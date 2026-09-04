import express, { type Request } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({
  configured: true, memberStatus: "active", memberExists: true,
  rpc: vi.fn(), getUser: vi.fn(), from: vi.fn(), admin: vi.fn(),
}));
vi.mock("../../supabase", () => ({
  supabaseConfigured: () => transport.configured,
  getSupabaseAdmin: transport.admin,
  getSupabaseAnon: () => ({ auth: { getUser: transport.getUser } }),
}));
// Unrelated member endpoints cannot enqueue mail or activate a legacy program.
vi.mock("../outbox", () => ({ enqueueNotification: vi.fn(), runOutboxTick: vi.fn() }));
vi.mock("../referrals", () => ({
  createReferralIdentity: vi.fn(), getLedgerBalance: vi.fn(), referralsEnabled: () => false,
}));

import { registerMemberApi } from "../members";
import { createReferralV1Service } from "./referral-v1-routes";
import { bindConfiguredMemberReferral, buildReferralV1Dependencies, referralV1Enabled } from "./referral-v1-production";
import { REFERRAL_V1_SCHEMA_VERSION } from "./referral-v1-store";
import { ATTRIBUTION_COOKIE_NAME, REFERRAL_VISITOR_COOKIE, createReferralVisitor, referralDigest,
  referralSubject, sealReferralCapture, sealReferralVisitor } from "./referral-v1-tokens";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = uid(1), memberId = uid(2), touchId = uid(3), linkId = uid(4), partnerId = uid(5);
const secret = "synthetic-referral-production-secret-not-for-use";
const flags = {
  RESEARCH_REFERRAL_V1_ENABLED: "true", AFFILIATE_SYSTEM_ENABLED: "true",
  AFFILIATE_PORTAL_ENABLED: "true", AFFILIATE_CODES_ENABLED: "true",
};
const env = { ...flags, RESEARCH_PARTNER_LINK_SECRET: secret, SITE_URL: "https://xenios.example.invalid" };
const jwt = (method = "password", subject = actor) => `synthetic.${Buffer.from(JSON.stringify({ sub: subject, amr: [{ method }] })).toString("base64url")}.synthetic`;
const normalToken = jwt(), recoveryToken = jwt("otp"), otherToken = jwt("password", uid(99));
const authority = { ok: true, value: { schemaVersion: REFERRAL_V1_SCHEMA_VERSION } };
const binding = { accountKey: `auth:${actor}`, linkId, touchId, partnerId, boundAt: "2026-09-04T12:00:00Z" };
const unavailable = { ok: false, reason: "unavailable" };

function cookie() {
  const visitor = createReferralVisitor(Date.now());
  const subjectKeyHash = referralSubject(secret, visitor);
  return { subjectKeyHash, value: `${REFERRAL_VISITOR_COOKIE}=${sealReferralVisitor(secret, visitor)}; ${ATTRIBUTION_COOKIE_NAME}=${sealReferralCapture(secret, { touchId, subjectKeyHash, expiresAt: visitor.expiresAt })}` };
}
function req(cookieHeader?: string, canonical = true): Request {
  return { headers: { cookie: cookieHeader, "x-forwarded-for": "198.51.100.99" }, ip: "192.0.2.22",
    body: { actorAuthUserId: uid(99), memberId: uid(99), partnerId: uid(99) },
    ...(canonical ? { researchMember: { id: memberId, auth_user_id: actor, status: "active" } } : {}),
  } as unknown as Request;
}
function memberApp() { const app = express(); app.use(express.json()); registerMemberApi(app); return app; }
const executeCalls = () => transport.rpc.mock.calls.filter(call => call[0] === "research_referral_v1_execute");

