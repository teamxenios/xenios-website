import express, { type Request } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateEarlyAccessApi, type EarlyAccessRegistrationOptions } from "../../../early-access/register";
import { InMemoryPrivateAccessSessionRepository } from "../../../early-access/private-access-session-repository";
import { createAssistedOrderViewerResolvers } from "../../express";
import { sha256AssistedOrderHasher } from "../../defaults";
import { requestIntentOwner } from "../service";
import { registerRequestIntentApi } from "../production";
import type { AssistedOrderProductionWiring } from "../../production-deps";
import type { CareAccessDependencies } from "../../../../care/access";
import type { CareRole } from "../../../../../shared/care/contracts";

const sdk = vi.hoisted(() => ({ aal: vi.fn(async () => ({ data: { currentLevel: "aal2" }, error: null })) }));
vi.mock("../../../../supabase", () => ({
  getSupabaseAnon: () => ({ auth: { mfa: { getAuthenticatorAssuranceLevel: sdk.aal } } }),
  supabaseConfigured: () => false,
}));
const base = "/api/research/early-access/request-intents";
const origin = "https://workflow-fixture.example.invalid";
const id = "30000000-0000-4000-8000-000000000003";
const actor = "10000000-0000-4000-8000-000000000001";
const at = "2026-11-18T03:00:00.000Z";
const workflow = { schemaVersion: 1, requestId: id, publicReference: "XRI-30000000000040008000000000000003",
  state: "queued", revision: 1, changedAt: at, customerNotice: "pending", events: [
    { id: "40000000-0000-4000-8000-000000000004", revision: 0, kind: "received", occurredAt: at },
    { id: "50000000-0000-4000-8000-000000000005", revision: 1, kind: "queued", occurredAt: at },
  ] };
