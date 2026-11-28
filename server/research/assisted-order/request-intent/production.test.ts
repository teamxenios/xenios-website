import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AssistedOrderProductionWiring } from "../production-deps";
import type { AssistedOrderViewer } from "../ports";
import type { CareAccessDependencies } from "../../../care/access";
import { sha256AssistedOrderHasher } from "../defaults";
import { registerRequestIntentApi, requestIntentOrigin, type RequestIntentPreparedProductionInput,
  REQUEST_INTENT_SERVER_REFERRAL_ENV, requestIntentReferralLocator } from "./production";
import type { NormalizedMasterOffering } from "../../master-offerings/model";
import { assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "../../../../shared/research/assisted-order/form";
import { validateRequestIntentInput, type RequestIntentInput } from "../../../../shared/research/assisted-order/request-intent";
import { REQUEST_INTENT_PREPARATION_PROTOCOL, type RequestIntentPreparationQuery } from "./service";

const root = "/api/research/early-access/request-intents";
const actor = "10000000-0000-4000-8000-000000000001";
function fixture(options: { enabled?: boolean; legal?: boolean; rate?: "ok" | "denied" | "failure";
  principal?: "clinical_admin" | "request_intent_reader" | "research_admin" | "absent"; bearerRejected?: boolean;
  staffFlag?: string; staffDbDenied?: boolean; customer?: AssistedOrderViewer;
  prepared?: RequestIntentPreparedProductionInput; contactAdmission?: boolean; preparedCatalog?: boolean; noRpc?: boolean;
  savedAttempt?: Readonly<{ ownerHash: string; attemptHash: string; record: unknown }>;
  env?: NodeJS.ProcessEnv; create?: (name: string, args: Readonly<Record<string, unknown>>) => unknown } = {}) {
  const rpc = vi.fn(async (name: string, _args?: Readonly<Record<string, unknown>>):
    Promise<{ data: unknown; error: { code?: string; message: string } | null }> => {
    if (name === "research_rate_limit_hit") return options.rate === "failure"
      ? { data: null, error: { message: "private diagnostic never returned" } }
      : { data: options.rate !== "denied", error: null };
    if (name === "request_intent_catalog_address_has") return { data: true, error: null };
    if (name === "request_intent_find_attempt") {
      const saved = options.savedAttempt;
      return { data: saved && _args?.p_owner_hash === saved.ownerHash && _args?.p_attempt_hash === saved.attemptHash
        ? saved.record : null, error: null };
    }
    if (name === "request_intent_staff_list" || name === "request_intent_operator_list") return options.staffDbDenied
      ? { data: null, error: { code: "42501", message: "private approval or current role absent" } }
      : { data: { items: [], total: 0, page: 1, pageSize: 25 }, error: null };
    if (name === "request_intent_staff_get" || name === "request_intent_operator_get") return { data: null, error: null };
    if (options.create && name.startsWith("request_intent_create")) return { data: options.create(name, _args ?? {}), error: null };
    throw new Error("Unexpected RPC " + name);
  });
  const wiring: AssistedOrderProductionWiring = {
    env: { SITE_URL: "https://fixture.example.invalid", RESEARCH_REQUEST_INTENT_ENABLED: options.enabled === false ? "false" : "true",
      RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED: options.staffFlag, CARE_ENABLED: "false", CARE_ENABLE_APPROVED: "false",
      ...(options.contactAdmission ? { RESEARCH_REQUEST_CATALOG_CONTACT_REQUIRED: "true",
        RESEARCH_REQUEST_CATALOG_CONTACT_RETENTION_SECONDS: "7200" } : {}), ...options.env },
    requiredAgreements: options.legal === false ? [] : [{ kind: "fixture-terms", version: "fixture-v1" }],
    agreementGate: { accepted: async () => true },
    masterOfferingServiceFor: () => options.preparedCatalog ? { select: async (query) => ({
      offerings: [preparedOffering], prices: new Map(),
      page: { page: query.page ?? 1, pageSize: query.pageSize ?? 100, total: 1 },
    }) } : null,
    bindingFor: (variantId) => options.preparedCatalog && variantId === "prepared-source-variant"
      ? { productId: "prepared-product", variantId: "prepared-variant" } : null,
    offeringVariantFor: () => null,
    catalogVersion: "synthetic", supabaseRpc: options.noRpc ? null : { rpc }, supabaseStorage: null, log: () => undefined,
  };
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
  const customer = vi.fn(async () => viewer);
  const prepared = registerRequestIntentApi(app, wiring, { customer }, care, options.prepared);
  return { app, rpc, care, customer, prepared };
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

// Owned synthetic composition fixtures only; never a real approval/session/assent.
const preparedOffering: NormalizedMasterOffering = {
  id: "prepared-offering", slug: "prepared-offering", canonicalKey: "prepared-offering",
  displayName: "Synthetic prepared offering", canonicalName: "Synthetic prepared offering",
  family: "research_peptides_materials", category: "Synthetic", subcategory: null, brand: null, aliases: [],
  displayState: "request_access", stateExplanation: "", copyState: "approved", visibility: "member",
  variants: [{ id: "prepared-source-variant", label: "Synthetic exact variant", displayState: "request_access",
    visibility: "member", sourceReferences: [] }], sourceReferences: [],
};
function preparedInput(): RequestIntentInput {
  const acceptedAt = new Date().toISOString();
  return { idempotencyKey: recoveryKey, contact: {
    fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid", mobilePhone: "+15555550123",
    ageConfirmed: true, shippingAddress: { line1: "1 Synthetic Street", city: "Test", region: "TX",
      postalCode: "00000", countryCode: "US" }, billingSameAsShipping: true,
  }, agreements: [{ kind: "fixture-terms", version: "fixture-v1", accepted: true, acceptedAt },
    ...requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: true })
      .map(ack => ({ ...assistedOrderFormPair(ack), accepted: true as const, acceptedAt }))],
  lines: [{ productId: "prepared-product", variantId: "prepared-variant", quantity: 1 }] };
}
function preparedPorts() {
  const now = Date.now();
  const proof = { customerRef: "eac_" + "a".repeat(32), sessionHandleHash: "b".repeat(64),
    expiresAtEpochMs: now + 120_000 };
  const read = vi.fn(async (_cookie: unknown) => proof);
  const metadata = vi.fn(async (query: RequestIntentPreparationQuery): Promise<unknown> => ({
    protocol: REQUEST_INTENT_PREPARATION_PROTOCOL, snapshotSha256: "d".repeat(64),
    issuedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60_000).toISOString(),
    admissionExpiresAt: new Date(now + 120_000).toISOString(), admissionPolicyRevision: query.admissionKey.policyRevision,
  }));
  const issue = vi.fn(async (): Promise<unknown> => "synthetic.prepared-witness");
  const preparation = { notAfter: new Date(now + 90_000).toISOString(), metadata, issue };
  return { proof, read, metadata, issue, preparation };
}

