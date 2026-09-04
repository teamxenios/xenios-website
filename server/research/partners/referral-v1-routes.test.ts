import express, { type RequestHandler } from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REFERRAL_API } from "@shared/research/referral-v1";
import { registerReferralV1Api, type ReferralV1Dependencies } from "./referral-v1-routes";
import { REFERRAL_V1_SCHEMA_VERSION, type ReferralV1Link, type ReferralV1Store } from "./referral-v1-store";
import { referralDigest, referralPublicToken } from "./referral-v1-tokens";

const secret = "synthetic-referral-route-key-not-for-production";
const actor = "10000000-0000-4000-8000-000000000001";
const linkId = "20000000-0000-4000-8000-000000000002";
const partnerId = "30000000-0000-4000-8000-000000000003";
const touchId = "40000000-0000-4000-8000-000000000004";
const key = "50000000-0000-4000-8000-000000000005";
const now = Date.parse("2026-09-04T00:00:00Z");
const token = referralPublicToken(secret, linkId, 1)!;
const canonicalLink: ReferralV1Link = { id: linkId, partnerId, internalCode: linkId, tokenKeyVersion: 1, tokenHashHex: referralDigest(token), destinationPath: "/health", createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 30 * 86400000).toISOString(), revokedAt: null, availability: "ready", captureCount: 1, bindingCount: 0 };
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); }))); });

