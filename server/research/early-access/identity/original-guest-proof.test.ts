import { createHash } from "node:crypto";
import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import { createOriginalGuestProofReader } from "./original-guest-proof";
import { SessionScopedEarlyAccessIdentityDirectory, EARLY_ACCESS_CONTINUITY_COOKIE,
  earlyAccessCustomerRefForContinuity, earlyAccessCustomerRefForSession, readEarlyAccessContinuityToken } from "./session-scoped-identity";
import { createUnlockRoute, createEarlyAccessSessionResolver, createEarlyAccessSessionIdReader,
  type PrivateAccessResponsePort, type PrivateAccessRouteDependencies } from "../private-access-routes";
import { InMemoryPrivateAccessSessionRepository, SupabasePrivateAccessSessionRepository,
  PRIVATE_ACCESS_SESSION_RPC, PRIVATE_ACCESS_SESSION_ACCESS_ROLE } from "../private-access-session-repository";
import { EARLY_ACCESS_TEST_CONFIG } from "../routes/route-fixtures";
import { createAssistedOrderViewerResolvers } from "../../assisted-order/express";
import { requestIntentOwner } from "../../assisted-order/request-intent/service";
import { sha256AssistedOrderHasher } from "../../assisted-order/defaults";

/** Actual canonical unlock/cookie codec/session repository/directory and viewer
 * namespace, with synthetic local sessions. These authored cases are not managed
 * Auth, persisted request-to-claim, browser or production activation evidence. */
function harness(options: { continuity?: boolean; secret?: string } = {}) {
  let now = Date.parse("2026-11-19T02:00:00.000Z"), nonce = 0;
  const repository = new InMemoryPrivateAccessSessionRepository();
  const config = { ...EARLY_ACCESS_TEST_CONFIG, openAccess: true, sessionSecret: options.secret ?? EARLY_ACCESS_TEST_CONFIG.sessionSecret };
  const logger = { warn: vi.fn() };
  const deps: PrivateAccessRouteDependencies = { config, repository, now: () => now,
    randomToken: () => Buffer.alloc(32, ++nonce).toString("base64url"), logger,
    continuitySecret: options.continuity === false ? null : config.sessionSecret };
  const resolveSession = createEarlyAccessSessionResolver(deps), readSessionId = createEarlyAccessSessionIdReader(deps);
  const identity = new SessionScopedEarlyAccessIdentityDirectory({ resolveSession, readSessionId,
    now: deps.now, continuitySecret: config.sessionSecret });
  const readOriginalGuestProof = createOriginalGuestProofReader(identity);
  const unlock = async (cookieHeader = "") => {
    let status = 0;
    const headers = new Map<string, string | readonly string[]>();
    const response: PrivateAccessResponsePort = { setHeader: (name, value) => headers.set(name, value),
      status: code => { status = code; }, json: () => undefined };
    await createUnlockRoute(deps)({ body: {}, clientKey: "synthetic-guest-proof", cookieHeader }, response);
    expect(status).toBe(200);
    const raw = headers.get("Set-Cookie"), issued = typeof raw === "string" ? [raw] : raw ?? [];
    const pairs = new Map<string, string>(cookieHeader.split(";").map(pair => pair.trim()).filter(Boolean).map(pair => {
      const equals = pair.indexOf("="); return [pair.slice(0, equals), pair.slice(equals + 1)] as const;
    }));
    for (const entry of issued) { const pair = entry.split(";")[0], equals = pair.indexOf("="); pairs.set(pair.slice(0, equals), pair.slice(equals + 1)); }
    return [...pairs].map(([name, value]) => `${name}=${value}`).join("; ");
  };
  return { repository, config, deps, identity, resolveSession, readSessionId, readOriginalGuestProof, unlock, logger,
    advance: (milliseconds: number) => { now += milliseconds; } };
}