describe("optional server-only prepared guest production DI", () => {
  it.each(["omitted", "reader_only", "no_reader", "no_rpc"] as const)(
    "keeps %s dependencies unavailable with no reader, issuer or native lookup", async missing => {
      const p = preparedPorts();
      const prepared = missing === "omitted" ? undefined : {
        readOriginalGuestProof: missing === "no_reader" ? null : p.read,
        ...(missing === "reader_only" ? {} : { preparation: p.preparation }),
      };
      const f = fixture({ enabled: false, noRpc: missing === "no_rpc", prepared });
      expect(f.prepared).toBeNull();
      expect((await request(f.app).get(root + "/config")).status).toBe(503);
      expect((await request(f.app).post(root).send({})).status).toBe(503);
      expect(f.customer).not.toHaveBeenCalled(); expect(p.read).not.toHaveBeenCalled();
      expect(f.rpc).not.toHaveBeenCalled(); expect(p.metadata).not.toHaveBeenCalled(); expect(p.issue).not.toHaveBeenCalled();
    });
  it("uses the supplied registered-reader result and exactly one canonical H1 -> H2 projection", async () => {
    const p = preparedPorts(), f = fixture({ prepared: { readOriginalGuestProof: p.read, preparation: p.preparation } });
    const projection = await f.prepared!.resolveGuest({ headers: { cookie: "synthetic-signed-guest-cookie" } });
    expect(projection).toMatchObject({ kind: "original_guest_projection", proof: p.proof, viewer: {
      actorType: "early_access_session", memberId: null, authUserId: null,
      earlyAccessCustomerRef: p.proof.customerRef,
      earlyAccessSessionHash: sha256AssistedOrderHasher.hash(p.proof.sessionHandleHash), normalizedEmail: null,
    } });
    expect(projection!.viewer.capabilities.has("assisted_orders:submit")).toBe(true);
    expect(p.read).toHaveBeenCalledTimes(1); expect(p.read).toHaveBeenCalledWith("synthetic-signed-guest-cookie");
    expect(f.customer).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
    expect(p.metadata).not.toHaveBeenCalled(); expect(p.issue).not.toHaveBeenCalled();
  });
  it.each(["Bearer synthetic-member", "Bearer synthetic-rejected", ""])(
    "never substitutes a member/ordinary customer for Authorization %j", async authorization => {
      const p = preparedPorts(), f = fixture({ prepared: { readOriginalGuestProof: p.read, preparation: p.preparation } });
      await expect(f.prepared!.resolveGuest({ headers: { authorization, cookie: "synthetic-cookie" } }))
        .rejects.toMatchObject({ code: "request_preparation_refused", status: 401 });
      expect(p.read).not.toHaveBeenCalled(); expect(f.customer).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
      expect(p.metadata).not.toHaveBeenCalled(); expect(p.issue).not.toHaveBeenCalled();
    });
  it("keeps a genuine null guest observation null without ordinary fallback or terminal409", async () => {
    const p = preparedPorts(), read = vi.fn(async () => null);
    const f = fixture({ prepared: { readOriginalGuestProof: read, preparation: p.preparation } });
    await expect(f.prepared!.resolveGuest({ headers: {} })).resolves.toBeNull();
    expect(read).toHaveBeenCalledTimes(1); expect(f.customer).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
    expect(p.metadata).not.toHaveBeenCalled(); expect(p.issue).not.toHaveBeenCalled();
  });
  it("keeps a failed guest provider unavailable instead of ordinary fallback or no-save proof", async () => {
    const p = preparedPorts(), read = vi.fn(async () => { throw Error("private provider diagnostic"); });
    const f = fixture({ prepared: { readOriginalGuestProof: read, preparation: p.preparation } });
    await expect(f.prepared!.resolveGuest({ headers: { cookie: "synthetic-cookie" } }))
      .rejects.toMatchObject({ code: "request_preparation_unavailable", status: 503 });
    expect(f.customer).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
    expect(p.metadata).not.toHaveBeenCalled(); expect(p.issue).not.toHaveBeenCalled();
  });
  it("binds the existing exact-saved service facet to the projected owner and retains fingerprint conflicts", async () => {
    const p = preparedPorts(), body = preparedInput(), normalized = validateRequestIntentInput(body);
    const ownerHash = sha256AssistedOrderHasher.stableHash(["request-intent-owner", "session",
      p.proof.customerRef, sha256AssistedOrderHasher.hash(p.proof.sessionHandleHash)]);
    const fingerprint = sha256AssistedOrderHasher.stableHash({ kind: "unapproved_selection_request",
      contact: normalized.contact, agreements: normalized.agreements, lines: normalized.lines });
    const f = fixture({ legal: false, prepared: { readOriginalGuestProof: p.read, preparation: p.preparation },
      savedAttempt: { ownerHash, attemptHash: sha256AssistedOrderHasher.hash(recoveryKey),
        record: { fingerprint, receipt: recoveryReceipt } } });
    const projection = await f.prepared!.resolveGuest({ headers: { cookie: "synthetic-cookie" } });
    await expect(f.prepared!.service.findSavedSubmission(projection!.viewer, body)).resolves.toEqual(recoveryReceipt);
    await expect(f.prepared!.service.findSavedSubmission(projection!.viewer,
      { ...body, lines: [{ ...body.lines[0], quantity: 2 }] })).rejects.toMatchObject({ status: 409 });
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["request_intent_find_attempt", "request_intent_find_attempt"]);
    expect(f.rpc).toHaveBeenCalledWith("request_intent_find_attempt", {
      p_owner_hash: ownerHash, p_attempt_hash: sha256AssistedOrderHasher.hash(recoveryKey),
    });
    expect(f.customer).not.toHaveBeenCalled(); expect(p.metadata).not.toHaveBeenCalled(); expect(p.issue).not.toHaveBeenCalled();
  });
  it("passes real canonical resolved facts through the injected existing preparation port without a save", async () => {
    const p = preparedPorts(), f = fixture({ contactAdmission: true, preparedCatalog: true,
      prepared: { readOriginalGuestProof: p.read, preparation: p.preparation } });
    const projection = await f.prepared!.resolveGuest({ headers: { cookie: "synthetic-cookie" } });
    const result = await f.prepared!.service.prepareFixture(projection!.viewer, preparedInput());
    expect(result).toEqual({ kind: "request_intent_prepared_fixture", protocol: REQUEST_INTENT_PREPARATION_PROTOCOL,
      witness: "synthetic.prepared-witness", expiresAt: expect.any(String) });
    expect(p.metadata).toHaveBeenCalledTimes(1); expect(p.issue).toHaveBeenCalledTimes(1);
    const query = p.metadata.mock.calls[0][0];
    expect(query.ownerHash).toBe(sha256AssistedOrderHasher.stableHash(["request-intent-owner", "session",
      p.proof.customerRef, sha256AssistedOrderHasher.hash(p.proof.sessionHandleHash)]));
    expect(query.snapshot.lines).toEqual([expect.objectContaining({ productId: "prepared-product", variantId: "prepared-variant",
      sourceVariantId: "prepared-source-variant", quantity: 1 })]);
    expect(p.issue).toHaveBeenCalledWith(expect.objectContaining({ ownerHash: query.ownerHash,
      attemptHash: query.attemptHash, fingerprint: query.fingerprint, admissionKey: query.admissionKey,
      snapshotSha256: "d".repeat(64), expiresAt: result.expiresAt }));
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual([
      "request_intent_find_attempt", "request_intent_catalog_address_has", "request_intent_catalog_address_has",
    ]);
    expect(f.customer).not.toHaveBeenCalled();
  });
  it("preserves an uncertain preparation issuer failure as503 without creating a request", async () => {
    const p = preparedPorts(); p.issue.mockRejectedValue(Error("private uncertain issuer outcome"));
    const f = fixture({ contactAdmission: true, preparedCatalog: true,
      prepared: { readOriginalGuestProof: p.read, preparation: p.preparation } });
    const projection = await f.prepared!.resolveGuest({ headers: { cookie: "synthetic-cookie" } });
    await expect(f.prepared!.service.prepareFixture(projection!.viewer, preparedInput()))
      .rejects.toMatchObject({ code: "request_preparation_unavailable", status: 503 });
    expect(p.metadata).toHaveBeenCalledTimes(1); expect(p.issue).toHaveBeenCalledTimes(1);
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual([
      "request_intent_find_attempt", "request_intent_catalog_address_has", "request_intent_catalog_address_has",
    ]);
    expect(f.customer).not.toHaveBeenCalled();
  });
  it.each([true, false])("preserves ordinary mounted HTTP behavior with unused prepared dependencies (enabled:%s)", async enabled => {
    const p = preparedPorts(); p.read.mockRejectedValue(Error("ordinary routes must not consult guest preparation"));
    const ordinary = fixture({ enabled, customer: recoveryGuest, savedAttempt: recoverableAttempt });
    const injected = fixture({ enabled, customer: recoveryGuest, savedAttempt: recoverableAttempt,
      prepared: { readOriginalGuestProof: p.read, preparation: p.preparation } });
    const before = await request(ordinary.app).get(root + "/config");
    const after = await request(injected.app).get(root + "/config");
    expect(after.status).toBe(before.status); expect(after.body).toEqual(before.body);
    const post = (app: typeof ordinary.app) => request(app).post(root + "/recover")
      .set("Origin", "https://fixture.example.invalid").send({ idempotencyKey: recoveryKey });
    const oldRecovery = await post(ordinary.app), newRecovery = await post(injected.app);
    expect(newRecovery.status).toBe(oldRecovery.status); expect(newRecovery.body).toEqual(oldRecovery.body);
    expect(injected.rpc.mock.calls).toEqual(ordinary.rpc.mock.calls);
    expect(injected.customer).toHaveBeenCalledTimes(ordinary.customer.mock.calls.length);
    expect(p.read).not.toHaveBeenCalled(); expect(p.metadata).not.toHaveBeenCalled(); expect(p.issue).not.toHaveBeenCalled();
  });
});

