// ADP-01 mounted protocol tests: real Express adapter, viewer resolver, route
// table, provider service and status repository. JWT stamps and RPC responses
// are synthetic ports, not live authentication, SQL races or provider evidence.
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { assistedOrderExpressHandler, createAssistedOrderViewerResolvers, type ExpressAssistedOrderRequest } from "./express";
import { createAssistedOrderRouteTable } from "./http";
import { AssistedOrderConflictError, AssistedOrderService } from "./service";
import type { AssistedOrderDependencies } from "./ports";
import { SupabaseAssistedOrderRepository, type SupabaseRpcClient, type SupabaseRpcResponse } from "./supabase-repository";
import { AssistedProviderJournalService, buildAssistedProviderJournal, type AssistedProviderJournalSource } from "./payment/provider-journal";

const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const REQUEST = id(1), QUOTE = id(2), ACCEPTANCE = id(3), ACTOR = id(4), ATTEMPT = id(5), OTHER = id(6);
const WHEN = "2026-10-01T09:00:00.000Z";
const BEARER = "Bearer synthetic-verified-admin", OTHER_BEARER = "Bearer synthetic-other-admin";
const PATH = "/api/admin/research/assisted-orders/:requestId/provider-attempts";
const URL = PATH.replace(":requestId", REQUEST);
const STATUS_PATH = "/api/admin/research/assisted-orders/:requestId/status";
const STATUS_URL = STATUS_PATH.replace(":requestId", REQUEST);
const command = { quoteId: QUOTE, quoteVersion: 1, acceptanceId: ACCEPTANCE };
const scope = { provider: "synthetic", accountId: "synthetic-account", mode: "test" as const };
const authority = { schemaVersion: "assisted_order_provider_journal_v2", transactionIsolation: "read_committed_only", settlementEnabled: false,
  refundEnabled: false, liveExecutionEnabled: false };
const attempt = () => ({ schemaVersion: "assisted_order_provider_attempt_v1", attemptId: ATTEMPT,
  requestId: REQUEST, ...command, sourceId: "synthetic-source", expectedAmountCents: 16927, currency: "USD",
  state: "held", reservedAt: WHEN, replayed: false });

function mounted(options: { enabled?: boolean; noSource?: boolean; forceNullService?: boolean; omitStamp?: boolean; authority?: unknown;
  reservation?: unknown; reserveError?: SupabaseRpcResponse["error"]; service?: AssistedOrderService } = {}) {
  const rpc = vi.fn<SupabaseRpcClient["rpc"]>(async (name) => {
    if (name === "research_assisted_order_provider_journal_authority") return { data: options.authority ?? authority, error: null };
    if (name === "research_assisted_order_provider_attempt_reserve") return {
      data: options.reserveError ? null : options.reservation ?? attempt(), error: options.reserveError ?? null,
    };
    throw new Error("Unexpected provider RPC");
  });
  const authenticateEvent = vi.fn<AssistedProviderJournalSource["authenticateEvent"]>();
  // Extra execution methods are tripwires: the held service must never call any.
  const createAttempt = vi.fn(), retrieveAttempt = vi.fn(), requestRefund = vi.fn(), requestCancellation = vi.fn();
  const source = { sourceId: "synthetic-source", adapterRevision: "synthetic-v1", scope,
    authenticateEvent, createAttempt, retrieveAttempt, requestRefund, requestCancellation };
  const provider = options.forceNullService ? new AssistedProviderJournalService({ rpc }, null)
    : buildAssistedProviderJournal({ enabled: options.enabled ?? true, rpc: { rpc }, source: options.noSource ? null : source });
  const viewers = createAssistedOrderViewerResolvers({ resolveMember: async () => null,
    earlyAccess: () => null, earlyAccessBindings: () => null, adminEmail: () => "synthetic-admin@example.test" });
  const updateStatus = vi.fn();
  const routes = createAssistedOrderRouteTable<ExpressAssistedOrderRequest>(
    options.service ?? { updateStatus } as unknown as AssistedOrderService,
    viewers, null, null, null, null, provider,
  );
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const bearer = req.headers.authorization;
    if (bearer !== BEARER && bearer !== OTHER_BEARER) { res.status(401).json({ error: "unauthorized" }); return; }
    if (!options.omitStamp) Object.assign(req, { adminAuthUserId: bearer === BEARER ? ACTOR : OTHER });
    next();
  });
  const reservation = routes.find((route) => route.method === "POST" && route.path === PATH);
  if (reservation) app.post(PATH, assistedOrderExpressHandler(reservation));
  const status = routes.find((route) => route.method === "PATCH" && route.path === STATUS_PATH)!;
  app.patch(STATUS_PATH, assistedOrderExpressHandler(status));
  return { app, rpc, routes, updateStatus,
    external: [authenticateEvent, createAttempt, retrieveAttempt, requestRefund, requestCancellation] };
}

