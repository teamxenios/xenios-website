import express, { type Request, type RequestHandler, type Response } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CareAccessDependencies } from "../../../care/access";
import type { AssistedOrderProductionWiring } from "../production-deps";
import type { AssistedOrderViewer } from "../ports";
import { createRequestIntentRouter } from "./express";
import { registerRequestIntentApi, requestIntentRateLimit } from "./production";
import type { RequestIntentRpcClient } from "./rpc-repository";
import { RequestIntentError, type RequestIntentService, type RequestIntentStaffReader } from "./service";

// The Quick Order form treats a FIRST submit answered 503 request_intent_unavailable as "this request was
// not saved" and clears that attempt's retry marker. These pins cover the server paths that send that code
// to a submit (closed intake, an unavailable write limiter or client address, a composition without an RPC
// client) and show each answers before the submit handler starts, so no request record is written. The
// limiter RPC may still have counted the hit. A failure inside the handler stays request_outcome_unconfirmed.
const root = "/api/research/early-access/request-intents";
const origin = "https://fixture.example.invalid";
const viewer: AssistedOrderViewer = { actorType: "early_access_session", memberId: null, authUserId: null,
  earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-session", normalizedEmail: null,
  capabilities: new Set(["assisted_orders:submit"]) };
const care: CareAccessDependencies = {
  loadCapabilityStatus: async () => ({ rail: "care" as const, state: "disabled" as const, enabled: false, publicMessage: "", checkedAt: new Date().toISOString() }),
  resolvePrincipal: async () => null,
  recordAccessDecision: async () => undefined,
};
type Limiter = "allows" | "error" | "malformed" | "throws" | "no_rpc";
function limiterRpc(limiter: Limiter) {
  return vi.fn(async (_name: string, _args?: Readonly<Record<string, unknown>>):
    Promise<{ data: unknown; error: { code?: string; message: string } | null }> => {
    if (limiter === "throws") throw new Error("synthetic limiter outage");
    if (limiter === "error") return { data: null, error: { message: "synthetic limiter failure" } };
    return { data: limiter === "malformed" ? "yes" : true, error: null };
  });
}
function fixture(options: { enabled?: boolean; limiter?: Limiter; resolve?: () => Promise<AssistedOrderViewer>; submit?: () => Promise<unknown> } = {}) {
  const limiter = options.limiter ?? "allows";
  const rpc = limiterRpc(limiter);
  const resolveCustomer = vi.fn(options.resolve ?? (async () => viewer));
  const submit = vi.fn(options.submit ?? (async () => ({})));
  const pass: RequestHandler = (_req, _res, next) => next();
  const app = express(); app.use(express.json());
  app.use(root, createRequestIntentRouter({
    service: { submit, recover: vi.fn(), list: vi.fn(), staffList: vi.fn(), staffRead: vi.fn() } as unknown as RequestIntentService,
    resolveCustomer, care, staffReadEnabled: () => false, staffReader: {} as RequestIntentStaffReader,
    mutationGuard: pass, readRateLimit: pass,
    writeRateLimit: requestIntentRateLimit(limiter === "no_rpc" ? null : { rpc } as unknown as RequestIntentRpcClient, "write"),
    enabled: () => options.enabled ?? true,
  }));
  return { app, rpc, resolveCustomer, submit };
}
/** The registered production composition, with a synthetic RPC client or none. */
function composed(options: { flag?: string; limiter: Limiter }) {
  const rpc = limiterRpc(options.limiter);
  const customer = vi.fn(async () => viewer);
  const wiring: AssistedOrderProductionWiring = {
    env: { SITE_URL: origin, RESEARCH_REQUEST_INTENT_ENABLED: options.flag ?? "true" },
    requiredAgreements: [{ kind: "fixture-terms", version: "fixture-v1" }],
    agreementGate: { accepted: async () => true },
    masterOfferingServiceFor: () => null, bindingFor: () => null, offeringVariantFor: () => null,
    catalogVersion: "synthetic", supabaseRpc: options.limiter === "no_rpc" ? null : { rpc }, supabaseStorage: null, log: () => undefined,
  };
  const app = express(); app.use(express.json());
  registerRequestIntentApi(app, wiring, { customer }, care);
  return { app, rpc, customer };
}
const body = { idempotencyKey: "10000000-0000-4000-8000-000000000001" };
const send = (app: express.Express) => request(app).post(root).send(body);
const sendSameOrigin = (app: express.Express) => request(app).post(root).set("Origin", origin).send(body);