describe("server referral locator switch (default off, reuses the Referral V1 gate)", () => {
  const secret = "synthetic-request-referral-switch-key-not-for-production";
  const v1On = { RESEARCH_REFERRAL_V1_ENABLED: "true", AFFILIATE_SYSTEM_ENABLED: "true",
    AFFILIATE_PORTAL_ENABLED: "true", AFFILIATE_CODES_ENABLED: "true", RESEARCH_PARTNER_LINK_SECRET: secret };
  const guest = { cookieHeader: undefined, actorAuthUserId: null };
  const member = { cookieHeader: undefined, actorAuthUserId: "ABCDEF00-1234-4ABC-8DEF-0123456789AB" };

  it("P1: builds no locator unless the switch is exactly \"true\", even with V1 fully on", () => {
    expect(REQUEST_INTENT_SERVER_REFERRAL_ENV).toBe("RESEARCH_REQUEST_SERVER_REFERRAL_ENABLED");
    for (const value of [undefined, "", "false", "TRUE", "1", " true"]) {
      expect(requestIntentReferralLocator({ ...v1On, [REQUEST_INTENT_SERVER_REFERRAL_ENV]: value })).toBeUndefined();
    }
  });

  it("P2: switch on with V1 off records disabled for guests and members alike", () => {
    for (const off of ["RESEARCH_REFERRAL_V1_ENABLED", "AFFILIATE_PORTAL_ENABLED", "AFFILIATE_CODES_ENABLED"]) {
      const locator = requestIntentReferralLocator({ ...v1On, [off]: "false", [REQUEST_INTENT_SERVER_REFERRAL_ENV]: "true" });
      expect(locator?.locate(guest)).toEqual({ kind: "unavailable", reason: "disabled" });
      expect(locator?.locate(member)).toEqual({ kind: "unavailable", reason: "disabled" });
    }
  });

  it("P3: switch and V1 on with a missing or short secret leave a guest unconfigured", () => {
    for (const bad of [undefined, "short-secret"]) {
      const locator = requestIntentReferralLocator({ ...v1On, RESEARCH_PARTNER_LINK_SECRET: bad, [REQUEST_INTENT_SERVER_REFERRAL_ENV]: "true" });
      expect(locator?.locate(guest)).toEqual({ kind: "unavailable", reason: "unconfigured" });
      // An account binding needs no partner-link secret, as in the resolver.
      expect(locator?.locate(member)).toEqual({ kind: "account", actorAuthUserId: "abcdef00-1234-4abc-8def-0123456789ab" });
    }
  });

  it("P3b: a configured guest without referral cookies has no supported touch", () => {
    const locator = requestIntentReferralLocator({ ...v1On, [REQUEST_INTENT_SERVER_REFERRAL_ENV]: "true" });
    expect(locator?.locate(guest)).toEqual({ kind: "no_supported_touch" });
    expect(locator?.locate({ cookieHeader: "unrelated=1", actorAuthUserId: null })).toEqual({ kind: "no_supported_touch" });
  });
});