beforeEach(() => {
  vi.clearAllMocks();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  // All provider calls are replaced at the production transport boundary.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected outbound request in synthetic-only test")));
  transport.configured = true; transport.memberStatus = "active"; transport.memberExists = true;
  transport.getUser.mockImplementation(async (token: string) => [normalToken, recoveryToken, otherToken].includes(token)
    ? { data: { user: { id: token === otherToken ? uid(99) : actor, email: "synthetic@example.invalid" } }, error: null }
    : { data: { user: null }, error: { message: "synthetic private auth provider detail", status: 401 } });
  transport.from.mockImplementation((table: string) => {
    const filters: Array<[string, unknown]> = [];
    const chain = { select: () => chain, eq: (name: string, value: unknown) => { filters.push([name, value]); return chain; },
      maybeSingle: async () => ({ error: null, data: table === "research_members"
        ? transport.memberExists && filters.some(([name, value]) => name === "auth_user_id" && value === actor)
          ? { id: memberId, auth_user_id: actor, application_id: uid(6), first_name: "Synthetic", email: "synthetic@example.invalid", status: transport.memberStatus, created_at: "2026-09-01T00:00:00Z" } : null
        : table === "research_applications" ? { status: "active" } : null }) };
    return chain;
  });
  transport.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "research_rate_limit_hit" ? true
    : name === "research_referral_v1_authority" ? authority
      : name === "research_partner_referral_v1_lineage" ? { state: "available", records: [] }
        : name === "research_referral_v1_execute" ? { ok: true, value: { binding, created: false, availability: "ready" } } : null }));
  transport.admin.mockReturnValue({ rpc: transport.rpc, from: transport.from });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Referral V1 production dependency wiring", () => {
  it("composes lazily and requires every independent capability", async () => {
    const deps = buildReferralV1Dependencies(env);
    expect(deps.enabled).toBe(true); expect(transport.admin).not.toHaveBeenCalled();
    for (const flag of Object.keys(flags)) for (const disabled of [undefined, "false", "TRUE", "1", " true "]) {
      const disabledEnv = { ...env, [flag]: disabled };
      expect(referralV1Enabled(disabledEnv)).toBe(false);
      expect(await createReferralV1Service(buildReferralV1Dependencies(disabledEnv)).ready()).toBe(false);
    }
    expect(transport.admin).not.toHaveBeenCalled();
  });

  it.each([
    { RESEARCH_PARTNER_LINK_SECRET: undefined }, { RESEARCH_PARTNER_LINK_SECRET: "short" },
    { SITE_URL: "https://xenios.example.invalid/path" }, { SITE_URL: "https://user:password@xenios.example.invalid" },
    { SITE_URL: "http://outside.example.invalid" },
  ])("fails service readiness closed for unsafe configuration %j", async change => {
    expect(await createReferralV1Service(buildReferralV1Dependencies({ ...env, ...change })).ready()).toBe(false);
    expect(transport.admin).not.toHaveBeenCalled();
  });

  it("refuses unavailable or drifted SQL capability without a memory substitute", async () => {
    const deps = buildReferralV1Dependencies(env);
    transport.configured = false;
    expect(await deps.store.authority()).toEqual(unavailable);
    expect(await deps.allowed(req(), "capture")).toBe(false);
    expect(transport.admin).not.toHaveBeenCalled();
    transport.configured = true;
    transport.rpc.mockResolvedValue({ data: { ok: true, value: { schemaVersion: "stale" } }, error: null });
    expect(await createReferralV1Service(deps).ready()).toBe(false);
  });

  it.each([["read", 120], ["write", 20], ["capture", 60]] as const)("uses canonical actor and durable %s budget", async (action, limit) => {
    expect(await buildReferralV1Dependencies(env).allowed(req(), action)).toBe(true);
    expect(transport.rpc).toHaveBeenCalledExactlyOnceWith("research_rate_limit_hit", {
      p_key: `gen2-referral-v1:${action}:${referralDigest(actor)}`, p_window_seconds: 3600, p_max_hits: limit,
    });
    expect(JSON.stringify(transport.rpc.mock.calls)).not.toContain(actor);
    expect(JSON.stringify(transport.rpc.mock.calls)).not.toContain("198.51.100.99");
  });

  it("uses the trusted request IP, not browser X-Forwarded-For or body identity", async () => {
    await buildReferralV1Dependencies(env).allowed(req(undefined, false), "capture");
    expect(transport.rpc.mock.calls[0][1].p_key).toBe(`gen2-referral-v1:capture:${referralDigest("192.0.2.22")}`);
  });

  it.each([false, null, undefined, "true", 1, {}, []])("only literal durable true permits an action (%j)", async data => {
    transport.rpc.mockResolvedValue({ data, error: null });
    const deps = buildReferralV1Dependencies(env);
    expect(await deps.allowed(req(), "capture")).toBe(false);
    expect(await buildReferralV1Dependencies(env).allowed(req(), "capture")).toBe(false);
    expect(transport.rpc).toHaveBeenCalledTimes(2);
  });

  it("sanitizes errors from client construction, provider responses and thrown transport", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = buildReferralV1Dependencies(env);
    transport.rpc.mockResolvedValue({ data: true, error: { message: "synthetic-private-provider-token" } });
    expect(await deps.allowed(req(), "write")).toBe(false);
    expect(await deps.store.authority()).toEqual(unavailable);
    transport.rpc.mockRejectedValue(new Error("synthetic-private-query"));
    expect(await deps.allowed(req(), "capture")).toBe(false);
    expect(await deps.lineage([])).toEqual({ state: "unavailable", records: [] });
    transport.admin.mockImplementation(() => { throw new Error("synthetic-private-client-key"); });
    expect(await deps.store.authority()).toEqual(unavailable);
    expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });

  it("wires lineage to its narrow RPC, not direct table access", async () => {
    expect(await buildReferralV1Dependencies(env).lineage([])).toEqual({ state: "available", records: [] });
    expect(transport.rpc).toHaveBeenCalledExactlyOnceWith("research_partner_referral_v1_lineage", { p_account_keys: [], p_limit: 100 });
    expect(transport.from).not.toHaveBeenCalled();
  });
});

