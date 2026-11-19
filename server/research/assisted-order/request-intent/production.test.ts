import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AssistedOrderProductionWiring } from "../production-deps";
import type { AssistedOrderViewer } from "../ports";
import type { CareAccessDependencies } from "../../../care/access";
import { sha256AssistedOrderHasher } from "../defaults";
import { assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "../../../../shared/research/assisted-order/form";
import { validateRequestIntentInput } from "../../../../shared/research/assisted-order/request-intent";
import { registerRequestIntentApi, requestIntentOrigin, REQUEST_INTENT_AUTHORITATIVE_REFERRAL_ENV } from "./production";
import { RequestIntentService } from "./service";
import type { RequestReferralSourceReader } from "./referral-source";

const root = "/api/research/early-access/request-intents";
const actor = "10000000-0000-4000-8000-000000000001";
function fixture(options: { enabled?: boolean; legal?: boolean; rate?: "ok" | "denied" | "failure";
  principal?: "clinical_admin" | "request_intent_reader" | "research_admin" | "absent"; bearerRejected?: boolean;
  staffFlag?: string; staffDbDenied?: boolean; customer?: AssistedOrderViewer;
  env?: NodeJS.ProcessEnv; secretGetter?: () => string | undefined;
  savedAttempt?: Readonly<{ ownerHash: string; attemptHash: string; record: unknown }> } = {}) {
  const rpc = vi.fn(async (name: string, _args?: Readonly<Record<string, unknown>>):
    Promise<{ data: unknown; error: { code?: string; message?: string } | null }> => {
    if (name === "research_rate_limit_hit") return options.rate === "failure"
      ? { data: null, error: { message: "private diagnostic never returned" } }
      : { data: options.rate !== "denied", error: null };
    if (name === "request_intent_find_attempt") {
      const saved = options.savedAttempt;
      return { data: saved && _args?.p_owner_hash === saved.ownerHash && _args?.p_attempt_hash === saved.attemptHash
        ? saved.record : null, error: null };
    }
    if (name === "request_intent_staff_list" || name === "request_intent_operator_list") return options.staffDbDenied
      ? { data: null, error: { code: "42501", message: "private approval or current role absent" } }
      : { data: { items: [], total: 0, page: 1, pageSize: 25 }, error: null };
    if (name === "request_intent_staff_get" || name === "request_intent_operator_get") return { data: null, error: null };
    throw new Error("Unexpected RPC " + name);
  });
  const wiring: AssistedOrderProductionWiring = {
    env: { SITE_URL: "https://fixture.example.invalid", RESEARCH_REQUEST_INTENT_ENABLED: options.enabled === false ? "false" : "true",
      RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED: options.staffFlag, CARE_ENABLED: "false", CARE_ENABLE_APPROVED: "false", ...options.env },
    requiredAgreements: options.legal === false ? [] : [{ kind: "fixture-terms", version: "fixture-v1" }],
    agreementGate: { accepted: async () => true },
    masterOfferingServiceFor: () => null, bindingFor: () => null, offeringVariantFor: () => null,
    catalogVersion: "synthetic", supabaseRpc: { rpc }, supabaseStorage: null, log: () => undefined,
  };
  if (options.secretGetter) Object.defineProperty(wiring.env, "RESEARCH_PARTNER_LINK_SECRET", { get: options.secretGetter });
  const viewer: AssistedOrderViewer = options.customer ?? { actorType: options.bearerRejected ? "early_access_session" : "member",
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
  return { app, rpc, care, viewer };
}
const recoveryKey = "20000000-0000-4000-8000-000000000002";
const recoveryReceipt = {
  kind: "unapproved_selection_request" as const, requestId: "30000000-0000-4000-8000-000000000003",
  publicReference: "XRI-30000000000040008000000000000003", status: "pending_review" as const,
  createdAt: "2026-10-30T12:00:00.000Z",
};
const recoveryGuest: AssistedOrderViewer = {
  actorType: "early_access_session", memberId: null, authUserId: null,
  earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-session-a",
  normalizedEmail: "shared@example.invalid", capabilities: new Set(["assisted_orders:submit"]),
};
const recoverableAttempt = {
  ownerHash: sha256AssistedOrderHasher.stableHash(["request-intent-owner", "session",
    recoveryGuest.earlyAccessCustomerRef, recoveryGuest.earlyAccessSessionHash]),
  attemptHash: sha256AssistedOrderHasher.hash(recoveryKey),
  record: { fingerprint: "a".repeat(64), receipt: { ...recoveryReceipt, privateDiagnostic: "must not reach the customer" } },
};

const referralFlags: NodeJS.ProcessEnv = { RESEARCH_REFERRAL_V1_ENABLED: "true", AFFILIATE_SYSTEM_ENABLED: "true",
  AFFILIATE_PORTAL_ENABLED: "true", AFFILIATE_CODES_ENABLED: "true" };

describe("actual optional referral source composition", () => {
  // Composition probes replace only the service boundary to inspect wiring.
  // Other tests use the real service/repository; no mock asserts native authority.
  it.each([undefined, "false", "TRUE", "1", "true "])("omits the source dependency for bridge flag %s", async flag => {
    const submit = vi.spyOn(RequestIntentService.prototype, "submit").mockResolvedValue(recoveryReceipt);
    const getSecret = vi.fn(() => { throw Error("must not read unused secret"); });
    try {
      const f = fixture({ env: { ...referralFlags, [REQUEST_INTENT_AUTHORITATIVE_REFERRAL_ENV]: flag }, secretGetter: getSecret });
      const response = await request(f.app).post(root).set("Origin", "https://fixture.example.invalid").send({ probe: true });
      expect(response.status).toBe(200); expect(submit.mock.calls[0][2]).toBeUndefined();
      expect(submit.mock.calls[0]).toHaveLength(2);
      expect(getSecret).not.toHaveBeenCalled();
      expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit"]);
    } finally { submit.mockRestore(); }
  });
  it("wires the existing verified member to a locator only, without reading the guest secret", async () => {
    const getSecret = vi.fn(() => { throw Error("guest secret is irrelevant to a member"); });
    let observed: unknown;
    const submit = vi.spyOn(RequestIntentService.prototype, "submit").mockImplementation(async (_viewer, _body, read) => {
      expect(getSecret).not.toHaveBeenCalled(); observed = read!(); return recoveryReceipt;
    });
    try {
      const f = fixture({ env: { ...referralFlags, [REQUEST_INTENT_AUTHORITATIVE_REFERRAL_ENV]: "true" }, secretGetter: getSecret });
      expect((await request(f.app).post(root).set("Origin", "https://fixture.example.invalid")
        .set("Cookie", "xr_ref_visitor=conflicting-guest-source").send({})).status).toBe(200);
      expect(submit.mock.calls[0][0]).toBe(f.viewer);
      expect(observed).toEqual({ kind: "account", actorAuthUserId: actor });
      expect(observed).not.toHaveProperty("partnerId"); expect(observed).not.toHaveProperty("eligible");
      expect(getSecret).not.toHaveBeenCalled();
      expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit"]);
    } finally { submit.mockRestore(); }
  });
  it("keeps missing V1 gates and missing guest key as truthful unavailable locators", async () => {
    const observed: unknown[] = [];
    const submit = vi.spyOn(RequestIntentService.prototype, "submit").mockImplementation(async (_viewer, _body, read?: RequestReferralSourceReader) => {
      observed.push(read!()); return recoveryReceipt;
    });
    try {
      for (const env of [{ [REQUEST_INTENT_AUTHORITATIVE_REFERRAL_ENV]: "true" },
        { ...referralFlags, [REQUEST_INTENT_AUTHORITATIVE_REFERRAL_ENV]: "true" }]) {
        const f = fixture({ env, customer: recoveryGuest });
        expect((await request(f.app).post(root).set("Origin", "https://fixture.example.invalid").send({})).status).toBe(200);
        expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit"]);
      }
      expect(observed).toEqual([{ kind: "unavailable", reason: "disabled" }, { kind: "unavailable", reason: "unconfigured" }]);
    } finally { submit.mockRestore(); }
  });
  it("replays an actual saved guest POST before the production source reads secret or cookies", async () => {
    const acceptedAt = "2026-11-19T12:00:00.000Z";
    const body = { idempotencyKey: recoveryKey, contact: { fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid",
      mobilePhone: "+15555550123", ageConfirmed: true, shippingAddress: { line1: "1 Synthetic Street", city: "Test", region: "TX", postalCode: "00000", countryCode: "US" },
      billingSameAsShipping: true }, agreements: [{ kind: "fixture-terms", version: "fixture-v1", accepted: true, acceptedAt },
        ...requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: false }).map(ack => ({ ...assistedOrderFormPair(ack), accepted: true, acceptedAt }))],
      lines: [{ productId: "synthetic", variantId: "synthetic-variant", quantity: 1 }] };
    const normalized = validateRequestIntentInput(body);
    const fingerprint = sha256AssistedOrderHasher.stableHash({ kind: "unapproved_selection_request", contact: normalized.contact, agreements: normalized.agreements, lines: normalized.lines });
    const getSecret = vi.fn(() => { throw Error("no optional secret reads on saved replay"); });
    const f = fixture({ customer: recoveryGuest, env: { ...referralFlags, [REQUEST_INTENT_AUTHORITATIVE_REFERRAL_ENV]: "true" }, secretGetter: getSecret,
      savedAttempt: { ...recoverableAttempt, record: { fingerprint, receipt: recoveryReceipt } } });
    const response = await request(f.app).post(root).set("Origin", "https://fixture.example.invalid").set("Cookie", "xr_ref_visitor=malformed").send(body);
    expect(response.status).toBe(200); expect(response.body).toEqual(recoveryReceipt);
    expect(getSecret).not.toHaveBeenCalled();
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit", "request_intent_find_attempt"]);
  });
});

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
  it.each([true, false])("does not let a rejected bearer fall back to a cookie owner (intake enabled: %s)", async (enabled) => {
    const f = fixture({ enabled, bearerRejected: true });
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
  it("isolates a named operator's list and detail from the privileged staff RPCs", async () => {
    const f = fixture({ principal: "request_intent_reader", staffFlag: "true" });
    expect((await request(f.app).get(root + "/staff")).status).toBe(200);
    expect((await request(f.app).get(root + "/staff/" + actor)).status).toBe(404);
    expect(f.rpc).toHaveBeenCalledWith("request_intent_operator_list", { p_actor_user_id: actor, p_page: 1 });
    expect(f.rpc).toHaveBeenCalledWith("request_intent_operator_get", {
      p_request_id: actor, p_actor_user_id: actor, p_include_context: false,
    });
    expect(f.rpc.mock.calls.map(([name]) => name)).not.toContain("request_intent_staff_get");
  });
  it("keeps pending read closed for an absent or malformed independent flag even for clinical_admin", async () => {
    for (const staffFlag of [undefined, "false", "TRUE", "1", " true", "true "]) {
      const f = fixture({ principal: "clinical_admin", staffFlag });
      expect((await request(f.app).get(root + "/staff")).status).toBe(503);
      expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit"]);
      expect(f.care.recordAccessDecision).not.toHaveBeenCalled();
    }
  });
  it("allows the separately gated staff pending read when public intake is closed", async () => {
    const f = fixture({ enabled: false, legal: false, principal: "clinical_admin", staffFlag: "true" });
    expect((await request(f.app).get(root + "/staff")).status).toBe(200);
    expect((await request(f.app).get(root + "/staff/" + actor)).status).toBe(404);
    expect(f.rpc).toHaveBeenCalledWith("request_intent_staff_get", { p_request_id: actor, p_actor_user_id: actor });
    expect((await request(f.app).post(root).send({})).status).toBe(503);
    expect((await request(f.app).get(root + "/config")).status).toBe(503);
    expect((await request(f.app).get(root + "/catalog")).status).toBe(503);
    expect(f.care.loadCapabilityStatus).not.toHaveBeenCalled();
  });
  it.each(["/recover", "/recover/", "/RECOVER"])("recovers only the saved customer receipt at %s after intake closes", async (path) => {
    const f = fixture({ enabled: false, legal: false, customer: recoveryGuest,
      savedAttempt: recoverableAttempt, principal: "absent" });
    const response = await request(f.app).post(root + path)
      .set("Origin", "https://fixture.example.invalid").set("Sec-Fetch-Site", "same-origin")
      .send({ idempotencyKey: recoveryKey });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ receipt: recoveryReceipt });
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["pragma"]).toBe("no-cache");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit", "request_intent_find_attempt"]);
    expect(f.rpc).toHaveBeenCalledWith("request_intent_find_attempt", {
      p_owner_hash: recoverableAttempt.ownerHash, p_attempt_hash: recoverableAttempt.attemptHash,
    });
    expect(f.rpc).toHaveBeenCalledWith("research_rate_limit_hit", {
      p_key: expect.stringMatching(/^request-intent:write:[a-f0-9]{64}$/), p_window_seconds: 600, p_max_hits: 20,
    });
    expect(f.care.recordAccessDecision).not.toHaveBeenCalled();
    expect(f.care.loadCapabilityStatus).not.toHaveBeenCalled();
    const rpcCount = f.rpc.mock.calls.length;
    expect((await request(f.app).post(root).set("Origin", "https://fixture.example.invalid")
      .send({ idempotencyKey: recoveryKey })).status).toBe(503);
    expect((await request(f.app).get(root + "/config")).status).toBe(503);
    expect((await request(f.app).get(root + "/catalog")).status).toBe(503);
    expect(f.rpc).toHaveBeenCalledTimes(rpcCount);
  });
  it("returns unconfirmed for another session or attempt despite matching customer and email", async () => {
    for (const [customer, key] of [
      [recoveryGuest, "40000000-0000-4000-8000-000000000004"],
      [{ ...recoveryGuest, earlyAccessSessionHash: "synthetic-session-b" }, recoveryKey],
    ] as const) {
      const f = fixture({ enabled: false, legal: false, customer, savedAttempt: recoverableAttempt });
      const response = await request(f.app).post(root + "/recover").set("Origin", "https://fixture.example.invalid")
        .send({ idempotencyKey: key });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ receipt: null });
      expect(JSON.stringify(response.body)).not.toContain(recoveryReceipt.publicReference);
      expect(f.rpc).toHaveBeenCalledWith("request_intent_find_attempt", {
        p_owner_hash: sha256AssistedOrderHasher.stableHash(["request-intent-owner", "session",
          customer.earlyAccessCustomerRef, customer.earlyAccessSessionHash]),
        p_attempt_hash: sha256AssistedOrderHasher.hash(key),
      });
      expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit", "request_intent_find_attempt"]);
    }
  });
  it("retains origin, Fetch Metadata and JSON guards for intake-closed recovery", async () => {
    const f = fixture({ enabled: false, customer: recoveryGuest, savedAttempt: recoverableAttempt });
    expect((await request(f.app).post(root + "/recover").send({ idempotencyKey: recoveryKey })).status).toBe(403);
    expect((await request(f.app).post(root + "/recover").set("Origin", "https://attacker.example.invalid")
      .send({ idempotencyKey: recoveryKey })).status).toBe(403);
    expect((await request(f.app).post(root + "/recover").set("Origin", "https://fixture.example.invalid")
      .set("Sec-Fetch-Site", "cross-site").send({ idempotencyKey: recoveryKey })).status).toBe(403);
    expect((await request(f.app).post(root + "/recover").set("Origin", "https://fixture.example.invalid")
      .type("form").send("idempotencyKey=" + recoveryKey)).status).toBe(403);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("retains exact recovery validation and never accepts caller-supplied ownership", async () => {
    for (const body of [{}, { idempotencyKey: 42 }, { idempotencyKey: "not-an-attempt" },
      { idempotencyKey: recoveryKey, email: "shared@example.invalid" },
      { idempotencyKey: recoveryKey, ownerHash: recoverableAttempt.ownerHash }]) {
      const f = fixture({ enabled: false, customer: recoveryGuest, savedAttempt: recoverableAttempt });
      const response = await request(f.app).post(root + "/recover").set("Origin", "https://fixture.example.invalid").send(body);
      expect(response.status).toBe(400);
      expect(response.body).not.toHaveProperty("receipt");
      expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit"]);
    }
  });
  it.each([["denied", 429], ["failure", 503]] as const)("keeps recovery closed when its durable limiter is %s", async (rate, status) => {
    const f = fixture({ enabled: false, customer: recoveryGuest, savedAttempt: recoverableAttempt, rate });
    const response = await request(f.app).post(root + "/recover").set("Origin", "https://fixture.example.invalid")
      .send({ idempotencyKey: recoveryKey });
    expect(response.status).toBe(status);
    expect(response.body).not.toHaveProperty("receipt");
    expect(JSON.stringify(response.body)).not.toContain("private diagnostic");
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit"]);
  });
  it("does not broaden the intake-off recovery exception to other methods or similar paths", async () => {
    const f = fixture({ enabled: false, customer: recoveryGuest, savedAttempt: recoverableAttempt });
    for (const [method, path] of [["get", "/recover"], ["head", "/recover"], ["patch", "/recover"],
      ["post", "/recover-other"], ["post", "/recover/extra"]] as const) {
      const probe = request(f.app)[method](root + path).set("Origin", "https://fixture.example.invalid");
      const response = await (method === "get" || method === "head" ? probe : probe.send({ idempotencyKey: recoveryKey }));
      expect(response.status).toBe(503);
    }
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("still requires a capable verified customer for intake-closed recovery", async () => {
    const f = fixture({ enabled: false, customer: { ...recoveryGuest, capabilities: new Set() }, savedAttempt: recoverableAttempt });
    const response = await request(f.app).post(root + "/recover").set("Origin", "https://fixture.example.invalid")
      .send({ idempotencyKey: recoveryKey });
    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty("receipt");
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["research_rate_limit_hit"]);
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
