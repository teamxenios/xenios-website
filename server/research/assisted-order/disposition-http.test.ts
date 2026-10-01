// Mounted protocol proof: real Express, viewer resolver, route and disposition
// service. Authentication stamps, independent source and RPC results are
// synthetic ports. Database grants/locking/financial truth require the separate
// disposable-database proof; these tests do not authenticate a live provider.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AssistedOrderDispositionService, type AssistedOrderNoFundsEvidenceAuthority } from "./financial-disposition";
import { AssistedOrderDispositionEffectsError, type DispositionEffectsRecovery } from "./disposition-effects";
import { createAssistedOrderRouteTable } from "./http";
import { assistedOrderExpressHandler, createAssistedOrderViewerResolvers, type ExpressAssistedOrderRequest } from "./express";
import type { AssistedOrderService } from "./service";
import type { SupabaseRpcClient, SupabaseRpcResponse } from "./supabase-repository";

const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const REQUEST = id(1), QUOTE = id(2), ACTOR = id(3), DISPOSITION = id(4);
const WHEN = "2026-10-01T06:30:00.000Z", GRAPH = "a".repeat(64);
const PATH = "/api/admin/research/assisted-orders/:requestId/financial-dispositions/no-funds/cancel";
const URL = PATH.replace(":requestId", REQUEST);
const BEARER = "Bearer synthetic-verified-admin";
const command = { evidenceHandle: "synthetic-source-handle", intent: "cancel" };
const graph = () => ({
  schemaVersion: "assisted_order_no_funds_context_v1", requestId: REQUEST,
  publicReference: "XRR-20261001-ABCDEF0011", fromStatus: "payment_review",
  quoteId: QUOTE, quoteVersion: 1, acceptanceId: id(5), totalCents: 16927,
  currency: "USD", graphFingerprint: GRAPH, observations: [], corrections: [], existingDispositionId: null,
});
const source = () => ({
  schemaVersion: "assisted_order_no_funds_receipt_v1" as const,
  sourceNamespace: "synthetic-ledger", sourceReceiptId: "synthetic-immutable-receipt",
  requestId: REQUEST, quoteId: QUOTE, graphFingerprint: GRAPH,
  outcome: "never_received" as const, finality: "terminal" as const, checkedAt: WHEN,
});
const receipt = () => ({ dispositionId: DISPOSITION, requestId: REQUEST, quoteId: QUOTE,
  graphFingerprint: GRAPH, kind: "no_funds", state: "cancelled", resolvedAt: WHEN,
  resolvedBy: "synthetic-private-admin@example.test", replayed: false });
function mounted(options: { disabled?: boolean; missingEffects?: boolean; noAdapter?: boolean;
  context?: unknown; committed?: unknown; contextError?: SupabaseRpcResponse["error"];
  commitError?: SupabaseRpcResponse["error"]; sourceNull?: boolean; sourceNamespace?: string; receiptNamespace?: string } = {}) {
  const rpc = vi.fn<SupabaseRpcClient["rpc"]>(async (name) => {
    if (name === "research_assisted_order_disposition_context") return {
      data: Object.hasOwn(options, "context") ? options.context : graph(), error: options.contextError ?? null,
    };
    if (name === "research_assisted_order_disposition_commit_cancel") return {
      data: Object.hasOwn(options, "committed") ? options.committed : receipt(), error: options.commitError ?? null,
    };
    throw new Error("Unexpected RPC");
  });
  const resolve = vi.fn<AssistedOrderNoFundsEvidenceAuthority["resolve"]>(async () => options.sourceNull ? null : {
    ...source(), sourceNamespace: options.receiptNamespace ?? source().sourceNamespace,
  });
  const recovery = { recover: vi.fn<DispositionEffectsRecovery["recover"]>(async () => {}),
    runBatch: vi.fn<DispositionEffectsRecovery["runBatch"]>(async () => ({ completed: 0, failed: 0 })) };
  const service = new AssistedOrderDispositionService({ rpc }, options.noAdapter ? null : {
    sourceNamespace: options.sourceNamespace ?? "synthetic-ledger", resolve,
  });
  const viewers = createAssistedOrderViewerResolvers({ resolveMember: async () => null,
    earlyAccess: () => null, earlyAccessBindings: () => null, adminEmail: () => "synthetic-admin@example.test" });
  const updateStatus = vi.fn();
  const routes = createAssistedOrderRouteTable<ExpressAssistedOrderRequest>(
    { updateStatus } as unknown as AssistedOrderService, viewers, null, null, null,
    options.disabled ? null : { service, effects: options.missingEffects ? null as unknown as DispositionEffectsRecovery : recovery },
  );
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers.authorization === BEARER) Object.assign(req, { adminAuthUserId: ACTOR });
    // The real service must still reject unstamped callers. The production JWT
    // middleware is not replaced with this synthetic stamp outside this test.
    next();
  });
  const route = routes.find((entry) => entry.method === "POST" && entry.path === PATH);
  if (route) app.post(PATH, assistedOrderExpressHandler(route));
  return { app, rpc, resolve, recovery, updateStatus, routes };
}