async function fixture(overrides: Partial<ReferralV1Dependencies> = {}) {
  const link = { ...canonicalLink };
  let winner: { touchId: string; linkId: string; partnerId: string; subjectKeyHash: string; capturedAt: string; expiresAt: string } | null = null;
  const binding = { accountKey: `auth:${actor}`, linkId, partnerId, touchId, boundAt: new Date(now).toISOString() };
  const store: ReferralV1Store = {
    authority: vi.fn(async () => ({ ok: true as const, value: { schemaVersion: REFERRAL_V1_SCHEMA_VERSION } })),
    listOwn: vi.fn(async () => ({ ok: true as const, value: { eligible: true, partnerId, partnerState: "active", links: [link] } })),
    issue: vi.fn(async () => ({ ok: true as const, value: { link, created: true } })),
    revoke: vi.fn(async () => ({ ok: true as const, value: { link: { ...link, availability: "revoked" as const, revokedAt: new Date(now).toISOString() }, created: true } })),
    resolve: vi.fn(async ({ tokenHashHex }) => tokenHashHex === link.tokenHashHex && link.availability === "ready" ? { ok: true as const, value: { link } } : { ok: false as const, reason: "invalid_link" as const }),
    capture: vi.fn(async ({ subjectKeyHash }) => {
      const created = !winner;
      winner ??= { touchId, linkId, partnerId, subjectKeyHash, capturedAt: new Date(now).toISOString(), expiresAt: link.expiresAt };
      return { ok: true as const, value: { touch: winner, created, availability: "ready" as const } };
    }),
    bind: vi.fn(async () => ({ ok: true as const, value: { binding, created: true, availability: "ready" as const } })),
    getBinding: vi.fn(async () => ({ ok: true as const, value: { binding, created: false, availability: "ready" as const } })),
    listAdmin: vi.fn(async () => ({ ok: true as const, value: { links: [link], events: [{ id: key, eventType: "account_bound" as const, partnerId, linkId, occurredAt: new Date(now).toISOString() }], bindings: [{ ...binding, availability: "ready" as const }], touches: [] } })),
  };
  const app = express(); app.use(express.json());
  const guard: RequestHandler = (req, res, next) => {
    if (req.headers.authorization !== `Bearer ${actor}`) { res.status(401).json({ ok: false }); return; }
    Object.assign(req, { researchMember: { auth_user_id: actor, id: "server-only-member", status: "active" } }); next();
  };
  const adminToken = `fixture.${Buffer.from(JSON.stringify({ sub: actor })).toString("base64url")}.fixture`;
  const adminGuard: RequestHandler = (req, res, next) => { if (req.headers.authorization !== `Bearer ${adminToken}`) { res.status(403).json({ ok: false }); return; } next(); };
  const server = await new Promise<Server>((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); }); servers.push(server);
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const deps: ReferralV1Dependencies = { enabled: true, secret, origin, store, now: () => now, allowed: vi.fn(async () => true), lineage: vi.fn(async () => ({ state: "unavailable", records: [] })), ...overrides };
  const service = registerReferralV1Api(app, deps, { requireMember: guard, requireAdmin: adminGuard });
  const request = async (path: string, options: { method?: string; body?: unknown; auth?: boolean; admin?: boolean; headers?: Record<string, string> } = {}) => {
    const response = await fetch(origin + path, { method: options.method ?? "GET", headers: { Origin: origin, ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(options.auth ? { Authorization: `Bearer ${actor}` } : {}), ...(options.admin ? { Authorization: `Bearer ${adminToken}` } : {}), ...options.headers }, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
    return { status: response.status, headers: response.headers, body: await response.json() as any };
  };
  const bootstrap = async () => {
    const result = await request(REFERRAL_API.bootstrap, { method: "POST", body: {} });
    return { Cookie: result.headers.get("set-cookie")!.split(";", 1)[0], "X-Xenios-Referral-CSRF": result.body.csrfToken };
  };
  return { request, bootstrap, store, deps, service, link };
}

describe("composed Referral V1 HTTP authority (synthetic guards, no external services)", () => {
  it("member ownership is resolved by the guard; only public-safe links leave the server", async () => {
    const f = await fixture();
    expect((await f.request(REFERRAL_API.links)).status).toBe(401);
    const result = await f.request(REFERRAL_API.links, { auth: true });
    expect(result.status).toBe(200);
    expect(f.store.listOwn).toHaveBeenCalledWith({ actorAuthUserId: actor });
    expect(result.body.links[0].url).toMatch(/\/r\/r1_[A-Za-z0-9_-]{43}$/);
    for (const forbidden of [partnerId, "tokenHashHex", "internalCode", "commission", "email", "medical"]) expect(JSON.stringify(result.body)).not.toContain(forbidden);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it.each([{ destinationPath: "//outside.invalid" }, { destinationPath: "/care", partnerId }, { destinationPath: "/care", commission: 99 }, { destinationPath: "/care", symptoms: "blocked" }])("rejects browser authority/redirect/clinical input %j", async (body) => {
    const f = await fixture();
    expect((await f.request(REFERRAL_API.links, { method: "POST", auth: true, body, headers: { "Idempotency-Key": key } })).status).toBe(400);
    expect(f.store.issue).not.toHaveBeenCalled();
  });
  it("requires same-origin JSON and an idempotency key for mutations", async () => {
    const f = await fixture();
    expect((await f.request(REFERRAL_API.links, { method: "POST", auth: true, body: { destinationPath: "/care" } })).status).toBe(400);
    expect((await f.request(REFERRAL_API.links, { method: "POST", auth: true, body: { destinationPath: "/care" }, headers: { Origin: "https://outside.invalid", "Idempotency-Key": key } })).status).toBe(403);
    const result = await f.request(REFERRAL_API.links, { method: "POST", auth: true, body: { destinationPath: "/care" }, headers: { "Idempotency-Key": key } });
    expect(result.status).toBe(200);
    expect(f.store.issue).toHaveBeenCalledWith(expect.objectContaining({ actorAuthUserId: actor, idempotencyKey: key, destinationPath: "/care", expiresInDays: 30 }));
  });
  it("resolves, captures durably, and binds the signed winning touch after authentication", async () => {
    const f = await fixture();
    expect((await f.request(REFERRAL_API.resolve, { method: "POST", body: { code: token } })).body).toEqual({ ok: true, valid: true, destinationPath: "/health", sharedBy: "an approved Xenios partner" });
    const headers = await f.bootstrap();
    const captured = await f.request(REFERRAL_API.capture, { method: "POST", body: { code: token }, headers });
    expect(captured.body).toEqual({ ok: true, destinationPath: "/health", attribution: "recognized", accountBinding: "sign_in_required" });
    const cookie = `${headers.Cookie}; ${captured.headers.get("set-cookie")!.split(";", 1)[0]}`;
    expect(f.store.capture).toHaveBeenCalledTimes(1);
    const bound = await f.request(REFERRAL_API.bind, { method: "POST", auth: true, body: {}, headers: { ...headers, Cookie: cookie } });
    expect(bound.body.accountBinding).toBe("bound");
    expect(f.store.bind).toHaveBeenCalledWith(expect.objectContaining({ actorAuthUserId: actor, touchId, subjectKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    const tampered = await f.request(REFERRAL_API.bind, { method: "POST", auth: true, body: {}, headers: { ...headers, Cookie: cookie + "x" } });
    expect(tampered.body.accountBinding).toBe("not_bound");
    expect(f.store.bind).toHaveBeenCalledTimes(1);
  });
  it("does not mint attribution if persistence fails", async () => {
    const f = await fixture(); const headers = await f.bootstrap();
    vi.mocked(f.store.capture).mockResolvedValue({ ok: false, reason: "unavailable" });
    const result = await f.request(REFERRAL_API.capture, { method: "POST", body: { code: token }, headers });
    expect(result.status).toBe(503); expect(result.headers.get("set-cookie")).toBeNull(); expect(f.store.bind).not.toHaveBeenCalled();
  });
  it("refuses unregistered/revoked links and missing or forged visitor CSRF", async () => {
    const f = await fixture();
    expect((await f.request(REFERRAL_API.resolve, { method: "POST", body: { code: `r1_${"x".repeat(43)}` } })).status).toBe(404);
    expect((await f.request(REFERRAL_API.capture, { method: "POST", body: { code: token } })).status).toBe(403);
    const headers = await f.bootstrap();
    expect((await f.request(REFERRAL_API.capture, { method: "POST", body: { code: token }, headers: { ...headers, "X-Xenios-Referral-CSRF": "x".repeat(43) } })).status).toBe(403);
    f.link.availability = "revoked";
    expect((await f.request(REFERRAL_API.capture, { method: "POST", body: { code: token }, headers })).status).toBe(404);
    expect(f.store.capture).not.toHaveBeenCalled();
  });
  it("a retained ineligible winner is never replaced by the incoming ready link or re-signed", async () => {
    const f = await fixture(); const headers = await f.bootstrap();
    vi.mocked(f.store.capture).mockResolvedValue({ ok: true, value: { created: false, availability: "revoked", touch: { touchId, linkId, partnerId, subjectKeyHash: "a".repeat(64), capturedAt: new Date(now).toISOString(), expiresAt: canonicalLink.expiresAt } } });
    const result = await f.request(REFERRAL_API.capture, { method: "POST", body: { code: token }, headers });
    expect(result.body.attribution).toBe("retained_ineligible"); expect(result.headers.get("set-cookie")).toBeNull();
  });
  it("hides shareability when signing material no longer reconstructs the registered hash", async () => {
    const f = await fixture(); f.link.tokenHashHex = "f".repeat(64);
    const result = await f.request(REFERRAL_API.links, { auth: true });
    expect(result.body.links[0]).toMatchObject({ state: "unavailable", url: null });
  });
  it("admin is separately guarded, shows only safe lineage, and exposes no correction mutation", async () => {
    const f = await fixture();
    expect((await f.request(REFERRAL_API.admin, { auth: true })).status).toBe(403);
    const result = await f.request(REFERRAL_API.admin, { admin: true });
    expect(result.status).toBe(200); expect(result.body.correctionsSupported).toBe(false);
    expect(result.body.bindings[0].accountKey).toBe(`auth:${actor}`);
    expect(result.body.lineage.state).toBe("unavailable");
    for (const forbidden of [token, "tokenHashHex", "subjectKeyHash", "internalCode", "commission", "email", "medical"]) expect(JSON.stringify(result.body)).not.toContain(forbidden);
    expect((await f.request(REFERRAL_API.admin + "?limit=999", { admin: true })).status).toBe(400);
  });
  it("capability or durable-budget absence fails closed", async () => {
    const disabled = await fixture({ enabled: false });
    expect((await disabled.request(REFERRAL_API.links, { auth: true })).status).toBe(503);
    expect(disabled.store.listOwn).not.toHaveBeenCalled();
    const limited = await fixture({ allowed: async () => false });
    expect((await limited.request(REFERRAL_API.bootstrap, { method: "POST", body: {} })).status).toBe(429);
    expect(limited.store.authority).not.toHaveBeenCalled();
  });
});
