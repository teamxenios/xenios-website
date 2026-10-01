import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { AssistedOrderDispositionService, type AssistedOrderNoFundsSourceReceipt } from "./financial-disposition";
import type { AssistedOrderViewer } from "./ports";
import type { SupabaseRpcClient, SupabaseRpcResponse } from "./supabase-repository";

const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const REQUEST = id(1), QUOTE = id(2), ACTOR = id(3), DISPOSITION = id(4), OBSERVATION = id(5);
const WHEN = "2026-10-01T06:30:00.000Z", GRAPH = "a".repeat(64);
const viewer: AssistedOrderViewer = { actorType: "admin", memberId: null, authUserId: ACTOR,
  earlyAccessSessionHash: null, normalizedEmail: "operator@example.test", actorLabel: "operator@example.test",
  capabilities: new Set(["assisted_orders:manage"]) };
const command = { evidenceHandle: "synthetic-source-handle", intent: "cancel" };
const graph = () => ({
  schemaVersion: "assisted_order_no_funds_context_v1", requestId: REQUEST, publicReference: "XRR-20261001-ABCDEF0011",
  fromStatus: "payment_review", quoteId: QUOTE, quoteVersion: 1, acceptanceId: id(6),
  totalCents: 16927, currency: "USD", graphFingerprint: GRAPH,
  observations: [{ observationId: OBSERVATION, quoteId: QUOTE, method: "manual", paymentReference: "XRR-20261001-ABCDEF0011",
    sourceEvidenceRef: "independent-original-transaction", observedAmountCents: 16927, observedCurrency: "USD",
    observedAt: WHEN, recordedAt: WHEN, observedByAuthUserId: ACTOR }],
  corrections: [], existingDispositionId: null,
});
const source = (): AssistedOrderNoFundsSourceReceipt => ({
  schemaVersion: "assisted_order_no_funds_receipt_v1", sourceNamespace: "synthetic-ledger", sourceReceiptId: "immutable-receipt-1",
  requestId: REQUEST, quoteId: QUOTE, graphFingerprint: GRAPH, outcome: "never_received", finality: "terminal", checkedAt: WHEN,
});
const committed = () => ({ dispositionId: DISPOSITION, requestId: REQUEST, quoteId: QUOTE, graphFingerprint: GRAPH,
  kind: "no_funds", state: "cancelled", resolvedAt: WHEN, resolvedBy: "operator@example.test", replayed: false });
function harness(options: { context?: unknown; source?: unknown; committed?: unknown;
  contextError?: SupabaseRpcResponse["error"]; commitError?: SupabaseRpcResponse["error"] } = {}) {
  const rpc = vi.fn<SupabaseRpcClient["rpc"]>(async (name) => {
    if (name === "research_assisted_order_disposition_context") return {
      data: Object.hasOwn(options, "context") ? options.context : graph(), error: options.contextError ?? null,
    };
    if (name === "research_assisted_order_disposition_commit_cancel") return {
      data: Object.hasOwn(options, "committed") ? options.committed : committed(), error: options.commitError ?? null,
    };
    throw new Error("Unexpected private RPC");
  });
  const resolve = vi.fn<(input: unknown) => Promise<unknown>>(async (_input) => Object.hasOwn(options, "source") ? options.source : source());
  // Unknown/malformed adapter values simulate the boundary's runtime input.
  const authority = { sourceNamespace: "synthetic-ledger", resolve: async (input: unknown) => Reflect.apply(resolve, undefined, [input]) as Promise<AssistedOrderNoFundsSourceReceipt | null> };
  return { rpc, resolve, service: new AssistedOrderDispositionService({ rpc }, authority) };
}
afterEach(() => vi.useRealTimers());

