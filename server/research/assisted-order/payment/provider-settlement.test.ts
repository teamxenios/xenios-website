import { describe, expect, it, vi } from "vitest";
import { AssistedProviderSettlementService, buildAssistedProviderSettlement, type AssistedProviderSettlementSource } from "./provider-settlement";
import type { AssistedOrderViewer } from "../ports";
import type { SupabaseRpcClient, SupabaseRpcResponse } from "../supabase-repository";

const id = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const REQUEST = id(1), JOURNAL = id(2), ATTEMPT = id(3), QUOTE = id(4), ACCEPTANCE = id(5), ACTOR = id(6);
const WHEN = "2026-10-01T11:55:12.000Z";
const PREFIX = "research_assisted_order_provider_settlement_";
const scope = { provider: "synthetic", accountId: "synthetic-account", mode: "test" as const };
const config = { sourceId: "synthetic-source", adapterRevision: "synthetic-v1", scope, policyRevision: "synthetic-settlement-v1" };
const viewer: AssistedOrderViewer = { actorType: "admin", authUserId: ACTOR, actorLabel: "untrusted-view-label",
  memberId: null, earlyAccessSessionHash: null, normalizedEmail: null, capabilities: new Set(["assisted_orders:manage"]) };
const authority = { schemaVersion: "assisted_order_provider_settlement_v1", transactionIsolation: "read_committed_only",
  settlementPolicy: "separate_scoped_admin_capture_v1", effectsPolicy: "canonical_verification_outbox_admin_v2",
  eligibilityPolicy: "reviewed_lineage_no_new_facts_v1", historicalAdoption: false };
const receipt = { schemaVersion: "assisted_order_provider_settlement_receipt_v1", settlementId: id(7), requestId: REQUEST,
  journalId: JOURNAL, attemptId: ATTEMPT, sourceId: config.sourceId, adapterRevision: config.adapterRevision,
  policyRevision: config.policyRevision, quoteId: QUOTE, quoteVersion: 1, acceptanceId: ACCEPTANCE,
  verificationId: id(8), verifiedAt: WHEN, verifiedBy: "synthetic-sql-granted-admin", state: "verified", replayed: false };
const publicReceipt = { schemaVersion: receipt.schemaVersion, settlementId: receipt.settlementId, requestId: REQUEST,
  journalId: JOURNAL, verificationId: receipt.verificationId, verifiedAt: WHEN, state: "verified", replayed: false };

function setup(options: { authority?: unknown; receipt?: unknown; noSource?: boolean;
  failAt?: "authority" | "commit"; failure?: SupabaseRpcResponse["error"] } = {}) {
  const rpc = vi.fn<SupabaseRpcClient["rpc"]>(async (name) => {
    if (name === PREFIX + options.failAt) return { data: null, error: options.failure ?? {
      code: "P0001", details: "ASSISTED_ORDER_PROVIDER_SETTLEMENT_HELD", message: "synthetic private data" } };
    if (name === PREFIX + "authority") return { data: Object.hasOwn(options, "authority") ? options.authority : authority, error: null };
    if (name === PREFIX + "commit") return { data: Object.hasOwn(options, "receipt") ? options.receipt : receipt, error: null };
    throw new Error("unexpected RPC");
  });
  const source: AssistedProviderSettlementSource = { ...config, scope: { ...scope } };
  return { rpc, source, service: new AssistedProviderSettlementService({ rpc }, options.noSource ? null : source) };
}
const settle = (h: ReturnType<typeof setup>, input: unknown = {}) => h.service.settle(viewer, REQUEST, JOURNAL, input);