describe("Referral V1 canonical member/me auth composition", () => {
  it("binds only the signed winning capture after real member guard verification", async () => {
    const claim = cookie();
    const response = await request(memberApp()).get(`/api/research/member/me?actorAuthUserId=${uid(99)}`)
      .set("Authorization", `Bearer ${normalToken}`).set("Cookie", claim.value);
    expect(response.status).toBe(200);
    expect(response.body.member).toMatchObject({ firstName: "Synthetic", status: "active" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(transport.getUser).toHaveBeenCalledExactlyOnceWith(normalToken);
    expect(transport.getUser.mock.invocationCallOrder[0]).toBeLessThan(transport.rpc.mock.invocationCallOrder[0]);
    expect(transport.from.mock.calls.map(call => call[0])).toEqual(["research_members", "research_applications"]);
    expect(transport.rpc.mock.calls.map(call => call[0])).toEqual(["research_rate_limit_hit", "research_referral_v1_authority", "research_referral_v1_execute"]);
    expect(executeCalls()[0][1]).toEqual({ p_operation: "bind", p_input: { actorAuthUserId: actor, touchId, subjectKeyHash: claim.subjectKeyHash } });
    expect(JSON.stringify(response.body)).not.toMatch(/auth:|subjectKeyHash|partnerId|touchId|xrv1|synthetic-private/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([[undefined, 401], ["synthetic-invalid", 401], [recoveryToken, 403], [otherToken, 403]] as const)("does not bind rejected identity/purpose (%s)", async (token, status) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const call = request(memberApp()).get("/api/research/member/me").set("Cookie", cookie().value);
    if (token) call.set("Authorization", `Bearer ${token}`);
    const response = await call;
    expect(response.status).toBe(status); expect(transport.rpc).not.toHaveBeenCalled();
    if (token === recoveryToken) expect(response.body.code).toBe("recovery_session");
  });

  it("preserves closed-subject privacy access without binding or capture-budget use", async () => {
    transport.memberStatus = "closed";
    const response = await request(memberApp()).get("/api/research/member/me").set("Authorization", `Bearer ${normalToken}`).set("Cookie", cookie().value);
    expect(response.status).toBe(200); expect(response.body.member.status).toBe("closed");
    expect(transport.rpc).not.toHaveBeenCalled();
  });

  it("ordinary member hydration with no capture performs no referral database calls", async () => {
    const response = await request(memberApp()).get("/api/research/member/me").set("Authorization", `Bearer ${normalToken}`);
    expect(response.status).toBe(200); expect(response.body.member.status).toBe("active");
    expect(transport.rpc).not.toHaveBeenCalled();
  });

  it("referral binding does not activate a canonically pending member", async () => {
    transport.memberStatus = "pending_activation";
    const response = await request(memberApp()).get("/api/research/member/me").set("Authorization", `Bearer ${normalToken}`).set("Cookie", cookie().value);
    expect(response.status).toBe(200); expect(response.body.member.status).toBe("pending_activation");
    expect(executeCalls()).toHaveLength(1);
    expect(transport.from.mock.calls.map(call => call[0])).toEqual(["research_members", "research_applications"]);
  });

  it.each(["denied", "provider_error", "thrown", "schema_missing"])("keeps legitimate auth successful when optional referral is %s", async failure => {
    const original = transport.rpc.getMockImplementation()!;
    transport.rpc.mockImplementation(async (name: string, args: unknown) => {
      if (name === "research_rate_limit_hit" && failure === "denied") return { data: false, error: null };
      if (name === "research_rate_limit_hit" && failure === "provider_error") return { data: null, error: { message: "synthetic-private" } };
      if (name === "research_rate_limit_hit" && failure === "thrown") throw new Error("synthetic-private");
      if (name === "research_referral_v1_authority" && failure === "schema_missing") return { data: null, error: null };
      return original(name, args);
    });
    const response = await request(memberApp()).get("/api/research/member/me").set("Authorization", `Bearer ${normalToken}`).set("Cookie", cookie().value);
    expect(response.status).toBe(200); expect(response.body.member.status).toBe("active");
    expect(executeCalls()).toHaveLength(0); expect(JSON.stringify(response.body)).not.toContain("synthetic-private");
  });

  it("does not bind through other member routes, unknown paths or caller body fields", async () => {
    const app = memberApp();
    for (const path of ["/api/research/member/referrals", "/api/research/member/me/nested"]) {
      await request(app).get(path).set("Authorization", `Bearer ${normalToken}`).set("Cookie", cookie().value);
    }
    await request(app).post("/api/research/member/me").set("Authorization", `Bearer ${normalToken}`).set("Cookie", cookie().value)
      .send({ researchMember: { auth_user_id: actor }, touchId, subjectKeyHash: "a".repeat(64) });
    expect(transport.rpc).not.toHaveBeenCalled();
  });

  it("does not spend capture budget for absent, malformed, mismatched or duplicate cookies", async () => {
    const valid = cookie().value, other = cookie().value;
    const variants = [undefined, "xr_aff=untrusted", valid + "x", valid + "; " + valid,
      `${valid.split("; ")[0]}; ${other.split("; ")[1]}`];
    for (const value of variants) await bindConfiguredMemberReferral(req(value));
    expect(transport.rpc).not.toHaveBeenCalled();
  });

  it("does not spend capture budget without canonical member, configuration, or flags", async () => {
    const valid = cookie().value;
    await bindConfiguredMemberReferral(req(valid, false));
    const closed = req(valid); (closed as any).researchMember.status = "closed";
    await bindConfiguredMemberReferral(closed);
    const invalid = req(valid); (invalid as any).researchMember.auth_user_id = "browser-chosen-member";
    await bindConfiguredMemberReferral(invalid);
    vi.stubEnv("RESEARCH_PARTNER_LINK_SECRET", "short");
    await bindConfiguredMemberReferral(req(valid));
    vi.stubEnv("RESEARCH_PARTNER_LINK_SECRET", secret); vi.stubEnv("SITE_URL", "https://outside.invalid/path");
    await bindConfiguredMemberReferral(req(valid));
    vi.stubEnv("RESEARCH_REFERRAL_V1_ENABLED", "false");
    await bindConfiguredMemberReferral(req(valid));
    expect(transport.rpc).not.toHaveBeenCalled();
  });
});