describe("canonical original guest proof custodian", () => {
  it("uses the exact signed H1 and continuity reference behind the actual guest viewer/request-owner namespace", async () => {
    const f = harness(), cookie = await f.unlock(), h1 = f.readSessionId(cookie);
    const read = await f.readOriginalGuestProof(cookie);
    expect(h1).toMatch(/^[a-f0-9]{64}$/); expect(read).not.toBeNull();
    if (!read || !h1) throw new Error("Canonical proof missing");
    const continuityToken = readEarlyAccessContinuityToken(cookie, f.config.sessionSecret);
    expect(read.customerRef).toBe(earlyAccessCustomerRefForContinuity(continuityToken!));
    expect(read.sessionHandleHash).toBe(h1);
    expect(read.expiresAtEpochMs).toBe((await f.resolveSession(cookie)).expiresAtEpochMs);
    const viewer = await createAssistedOrderViewerResolvers({ earlyAccess: () => f, resolveMember: async () => null,
      earlyAccessBindings: () => null, adminEmail: () => "" }).customer({ headers: { cookie } } as Request);
    const h2 = createHash("sha256").update(h1, "utf8").digest("hex");
    expect(viewer.actorType).toBe("early_access_session"); expect(viewer.earlyAccessSessionHash).toBe(h2);
    expect(requestIntentOwner(viewer, sha256AssistedOrderHasher))
      .toBe(sha256AssistedOrderHasher.stableHash(["request-intent-owner", "session", read.customerRef, h2]));
    expect(read.sessionHandleHash).not.toBe(h2); expect(Object.keys(read).sort()).toEqual(["customerRef", "expiresAtEpochMs", "sessionHandleHash"]);
    expect(Object.isFrozen(read)).toBe(true);
  });

  it("supports the exact pre-continuity legacy session namespace without inventing an alias", async () => {
    const f = harness({ continuity: false }), cookie = await f.unlock(), h1 = f.readSessionId(cookie);
    expect(readEarlyAccessContinuityToken(cookie, f.config.sessionSecret)).toBeNull();
    const read = await f.readOriginalGuestProof(cookie);
    expect(read?.customerRef).toBe(earlyAccessCustomerRefForSession(h1!));
    expect((await f.identity.resolve({ cookieHeader: cookie }))?.customerRef).toBe(read?.customerRef);
  });

  it("does not reconstruct a lost continuity or historical session hash during renewal", async () => {
    const f = harness(), cookie = await f.unlock(), original = await f.readOriginalGuestProof(cookie);
    f.advance(1_000);
    const renewed = await f.readOriginalGuestProof(await f.unlock(cookie));
    expect(renewed?.customerRef).toBe(original?.customerRef); expect(renewed?.sessionHandleHash).not.toBe(original?.sessionHandleHash);
    const withoutContinuity = cookie.split("; ").filter(pair => !pair.startsWith(EARLY_ACCESS_CONTINUITY_COOKIE + "=")).join("; ");
    const legacy = await f.readOriginalGuestProof(withoutContinuity);
    expect(legacy?.customerRef).toBe(earlyAccessCustomerRefForSession(f.readSessionId(withoutContinuity)!));
    expect(legacy?.customerRef).not.toBe(original?.customerRef);
    const forgedContinuity = cookie.split("; ").map(pair => pair.startsWith(EARLY_ACCESS_CONTINUITY_COOKIE + "=")
      ? pair.slice(0, -1) + (pair.endsWith("0") ? "1" : "0") : pair).join("; ");
    expect(await f.readOriginalGuestProof(forgedContinuity)).toEqual(legacy);
    const owner = (proof: typeof original) => proof && sha256AssistedOrderHasher.stableHash(["request-intent-owner", "session",
      proof.customerRef, createHash("sha256").update(proof.sessionHandleHash, "utf8").digest("hex")]);
    expect(owner(renewed)).not.toBe(owner(original)); expect(owner(legacy)).not.toBe(owner(original));
  });

  it("checks revocation freshly, never mints or extends a session during proof reads and logs no credential", async () => {
    const f = harness(), cookie = await f.unlock(), create = vi.spyOn(f.repository, "create");
    f.logger.warn.mockClear();
    const original = await f.readOriginalGuestProof(cookie);
    f.advance(1_000);
    expect((await f.readOriginalGuestProof(cookie))?.expiresAtEpochMs).toBe(original?.expiresAtEpochMs);
    await f.repository.revoke(f.readSessionId(cookie)!, f.deps.now());
    expect(await f.readOriginalGuestProof(cookie)).toBeNull();
    expect(create).not.toHaveBeenCalled(); expect(f.logger.warn).not.toHaveBeenCalled();
  });

  it("refuses expiry, tampered session cookies and a foreign deployment's signing secret", async () => {
    const f = harness(), cookie = await f.unlock();
    const sessionPair = cookie.split("; ")[0], tampered = sessionPair.slice(0, -1) + (sessionPair.endsWith("A") ? "B" : "A");
    expect(f.readSessionId(tampered)).toBeNull();
    expect(await f.readOriginalGuestProof(tampered)).toBeNull();
    const foreign = harness({ secret: "foreign-deployment-secret-for-canonical-cookie-test-0123456789" });
    expect(foreign.readSessionId(cookie)).toBeNull();
    expect(await foreign.readOriginalGuestProof(cookie)).toBeNull();
    f.config.enabled = false; expect(await f.readOriginalGuestProof(cookie)).toBeNull(); f.config.enabled = true;
    f.advance(61 * 60_000); expect(await f.readOriginalGuestProof(cookie)).toBeNull();
    expect(await f.readOriginalGuestProof(undefined)).toBeNull();
  });

  it("keeps the actual boolean-only durable adapter unavailable instead of inventing a row expiry", async () => {
    const f = harness(), cookie = await f.unlock();
    const query = vi.fn(async () => true);
    const repository = new SupabasePrivateAccessSessionRepository({ ownerId: "70000000-0000-4000-8000-000000000001", query });
    const deps = { ...f.deps, repository }, resolveSession = createEarlyAccessSessionResolver(deps);
    expect(await resolveSession(cookie)).toEqual({ authenticated: true, expiresAtEpochMs: null });
    const read = createOriginalGuestProofReader(new SessionScopedEarlyAccessIdentityDirectory({ resolveSession,
      readSessionId: createEarlyAccessSessionIdReader(deps), now: deps.now, continuitySecret: f.config.sessionSecret }));
    expect(await read(cookie)).toBeNull();
    expect(query).toHaveBeenCalledWith({ fn: PRIVATE_ACCESS_SESSION_RPC.sessionActive, args: {
      p_session_hash: f.readSessionId(cookie), p_owner_id: repository.sessionOwnerId, p_access_role: PRIVATE_ACCESS_SESSION_ACCESS_ROLE } });
  });
});
