import { describe, expect, it, vi } from "vitest";
import {
  ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_ENV_VAR,
  ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID_ENV_VAR,
  ASSISTED_ORDER_AUDIT_ATTESTATION,
  ASSISTED_ORDER_AUDIT_ATTESTATION_ENV_VAR,
  ASSISTED_ORDER_AUDIT_AUTHORITY_RPC,
  ASSISTED_ORDER_AUDIT_ENABLED_ENV_VAR,
  ASSISTED_ORDER_AUDIT_SCHEMA_ENV_VAR,
  ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
  assistedOrderAuditActorTypes,
  assistedOrderAuditEventTypes,
  resolveAssistedOrderAuditAuthority,
  type ResolvedAssistedOrderAuditAuthority,
} from "./audit-store";
import {
  PAYMENT_EFFECTS_SCHEMA,
  paymentEffectDispatchAllowed,
  resolvePaymentEffectsRecovery,
} from "./payment-effects";
import type { SupabaseRpcClient, SupabaseRpcResponse } from "./supabase-repository";
import type { AssistedOrderAuditEvent } from "./ports";

const cryptoProbe = vi.hoisted(() => ({ hmacCalls: 0 }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, createHmac: (...args: Parameters<typeof actual.createHmac>) => {
    cryptoProbe.hmacCalls += 1;
    return actual.createHmac(...args);
  } };
});