describe("mounted explicit no-funds cancellation protocol", () => {
  it("does not mount the command without the optional disposition composition", async () => {
    const h = mounted({ disabled: true });
    expect((await request(h.app).post(URL).send(command)).status).toBe(404);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("commits only server-bound facts, then recovers durable effects and returns a private-data-free receipt", async () => {
    const h = mounted();
    const result = await request(h.app).post(URL).set("authorization", BEARER).send(command);
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.body).toEqual({ dispositionId: DISPOSITION, requestId: REQUEST,
      kind: "no_funds", state: "cancelled", resolvedAt: WHEN, replayed: false });
    expect(h.routes.find((entry) => entry.method === "POST" && entry.path === PATH)?.auth).toBe("admin");
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual([
      "research_assisted_order_disposition_context", "research_assisted_order_disposition_commit_cancel",
    ]);
    expect(h.rpc.mock.calls[1][1]).toMatchObject({ p_request_id: REQUEST, p_quote_id: QUOTE,
      p_expected_graph_fingerprint: GRAPH, p_actor_auth_user_id: ACTOR, p_intent: "cancel", p_receipt: source() });
    expect(h.recovery.recover).toHaveBeenCalledExactlyOnceWith(DISPOSITION, REQUEST);
    expect(h.recovery.recover.mock.invocationCallOrder[0]).toBeGreaterThan(h.rpc.mock.invocationCallOrder[1]);
    expect(h.updateStatus).not.toHaveBeenCalled();
    expect(JSON.stringify(result.body)).not.toMatch(/sourceReceipt|sourceNamespace|graphFingerprint|resolvedBy|synthetic-private/);
  });

  it.each(["", "Bearer browser-admin-claim"])("refuses unstamped actor %s before any authority lookup", async (bearer) => {
    const h = mounted();
    const response = await request(h.app).post(URL).set("authorization", bearer).send({ ...command, authUserId: ACTOR });
    expect(response.status).toBe(403);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.resolve).not.toHaveBeenCalled();
  });

  it.each([{ ...command, noFunds: true }, { ...command, amount: 0 }, { ...command, paymentVerified: false },
    { ...command, receipt: source() }, { ...command, intent: "refund" }, { ...command, intent: "void" }])(
    "rejects browser financial assertions or unsupported disposition intents %#", async (body) => {
      const h = mounted();
      expect((await request(h.app).post(URL).set("authorization", BEARER).send(body)).status).toBe(400);
      expect(h.rpc).not.toHaveBeenCalled();
      expect(h.recovery.recover).not.toHaveBeenCalled();
    },
  );

  it.each([{ noAdapter: true }, { missingEffects: true }])("holds an unavailable dependency before financial writes %#", async (options) => {
    const h = mounted(options);
    const response = await request(h.app).post(URL).set("authorization", BEARER).send(command);
    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).not.toMatch(/was recorded|Payment verification/);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.recovery.recover).not.toHaveBeenCalled();
  });

  it.each([
    { code: "P0001", details: "ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED", status: 403 },
    { code: "PGRST202", details: "missing authority", status: 409 },
    { code: "P0001", details: "ASSISTED_ORDER_NO_FUNDS_REFUSED", status: 409 },
  ])("keeps context refusal $details private and before the independent source", async ({ status, ...error }) => {
    const h = mounted({ contextError: { ...error, message: "synthetic private financial fact" } });
    const response = await request(h.app).post(URL).set("authorization", BEARER).send(command);
    expect(response.status).toBe(status);
    expect(JSON.stringify(response.body)).not.toMatch(/synthetic private|was recorded/);
    expect(h.resolve).not.toHaveBeenCalled();
    expect(h.recovery.recover).not.toHaveBeenCalled();
  });

  it("does not translate no source evidence into no funds", async () => {
    const h = mounted({ sourceNull: true });
    expect((await request(h.app).post(URL).set("authorization", BEARER).send(command)).status).toBe(409);
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.recovery.recover).not.toHaveBeenCalled();
  });

  it("requests the exact configured source grant before lookup and refuses another-source-only actor", async () => {
    const h = mounted({ contextError: { code: "P0001", details: "ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED", message: "grant is for another source" } });
    expect((await request(h.app).post(URL).set("authorization", BEARER).send(command)).status).toBe(403);
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith("research_assisted_order_disposition_context", {
      p_request_id: REQUEST, p_actor_auth_user_id: ACTOR, p_source_namespace: "synthetic-ledger",
    });
    expect(h.resolve).not.toHaveBeenCalled();
  });

  it("refuses malformed configured namespace before lookup and mismatched source receipt before commit", async () => {
    const malformed = mounted({ sourceNamespace: " uppercase " });
    expect((await request(malformed.app).post(URL).set("authorization", BEARER).send(command)).status).toBe(409);
    expect(malformed.rpc).not.toHaveBeenCalled();
    expect(malformed.resolve).not.toHaveBeenCalled();
    const mismatch = mounted({ receiptNamespace: "other-valid-source" });
    expect((await request(mismatch.app).post(URL).set("authorization", BEARER).send(command)).status).toBe(409);
    expect(mismatch.rpc).toHaveBeenCalledTimes(1);
    expect(mismatch.recovery.recover).not.toHaveBeenCalled();
  });

  it("preserves stale-context SQL refusal after source access without recovering or claiming cancellation", async () => {
    const h = mounted({ commitError: { code: "P0001", details: "ASSISTED_ORDER_NO_FUNDS_CONTEXT_STALE", message: "private graph changed" } });
    const response = await request(h.app).post(URL).set("authorization", BEARER).send(command);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("financial_disposition_stale");
    expect(JSON.stringify(response.body)).not.toMatch(/private graph|was recorded/);
    expect(h.resolve).toHaveBeenCalledTimes(1);
    expect(h.recovery.recover).not.toHaveBeenCalled();
  });

  it("reports post-commit recovery failure as cancellation follow-up, never payment verification", async () => {
    const h = mounted();
    h.recovery.recover.mockRejectedValueOnce(new AssistedOrderDispositionEffectsError());
    const response = await request(h.app).post(URL).set("authorization", BEARER).send(command);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "financial_disposition_effects_pending",
      message: "Cancellation was recorded. Its audit and notification follow-up is pending and will be retried automatically." });
    expect(h.rpc).toHaveBeenCalledTimes(2);
    expect(h.updateStatus).not.toHaveBeenCalled();
  });

  it("does not accept or recover a misbound commit receipt", async () => {
    const h = mounted({ committed: { ...receipt(), requestId: id(99) } });
    const response = await request(h.app).post(URL).set("authorization", BEARER).send(command);
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toMatch(/was recorded|synthetic-private/);
    expect(h.recovery.recover).not.toHaveBeenCalled();
  });

  it("returns exact receipt replay and recovers by the same durable identity", async () => {
    const h = mounted({ context: { ...graph(), existingDispositionId: DISPOSITION }, committed: { ...receipt(), replayed: true } });
    const response = await request(h.app).post(URL).set("authorization", BEARER).send(command);
    expect(response.status).toBe(200);
    expect(response.body.replayed).toBe(true);
    expect(h.recovery.recover).toHaveBeenCalledExactlyOnceWith(DISPOSITION, REQUEST);
    expect(h.updateStatus).not.toHaveBeenCalled();
  });
});
