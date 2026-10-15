import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AssistedOrderProductionWiring } from "../production-deps";
import type { AssistedOrderViewer } from "../ports";
import type { CareAccessDependencies } from "../../../care/access";
import { registerRequestIntentApi, requestIntentOrigin } from "./production";

const root = "/api/research/early-access/request-intents";
const actor = "10000000-0000-4000-8000-000000000001";
function fixture(options: { enabled?: boolean; legal?: boolean; rate?: "ok" | "denied" | "failure";
  principal?: "clinical_admin" | "research_admin" | "absent"; bearerRejected?: boolean;
  staffFlag?: string; staffDbDenied?: boolean } = {}) {
  const rpc = vi.fn(async (name: string, _args?: Readonly<Record<string, unknown>>) => {
    if (name === "research_rate_limit_hit") return options.rate === "failure"
      ? { data: null, error: { message: "private diagnostic never returned" } }
      : { data: options.rate !== "denied", error: null };
    if (name === "request_intent_find_attempt") return { data: null, error: null };
    if (name === "request_intent_staff_list") return options.staffDbDenied
      ? { data: null, error: { code: "42501", message: "private approval or current role absent" } }
      : { data: { items: [], total: 0, page: 1, pageSize: 25 }, error: null };
    if (name === "request_intent_staff_get") return { data: null, error: null };
    throw new Error("Unexpected RPC " + name);
  });
  const wiring: AssistedOrderProductionWiring = {
    env: { SITE_URL: "https://fixture.example.invalid", RESEARCH_REQUEST_INTENT_ENABLED: options.enabled === false ? "false" : "true",
      RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED: options.staffFlag, CARE_ENABLED: "false", CARE_ENABLE_APPROVED: "false" },
    requiredAgreements: options.legal === false ? [] : [{ kind: "fixture-terms", version: "fixture-v1" }],
    agreementGate: { accepted: async () => true },
    masterOfferingServiceFor: () => null, bindingFor: () => null, offeringVariantFor: () => null,
    catalogVersion: "synthetic", supabaseRpc: { rpc }, supabaseStorage: null, log: () => undefined,
  };
  const viewer: AssistedOrderViewer = { actorType: options.bearerRejected ? "early_access_session" : "member",
    memberId: options.bearerRejected ? null : "synthetic-member", authUserId: options.bearerRejected ? null : actor,
    earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-hash", normalizedEmail: null,
    capabilities: new Set(["assisted_orders:submit"]) };
  const care: CareAccessDependencies = {
    loadCapabilityStatus: vi.fn(async () => ({ rail: "care" as const, state: "disabled" as const, enabled: false, publicMessage: "", checkedAt: new Date().toISOString() })),
    resolvePrincipal: async () => options.principal === "absent" ? null : ({
      subjectId: actor, roles: [options.principal ?? "research_admin"],
    }),
    recordAccessDecision: vi.fn(async () => undefined),
  };
  const app = express(); app.use(express.json());
  registerRequestIntentApi(app, wiring, { customer: async () => viewer }, care);
  return { app, rpc, care };
}
describe("proposed mixed-request production composition", () => {
  it("requires an explicit canonical origin and rejects credentials, paths and nonlocal HTTP", () => {
    expect(requestIntentOrigin(undefined)).toBeNull();
    for (const value of ["https://user@example.invalid", "https://fixture.example.invalid/path", "http://fixture.example.invalid", "https://fixture.example.invalid/?x=1"]) {
      expect(requestIntentOrigin(value)).toBeNull();
    }
    expect(requestIntentOrigin("http://127.0.0.1:5100")).toBe("http://127.0.0.1:5100");
    expect(requestIntentOrigin("https://fixture.example.invalid")).toBe("https://fixture.example.invalid");
  });
  it("is dark by default and performs no RPC while disabled", async () => {
    const f = fixture({ enabled: false });
    expect((await request(f.app).get(root + "/config")).status).toBe(503);
    expect((await request(f.app).post(root).send({})).status).toBe(503);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("distinguishes configured off from broken readiness without granting fallback on a readiness failure", async () => {
    const off = fixture({ enabled: false });
    expect((await request(off.app).get(root + "/config")).body).toEqual({
      enabled: false, error: "request_intent_disabled",
    });
    const broken = fixture({ legal: false });
    expect((await request(broken.app).get(root + "/config")).body).toEqual({
      enabled: false, error: "request_intent_unavailable",
    });
    expect(off.rpc).not.toHaveBeenCalled(); expect(broken.rpc).not.toHaveBeenCalled();
  });
  it("does not invent legal versions when canonical requirements are missing", async () => {
    const f = fixture({ legal: false });
    expect((await request(f.app).get(root + "/config")).status).toBe(503);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("publishes the canonical legal pairs and separately scoped operational facts", async () => {
    const f = fixture();
    const response = await request(f.app).get(root + "/config");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body.requiredAgreements).toEqual([{ kind: "fixture-terms", version: "fixture-v1" }]);
    expect(response.body.formAcknowledgments.find((a: { id: string }) => a.id === "research_use_only").scope).toBe("research_use_only");
  });
  it("rejects cross-origin, absent-origin, wrong Fetch Metadata and non-JSON before persistence", async () => {
    const f = fixture();
    expect((await request(f.app).post(root).send({})).status).toBe(403);
    expect((await request(f.app).post(root).set("Origin", "https://attacker.example.invalid").send({})).status).toBe(403);
    expect((await request(f.app).post(root).set("Origin", "https://fixture.example.invalid").set("Sec-Fetch-Site", "cross-site").send({})).status).toBe(403);
    expect((await request(f.app).post(root).set("Origin", "https://fixture.example.invalid").type("form").send("a=b")).status).toBe(403);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("refuses a durable-limiter error or denial without a process-memory fallback", async () => {
    const failed = fixture({ rate: "failure" }), denied = fixture({ rate: "denied" });
    const response = await request(failed.app).get(root + "/config");
    expect(response.status).toBe(503); expect(JSON.stringify(response.body)).not.toContain("private diagnostic");
    expect((await request(denied.app).get(root + "/config")).status).toBe(429);
  });
  it("does not let a rejected bearer fall back to an Early Access cookie owner", async () => {
    const f = fixture({ bearerRejected: true });
    const response = await request(f.app).post(root + "/recover").set("Origin", "https://fixture.example.invalid")
      .set("Authorization", "Bearer synthetic-invalid").send({ idempotencyKey: actor });
    expect(response.status).toBe(401);
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit"]);
  });
  it("general website/Research admin authority cannot read private clinical requests", async () => {
    const f = fixture({ principal: "research_admin", staffFlag: "true" });
    expect((await request(f.app).get(root + "/staff")).status).toBe(403);
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit"]);
    expect(f.care.recordAccessDecision).toHaveBeenCalledWith(expect.objectContaining({ outcome: "forbidden" }));
  });
  it("forwards only the canonical Care principal to the backend private reader", async () => {
    const f = fixture({ principal: "clinical_admin", staffFlag: "true" });
    const response = await request(f.app).get(root + "/staff?page=1");
    expect(response.status).toBe(200); expect(response.body.total).toBe(0);
    expect(f.rpc).toHaveBeenCalledWith("request_intent_staff_list", { p_actor_user_id: actor, p_page: 1 });
    expect(f.care.loadCapabilityStatus).not.toHaveBeenCalled();
    expect(f.care.recordAccessDecision).toHaveBeenCalledWith(expect.objectContaining({ outcome: "allowed", actorSubjectId: actor }));
  });
  it("keeps pending read closed for an absent or malformed independent flag even for clinical_admin", async () => {
    for (const staffFlag of [undefined, "false", "TRUE", "1", " true", "true "]) {
      const f = fixture({ principal: "clinical_admin", staffFlag });
      expect((await request(f.app).get(root + "/staff")).status).toBe(503);
      expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit"]);
      expect(f.care.recordAccessDecision).not.toHaveBeenCalled();
    }
  });
  it("allows only the separately gated pending read when public intake is closed", async () => {
    const f = fixture({ enabled: false, legal: false, principal: "clinical_admin", staffFlag: "true" });
    expect((await request(f.app).get(root + "/staff")).status).toBe(200);
    expect((await request(f.app).get(root + "/staff/" + actor)).status).toBe(404);
    expect(f.rpc).toHaveBeenCalledWith("request_intent_staff_get", { p_request_id: actor, p_actor_user_id: actor });
    expect((await request(f.app).post(root).send({})).status).toBe(503);
    expect((await request(f.app).get(root + "/config")).status).toBe(503);
    expect((await request(f.app).get(root + "/catalog")).status).toBe(503);
    expect(f.care.loadCapabilityStatus).not.toHaveBeenCalled();
  });
  it("does not broaden the intake-off exception to other staff paths or mutation methods", async () => {
    const f = fixture({ enabled: false, principal: "clinical_admin", staffFlag: "true" });
    for (const path of ["/staff-export", "/staff/not-a-uuid", "/staff/" + actor + "/approve", "/staff/" + actor + "/payment"]) {
      expect((await request(f.app).get(root + path)).status).toBe(503);
    }
    expect((await request(f.app).post(root + "/staff").send({})).status).toBe(503);
    expect((await request(f.app).patch(root + "/staff/" + actor).send({ status: "paid" })).status).toBe(503);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("rejects absent canonical staff identity despite the separate flag", async () => {
    const f = fixture({ principal: "absent", staffFlag: "true" });
    expect((await request(f.app).get(root + "/staff")).status).toBe(401);
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit"]);
  });
  it("does not let a runtime role pass bypass the independent SQL approval or role recheck", async () => {
    const f = fixture({ principal: "clinical_admin", staffFlag: "true", staffDbDenied: true });
    const response = await request(f.app).get(root + "/staff");
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("private approval");
    expect(response.body).not.toHaveProperty("items");
    // Synthetic RPC refusal is not execution proof of the candidate SQL.
  });
  it("rejects caller-supplied actor or email query fields before private readback", async () => {
    const f = fixture({ principal: "clinical_admin", staffFlag: "true" });
    expect((await request(f.app).get(root + "/staff?actor=another&email=synthetic@example.invalid")).status).toBe(400);
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit"]);
  });
  it("registers no payment or approval writer", async () => {
    const f = fixture({ principal: "clinical_admin" });
    expect((await request(f.app).patch(root + "/staff/" + actor).send({ status: "paid" })).status).toBe(404);
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
