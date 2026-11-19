import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AssistedOrderViewer } from "../ports";
import type { CareAccessDependencies } from "../../../care/access";
import { createRequestIntentRouter } from "./express";
import { RequestIntentError, type RequestIntentService } from "./service";
import type { RequestReferralSourceProvider, RequestReferralSourceReader } from "./referral-source";

const viewer: AssistedOrderViewer = { actorType: "member", authUserId: "10000000-0000-4000-8000-000000000001",
  memberId: "synthetic-member", normalizedEmail: null, earlyAccessSessionHash: null,
  capabilities: new Set(["assisted_orders:submit"]) };
const receipt = { kind: "unapproved_selection_request" as const, requestId: "20000000-0000-4000-8000-000000000002",
  publicReference: "XRI-20000000000040008000000000000002", status: "pending_review" as const, createdAt: "2026-11-19T12:00:00.000Z" };
const pass: RequestHandler = (_req, _res, next) => next();
// A routing-boundary fake only. Canonical validation/replay/save is tested with
// the real service and repository; these probes assert the actual POST wiring.
function fixture(source?: RequestReferralSourceProvider) {
  const resolveCustomer = vi.fn(async () => viewer);
  const submit = vi.fn(async (_viewer: AssistedOrderViewer, _body: unknown, _reader?: RequestReferralSourceReader) => receipt);
  const app = express(); app.use(express.json());
  app.use("/requests", createRequestIntentRouter({ service: { submit } as unknown as RequestIntentService,
    resolveCustomer, care: {} as CareAccessDependencies, staffReadEnabled: () => false,
    staffReader: { get: async () => null, list: async () => ({ items: [], total: 0, page: 1, pageSize: 25 }) },
    mutationGuard: pass, readRateLimit: pass, writeRateLimit: pass, enabled: () => true,
    ...(source ? { referralSource: source } : {}) }));
  return { app, resolveCustomer, submit };
}

describe("actual request POST lazy server locator boundary", () => {
  it("passes the canonical resolved viewer and raw cookie only through a lazy trusted closure", async () => {
    const source = vi.fn(() => ({ kind: "account" as const, actorAuthUserId: viewer.authUserId! }));
    const f = fixture(source), body = { reported: "unchanged routing input", _serverReferral: { kind: "no_supported_touch" } };
    f.submit.mockImplementationOnce(async (resolved, raw, read) => {
      expect(resolved).toBe(viewer); expect(raw).toEqual(body);
      expect(source).not.toHaveBeenCalled(); expect(typeof read).toBe("function");
      expect(read!()).toEqual({ kind: "account", actorAuthUserId: viewer.authUserId }); return receipt;
    });
    const response = await request(f.app).post("/requests").set("Cookie", "synthetic-cookie=private").send(body);
    expect(response.status).toBe(200); expect(response.body).toEqual(receipt);
    expect(f.resolveCustomer).toHaveBeenCalledTimes(1);
    expect(source).toHaveBeenCalledExactlyOnceWith(viewer, "synthetic-cookie=private");
    expect(f.submit).toHaveBeenCalledTimes(1);
  });
  it("does not read the optional source unless the service consumes it", async () => {
    const source = vi.fn(() => { throw Error("must remain lazy for saved replay"); });
    const f = fixture(source);
    expect((await request(f.app).post("/requests").send({ idempotencyKey: receipt.requestId })).body).toEqual(receipt);
    expect(source).not.toHaveBeenCalled(); expect(typeof f.submit.mock.calls[0][2]).toBe("function");
  });
  it("keeps the original two-argument service call when the capability is not configured", async () => {
    const f = fixture(), body = { idempotencyKey: receipt.requestId };
    expect((await request(f.app).post("/requests").send(body)).status).toBe(200);
    expect(f.submit).toHaveBeenCalledExactlyOnceWith(viewer, body);
  });
  it("does no source read or submit after canonical identity denial", async () => {
    const source = vi.fn(() => ({ kind: "no_supported_touch" as const })), f = fixture(source);
    f.resolveCustomer.mockRejectedValueOnce(new RequestIntentError("authentication_required", 401));
    const response = await request(f.app).post("/requests").send({});
    expect(response.status).toBe(401); expect(source).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled();
  });
  it("preserves uncertainty and performs no alternate submit when a source unexpectedly throws", async () => {
    const source = vi.fn(() => { throw Error("private source diagnostic"); }), f = fixture(source);
    f.submit.mockImplementationOnce(async (_viewer, _body, read) => { read!(); return receipt; });
    const response = await request(f.app).post("/requests").send({});
    expect(response.status).toBe(503); expect(response.body.error).toBe("request_outcome_unconfirmed");
    expect(JSON.stringify(response.body)).not.toContain("private source diagnostic");
    expect(source).toHaveBeenCalledTimes(1); expect(f.submit).toHaveBeenCalledTimes(1);
  });
});