describe("server referral locator wiring through registerRequestIntentApi (P4)", () => {
  const v1On = { RESEARCH_REFERRAL_V1_ENABLED: "true", AFFILIATE_SYSTEM_ENABLED: "true", AFFILIATE_PORTAL_ENABLED: "true",
    AFFILIATE_CODES_ENABLED: "true", RESEARCH_PARTNER_LINK_SECRET: "synthetic-request-referral-switch-key-not-for-production" };
  async function birth(switchValue: string | undefined) {
    const create = vi.fn((_name: string, args: Readonly<Record<string, unknown>>) => {
      const detail = args.p_detail as Record<string, unknown>;
      return { fingerprint: args.p_fingerprint, receipt: { kind: detail.kind, requestId: detail.requestId,
        publicReference: detail.publicReference, status: detail.status, createdAt: detail.createdAt } };
    });
    const f = fixture({ preparedCatalog: true, create, env: { ...v1On, [REQUEST_INTENT_SERVER_REFERRAL_ENV]: switchValue } });
    const response = await request(f.app).post(root).set("Origin", "https://fixture.example.invalid")
      .set("Sec-Fetch-Site", "same-origin").set("Cookie", "synthetic=1").send(preparedInput());
    return { f, create, response };
  }

  it("P4: switch on sends the member's account locator in p_detail; off sends the earlier payload", async () => {
    const on = await birth("true"), off = await birth(undefined);
    expect(on.response.status).toBe(200); expect(off.response.status).toBe(200);
    expect(on.create).toHaveBeenCalledTimes(1); expect(off.create).toHaveBeenCalledTimes(1);
    const [onName, onArgs] = on.create.mock.calls[0], [offName, offArgs] = off.create.mock.calls[0];
    expect(onName).toBe("request_intent_create_or_replay"); expect(offName).toBe(onName);
    const { _serverReferral, ...onDetail } = onArgs.p_detail as Record<string, unknown>;
    expect(_serverReferral).toEqual({ kind: "account", actorAuthUserId: actor });
    expect(offArgs.p_detail).not.toHaveProperty("_serverReferral");
    expect(Object.keys(onDetail).sort()).toEqual(Object.keys(offArgs.p_detail as object).sort());
    expect(on.response.body).not.toHaveProperty("_serverReferral");
    expect(JSON.stringify(on.response.body)).not.toContain(actor);
  });

  it("P4b: the prepared facets keep their shape with the switch on", () => {
    const p = preparedPorts();
    const on = fixture({ env: { ...v1On, [REQUEST_INTENT_SERVER_REFERRAL_ENV]: "true" },
      prepared: { readOriginalGuestProof: p.read, preparation: p.preparation } });
    expect(Object.keys(on.prepared!).sort()).toEqual(["resolveGuest", "service"]);
    expect(Object.keys(on.prepared!.service).sort()).toEqual(["findSavedSubmission", "prepareFixture"]);
  });
});