describe("request_intent_unavailable on submit is a pre-handler answer only", () => {
  it("answers closed intake before the limiter, the customer resolver or the service", async () => {
    const f = fixture({ enabled: false });
    const response = await send(f.app);
    expect(response.status).toBe(503); expect(response.body).toEqual({ error: "request_intent_unavailable" });
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.resolveCustomer).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled();
  });
  it.each(["error", "malformed", "throws", "no_rpc"] as const)("answers an unavailable write limiter (%s) before the submit handler", async (limiter) => {
    const f = fixture({ limiter });
    const response = await send(f.app);
    expect(response.status).toBe(503); expect(response.body).toEqual({ error: "request_intent_unavailable" });
    expect(f.resolveCustomer).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled();
  });
  it("answers a write from an unknown client address before its RPC or the handler", async () => {
    const rpc = limiterRpc("allows"), next = vi.fn();
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    requestIntentRateLimit({ rpc } as unknown as RequestIntentRpcClient, "write")(
      { headers: {}, socket: {} } as unknown as Request, res as unknown as Response, next);
    await new Promise((resolve) => setImmediate(resolve));
    expect(res.status).toHaveBeenCalledWith(503); expect(res.json).toHaveBeenCalledWith({ error: "request_intent_unavailable" });
    expect(rpc).not.toHaveBeenCalled(); expect(next).not.toHaveBeenCalled();
  });
  it("answers a failure inside the submit handler as unconfirmed, never with the pre-handler code", async () => {
    for (const options of [
      { resolve: async (): Promise<AssistedOrderViewer> => { throw new Error("synthetic resolver failure"); } },
      { submit: async () => { throw new Error("synthetic lost RPC reply"); } },
      { submit: async () => { throw new RequestIntentError("request_intent_unavailable", 503); } },
    ]) {
      const f = fixture(options);
      const response = await send(f.app);
      expect(response.status).toBe(503); expect(response.body.error).toBe("request_outcome_unconfirmed");
      expect(f.rpc).toHaveBeenCalledTimes(1); expect(f.resolveCustomer).toHaveBeenCalledTimes(1);
    }
  });
  it("answers a composed submit while intake is switched off, before any RPC or the customer resolver", async () => {
    const f = composed({ flag: "false", limiter: "allows" });
    const response = await sendSameOrigin(f.app);
    expect(response.status).toBe(503); expect(response.body).toEqual({ error: "request_intent_unavailable" });
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.customer).not.toHaveBeenCalled();
  });
  it.each(["error", "malformed", "throws"] as const)("answers a composed submit whose write limiter is unavailable (%s) after only the limiter RPC", async (limiter) => {
    const f = composed({ limiter });
    const response = await sendSameOrigin(f.app);
    expect(response.status).toBe(503); expect(response.body).toEqual({ error: "request_intent_unavailable" });
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit"]);
    expect(f.customer).not.toHaveBeenCalled();
  });
  it("answers a submit with request_intent_unavailable when the composition has no RPC client", async () => {
    const f = composed({ limiter: "no_rpc" });
    const response = await sendSameOrigin(f.app);
    expect(response.status).toBe(503); expect(response.body).toEqual({ error: "request_intent_unavailable" });
    expect(f.customer).not.toHaveBeenCalled();
  });
});