describe("ADP-01 mounted held reservation protocol", () => {
  it("refuses a valid old v1 authority before reservation without exposing database facts", async () => {
    const h = mounted({ authority: { schemaVersion: "assisted_order_provider_journal_v1", settlementEnabled: false,
      refundEnabled: false, liveExecutionEnabled: false } });
    const response = await request(h.app).post(URL).set("authorization", BEARER).send(command);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "provider_journal_unavailable", message: "Provider payment processing remains unavailable." });
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual(["research_assisted_order_provider_journal_authority"]);
    for (const operation of h.external) expect(operation).not.toHaveBeenCalled();
  });

  it("passes exact accepted-quote identities with the guarded actor, never a payment operation", async () => {
    const h = mounted();
    const response = await request(h.app).post(URL).set("authorization", BEARER).send(command);
    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual(attempt());
    expect(h.routes.find((route) => route.method === "POST" && route.path === PATH)?.auth).toBe("admin");
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual([
      "research_assisted_order_provider_journal_authority", "research_assisted_order_provider_attempt_reserve",
    ]);
    expect(h.rpc.mock.calls[1][1]).toMatchObject({ p_request_id: REQUEST, p_quote_id: QUOTE, p_quote_version: 1,
      p_acceptance_id: ACCEPTANCE, p_actor_auth_user_id: ACTOR, p_source_id: "synthetic-source",
      p_idempotency_key: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(response.body)).not.toMatch(/clientSecret|checkoutUrl|paymentVerified|providerPaymentId/);
    expect(h.updateStatus).not.toHaveBeenCalled();
    for (const operation of h.external) expect(operation).not.toHaveBeenCalled();
  });

  it.each([{ enabled: false }, { noSource: true }])("does not compose an enabled reservation door without both gates %#", async (options) => {
    const h = mounted(options);
    expect(h.routes.some((route) => route.path === PATH)).toBe(false);
    // This isolated descriptor harness intentionally has no application fallback.
    expect((await request(h.app).post(URL).set("authorization", BEARER).send(command)).status).toBe(404);
    expect(h.rpc).not.toHaveBeenCalled();
    for (const operation of h.external) expect(operation).not.toHaveBeenCalled();
  });

  it("also refuses a manually constructed null-source service before RPC", async () => {
    const h = mounted({ forceNullService: true });
    const response = await request(h.app).post(URL).set("authorization", BEARER).send(command);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("provider_journal_unavailable");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("pins the actual startup mount to verified admin and an unconfigured source", () => {
    const startup = readFileSync(new NodeURL("../../index.ts", import.meta.url), "utf8");
    const composition = startup.slice(startup.indexOf("const assistedProviderJournal = buildAssistedProviderJournal"),
      startup.indexOf("const assistedOrderRoutes =", startup.indexOf("const assistedProviderJournal =")));
    expect(composition).toContain('process.env.RESEARCH_ASSISTED_ORDER_PROVIDER_JOURNAL_ENABLED === "true"');
    expect(composition).toContain("source: null");
    expect(startup).toContain(`app.post("${PATH}", requireSupabaseAdmin,`);
    expect(startup).toContain(`assistedOrderUnavailableDoor("${PATH}", "assisted_order_provider_disabled")`);
  });

  it.each(["", "Bearer browser-admin", "Bearer synthetic-member"])("rejects unverified caller %s before the journal", async (bearer) => {
    const h = mounted();
    const response = await request(h.app).post(URL).set("authorization", bearer)
      .send({ ...command, adminAuthUserId: ACTOR, authenticated: true });
    expect(response.status).toBe(401);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("requires the server JWT stamp even after admission", async () => {
    const h = mounted({ omitStamp: true });
    const response = await request(h.app).post(URL).set("authorization", BEARER).send(command);
    expect(response.status).toBe(403);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("does not substitute the configured admin label for a wrong scoped actor", async () => {
    const h = mounted({ reserveError: { code: "P0001", details: "ASSISTED_ORDER_PROVIDER_GRANT_REQUIRED", message: "private grant mismatch" } });
    const response = await request(h.app).post(URL).set("authorization", OTHER_BEARER).send(command);
    expect(response.status).toBe(403);
    expect(h.rpc.mock.calls[1][1]).toMatchObject({ p_actor_auth_user_id: OTHER });
    expect(JSON.stringify(response.body)).not.toContain("private grant");
  });

  it.each(["expectedAmountCents", "currency", "sourceId", "scope", "adapterRevision", "actorAuthUserId", "paid", "authenticated", "providerEvent"])(
    "rejects browser authority field %s without RPC or external calls", async (field) => {
      const h = mounted();
      expect((await request(h.app).post(URL).set("authorization", BEARER).send({ ...command, [field]: "untrusted" })).status).toBe(400);
      expect(h.rpc).not.toHaveBeenCalled();
      for (const operation of h.external) expect(operation).not.toHaveBeenCalled();
    },
  );

  it.each([{ quoteId: OTHER }, { quoteVersion: 2 }, { acceptanceId: OTHER }])("preserves SQL refusal for a wrong quote binding %#", async (patch) => {
    const h = mounted({ reserveError: { code: "P0001", details: "ASSISTED_ORDER_PROVIDER_RESERVATION_REFUSED", message: "private quote mismatch" } });
    const response = await request(h.app).post(URL).set("authorization", BEARER).send({ ...command, ...patch });
    expect(response.status).toBe(409);
    expect(h.rpc).toHaveBeenCalledTimes(2);
    expect(h.updateStatus).not.toHaveBeenCalled();
    for (const operation of h.external) expect(operation).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain("private quote");
  });

  it.each([{ quoteId: OTHER }, { requestId: OTHER }, { state: "paid" }, { clientSecret: "synthetic-private" }])(
    "never returns a misbound, financial or secret-bearing reservation receipt %#", async (patch) => {
      const h = mounted({ reservation: { ...attempt(), ...patch } });
      const response = await request(h.app).post(URL).set("authorization", BEARER).send(command);
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toMatch(/synthetic-private|clientSecret|"paid"/);
      expect(h.updateStatus).not.toHaveBeenCalled();
    },
  );

  it("returns the same immutable held receipt on replay without external execution", async () => {
    const h = mounted({ reservation: { ...attempt(), replayed: true } });
    const response = await request(h.app).post(URL).set("authorization", BEARER).send(command);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ...attempt(), replayed: true });
    for (const operation of h.external) expect(operation).not.toHaveBeenCalled();
  });
});

describe("ADP-01 generic status SQL hold stays a controlled conflict", () => {
  it.each([
    { code: "P0001", details: "ASSISTED_ORDER_PROVIDER_UNCERTAINTY_HELD_OTHER" },
    { code: "XX000", details: "ASSISTED_ORDER_PROVIDER_UNCERTAINTY_HELD" },
    { code: "P0001", details: "ASSISTED_ORDER_PROVIDER_TRANSACTION_ISOLATION_REQUIRED_OTHER" },
    { code: "XX000", details: "ASSISTED_ORDER_PROVIDER_TRANSACTION_ISOLATION_REQUIRED" },
    { code: "P0001", details: undefined },
  ])("does not disguise other database errors as a provider hold %#", async (error) => {
    const repository = new SupabaseAssistedOrderRepository({ rpc: async () => ({ data: null,
      error: { ...error, message: "synthetic internal failure" } }) });
    await expect(repository.updateStatus({ requestId: REQUEST, fromStatus: "reviewing", toStatus: "cancelled",
      actorId: ACTOR, actorType: "admin", customerMessage: null, internalNote: null,
      evidence: { cancellationReason: "synthetic cancellation" }, occurredAt: WHEN,
    })).rejects.not.toBeInstanceOf(AssistedOrderConflictError);
  });

  it.each([
    { from: "reviewing", to: "cancelled", evidence: { cancellationReason: "synthetic cancellation" } },
    { from: "paid", to: "supplier_processing", evidence: { supplierAssignmentId: "synthetic-assignment" } },
  ].flatMap((transition) => [
    { ...transition, detail: "ASSISTED_ORDER_PROVIDER_UNCERTAINTY_HELD", error: "provider_payment_on_hold",
      message: "This financial action remains on hold while provider payment activity is unresolved." },
    { ...transition, detail: "ASSISTED_ORDER_PROVIDER_TRANSACTION_ISOLATION_REQUIRED", error: "financial_action_unavailable",
      message: "This financial action is unavailable. No change has been made." },
  ]))("refuses $from to $to for $detail through real service/repository without effects", async ({ from, to, evidence, detail, error, message }) => {
    const rpc = vi.fn<SupabaseRpcClient["rpc"]>(async (name) => {
      if (name === "research_assisted_order_admin_get") return { data: {
        requestId: REQUEST, publicReference: "XRR-20261001-ABCDEF0011", status: from,
        actorMemberId: null, fullLegalName: "Synthetic customer", email: "synthetic@example.test", mobilePhone: "+15555550100",
        organizationName: null, shippingAddress: {}, billingAddress: {}, lines: [], estimatedTotalCents: null,
        generalNotes: null, agreements: [], affiliateAttributionRef: null, timeline: [], documents: [], createdAt: WHEN, updatedAt: WHEN,
      }, error: null };
      if (name === "research_assisted_order_financial_state") return {
        data: { hasObservation: from === "paid", paymentVerified: from === "paid" }, error: null,
      };
      if (name === "research_assisted_order_set_status") return { data: null, error: { code: "P0001",
        details: detail, message: "synthetic private provider account and event" } };
      throw new Error("Unexpected status RPC");
    });
    const enqueue = vi.fn(), record = vi.fn();
    const service = new AssistedOrderService({ repository: new SupabaseAssistedOrderRepository({ rpc }),
      clock: { now: () => new Date(WHEN) }, outbox: { enqueue }, audit: { record },
    } as unknown as AssistedOrderDependencies);
    const h = mounted({ enabled: false, service });
    const response = await request(h.app).patch(STATUS_URL).set("authorization", BEARER).send({ status: to, evidence });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error, message });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(rpc.mock.calls.map(([name]) => name)).toContain("research_assisted_order_set_status");
    expect(h.rpc).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});
