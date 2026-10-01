// Mounted protocol coverage only: JWT admission is synthetic. The separate
// disposable SQL proof exercises the real service and durable authority.
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { assistedOrderExpressHandler, createAssistedOrderViewerResolvers, type ExpressAssistedOrderRequest } from "./express";
import { createAssistedOrderRouteTable } from "./http";
import { AssistedOrderAuthorizationError, AssistedOrderConflictError, type AssistedOrderService } from "./service";
import { AssistedProviderExecutionService, buildAssistedProviderExecution } from "./payment/provider-execution";

const id = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const REQUEST = id(1), ATTEMPT = id(2), ACTOR = id(3);
const PATH = "/api/admin/research/assisted-orders/:requestId/provider-attempts/:attemptId/prepare";
const URL = PATH.replace(":requestId", REQUEST).replace(":attemptId", ATTEMPT);
const BEARER = "Bearer synthetic-adp02-admin";
const receipt = Object.freeze({ schemaVersion: "assisted_order_provider_execution_receipt_v1",
  requestId: REQUEST, attemptId: ATTEMPT, state: "held", outcome: "recorded", replayed: false });

function mounted(options: { service?: AssistedProviderExecutionService | null; omitStamp?: boolean } = {}) {
  const prepare = vi.fn(async () => receipt);
  const execution = options.service === undefined
    ? { prepare } as unknown as AssistedProviderExecutionService : options.service;
  const viewers = createAssistedOrderViewerResolvers({ resolveMember: async () => null,
    earlyAccess: () => null, earlyAccessBindings: () => null, adminEmail: () => "synthetic-admin@example.test" });
  const routes = createAssistedOrderRouteTable<ExpressAssistedOrderRequest>(
    {} as AssistedOrderService, viewers, null, null, null, null, null, execution,
  );
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.headers.authorization !== BEARER) { res.status(401).json({ error: "unauthorized" }); return; }
    if (!options.omitStamp) Object.assign(req, { adminAuthUserId: ACTOR });
    next();
  });
  const descriptor = routes.find((route) => route.method === "POST" && route.path === PATH);
  if (descriptor) app.post(PATH, assistedOrderExpressHandler(descriptor));
  return { app, routes, prepare };
}

describe("ADP02 mounted provider create/recovery protocol", () => {
  it("has a separate admin POST and passes server actor plus exact path identities", async () => {
    const h = mounted();
    const response = await request(h.app).post(URL).set("authorization", BEARER).send({});
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual(receipt);
    expect(h.routes.find((route) => route.method === "POST" && route.path === PATH)?.auth).toBe("admin");
    expect(h.prepare).toHaveBeenCalledWith(expect.objectContaining({ actorType: "admin", authUserId: ACTOR }), REQUEST, ATTEMPT, {});
    expect(h.routes.some((route) => route.method === "POST" && route.path.endsWith("/provider-attempts"))).toBe(false);
  });

  it.each(["", "Bearer browser-admin", "Bearer synthetic-member"])("refuses unverified admission %s before prepare", async (authorization) => {
    const h = mounted();
    expect((await request(h.app).post(URL).set("authorization", authorization).send({ authenticated: true, adminAuthUserId: ACTOR })).status).toBe(401);
    expect(h.prepare).not.toHaveBeenCalled();
  });

  it("requires the actual server stamp inside the real service, not a browser claim", async () => {
    const rpc = vi.fn();
    const h = mounted({ service: new AssistedProviderExecutionService({ rpc }, null), omitStamp: true });
    const response = await request(h.app).post(URL).set("authorization", BEARER).send({});
    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a directly constructed null-source service remains safely unavailable", async () => {
    const rpc = vi.fn();
    const h = mounted({ service: new AssistedProviderExecutionService({ rpc }, null) });
    const response = await request(h.app).post(URL).set("authorization", BEARER).send({});
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("provider_execution_unavailable");
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([false, true])("no source means no descriptor even when flag=%s", async (enabled) => {
    const rpc = vi.fn();
    const service = buildAssistedProviderExecution({ enabled, rpc: { rpc }, source: null });
    expect(service).toBeNull();
    const h = mounted({ service });
    expect(h.routes.some((route) => route.path === PATH)).toBe(false);
    // No production fallback in this isolated descriptor harness.
    expect((await request(h.app).post(URL).set("authorization", BEARER).send({})).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never dispatches on GET or the unmounted OPTIONS descriptor", async () => {
    const h = mounted();
    expect((await request(h.app).get(URL).set("authorization", BEARER)).status).toBe(404);
    await request(h.app).options(URL).set("authorization", BEARER);
    expect(h.prepare).not.toHaveBeenCalled();
  });

  it.each([
    { error: new AssistedOrderAuthorizationError(), status: 403 },
    { error: new AssistedOrderConflictError("provider_execution_unavailable", "Provider payment processing remains unavailable."), status: 409 },
    { error: new Error("synthetic-private-provider-payload"), status: 500 },
  ])("keeps failure class $status without exposing provider error text", async ({ error, status }) => {
    const h = mounted();
    h.prepare.mockRejectedValueOnce(error);
    const response = await request(h.app).post(URL).set("authorization", BEARER).send({});
    expect(response.status).toBe(status);
    expect(JSON.stringify(response.body)).not.toContain("synthetic-private-provider-payload");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("pins the literal production mount to verified admin and unconditional null source", () => {
    const startup = readFileSync(new NodeURL("../../index.ts", import.meta.url), "utf8");
    const start = startup.indexOf("const assistedProviderExecution = buildAssistedProviderExecution");
    expect(start).toBeGreaterThan(-1);
    const composition = startup.slice(start, startup.indexOf("const assistedOrderRoutes =", start));
    expect(composition).toContain('process.env.RESEARCH_ASSISTED_ORDER_PROVIDER_EXECUTION_ENABLED === "true"');
    expect(composition).toContain("source: null");
    expect(startup).toContain(`app.post("${PATH}", requireSupabaseAdmin,`);
    expect(startup).toContain(`assistedOrderUnavailableDoor("${PATH}", "assisted_order_provider_execution_disabled")`);
    expect(composition).not.toMatch(/Stripe|Square|Authorize\.net|process\.env\.[A-Z_]*SECRET/);
  });
});