const PREFIX = "research_assisted_order_payment_effects_";
const id = (value: number, family = 1) => `${family}0000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const VERIFICATION = id(1);
const REQUEST = id(1, 2);
const ADMIN = id(1, 3);
const OUTBOX = id(1, 4);
const WHEN = "2026-10-01T04:00:00.000Z";
const authorityEnvelope = () => ({
  schemaVersion: PAYMENT_EFFECTS_SCHEMA,
  intentPolicy: "verification_atomic_canonical_outbox_v1",
  auditPolicy: "canonical_audit_before_dispatch_v1",
  historicalAdoption: false,
});
const pendingContext = (verificationId = VERIFICATION) => ({
  verificationId, requestId: REQUEST, verifiedAt: WHEN, verifiedBy: ADMIN,
  outboxId: OUTBOX, outboxStatus: "held", state: "pending", auditReceipt: null,
});
const receipt = (verificationId = VERIFICATION, fingerprint = "a".repeat(64)) => ({
  state: "inserted", eventId: verificationId,
  eventKey: `assisted-order-audit:v1:${verificationId}`, requestId: REQUEST,
  eventType: "assisted_order.status_changed", eventFingerprint: fingerprint,
  schemaVersion: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION, attestation: ASSISTED_ORDER_AUDIT_ATTESTATION,
});
const completeContext = (verificationId = VERIFICATION, fingerprint = "a".repeat(64)) => ({
  ...pendingContext(verificationId), state: "complete", outboxStatus: "pending",
  auditReceipt: receipt(verificationId, fingerprint),
});

// Every positive recovery fixture obtains the private brand from the real
// resolver. A callback/logger or a type assertion is never used as authority.
async function auditAuthority(keyByte = 7): Promise<ResolvedAssistedOrderAuditAuthority> {
  const result = await resolveAssistedOrderAuditAuthority({
    env: {
      [ASSISTED_ORDER_AUDIT_ENABLED_ENV_VAR]: "true",
      [ASSISTED_ORDER_AUDIT_SCHEMA_ENV_VAR]: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
      [ASSISTED_ORDER_AUDIT_ATTESTATION_ENV_VAR]: ASSISTED_ORDER_AUDIT_ATTESTATION,
      [ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID_ENV_VAR]: `key-${keyByte}`,
      [ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_ENV_VAR]: Buffer.alloc(32, keyByte).toString("base64url"),
    },
    rpc: { rpc: async (name) => ({ data: name === ASSISTED_ORDER_AUDIT_AUTHORITY_RPC ? {
      schemaVersion: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION, attestation: ASSISTED_ORDER_AUDIT_ATTESTATION,
      eventTypes: assistedOrderAuditEventTypes, actorTypes: assistedOrderAuditActorTypes,
      evidencePolicy: "bounded_allowlist_v1", actorIdentityPolicy: "hmac_sha256_alias_v1", appendOnly: true,
    } : null, error: null }) },
  });
  if (!result.available) throw new Error(result.refusalReason);
  return result.authority;
}

type Hook = (name: string, args: Readonly<Record<string, unknown>> | undefined) =>
  SupabaseRpcResponse | undefined | Promise<SupabaseRpcResponse | undefined>;
async function harness(hook?: Hook, suppliedAudit?: ResolvedAssistedOrderAuditAuthority) {
  const audit = suppliedAudit ?? await auditAuthority();
  const rpc = vi.fn<SupabaseRpcClient["rpc"]>(async (name, args) => {
    const custom = await hook?.(name, args);
    if (custom !== undefined) return custom;
    if (name === `${PREFIX}authority`) return { data: authorityEnvelope(), error: null };
    if (name === `${PREFIX}context`) return { data: pendingContext(String(args?.p_verification_id)), error: null };
    if (name === `${PREFIX}complete`) {
      const event = args?.p_event as Record<string, unknown>;
      return { data: completeContext(String(args?.p_verification_id), String(event.eventFingerprint)), error: null };
    }
    if (name === `${PREFIX}pending`) return { data: [], error: null };
    throw new Error(`Unexpected RPC: ${name}`);
  });
  const recovery = await resolvePaymentEffectsRecovery({ enabled: true, rpc: { rpc }, audit });
  if (!recovery) throw new Error("Synthetic authority did not resolve");
  rpc.mockClear();
  return { recovery, rpc, audit };
}

describe("payment-effects authority resolution", () => {
  it("requires the flag, RPC, and real resolved audit authority before probing", async () => {
    const rpc = { rpc: vi.fn() };
    const audit = await auditAuthority();
    expect(await resolvePaymentEffectsRecovery({ enabled: false, rpc, audit })).toBeNull();
    expect(await resolvePaymentEffectsRecovery({ enabled: true, rpc: null, audit })).toBeNull();
    expect(await resolvePaymentEffectsRecovery({ enabled: true, rpc, audit: null })).toBeNull();
    const loggerOnly = { ...Object.fromEntries(Object.entries(audit)), sink: { record: vi.fn() } };
    // Simulate untyped configuration input without blessing it with the brand.
    expect(await Reflect.apply(resolvePaymentEffectsRecovery, undefined, [{ enabled: true, rpc, audit: loggerOnly }])).toBeNull();
    expect(rpc.rpc).not.toHaveBeenCalled();
  });

  it.each([
    null, {}, { ...authorityEnvelope(), extra: true },
    { ...authorityEnvelope(), schemaVersion: "legacy" },
    { ...authorityEnvelope(), intentPolicy: "opportunistic" },
    { ...authorityEnvelope(), auditPolicy: "logger" },
    { ...authorityEnvelope(), historicalAdoption: true },
    { ...authorityEnvelope(), historicalAdoption: "false" },
  ])("refuses malformed or weaker schema authority %#", async (data) => {
    const rpc = { rpc: vi.fn(async () => ({ data, error: null })) };
    expect(await resolvePaymentEffectsRecovery({ enabled: true, rpc, audit: await auditAuthority() })).toBeNull();
    expect(rpc.rpc).toHaveBeenCalledExactlyOnceWith(`${PREFIX}authority`);
  });

  it("fails closed on missing schema, database errors, or a rejected probe", async () => {
    const audit = await auditAuthority();
    for (const rpc of [
      { rpc: async () => ({ data: authorityEnvelope(), error: { code: "PGRST202", message: "private detail" } }) },
      { rpc: async () => { throw new Error("private transport detail"); } },
    ]) expect(await resolvePaymentEffectsRecovery({ enabled: true, rpc, audit })).toBeNull();
  });
});

describe("durable verification effects recovery", () => {
  it("prepares the canonical immutable event only from stored verification facts", async () => {
    const { recovery, rpc } = await harness();
    await recovery.recover(VERIFICATION, REQUEST);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([`${PREFIX}context`, `${PREFIX}complete`]);
    const args = rpc.mock.calls[1][1]!;
    expect(args).toMatchObject({ p_verification_id: VERIFICATION,
      p_schema_version: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION, p_attestation: ASSISTED_ORDER_AUDIT_ATTESTATION,
      p_event: { eventId: VERIFICATION, requestId: REQUEST, eventType: "assisted_order.status_changed",
        actorType: "admin", occurredAt: WHEN,
        evidence: { from: "payment_review", to: "paid", authorityEvidenceKinds: ["payment_verification"] } } });
    const event = args.p_event as Record<string, unknown>;
    expect(event.actorAlias).toMatch(/^aa1:key-7:[a-f0-9]{64}$/);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.evidence)).toBe(true);
    expect(JSON.stringify(args)).not.toContain(ADMIN);
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/payment_verify|verifier_grant|provider|audit_append/);
  });

  it.each(["admin@example.test", "controlled-import-operator"])("recovers the actual stored verifier actor label without a current grant: %s", async (verifiedBy) => {
    const { recovery, rpc } = await harness((name) => {
      if (name === `${PREFIX}context`) return { data: { ...pendingContext(), verifiedBy }, error: null };
      if (name === `${PREFIX}complete`) return { data: { ...completeContext(), verifiedBy }, error: null };
    });
    await expect(recovery.recover(VERIFICATION, REQUEST)).resolves.toBeUndefined();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([`${PREFIX}context`, `${PREFIX}complete`]);
    const event = rpc.mock.calls[1][1]?.p_event as Record<string, unknown>;
    expect(event.actorAlias).toMatch(/^aa1:key-7:[a-f0-9]{64}$/);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(verifiedBy);
  });

  it.each(["", "   ", " operator ", "operator\nprivate", "operator\u0000private", "a".repeat(513)])(
    "refuses a malformed stored verifier actor label before completion %#", async (verifiedBy) => {
      const { recovery, rpc } = await harness((name) => name === `${PREFIX}context`
        ? { data: { ...pendingContext(), verifiedBy }, error: null } : undefined);
      await expect(recovery.recover(VERIFICATION)).rejects.toHaveProperty("name", "AssistedOrderVerificationEffectsError");
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );

  it("retries a durable held obligation after failure and after process restart without verifying money again", async () => {
    let failures = 1;
    let stored: Record<string, unknown> = pendingContext();
    const hook: Hook = (name, args) => {
      if (name === `${PREFIX}context`) return { data: stored, error: null };
      if (name === `${PREFIX}complete`) {
        if (failures-- > 0) return { data: null, error: { message: "private interrupted write" } };
        const event = args?.p_event as Record<string, unknown>;
        const completed = completeContext(VERIFICATION, String(event.eventFingerprint));
        // Synthetic persistent database fixture shared by the new worker instance.
        stored = completed;
        return { data: completed, error: null };
      }
    };
    const first = await harness(hook);
    await expect(first.recovery.recover(VERIFICATION)).rejects.toHaveProperty("name", "AssistedOrderVerificationEffectsError");
    expect(stored.state).toBe("pending");
    const restarted = await harness(hook);
    await expect(restarted.recovery.recover(VERIFICATION)).resolves.toBeUndefined();
    await expect(restarted.recovery.recover(VERIFICATION)).resolves.toBeUndefined();
    expect(restarted.rpc.mock.calls.map(([name]) => name)).toEqual([`${PREFIX}context`, `${PREFIX}complete`, `${PREFIX}context`]);
  });

  it("reads an existing receipt before regenerating an event under a rotated HMAC key", async () => {
    const oldAudit = await auditAuthority(7);
    const newAudit = await auditAuthority(8);
    const event: AssistedOrderAuditEvent = { eventId: VERIFICATION, requestId: REQUEST, eventType: "assisted_order.status_changed",
      actorType: "admin", actorId: ADMIN, occurredAt: WHEN,
      evidence: { from: "payment_review", to: "paid", authorityEvidenceKinds: ["payment_verification"] } };
    const oldRecord = oldAudit.prepare(event);
    expect(newAudit.prepare(event).eventFingerprint).not.toBe(oldRecord.eventFingerprint);
    const { recovery, rpc } = await harness((name) => name === `${PREFIX}context`
      ? { data: completeContext(VERIFICATION, oldRecord.eventFingerprint), error: null } : undefined, newAudit);
    const before = cryptoProbe.hmacCalls;
    await expect(recovery.recover(VERIFICATION, REQUEST)).resolves.toBeUndefined();
    expect(cryptoProbe.hmacCalls).toBe(before);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(`${PREFIX}context`, { p_verification_id: VERIFICATION });
  });

  it("accepts concurrently completed replay receipts without replacing the stored event", async () => {
    const { recovery, rpc } = await harness((name) => name === `${PREFIX}complete`
      ? { data: { ...completeContext(), auditReceipt: { ...receipt(), state: "replayed" } }, error: null } : undefined);
    await expect(Promise.all([recovery.recover(VERIFICATION), recovery.recover(VERIFICATION)])).resolves.toEqual([undefined, undefined]);
    const writes = rpc.mock.calls.filter(([name]) => name === `${PREFIX}complete`);
    expect(writes).toHaveLength(2);
    expect(writes[0][1]).toEqual(writes[1][1]);
    expect((writes[0][1]?.p_event as Record<string, unknown>).eventKey).toBe(`assisted-order-audit:v1:${VERIFICATION}`);
  });

  it("releases an interrupted held notification using its existing audit receipt after key rotation", async () => {
    const oldAudit = await auditAuthority(7);
    const event: AssistedOrderAuditEvent = { eventId: VERIFICATION, requestId: REQUEST,
      eventType: "assisted_order.status_changed", actorType: "admin", actorId: ADMIN,
      occurredAt: WHEN, evidence: { from: "payment_review", to: "paid", authorityEvidenceKinds: ["payment_verification"] } };
    const oldRecord = oldAudit.prepare(event);
    const oldReceipt = receipt(VERIFICATION, oldRecord.eventFingerprint);
    const { recovery, rpc } = await harness((name) => {
      if (name === `${PREFIX}context`) return { data: { ...pendingContext(), auditReceipt: oldReceipt }, error: null };
      if (name === `${PREFIX}complete`) return { data: completeContext(VERIFICATION, oldRecord.eventFingerprint), error: null };
    }, await auditAuthority(8));
    const before = cryptoProbe.hmacCalls;
    await expect(recovery.recover(VERIFICATION, REQUEST)).resolves.toBeUndefined();
    expect(cryptoProbe.hmacCalls).toBe(before);
    expect(rpc).toHaveBeenLastCalledWith(`${PREFIX}complete`, {
      p_verification_id: VERIFICATION, p_schema_version: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
      p_attestation: ASSISTED_ORDER_AUDIT_ATTESTATION, p_event: null,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("key-8");
  });

  it.each([
    null, {}, { ...pendingContext(), extra: "private" },
    { ...pendingContext(), verificationId: id(2) }, { ...pendingContext(), requestId: "bad" },
    { ...pendingContext(), verifiedBy: null }, { ...pendingContext(), outboxId: "bad" },
    { ...pendingContext(), verifiedAt: "2026-02-30T00:00:00.000Z" },
    { ...pendingContext(), verifiedAt: "2026-10-01T04:00:00Z" },
    { ...pendingContext(), outboxStatus: "pending" }, { ...pendingContext(), auditReceipt: { ...receipt(), requestId: id(2, 2) } },
    { ...pendingContext(), state: "legacy_paid" },
    { ...completeContext(), outboxStatus: "held" },
    { ...completeContext(), auditReceipt: { ...receipt(), requestId: id(2, 2) } },
    { ...completeContext(), auditReceipt: { ...receipt(), extra: true } },
    { ...completeContext(), auditReceipt: { ...receipt(), state: "maybe" } },
    { ...completeContext(), auditReceipt: { ...receipt(), eventId: id(2) } },
    { ...completeContext(), auditReceipt: { ...receipt(), eventKey: "wrong" } },
    { ...completeContext(), auditReceipt: { ...receipt(), eventType: "assisted_order.submitted" } },
    { ...completeContext(), auditReceipt: { ...receipt(), schemaVersion: "old" } },
    { ...completeContext(), auditReceipt: { ...receipt(), attestation: "old" } },
    { ...completeContext(), auditReceipt: { ...receipt(), eventFingerprint: "not-a-digest" } },
  ])("refuses malformed context or receipt before completion %#", async (data) => {
    const { recovery, rpc } = await harness((name) => name === `${PREFIX}context` ? { data, error: null } : undefined);
    await expect(recovery.recover(VERIFICATION)).rejects.toHaveProperty("name", "AssistedOrderVerificationEffectsError");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    { requestId: id(2, 2), auditReceipt: { ...receipt(), requestId: id(2, 2) } },
    { verifiedBy: id(2, 3) }, { verifiedAt: "2026-10-01T04:00:01.000Z" }, { outboxId: id(2, 4) },
    pendingContext(), { auditReceipt: null },
  ])("refuses a completion that changes immutable context or is incomplete %#", async (change) => {
    const { recovery } = await harness((name) => name === `${PREFIX}complete`
      ? { data: { ...completeContext(), ...change }, error: null } : undefined);
    await expect(recovery.recover(VERIFICATION)).rejects.toHaveProperty("name", "AssistedOrderVerificationEffectsError");
  });

  it("refuses invalid input before RPC and wrong request bindings before completion", async () => {
    const { recovery, rpc } = await harness();
    await expect(recovery.recover("bad")).rejects.toHaveProperty("name", "AssistedOrderVerificationEffectsError");
    await expect(recovery.recover(VERIFICATION, "bad")).rejects.toHaveProperty("name", "AssistedOrderVerificationEffectsError");
    expect(rpc).not.toHaveBeenCalled();
    await expect(recovery.recover(VERIFICATION, id(2, 2))).rejects.toHaveProperty("name", "AssistedOrderVerificationEffectsError");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(["context", "complete"])("does not reflect failed %s RPC details", async (operation) => {
    const { recovery } = await harness((name) => name === `${PREFIX}${operation}`
      ? { data: null, error: { message: "private verification evidence", code: "XX000" } } : undefined);
    const failure = await recovery.recover(VERIFICATION).catch((error) => error);
    expect(failure).toHaveProperty("name", "AssistedOrderVerificationEffectsError");
    expect(String(failure)).not.toContain("private verification evidence");
  });
});

describe("bounded restart-safe recovery sweep", () => {
  const row = (number: number) => ({ verificationId: id(number), outboxId: id(number, 4), createdAt: WHEN });

  it("passes twenty poison rows by keyset, completes later work, and wraps for retry", async () => {
    let pages = 0;
    const { recovery, rpc } = await harness((name, args) => {
      if (name === `${PREFIX}pending`) return { data: pages++ === 0 ? Array.from({ length: 20 }, (_, i) => row(i + 1))
        : pages === 2 ? [row(21)] : [], error: null };
      if (name === `${PREFIX}context` && args?.p_verification_id !== id(21)) {
        return { data: null, error: { message: "held unavailable obligation" } };
      }
    });
    expect(await recovery.runBatch()).toEqual({ completed: 0, failed: 20 });
    expect(await recovery.runBatch()).toEqual({ completed: 1, failed: 0 });
    expect(await recovery.runBatch()).toEqual({ completed: 0, failed: 0 });
    expect(rpc.mock.calls.filter(([name]) => name === `${PREFIX}pending`).map(([, args]) => args)).toEqual([
      { p_after_created_at: null, p_after_id: null, p_limit: 20 },
      { p_after_created_at: WHEN, p_after_id: id(20, 4), p_limit: 20 },
      { p_after_created_at: null, p_after_id: null, p_limit: 20 },
    ]);
  });

  it("does not overlap runBatch, and releases the latch after a failed read", async () => {
    let release!: (value: SupabaseRpcResponse) => void;
    const waiting = new Promise<SupabaseRpcResponse>((resolve) => { release = resolve; });
    let reads = 0;
    const { recovery, rpc } = await harness((name) => name === `${PREFIX}pending`
      ? (++reads === 1 ? waiting : { data: [], error: null }) : undefined);
    const active = recovery.runBatch();
    expect(await recovery.runBatch()).toEqual({ completed: 0, failed: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
    release({ data: null, error: { message: "unavailable" } });
    await expect(active).rejects.toHaveProperty("name", "AssistedOrderVerificationEffectsError");
    expect(await recovery.runBatch()).toEqual({ completed: 0, failed: 0 });
  });

  it("rejects a repeated cursor row before recovering any item on the next page", async () => {
    let pages = 0;
    const { recovery, rpc } = await harness((name) => name === `${PREFIX}pending`
      ? { data: pages++ === 0 ? Array.from({ length: 20 }, (_, i) => row(i + 1)) : [row(20)], error: null }
      : undefined);
    expect(await recovery.runBatch()).toEqual({ completed: 20, failed: 0 });
    rpc.mockClear();
    await expect(recovery.runBatch()).rejects.toHaveProperty("name", "AssistedOrderVerificationEffectsError");
    expect(rpc).toHaveBeenCalledExactlyOnceWith(`${PREFIX}pending`, {
      p_after_created_at: WHEN, p_after_id: id(20, 4), p_limit: 20,
    });
  });

  it.each([
    null, {}, Array.from({ length: 21 }, (_, i) => row(i + 1)),
    [row(1), { ...row(2), extra: true }], [row(1), row(1)],
    [row(2), row(1)], [row(1), { ...row(2), verificationId: id(1) }],
    [{ ...row(1), createdAt: "2026-02-30T00:00:00.000Z" }],
    [{ ...row(1), outboxId: "bad" }], [{ ...row(1), verificationId: "bad" }],
  ])("validates the entire bounded page before recovering any item %#", async (data) => {
    const { recovery, rpc } = await harness((name) => name === `${PREFIX}pending` ? { data, error: null } : undefined);
    await expect(recovery.runBatch()).rejects.toHaveProperty("name", "AssistedOrderVerificationEffectsError");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("last-mile payment notification authority", () => {
  const job = () => ({ id: OUTBOX, assisted_order_verification_id: VERIFICATION,
    event_key: `request:${REQUEST}:payment-verification:${VERIFICATION}`,
    recipient: "synthetic@example.test", template_key: "research.assisted_order.status_changed.customer",
    payload: { status: "paid", publicReference: "XRR-SYNTHETIC" } });

  it("leaves unrelated notifications alone without any new provider or RPC call", async () => {
    const rpc = { rpc: vi.fn() };
    expect(await paymentEffectDispatchAllowed(rpc, { template_key: "other", payload: { status: "reviewing" } })).toBe(true);
    expect(rpc.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { ...job(), assisted_order_verification_id: null },
    { ...job(), assisted_order_verification_id: undefined, event_key: "legacy-status-paid" },
    { ...job(), assisted_order_verification_id: undefined, template_key: "other", payload: {} },
    { ...job(), assisted_order_verification_id: "forged" },
    { ...job(), id: "forged" }, { ...job(), recipient: null },
    { ...job(), event_key: null }, { ...job(), template_key: null },
  ])("denies unbound legacy paid, reserved event keys, and malformed new FK jobs %#", async (value) => {
    const rpc = { rpc: vi.fn() };
    expect(await paymentEffectDispatchAllowed(rpc, value)).toBe(false);
    expect(rpc.rpc).not.toHaveBeenCalled();
  });

  it.each([" paid ", "PAID", "\tpaid\n", "\u00a0paid\u00a0", null, {}, undefined])(
    "denies malformed status notices before renderer normalization or readiness access %#", async (status) => {
      const rpc = { rpc: vi.fn() };
      const legacy = { ...job(), assisted_order_verification_id: null, event_key: "legacy-status-event",
        payload: status === undefined ? {} : { status } };
      expect(await paymentEffectDispatchAllowed(rpc, legacy)).toBe(false);
      expect(rpc.rpc).not.toHaveBeenCalled();
    },
  );

  it("preserves an exact nonfinancial status notice without inventing a payment obligation", async () => {
    const rpc = { rpc: vi.fn() };
    expect(await paymentEffectDispatchAllowed(rpc, { ...job(), assisted_order_verification_id: null,
      event_key: "ordinary-reviewing", payload: { status: "reviewing" } })).toBe(true);
    expect(rpc.rpc).not.toHaveBeenCalled();
  });

  it("rechecks exact FK, outbox, recipient, key, template and payload immediately before delivery", async () => {
    const rpc = { rpc: vi.fn(async () => ({ data: true, error: null })) };
    expect(await paymentEffectDispatchAllowed(rpc, job())).toBe(true);
    expect(rpc.rpc).toHaveBeenCalledExactlyOnceWith(`${PREFIX}outbox_ready`, {
      p_outbox_id: OUTBOX, p_verification_id: VERIFICATION, p_event_key: job().event_key,
      p_recipient: job().recipient, p_template_key: job().template_key, p_payload: job().payload,
    });
  });

  it.each([false, null, 1, "true", { ready: true }])("does not dispatch a non-true readiness result %j", async (data) => {
    expect(await paymentEffectDispatchAllowed({ rpc: async () => ({ data, error: null }) }, job())).toBe(false);
  });

  it("denies an otherwise valid job on error or rejection, including FK jobs under other templates", async () => {
    const changed = { ...job(), event_key: "ordinary", template_key: "other", payload: {} };
    expect(await paymentEffectDispatchAllowed({ rpc: async () => ({ data: true, error: { message: "private" } }) }, changed)).toBe(false);
    expect(await paymentEffectDispatchAllowed({ rpc: async () => { throw new Error("private"); } }, changed)).toBe(false);
  });
});
