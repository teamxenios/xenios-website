import { describe, expect, it, vi } from "vitest";
import {
  ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_ENV_VAR, ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID_ENV_VAR,
  ASSISTED_ORDER_AUDIT_ATTESTATION, ASSISTED_ORDER_AUDIT_ATTESTATION_ENV_VAR, ASSISTED_ORDER_AUDIT_AUTHORITY_RPC,
  ASSISTED_ORDER_AUDIT_ENABLED_ENV_VAR, ASSISTED_ORDER_AUDIT_SCHEMA_ENV_VAR, ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
  assistedOrderAuditActorTypes, assistedOrderAuditEventTypes, resolveAssistedOrderAuditAuthority,
  type ResolvedAssistedOrderAuditAuthority,
} from "./audit-store";
import { DISPOSITION_EFFECTS_SCHEMA, dispositionEffectDispatchAllowed, resolveDispositionEffectsRecovery } from "./disposition-effects";
import { ASSISTED_ORDER_NO_FUNDS_CUSTOMER_MESSAGE } from "../../../shared/research/assisted-order/financial-disposition";
import type { SupabaseRpcClient, SupabaseRpcResponse } from "./supabase-repository";

const cryptoProbe = vi.hoisted(() => ({ calls: 0 }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, createHmac: (...args: Parameters<typeof actual.createHmac>) => {
    cryptoProbe.calls += 1;
    return actual.createHmac(...args);
  } };
});
const PREFIX = "research_assisted_order_disposition_effects_";
const id = (n: number, family = 1) => `${family}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DISPOSITION = id(1), REQUEST = id(1, 2), OUTBOX = id(1, 3);
const WHEN = "2026-10-01T06:30:00.000Z";
const authority = () => ({ schemaVersion: DISPOSITION_EFFECTS_SCHEMA,
  intentPolicy: "no_funds_cancel_atomic_canonical_outbox_v1", auditPolicy: "canonical_audit_before_dispatch_v1",
  historicalAdoption: false, allowedOutcomes: ["never_received"], allowedFinality: ["terminal"], unsupportedKinds: ["void", "refund"] });
const pending = (dispositionId = DISPOSITION) => ({ dispositionId, requestId: REQUEST, fromStatus: "payment_review",
  resolvedAt: WHEN, resolvedBy: "synthetic-admin@example.test", outboxId: OUTBOX, outboxStatus: "held", state: "pending", auditReceipt: null });
const receipt = (dispositionId = DISPOSITION) => ({ state: "inserted", eventId: dispositionId,
  eventKey: `assisted-order-audit:v1:${dispositionId}`, requestId: REQUEST, eventType: "assisted_order.status_changed",
  eventFingerprint: "a".repeat(64), schemaVersion: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION, attestation: ASSISTED_ORDER_AUDIT_ATTESTATION });
const complete = (dispositionId = DISPOSITION) => ({ ...pending(dispositionId), state: "complete", outboxStatus: "pending", auditReceipt: receipt(dispositionId) });
async function audit(key = 7): Promise<ResolvedAssistedOrderAuditAuthority> {
  const result = await resolveAssistedOrderAuditAuthority({ env: {
    [ASSISTED_ORDER_AUDIT_ENABLED_ENV_VAR]: "true", [ASSISTED_ORDER_AUDIT_SCHEMA_ENV_VAR]: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
    [ASSISTED_ORDER_AUDIT_ATTESTATION_ENV_VAR]: ASSISTED_ORDER_AUDIT_ATTESTATION,
    [ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID_ENV_VAR]: `test-${key}`,
    [ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_ENV_VAR]: Buffer.alloc(32, key).toString("base64url"),
  }, rpc: { rpc: async (name) => ({ data: name === ASSISTED_ORDER_AUDIT_AUTHORITY_RPC ? {
    schemaVersion: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION, attestation: ASSISTED_ORDER_AUDIT_ATTESTATION,
    eventTypes: assistedOrderAuditEventTypes, actorTypes: assistedOrderAuditActorTypes,
    evidencePolicy: "bounded_allowlist_v1", actorIdentityPolicy: "hmac_sha256_alias_v1", appendOnly: true,
  } : null, error: null }) } });
  if (!result.available) throw new Error(result.refusalReason);
  return result.authority;
}
type Hook = (name: string, args: Readonly<Record<string, unknown>> | undefined) => SupabaseRpcResponse | undefined | Promise<SupabaseRpcResponse | undefined>;
async function harness(hook?: Hook, resolvedAudit?: ResolvedAssistedOrderAuditAuthority) {
  const rpc = vi.fn<SupabaseRpcClient["rpc"]>(async (name, args) => {
    const result = await hook?.(name, args);
    if (result !== undefined) return result;
    if (name === `${PREFIX}authority`) return { data: authority(), error: null };
    if (name === `${PREFIX}context`) return { data: pending(String(args?.p_disposition_id)), error: null };
    if (name === `${PREFIX}complete`) return { data: complete(String(args?.p_disposition_id)), error: null };
    if (name === `${PREFIX}pending`) return { data: [], error: null };
    throw new Error("Unexpected RPC");
  });
  const recovery = await resolveDispositionEffectsRecovery({ enabled: true, rpc: { rpc }, audit: resolvedAudit ?? await audit() });
  if (!recovery) throw new Error("Synthetic authority did not resolve");
  rpc.mockClear();
  return { recovery, rpc };
}

describe("canonical disposition effects authority", () => {
  it("requires actual probed audit branding, flag and RPC rather than a logger", async () => {
    const rpc = { rpc: vi.fn() }, realAudit = await audit();
    expect(await resolveDispositionEffectsRecovery({ enabled: false, rpc, audit: realAudit })).toBeNull();
    expect(await resolveDispositionEffectsRecovery({ enabled: true, rpc: null, audit: realAudit })).toBeNull();
    expect(await resolveDispositionEffectsRecovery({ enabled: true, rpc, audit: null })).toBeNull();
    expect(await Reflect.apply(resolveDispositionEffectsRecovery, undefined, [{ enabled: true, rpc,
      audit: Object.fromEntries(Object.entries(realAudit)) }])).toBeNull();
    expect(rpc.rpc).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...authority(), extra: true }, { ...authority(), schemaVersion: "wrong" },
    { ...authority(), intentPolicy: "opportunistic" }, { ...authority(), auditPolicy: "logger" },
    { ...authority(), historicalAdoption: true }, { ...authority(), allowedOutcomes: ["zero_balance"] },
    { ...authority(), allowedFinality: ["pending"] }, { ...authority(), unsupportedKinds: [] }])(
    "refuses malformed or weakened schema authority %#", async (data) => {
      expect(await resolveDispositionEffectsRecovery({ enabled: true, rpc: { rpc: async () => ({ data, error: null }) }, audit: await audit() })).toBeNull();
    },
  );
  it("refuses failed authority probes without throwing database details", async () => {
    expect(await resolveDispositionEffectsRecovery({ enabled: true, audit: await audit(),
      rpc: { rpc: async () => { throw new Error("private"); } } })).toBeNull();
  });
});

describe("durable no-funds cancellation recovery", () => {
  it.each(["reviewing", "payment_pending", "payment_review"])("uses truthful stored %s -> cancelled audit and never verification/grant/source calls", async (fromStatus) => {
    const h = await harness((name) => name === `${PREFIX}context` ? { data: { ...pending(), fromStatus }, error: null }
      : name === `${PREFIX}complete` ? { data: { ...complete(), fromStatus }, error: null } : undefined);
    await h.recovery.recover(DISPOSITION, REQUEST);
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual([`${PREFIX}context`, `${PREFIX}complete`]);
    const args = h.rpc.mock.calls[1][1]!;
    expect(args).toMatchObject({ p_disposition_id: DISPOSITION,
      p_schema_version: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION, p_attestation: ASSISTED_ORDER_AUDIT_ATTESTATION,
      p_event: { eventId: DISPOSITION, requestId: REQUEST, eventType: "assisted_order.status_changed", actorType: "admin",
        occurredAt: WHEN, evidence: { from: fromStatus, to: "cancelled", authorityEvidenceKinds: ["cancellation_reason_present"] } } });
    expect((args.p_event as Record<string, unknown>).actorAlias).toMatch(/^aa1:test-7:[a-f0-9]{64}$/);
    expect(JSON.stringify(args)).not.toContain(pending().resolvedBy);
  });

  it.each(["complete", "pending"])("uses an existing audit receipt before HMAC regeneration after rotation: %s", async (state) => {
    const h = await harness((name) => name === `${PREFIX}context`
      ? { data: state === "complete" ? complete() : { ...pending(), auditReceipt: receipt() }, error: null } : undefined, await audit(8));
    const before = cryptoProbe.calls;
    await h.recovery.recover(DISPOSITION);
    expect(cryptoProbe.calls).toBe(before);
    if (state === "complete") expect(h.rpc).toHaveBeenCalledTimes(1);
    else expect(h.rpc.mock.calls[1][1]?.p_event).toBeNull();
  });

  it("restarts a failed obligation and accepts concurrent replay without changing immutable facts", async () => {
    let fail = true;
    const hook: Hook = (name) => name === `${PREFIX}complete` && fail
      ? { data: null, error: { message: "private interrupted transaction" } } : undefined;
    const beforeRestart = await harness(hook);
    await expect(beforeRestart.recovery.recover(DISPOSITION)).rejects.toHaveProperty("name", "AssistedOrderDispositionEffectsError");
    fail = false;
    const restarted = await harness(hook);
    await expect(Promise.all([restarted.recovery.recover(DISPOSITION), restarted.recovery.recover(DISPOSITION)])).resolves.toEqual([undefined, undefined]);
    const writes = restarted.rpc.mock.calls.filter(([name]) => name === `${PREFIX}complete`);
    expect(writes).toHaveLength(2);
    expect(writes[0][1]).toEqual(writes[1][1]);
  });

  it.each([null, {}, { ...pending(), extra: "private" }, { ...pending(), requestId: "bad" },
    { ...pending(), dispositionId: id(99) }, { ...pending(), fromStatus: "paid" }, { ...pending(), fromStatus: "cancelled" },
    { ...pending(), resolvedBy: " padded " }, { ...pending(), resolvedAt: "2026-02-30T00:00:00.000Z" },
    { ...pending(), outboxId: "bad" }, { ...pending(), outboxStatus: "pending" }, { ...complete(), auditReceipt: null },
    { ...complete(), auditReceipt: { ...receipt(), eventId: id(99) } },
    { ...complete(), auditReceipt: { ...receipt(), eventType: "assisted_order.submitted" } },
    { ...complete(), auditReceipt: { ...receipt(), eventFingerprint: "bad" } },
    { ...complete(), auditReceipt: { ...receipt(), attestation: "wrong" } }])(
    "refuses malformed or misbound durable context before release %#", async (data) => {
      const h = await harness((name) => name === `${PREFIX}context` ? { data, error: null } : undefined);
      await expect(h.recovery.recover(DISPOSITION)).rejects.toHaveProperty("name", "AssistedOrderDispositionEffectsError");
      expect(h.rpc).toHaveBeenCalledTimes(1);
    },
  );
  it.each([{ resolvedBy: "other@example.test" }, { resolvedAt: "2026-10-01T06:30:01.000Z" },
    { outboxId: id(99) }, { fromStatus: "reviewing" }, { requestId: id(99) }, { state: "pending" }])(
    "refuses changed facts in completion %#", async (change) => {
      const h = await harness((name) => name === `${PREFIX}complete` ? { data: { ...complete(), ...change }, error: null } : undefined);
      await expect(h.recovery.recover(DISPOSITION)).rejects.toHaveProperty("name", "AssistedOrderDispositionEffectsError");
    },
  );
  it("rejects a wrong expected request and invalid IDs before completion", async () => {
    const h = await harness();
    await expect(h.recovery.recover("bad")).rejects.toThrow();
    expect(h.rpc).not.toHaveBeenCalled();
    await expect(h.recovery.recover(DISPOSITION, id(99))).rejects.toThrow();
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("bounded disposition worker", () => {
  const row = (n: number) => ({ dispositionId: id(n), outboxId: id(n, 3), createdAt: WHEN });
  it("advances past twenty poison rows, completes later work and wraps without starvation", async () => {
    let page = 0;
    const h = await harness((name, args) => {
      if (name === `${PREFIX}pending`) return { data: page++ === 0 ? Array.from({ length: 20 }, (_, i) => row(i + 1)) : page === 2 ? [row(21)] : [], error: null };
      if (name === `${PREFIX}context` && args?.p_disposition_id !== id(21)) return { data: null, error: { message: "held" } };
    });
    expect(await h.recovery.runBatch()).toEqual({ completed: 0, failed: 20 });
    expect(await h.recovery.runBatch()).toEqual({ completed: 1, failed: 0 });
    expect(await h.recovery.runBatch()).toEqual({ completed: 0, failed: 0 });
    expect(h.rpc.mock.calls.filter(([name]) => name === `${PREFIX}pending`).map(([, args]) => args)).toEqual([
      { p_after_created_at: null, p_after_id: null, p_limit: 20 },
      { p_after_created_at: WHEN, p_after_id: id(20, 3), p_limit: 20 },
      { p_after_created_at: null, p_after_id: null, p_limit: 20 },
    ]);
  });
  it("does not overlap batches and releases its latch after failure", async () => {
    let release!: (response: SupabaseRpcResponse) => void;
    const waiting = new Promise<SupabaseRpcResponse>((resolve) => { release = resolve; });
    let reads = 0;
    const h = await harness((name) => name === `${PREFIX}pending` ? (++reads === 1 ? waiting : { data: [], error: null }) : undefined);
    const active = h.recovery.runBatch();
    expect(await h.recovery.runBatch()).toEqual({ completed: 0, failed: 0 });
    expect(h.rpc).toHaveBeenCalledTimes(1);
    release({ data: null, error: { message: "private" } });
    await expect(active).rejects.toThrow();
    expect(await h.recovery.runBatch()).toEqual({ completed: 0, failed: 0 });
  });
  it.each([null, {}, Array.from({ length: 21 }, (_, i) => row(i + 1)), [row(1), row(1)],
    [row(2), row(1)], [row(1), { ...row(2), extra: true }], [{ ...row(1), dispositionId: "bad" }]])(
    "validates the whole bounded page before recovering anything %#", async (data) => {
      const h = await harness((name) => name === `${PREFIX}pending` ? { data, error: null } : undefined);
      await expect(h.recovery.runBatch()).rejects.toThrow();
      expect(h.rpc).toHaveBeenCalledTimes(1);
    },
  );
});

describe("disposition last-mile delivery authority", () => {
  const job = () => ({ id: OUTBOX, assisted_order_disposition_id: DISPOSITION,
    event_key: `assisted-order:${REQUEST}:financial-disposition:${DISPOSITION}`, recipient: "customer@example.test",
    template_key: "research.assisted_order.status_changed.customer",
    payload: { publicReference: "XRR-20261001-ABCDEF0011", status: "cancelled", customerMessage: ASSISTED_ORDER_NO_FUNDS_CUSTOMER_MESSAGE } });
  it("does not make ordinary pre-migration cancellations depend on the new schema", async () => {
    const rpc = { rpc: vi.fn() };
    expect(await dispositionEffectDispatchAllowed(rpc, { ...job(), assisted_order_disposition_id: null,
      event_key: "ordinary-cancellation", payload: { status: "cancelled", customerMessage: "This request was cancelled." } })).toBe(true);
    expect(rpc.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { ...job(), assisted_order_disposition_id: null }, { ...job(), assisted_order_disposition_id: "bad" },
    { ...job(), id: "bad" }, { ...job(), event_key: null }, { ...job(), recipient: null },
    { ...job(), payload: { ...job().payload, status: " cancelled " } },
    { ...job(), assisted_order_disposition_id: null, event_key: "ordinary", payload: { ...job().payload, customerMessage: ` ${ASSISTED_ORDER_NO_FUNDS_CUSTOMER_MESSAGE.toUpperCase()} ` } },
  ])("refuses forged or missing FK/reserved-namespace/copy bindings %#", async (value) => {
    const rpc = { rpc: vi.fn() };
    expect(await dispositionEffectDispatchAllowed(rpc, value)).toBe(false);
    expect(rpc.rpc).not.toHaveBeenCalled();
  });
  it("requires exact readiness for the full bound delivery envelope", async () => {
    const rpc = { rpc: vi.fn(async () => ({ data: true, error: null })) };
    expect(await dispositionEffectDispatchAllowed(rpc, job())).toBe(true);
    expect(rpc.rpc).toHaveBeenCalledExactlyOnceWith(`${PREFIX}outbox_ready`, {
      p_outbox_id: OUTBOX, p_disposition_id: DISPOSITION, p_event_key: job().event_key,
      p_recipient: job().recipient, p_template_key: job().template_key, p_payload: job().payload,
    });
  });
  it.each([null, false, "true", 1, { ready: true }])("refuses a non-true readiness result %j", async (data) => {
    expect(await dispositionEffectDispatchAllowed({ rpc: async () => ({ data, error: null }) }, job())).toBe(false);
  });
  it("refuses missing schema and transport errors", async () => {
    expect(await dispositionEffectDispatchAllowed({ rpc: async () => ({ data: true, error: { code: "PGRST202", message: "private" } }) }, job())).toBe(false);
    expect(await dispositionEffectDispatchAllowed({ rpc: async () => { throw new Error("private"); } }, job())).toBe(false);
  });
});