describe("provider-neutral positive no-funds cancellation authority", () => {
  it("checks the scoped server context before source access and atomically commits its exact receipt", async () => {
    const h = harness();
    const result = await h.service.cancelWithNoFunds({ ...viewer, authUserId: ACTOR.toUpperCase() }, REQUEST.toUpperCase(), command);
    expect(h.rpc.mock.calls[0]).toEqual(["research_assisted_order_disposition_context", {
      p_request_id: REQUEST, p_actor_auth_user_id: ACTOR, p_source_namespace: "synthetic-ledger",
    }]);
    expect(h.resolve.mock.invocationCallOrder[0]).toBeGreaterThan(h.rpc.mock.invocationCallOrder[0]);
    const input = h.resolve.mock.calls[0][0] as unknown as { context: ReturnType<typeof graph>; evidenceHandle: string; actorAuthUserId: string; signal: AbortSignal };
    expect(input.context).toEqual(graph());
    expect(input).toMatchObject({ evidenceHandle: command.evidenceHandle, actorAuthUserId: ACTOR });
    expect(input.signal).toBeInstanceOf(AbortSignal);
    expect(Object.isFrozen(input.context)).toBe(true);
    expect(Object.isFrozen(input.context.observations[0])).toBe(true);
    const key = createHash("sha256").update(JSON.stringify([
      "assisted-order-no-funds:v1", source().sourceNamespace, source().sourceReceiptId, REQUEST, GRAPH,
    ])).digest("hex");
    expect(h.rpc).toHaveBeenLastCalledWith("research_assisted_order_disposition_commit_cancel", {
      p_request_id: REQUEST, p_quote_id: QUOTE, p_expected_graph_fingerprint: GRAPH, p_actor_auth_user_id: ACTOR,
      p_idempotency_key: key, p_intent: "cancel", p_receipt: source(),
    });
    expect(result).toEqual({ dispositionId: DISPOSITION, requestId: REQUEST, kind: "no_funds", state: "cancelled", resolvedAt: WHEN, replayed: false });
    expect(Object.isFrozen(result)).toBe(true);
    for (const privateField of ["resolvedBy", "sourceReceiptId", "sourceNamespace", "graphFingerprint", "observations", "hasObservation", "paymentVerified"]) {
      expect(result).not.toHaveProperty(privateField);
    }
  });

  it("does not infer a no-funds fact when the adapter is unconfigured", async () => {
    const rpc = vi.fn();
    await expect(new AssistedOrderDispositionService({ rpc }, null).cancelWithNoFunds(viewer, REQUEST, command))
      .rejects.toMatchObject({ code: "financial_disposition_evidence_unavailable" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("binds the configured source namespace before scoped grant lookup", async () => {
    const h = harness({ contextError: { code: "P0001", details: "ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED", message: "another source is not authority" } });
    await expect(h.service.cancelWithNoFunds(viewer, REQUEST, command)).rejects.toHaveProperty("name", "AssistedOrderAuthorizationError");
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith("research_assisted_order_disposition_context", {
      p_request_id: REQUEST, p_actor_auth_user_id: ACTOR, p_source_namespace: "synthetic-ledger",
    });
    expect(h.resolve).not.toHaveBeenCalled();
  });

  it("refuses a receipt from a different source than the configured authority", async () => {
    const h = harness({ source: { ...source(), sourceNamespace: "another-valid-source" } });
    await expect(h.service.cancelWithNoFunds(viewer, REQUEST, command))
      .rejects.toMatchObject({ code: "financial_disposition_evidence_unverified" });
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it.each(["", " padded ", "UPPERCASE", "bank/control\n", "x".repeat(81)])(
    "refuses malformed configured source namespace %j before any access", async (sourceNamespace) => {
      const rpc = { rpc: vi.fn() }, resolve = vi.fn(async () => source());
      const service = new AssistedOrderDispositionService(rpc, { sourceNamespace, resolve });
      await expect(service.cancelWithNoFunds(viewer, REQUEST, command))
        .rejects.toMatchObject({ code: "financial_disposition_evidence_unavailable" });
      expect(rpc.rpc).not.toHaveBeenCalled();
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it("passes original and replacement source identities without treating a correction or null legacy actor as no funds", async () => {
    const original = { ...graph().observations[0], observedByAuthUserId: null };
    const replacement = { ...graph().observations[0], observationId: id(7), sourceEvidenceRef: "independent-replacement-transaction" };
    const context = { ...graph(), observations: [original, replacement], corrections: [{
      observationId: original.observationId, replacementId: replacement.observationId,
      reason: "Synthetic correction", correctedBy: ACTOR, correctedAt: WHEN,
    }] };
    const h = harness({ context, source: null });
    await expect(h.service.cancelWithNoFunds(viewer, REQUEST, command))
      .rejects.toMatchObject({ code: "financial_disposition_evidence_unverified" });
    expect(h.resolve).toHaveBeenCalledWith(expect.objectContaining({ context }));
    const input = h.resolve.mock.calls[0][0] as { context: typeof context };
    expect(Object.isFrozen(input.context.corrections[0])).toBe(true);
    expect(input.context.observations.map((row) => row.sourceEvidenceRef)).toEqual([
      "independent-original-transaction", "independent-replacement-transaction",
    ]);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...viewer, actorType: "member" as const }, { ...viewer, authUserId: null },
    { ...viewer, capabilities: new Set<string>() }, { ...viewer, authUserId: "browser-label" },
  ])("refuses a non-authorized actor before context or evidence %#", async (actor) => {
    const h = harness();
    await expect(h.service.cancelWithNoFunds(actor, REQUEST, command)).rejects.toHaveProperty("name", "AssistedOrderAuthorizationError");
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.resolve).not.toHaveBeenCalled();
  });

  it.each([
    { ...command, noFunds: true }, { ...command, sourceReceiptId: "typed-proof" },
    { ...command, amount: 0 }, { ...command, kind: "refund" }, { ...command, actorAuthUserId: ACTOR },
    { ...command, graphFingerprint: GRAPH }, { ...command, intent: "refund" },
    { ...command, intent: "void" }, { ...command, intent: "" }, { evidenceHandle: "handle" },
    { ...command, evidenceHandle: " padded " }, { ...command, evidenceHandle: "private\nraw" },
  ])("accepts only the two intent fields, never typed financial facts %#", async (input) => {
    const h = harness();
    await expect(h.service.cancelWithNoFunds(viewer, REQUEST, input)).rejects.toHaveProperty("name", "AssistedOrderValidationError");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { code: "P0001", details: "ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED", name: "AssistedOrderAuthorizationError" },
    { code: "PGRST202", details: "", name: "AssistedOrderConflictError" },
    { code: "P0001", details: "ASSISTED_ORDER_NO_FUNDS_REFUSED", name: "AssistedOrderConflictError" },
  ])("refuses the context authority before source access: $details", async ({ code, details, name }) => {
    const h = harness({ contextError: { code, details, message: "private database detail" } });
    const error = await h.service.cancelWithNoFunds(viewer, REQUEST, command).catch((failure) => failure);
    expect(error).toHaveProperty("name", name);
    expect(String(error)).not.toContain("private database detail");
    expect(h.resolve).not.toHaveBeenCalled();
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    null, {}, { ...graph(), requestId: id(99) }, { ...graph(), fromStatus: "paid" },
    { ...graph(), fromStatus: "supplier_processing" }, { ...graph(), graphFingerprint: "bad" },
    { ...graph(), currency: "EUR" }, { ...graph(), hasObservation: false },
    { ...graph(), observations: [graph().observations[0], graph().observations[0]] },
    { ...graph(), observations: [{ ...graph().observations[0], method: "provider" }] },
    { ...graph(), observations: [{ ...graph().observations[0], quoteId: id(99) }] },
    { ...graph(), observations: Array.from({ length: 101 }, (_, i) => ({ ...graph().observations[0], observationId: id(i + 100) })) },
    { ...graph(), corrections: [{ observationId: OBSERVATION, replacementId: id(99), reason: "fixture", correctedBy: ACTOR, correctedAt: WHEN }] },
    { ...graph(), corrections: [{ observationId: OBSERVATION, replacementId: OBSERVATION, reason: "fixture", correctedBy: ACTOR, correctedAt: WHEN }] },
  ])("does not treat a missing, malformed or unrelated graph as financial evidence %#", async (context) => {
    const h = harness({ context });
    await expect(h.service.cancelWithNoFunds(viewer, REQUEST, command)).rejects.toThrow();
    expect(h.resolve).not.toHaveBeenCalled();
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    null, {}, { ...source(), requestId: id(99) }, { ...source(), quoteId: id(99) },
    { ...source(), graphFingerprint: "b".repeat(64) }, { ...source(), outcome: "zero_balance" },
    { ...source(), outcome: "net_zero" }, { ...source(), outcome: "refunded" }, { ...source(), outcome: "void" },
    { ...source(), finality: "pending" }, { ...source(), finality: "unknown" },
    { ...source(), amount: 0 }, { ...source(), sourceReceiptId: " padded " },
    { ...source(), sourceNamespace: "browser supplied" }, { ...source(), checkedAt: "not-a-time" },
    { ...source(), checkedAt: "2026-10-01T06:30:00.000+00:00" },
    { ...source(), checkedAt: "2026-10-01T06:30:00Z" },
    { ...source(), checkedAt: "2026-10-01T06:30:00.000001Z" },
    { ...source(), checkedAt: "2026-02-30T06:30:00.000Z" },
  ])("requires a complete exact terminal never-received receipt %#", async (sourceValue) => {
    const h = harness({ source: sourceValue });
    await expect(h.service.cancelWithNoFunds(viewer, REQUEST, command))
      .rejects.toMatchObject({ code: "financial_disposition_evidence_unverified" });
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("bounds an evidence source timeout and aborts without committing or reflecting details", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.resolve.mockImplementation(() => new Promise(() => {}));
    const pending = h.service.cancelWithNoFunds(viewer, REQUEST, command);
    const rejection = expect(pending).rejects.toMatchObject({ code: "financial_disposition_evidence_unavailable" });
    await vi.advanceTimersByTimeAsync(5_001);
    await rejection;
    const input = h.resolve.mock.calls[0][0] as unknown as { signal: AbortSignal };
    expect(input.signal.aborted).toBe(true);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("does not leak an independent evidence-source exception", async () => {
    const h = harness();
    h.resolve.mockRejectedValueOnce(new Error("private bank transaction detail"));
    const error = await h.service.cancelWithNoFunds(viewer, REQUEST, command).catch((failure) => failure);
    expect(error).toMatchObject({ code: "financial_disposition_evidence_unavailable" });
    expect(String(error)).not.toContain("private bank transaction detail");
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it.each(["ASSISTED_ORDER_NO_FUNDS_CONTEXT_STALE", "ASSISTED_ORDER_NO_FUNDS_REFUSED",
    "ASSISTED_ORDER_NO_FUNDS_RECEIPT_INVALID", "ASSISTED_ORDER_NO_FUNDS_REPLAY_CONFLICT", "ASSISTED_ORDER_NO_FUNDS_EVIDENCE_REUSED"])(
    "honors SQL refusal after the source lookup without retry: %s", async (details) => {
      const h = harness({ commitError: { code: "P0001", details, message: "private financial context" } });
      await expect(h.service.cancelWithNoFunds(viewer, REQUEST, command)).rejects.toHaveProperty("name", "AssistedOrderConflictError");
      expect(h.resolve).toHaveBeenCalledTimes(1);
      expect(h.rpc).toHaveBeenCalledTimes(2);
    },
  );

  it("rechecks a revoked grant at commit rather than granting from the earlier successful context", async () => {
    const h = harness({ commitError: { code: "P0001", details: "ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED", message: "revoked" } });
    await expect(h.service.cancelWithNoFunds(viewer, REQUEST, command)).rejects.toHaveProperty("name", "AssistedOrderAuthorizationError");
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it.each([
    null, {}, { ...committed(), requestId: id(99) }, { ...committed(), quoteId: id(99) },
    { ...committed(), graphFingerprint: "b".repeat(64) }, { ...committed(), dispositionId: "bad" },
    { ...committed(), kind: "refund" }, { ...committed(), state: "paid" },
    { ...committed(), resolvedAt: "bad" }, { ...committed(), resolvedBy: " padded " },
    { ...committed(), replayed: "true" }, { ...committed(), privateExtra: "raw" },
    { ...committed(), resolvedAt: "2026-10-01T06:30:00.000+00:00" },
    { ...committed(), resolvedAt: "2026-10-01T06:30:00Z" },
    { ...committed(), resolvedAt: "2026-10-01T06:30:00.000001Z" },
    { ...committed(), resolvedAt: "2026-02-30T06:30:00.000Z" },
  ])("does not accept malformed or misbound post-commit receipts %#", async (receipt) => {
    const h = harness({ committed: receipt });
    await expect(h.service.cancelWithNoFunds(viewer, REQUEST, command)).rejects.toThrow("Financial disposition receipt unavailable");
  });

  it("keeps idempotency bound to the immutable receipt and original graph on replay", async () => {
    const h = harness({ context: { ...graph(), existingDispositionId: DISPOSITION }, committed: { ...committed(), replayed: true } });
    expect((await h.service.cancelWithNoFunds(viewer, REQUEST, command)).replayed).toBe(true);
    const first = h.rpc.mock.calls[1][1];
    await h.service.cancelWithNoFunds(viewer, REQUEST, command);
    expect(h.rpc.mock.calls[3][1]).toEqual(first);
    const wrong = harness({ context: { ...graph(), existingDispositionId: id(99) } });
    await expect(wrong.service.cancelWithNoFunds(viewer, REQUEST, command)).rejects.toThrow("Financial disposition receipt unavailable");
  });
});