describe("explicit admin governed capture settlement", () => {
  it("requires explicit composition, a validated source and a separate SQL authority", async () => {
    const h = setup();
    expect(buildAssistedProviderSettlement({ enabled: false, rpc: { rpc: h.rpc }, source: h.source })).toBeNull();
    expect(buildAssistedProviderSettlement({ enabled: true, rpc: null, source: h.source })).toBeNull();
    expect(buildAssistedProviderSettlement({ enabled: true, rpc: { rpc: h.rpc }, source: null })).toBeNull();
    expect(buildAssistedProviderSettlement({ enabled: true, rpc: { rpc: h.rpc }, source: h.source })).toBeInstanceOf(AssistedProviderSettlementService);
    expect(h.rpc).not.toHaveBeenCalled();
    const disabled = setup({ noSource: true });
    await expect(settle(disabled)).rejects.toMatchObject({ code: "provider_settlement_unavailable" });
    expect(disabled.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { sourceId: "" }, { sourceId: "SOURCE" }, { sourceId: "source\n" }, { adapterRevision: null },
    { adapterRevision: "v 1" }, { policyRevision: "" }, { policyRevision: "p".repeat(81) },
    { scope: null }, { scope: { ...scope, accountId: "" } }, { scope: { ...scope, accountId: "account\n" } },
    { scope: { ...scope, accountId: "account " } }, { scope: { ...scope, provider: "Provider" } },
    { scope: { ...scope, mode: "sandbox" } }, { scope: { ...scope, verified: true } }, { enabled: true },
  ])("refuses invalid or widened source configuration %#", async (patch) => {
    const h = setup(), source = { ...h.source, ...patch } as never;
    expect(buildAssistedProviderSettlement({ enabled: true, rpc: { rpc: h.rpc }, source })).toBeNull();
    const service = new AssistedProviderSettlementService({ rpc: h.rpc }, source);
    await expect(service.settle(viewer, REQUEST, JOURNAL, {})).rejects.toMatchObject({ code: "provider_settlement_unavailable" });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { actorType: "member" }, { actorType: "early_access_session" }, { actorType: "system" },
    { authUserId: undefined }, { authUserId: null }, { authUserId: "browser-admin" },
    { authUserId: ACTOR.toUpperCase() }, { authUserId: ` ${ACTOR}` }, { capabilities: new Set() },
    { capabilities: new Set(["assisted_orders:read_all"]) },
  ])("refuses wrong or unverified actors before any RPC %#", async (patch) => {
    const h = setup();
    await expect(h.service.settle({ ...viewer, ...patch } as AssistedOrderViewer, REQUEST, JOURNAL, {}))
      .rejects.toMatchObject({ name: "AssistedOrderAuthorizationError" });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each([undefined, null, [], "{}", false, { amountCents: 16927 }, { currency: "USD" },
    { reference: "payment" }, { verified: true }, { paid: true }, { authenticated: true }, { kind: "captured" },
    { sourceId: config.sourceId }, { adapterRevision: config.adapterRevision }, { policyRevision: config.policyRevision },
    { scope }, { actorAuthUserId: ACTOR }, { actorLabel: "admin" }, { verificationId: receipt.verificationId },
    { quoteId: QUOTE }, { acceptanceId: ACCEPTANCE }, { providerPaymentId: "payment" }, { journalId: JOURNAL },
    { expectedAmountCents: 16927 }, { status: "paid" }, { requestId: REQUEST }])(
    "refuses browser authority and nonempty command %#", async (body) => {
      const h = setup();
      await expect(h.service.settle(viewer, REQUEST, JOURNAL, body)).rejects.toMatchObject({ name: "AssistedOrderValidationError" });
      expect(h.rpc).not.toHaveBeenCalled();
    });

  it.each(["", "not-uuid", REQUEST.toUpperCase(), `${REQUEST}\n`])("refuses malformed route identities %s", async (value) => {
    const h = setup();
    await expect(h.service.settle(viewer, value, JOURNAL, {})).rejects.toMatchObject({ name: "AssistedOrderValidationError" });
    await expect(h.service.settle(viewer, REQUEST, value, {})).rejects.toMatchObject({ name: "AssistedOrderValidationError" });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each([
    undefined, null, {}, [],
    { schemaVersion: "assisted_order_provider_journal_v3", transactionIsolation: "read_committed_only",
      journalPolicy: "authenticated_durable_evidence_only_v1", settlementPolicy: "separate_scoped_admin_capture_v1", refundPolicy: "record_and_hold_only_v1" },
    { ...authority, schemaVersion: "assisted_order_provider_settlement_v2" },
    { ...authority, transactionIsolation: "repeatable_read" }, { ...authority, historicalAdoption: true },
    { ...authority, settlementPolicy: "automatic" }, { ...authority, effectsPolicy: "best_effort" },
    { ...authority, eligibilityPolicy: "verified_implies_eligible" }, { ...authority, enabled: true },
    ...Object.keys(authority).map((field) => ({ ...authority, [field]: undefined })),
  ])("requires the complete new settlement capability, never held-schema or widened authority %#", async (capability) => {
    const h = setup({ authority: capability });
    await expect(settle(h)).rejects.toMatchObject({ code: "provider_settlement_unavailable" });
    expect(h.rpc.mock.calls).toEqual([[PREFIX + "authority", undefined]]);
  });

  it("sends only configured source/policy plus actual admin Auth identity, then redacts the durable receipt", async () => {
    const h = setup();
    const result = await settle(h);
    expect(result).toEqual(publicReceipt); expect(Object.isFrozen(result)).toBe(true);
    expect(h.rpc.mock.calls).toEqual([[PREFIX + "authority", undefined], [PREFIX + "commit", {
      p_request_id: REQUEST, p_journal_id: JOURNAL, p_source_id: config.sourceId, p_adapter_revision: config.adapterRevision,
      p_expected_scope: scope, p_policy_revision: config.policyRevision, p_actor_auth_user_id: ACTOR,
    }]]);
    expect(JSON.stringify(result)).not.toMatch(/synthetic|quoteId|attemptId|verifiedBy|scope|policy|currency|amount|eligible/i);
    expect(JSON.stringify(h.rpc.mock.calls)).not.toContain(viewer.actorLabel);
  });

  it("snapshots configuration before a later caller or authority wait can mutate it", async () => {
    const h = setup();
    Object.assign(h.source.scope, { accountId: "mutated-account", mode: "live" });
    Object.assign(h.source, { sourceId: "mutated-source", adapterRevision: "mutated-revision", policyRevision: "mutated-policy" });
    const original = h.rpc.getMockImplementation()!;
    h.rpc.mockImplementation(async (name, args) => {
      Object.assign(h.source, { sourceId: "mutated-again" });
      return original(name, args);
    });
    expect(await settle(h)).toEqual(publicReceipt);
    expect(h.rpc.mock.calls[1][1]).toMatchObject({ p_source_id: config.sourceId, p_adapter_revision: config.adapterRevision,
      p_expected_scope: scope, p_policy_revision: config.policyRevision });
    expect(Object.isFrozen(h.rpc.mock.calls[1][1]?.p_expected_scope)).toBe(true);
  });

  it.each(["authority", "commit"] as const)("does not leak rejected %s RPC errors", async (failurePoint) => {
    const h = setup(), original = h.rpc.getMockImplementation()!;
    h.rpc.mockImplementation(async (name, args) => {
      if (name === PREFIX + failurePoint) throw new Error("private bank account and raw provider evidence");
      return original(name, args);
    });
    const error = await settle(h).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "provider_settlement_unavailable", message: "Provider payment settlement remains on hold." });
    expect(String(error)).not.toMatch(/private|bank|evidence/);
  });

  it.each(["ASSISTED_ORDER_PROVIDER_SETTLEMENT_HELD", "ASSISTED_ORDER_PROVIDER_SETTLEMENT_CONFLICT", "READ_COMMITTED_REQUIRED",
    "ASSISTED_ORDER_PROVIDER_EXECUTION_GRANT_REQUIRED", "ASSISTED_ORDER_PROVIDER_GRANT_REQUIRED"])(
    "sanitizes failure %s without widening reservation/create grants", async (details) => {
      const h = setup({ failAt: "commit", failure: { code: "P0001", details, message: "private SQL" } });
      await expect(settle(h)).rejects.toMatchObject({ code: "provider_settlement_unavailable" });
    });

  it("maps only the exact SQL settlement-grant authorization denial", async () => {
    const h = setup({ failAt: "commit", failure: { code: "P0001", details: "ASSISTED_ORDER_PROVIDER_SETTLEMENT_GRANT_REQUIRED", message: "private grant" } });
    await expect(settle(h)).rejects.toMatchObject({ name: "AssistedOrderAuthorizationError" });
    const wrongCode = setup({ failAt: "commit", failure: { code: "XX000", details: "ASSISTED_ORDER_PROVIDER_SETTLEMENT_GRANT_REQUIRED" } });
    await expect(settle(wrongCode)).rejects.toMatchObject({ code: "provider_settlement_unavailable" });
  });

  it.each([undefined, false, [], { error: { message: "private" } }])("refuses malformed RPC envelopes %#", async (response) => {
    const h = setup(); h.rpc.mockResolvedValue(response as never);
    await expect(settle(h)).rejects.toMatchObject({ code: "provider_settlement_unavailable" });
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("returns not found only for an explicit null result after authorization", async () => {
    const h = setup({ receipt: null });
    await expect(settle(h)).rejects.toMatchObject({ name: "AssistedOrderNotFoundError" });
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual([PREFIX + "authority", PREFIX + "commit"]);
  });

  it.each([
    { requestId: id(99) }, { journalId: id(99) }, { sourceId: "other" }, { adapterRevision: "other" }, { policyRevision: "other" },
    { schemaVersion: "other" }, { quoteVersion: 0 }, { quoteVersion: 1.5 }, { quoteVersion: 2_147_483_648 },
    { state: "paid" }, { state: "eligible" }, { replayed: "true" }, { rawPayload: "private" }, { amountCents: 16927 },
    { verifiedAt: "2026-10-01T11:55:12Z" }, { verifiedAt: "2026-10-01T11:55:12.000+00:00" },
    { verifiedAt: "2026-02-30T11:55:12.000Z" }, { verifiedAt: "2026-10-01T11:55:12.000000Z" },
    { verifiedBy: "" }, { verifiedBy: " admin" }, { verifiedBy: "admin\n" }, { verifiedBy: "a\u007fb" },
    { verifiedBy: "x".repeat(513) }, { verifiedBy: "\u{1f600}".repeat(257) },
    ...["settlementId", "requestId", "journalId", "attemptId", "quoteId", "acceptanceId", "verificationId"].map((field) => ({ [field]: "not-uuid" })),
    ...Object.keys(receipt).map((field) => ({ [field]: undefined })),
  ])("refuses mismatched or malformed durable settlement receipts %#", async (patch) => {
    const h = setup({ receipt: { ...receipt, ...patch } });
    await expect(settle(h)).rejects.toMatchObject({ code: "provider_settlement_unavailable" });
  });

  it.each(["synthetic-admin@example.test", "\u{1f600}".repeat(256)])("accepts canonical private actor label but never exposes it %s", async (verifiedBy) => {
    const h = setup({ receipt: { ...receipt, verifiedBy } });
    expect(await settle(h)).toEqual(publicReceipt);
  });

  it("waits for the atomic commit response before returning a verified receipt", async () => {
    const h = setup(); let resolve!: (value: SupabaseRpcResponse) => void;
    const original = h.rpc.getMockImplementation()!;
    h.rpc.mockImplementation((name, args) => name === PREFIX + "commit" ? new Promise((done) => { resolve = done; }) : original(name, args));
    let finished = false; const pending = settle(h).then((value) => { finished = true; return value; });
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    expect(finished).toBe(false);
    resolve({ data: receipt, error: null });
    expect(await pending).toEqual(publicReceipt);
  });

  it("replays through SQL on every request, including a new process, without claiming current eligibility", async () => {
    const h = setup({ receipt: { ...receipt, replayed: true } });
    expect(await settle(h)).toEqual({ ...publicReceipt, replayed: true });
    expect(await settle(h)).toEqual({ ...publicReceipt, replayed: true });
    const restarted = new AssistedProviderSettlementService({ rpc: h.rpc }, h.source);
    expect(await restarted.settle(viewer, REQUEST, JOURNAL, {})).toEqual({ ...publicReceipt, replayed: true });
    expect(h.rpc.mock.calls.filter(([name]) => name === PREFIX + "commit")).toHaveLength(3);
  });

  it("does not retry a lost commit response locally; a later explicit command can recover SQL replay", async () => {
    const h = setup({ receipt: { ...receipt, replayed: true } }), original = h.rpc.getMockImplementation()!;
    let first = true;
    h.rpc.mockImplementation(async (name, args) => {
      if (name === PREFIX + "commit" && first) { first = false; throw new Error("synthetic response lost after commit"); }
      return original(name, args);
    });
    await expect(settle(h)).rejects.toMatchObject({ code: "provider_settlement_unavailable" });
    expect(h.rpc.mock.calls.filter(([name]) => name === PREFIX + "commit")).toHaveLength(1);
    expect(await settle(h)).toEqual({ ...publicReceipt, replayed: true });
  });
});