function staffToken(aal = "aal2") {
  return `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({
    sub: actor, aal, exp: Date.now() / 1000 + 300,
  })).toString("base64url")}.fixture`;
}
function fixture(options: { workflowOn?: boolean; statusOn?: boolean; processOn?: boolean; role?: CareRole; dbDenied?: boolean } = {}) {
  let clock = Date.now();
  const app = express(); app.use(express.json());
  let doors: Parameters<NonNullable<EarlyAccessRegistrationOptions["onDoorSources"]>>[0] | null = null;
  registerPrivateEarlyAccessApi(app, {
    config: { enabled: true, openAccess: true, passwordHash: null,
      sessionSecret: "synthetic-workflow-session-secret-0123456789012345", sessionTtlMinutes: 60,
      sessionTtlClampedFrom: null, maxAttempts: 20, lockoutMinutes: 5, cookieName: null, problems: [] },
    repository: new InMemoryPrivateAccessSessionRepository(), sessionIdentity: true,
    now: () => clock, env: {}, onDoorSources: value => { doors = value; },
  });
  const viewers = createAssistedOrderViewerResolvers({ resolveMember: async () => null,
    earlyAccess: () => doors, earlyAccessBindings: () => null, adminEmail: () => "" });
  let ownerA = "";
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}): Promise<{ data: unknown; error: { code?: string; message?: string } | null }> => {
    if (name === "research_rate_limit_hit") return { data: true, error: null };
    if (options.dbDenied) return { data: null, error: { code: "42501", message: "private diagnostic" } };
    if (name === "request_intent_workflow_owner_get") return { data: args.p_owner_hash === ownerA && args.p_request_id === id ? workflow : null, error: null };
    if (name === "request_intent_workflow_staff_get") return { data: { workflow, canStartReview: args.p_mfa_verified === true && args.p_processing_enabled === true }, error: null };
    if (name === "request_intent_start_review") return { data: { replay: false, workflow }, error: null };
    throw Error("Unexpected RPC");
  });
  const wiring: AssistedOrderProductionWiring = {
    env: { SITE_URL: origin, RESEARCH_REQUEST_INTENT_ENABLED: "false", RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED: "true",
      RESEARCH_REQUEST_WORKFLOW_ENABLED: options.workflowOn === false ? "false" : "true",
      RESEARCH_REQUEST_WORKFLOW_ENVIRONMENT: "ea-workflow-fixture", RESEARCH_REQUEST_WORKFLOW_START_AT: at,
      EA_REQUEST_CUSTOMER_STATUS_ENABLED: options.statusOn === false ? "false" : "true",
      RESEARCH_REQUEST_REVIEW_WRITE_ENABLED: options.processOn === false ? "false" : "true" },
    requiredAgreements: [], agreementGate: null, masterOfferingServiceFor: () => null, bindingFor: () => null,
    offeringVariantFor: () => null, catalogVersion: "fixture", supabaseRpc: { rpc }, supabaseStorage: null, log: () => undefined,
  };
  const care: CareAccessDependencies = {
    loadCapabilityStatus: async () => { throw Error("must not activate Care"); },
    resolvePrincipal: async req => req.get("x-fixture-staff") === "verified"
      ? { subjectId: actor, roles: [options.role ?? "request_intent_reader"] } : null,
    recordAccessDecision: vi.fn(async () => undefined),
  };
  registerRequestIntentApi(app, wiring, viewers, care);
  async function bootstrap() {
    const response = await request(app).post("/api/research/early-access/unlock").send({});
    expect(response.status).toBe(200);
    const cookies: string[] = response.headers["set-cookie"] ?? [];
    return cookies.map(cookie => cookie.split(";")[0]).join("; ");
  }
  async function bindOwner(cookie: string) {
    const viewer = await viewers.customer({ headers: { cookie } } as Request);
    expect(viewer.actorType).toBe("early_access_session");
    expect(viewer.authUserId).toBeNull(); expect(viewer.memberId).toBeNull();
    ownerA = requestIntentOwner(viewer, sha256AssistedOrderHasher);
    return ownerA;
  }
  return { app, bootstrap, bindOwner, rpc, expire: () => { clock += 61 * 60_000; } };
}
describe("workflow routes on canonical accountless Early Access sessions", () => {
  it("boots distinct actual anonymous cookie jars and preserves owner read while new intake is off", async () => {
    const f = fixture();
    const a = await f.bootstrap(), b = await f.bootstrap();
    const hashB = await f.bindOwner(b), hashA = await f.bindOwner(a);
    expect(hashA).not.toBe(hashB);
    const own = await request(f.app).get(`${base}/${id}/workflow`).set("Cookie", a);
    expect(own.status).toBe(200); expect(own.body).toEqual(workflow);
    expect(own.headers["cache-control"]).toContain("no-store");
    expect(own.headers["referrer-policy"]).toBe("no-referrer");
    expect((await request(f.app).get(`${base}/${id}/workflow`).set("Cookie", b)).status).toBe(404);
    expect((await request(f.app).get(`${base}/${id}/workflow`)).status).toBe(401);
    expect((await request(f.app).get(`${base}/${id}/workflow`).set("Cookie", a).auth("invalid", { type: "bearer" })).status).toBe(401);
    expect((await request(f.app).get(`${base}/${id}/workflow?email=synthetic@example.invalid`).set("Cookie", b)).status).toBe(400);
    f.expire();
    expect((await request(f.app).get(`${base}/${id}/workflow`).set("Cookie", a)).status).toBe(401);
  });
  it("holds disabled status and workflow without fabricating a receipt", async () => {
    for (const options of [{ statusOn: false }, { workflowOn: false }]) {
      const f = fixture(options); const a = await f.bootstrap(); await f.bindOwner(a);
      expect((await request(f.app).get(`${base}/${id}/workflow`).set("Cookie", a)).status).toBe(503);
      expect(f.rpc.mock.calls.filter(([name]) => name.startsWith("request_intent_workflow"))).toHaveLength(0);
    }
  });
  it("keeps a reader's staff wrapper non-mutating and commands guarded", async () => {
    const f = fixture();
    const read = await request(f.app).get(`${base}/staff/${id}/workflow`).set("x-fixture-staff", "verified");
    expect(read.status).toBe(200); expect(read.body).toEqual({ workflow, canStartReview: false });
    const command = { commandId: actor, expectedRevision: 1 };
    expect((await request(f.app).post(`${base}/staff/${id}/start-review`).set("Origin", origin)
      .set("x-fixture-staff", "verified").auth(staffToken(), { type: "bearer" }).send(command)).status).toBe(403);
    expect(f.rpc.mock.calls.some(([name]) => name === "request_intent_start_review")).toBe(false);
    const processor = fixture({ role: "request_intent_processor" });
    const post = (body: unknown, originValue = origin) => request(processor.app).post(`${base}/staff/${id}/start-review`)
      .set("Origin", originValue).set("x-fixture-staff", "verified").auth(staffToken(), { type: "bearer" }).send(body);
    expect((await post(command, "https://wrong-origin.invalid")).status).toBe(403);
    expect((await post({ ...command, actorId: actor })).status).toBe(400);
    expect((await post(command)).status).toBe(200);
    expect(processor.rpc).toHaveBeenCalledWith("request_intent_start_review", expect.objectContaining({
      p_actor_user_id: actor, p_mfa_verified: true, p_environment: "ea-workflow-fixture", p_command_id: actor,
    }));
    const denied = fixture({ role: "request_intent_processor", dbDenied: true });
    const response = await request(denied.app).post(`${base}/staff/${id}/start-review`).set("Origin", origin)
      .set("x-fixture-staff", "verified").auth(staffToken(), { type: "bearer" }).send(command);
    expect(response.status).toBe(403); expect(JSON.stringify(response.body)).not.toContain("diagnostic");
  });
});
