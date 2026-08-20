import { describe, expect, it } from "vitest";

import { registerPrivateEarlyAccessApi } from "./register";
import type { EarlyAccessConfig } from "./private-access-config";
import { hashPrivateAccessSessionToken } from "./private-access-session-repository";

// Proves the MOUNTED unlock route mints through the grant-nonce exchange when a
// durable store is configured, and that the cookie it hands back resolves.
//
// This is the integration these modules were built for. Unit tests proved the
// exchange in isolation; nothing until now proved the ROUTE uses it, or that the
// hash unlock writes is the hash the session route later looks up.

const PASSWORD = "durable-route-password";
const OWNER = "00000000-0000-4000-8000-000000000001";

function scryptHash(password: string): string {
  const { randomBytes, scryptSync } = require("node:crypto");
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  return ["scrypt", 32768, 8, 1, salt.toString("base64url"), digest.toString("base64url")].join("$");
}

function config(): EarlyAccessConfig {
  return Object.freeze({
    enabled: true,
    passwordHash: scryptHash(PASSWORD),
    sessionSecret: "s".repeat(64),
    sessionTtlMinutes: 240,
    maxAttempts: 8,
    lockoutMinutes: 15,
    cookieName: "xenios_early_access",
    problems: Object.freeze([]),
  }) as unknown as EarlyAccessConfig;
}

/** Enforces the SQL's invariants: a grant must exist and is consumed once. */
function durableStore(options: { refuseGrant?: boolean } = {}) {
  const grants = new Map<string, boolean>();
  const rows = new Map<string, number>();
  return {
    grants,
    rows,
    repository: {
      async issueNonce(nonceHash: string) {
        if (options.refuseGrant) return { ok: false as const, code: "RPC_FAILED" };
        grants.set(nonceHash, false);
        return { ok: true as const, value: 1 };
      },
      async create(input: any) {
        if (typeof input.nonceHash !== "string") return { ok: false as const, code: "NONCE_REQUIRED" };
        if (grants.get(input.nonceHash) !== false) return { ok: false as const, code: "NONCE_REQUIRED" };
        grants.set(input.nonceHash, true);
        rows.set(input.sessionHash, input.expiresAt);
        return { ok: true as const, value: { sessionHash: input.sessionHash, expiresAtEpochMs: input.expiresAt } };
      },
      async resolve(sessionHash: string) {
        const expiresAtEpochMs = rows.get(sessionHash);
        return expiresAtEpochMs === undefined
          ? { ok: false as const, code: "NOT_FOUND" }
          : { ok: true as const, value: { sessionHash, ownerId: OWNER, expiresAtEpochMs } };
      },
      async touch() { return { ok: true as const, value: undefined }; },
      async revoke(sessionHash: string) { rows.delete(sessionHash); return { ok: true as const, value: undefined }; },
      async pruneExpired() { return { ok: true as const, value: 0 }; },
    } as any,
  };
}

/** Captures what the route registered, without running Express. */
function fakeApp() {
  const routes = new Map<string, Function>();
  return {
    app: { post: (p: string, h: Function) => routes.set(`POST ${p}`, h), get: (p: string, h: Function) => routes.set(`GET ${p}`, h) } as any,
    routes,
  };
}

function fakeResponse() {
  const headers: Record<string, string> = {};
  const state: any = { status: 0, body: null, headers };
  return {
    state,
    res: {
      setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = String(v); },
      status(code: number) { state.status = code; return this; },
      json(body: unknown) { state.body = body; return this; },
      end() { return this; },
    } as any,
  };
}

async function call(routes: Map<string, Function>, key: string, req: any) {
  const { res, state } = fakeResponse();
  await (routes.get(key) as any)(req, res);
  // The handler is fire-and-forget inside the wrapper; let its promise settle.
  await new Promise((resolve) => setImmediate(resolve));
  return state;
}

/**
 * A durable store scoped to a NON-default owner, which is what every real
 * deployment is, and which refuses an owner mismatch exactly as the SQL does.
 */
function ownerScopedStore(ownerId: string) {
  const grants = new Map<string, boolean>();
  const rows = new Map<string, number>();
  const seenOwners: string[] = [];
  return {
    grants,
    rows,
    seenOwners,
    repository: {
      sessionOwnerId: ownerId,
      async issueNonce(nonceHash: string) {
        grants.set(nonceHash, false);
        return { ok: true as const, value: 1 };
      },
      async create(input: any) {
        seenOwners.push(input.ownerId);
        // The exchange RPC refuses an owner mismatch, and the route maps that
        // refusal to the same generic denial as a wrong password.
        if (input.ownerId !== ownerId) return { ok: false as const, code: "NOT_FOUND" };
        if (grants.get(input.nonceHash) !== false) return { ok: false as const, code: "NONCE_REQUIRED" };
        grants.set(input.nonceHash, true);
        rows.set(input.sessionHash, input.expiresAt);
        return { ok: true as const, value: { sessionHash: input.sessionHash, expiresAtEpochMs: input.expiresAt } };
      },
      async resolve(sessionHash: string) {
        const expiresAtEpochMs = rows.get(sessionHash);
        return expiresAtEpochMs === undefined
          ? { ok: false as const, code: "NOT_FOUND" }
          : { ok: true as const, value: { sessionHash, ownerId, expiresAtEpochMs } };
      },
      async touch() { return { ok: true as const, value: undefined }; },
      async revoke() { return { ok: true as const, value: undefined }; },
      async pruneExpired() { return { ok: true as const, value: 0 }; },
    } as any,
  };
}

describe("the unlock route and its repository agree about the owner", () => {
  // The failure this pins was silent and total: the repository issued grants
  // under RESEARCH_EARLY_ACCESS_OWNER_ID while the route exchanged them under a
  // hard-coded default, so every deployment whose owner id was not exactly that
  // default answered the CORRECT password with the same denial as a wrong one.
  // The only configuration that happened to work was the hard-coded default.
  const NON_DEFAULT_OWNER = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

  it("unlocks under the owner the repository writes under, not a default", async () => {
    const store = ownerScopedStore(NON_DEFAULT_OWNER);
    const { app, routes } = fakeApp();
    registerPrivateEarlyAccessApi(app, { config: config(), repository: store.repository });

    const unlocked = await call(routes, "POST /api/research/early-access/unlock", {
      body: { password: PASSWORD }, ip: "203.0.113.10",
    });

    expect(unlocked.status).toBe(200);
    expect(store.seenOwners).toEqual([NON_DEFAULT_OWNER]);
    expect(store.seenOwners).not.toContain(OWNER);
    expect(store.rows.size).toBe(1);
  });

  it("still issues a cookie that resolves, under that same owner", async () => {
    const store = ownerScopedStore(NON_DEFAULT_OWNER);
    const { app, routes } = fakeApp();
    registerPrivateEarlyAccessApi(app, { config: config(), repository: store.repository });

    const unlocked = await call(routes, "POST /api/research/early-access/unlock", {
      body: { password: PASSWORD }, ip: "203.0.113.11",
    });
    const setCookie = unlocked.headers["set-cookie"] as string;
    const firstPair = setCookie.slice(0, setCookie.indexOf(";"));
    const cookieName = firstPair.slice(0, firstPair.indexOf("="));
    const cookieValue = firstPair.slice(firstPair.indexOf("=") + 1);

    const session = await call(routes, "GET /api/research/early-access/session", {
      headers: { cookie: `${cookieName}=${cookieValue}` },
    });
    expect(session.body).toMatchObject({ authenticated: true });
  });
});

describe("the mounted unlock route on a durable store", () => {
  it("mints through the grant exchange, and the cookie it issues RESOLVES", async () => {
    const store = durableStore();
    const { app, routes } = fakeApp();
    registerPrivateEarlyAccessApi(app, { config: config(), repository: store.repository });

    const unlocked = await call(routes, "POST /api/research/early-access/unlock", {
      body: { password: PASSWORD }, ip: "203.0.113.9",
    });
    expect(unlocked.status).toBe(200);

    // A grant was registered AND consumed: the exchange really ran.
    expect(store.grants.size).toBe(1);
    expect([...store.grants.values()]).toEqual([true]);
    expect(store.rows.size).toBe(1);

    // The row is keyed by a hash, and the raw cookie value is not that key.
    const setCookie = unlocked.headers["set-cookie"];
    expect(typeof setCookie).toBe("string");
    // Take the name from the header itself. The real cookie is __Host- prefixed,
    // which is not the configured display name, and hardcoding either would test
    // the test rather than the route.
    const firstPair = setCookie.slice(0, setCookie.indexOf(";"));
    const cookieName = firstPair.slice(0, firstPair.indexOf("="));
    const cookieValue = firstPair.slice(firstPair.indexOf("=") + 1);
    expect(cookieName).toMatch(/^__Host-/);
    expect([...store.rows.keys()]).not.toContain(cookieValue);
    expect(hashPrivateAccessSessionToken(cookieValue)).not.toBe([...store.rows.keys()][0]);

    // THE DRIFT CHECK: the session route must find the row unlock wrote.
    const session = await call(routes, "GET /api/research/early-access/session", {
      headers: { cookie: `${cookieName}=${cookieValue}` },
    });
    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({ authenticated: true });
  });

  it("fails closed with a CORRECT password when the grant cannot be registered", async () => {
    const store = durableStore({ refuseGrant: true });
    const { app, routes } = fakeApp();
    registerPrivateEarlyAccessApi(app, { config: config(), repository: store.repository });

    const unlocked = await call(routes, "POST /api/research/early-access/unlock", {
      body: { password: PASSWORD }, ip: "203.0.113.10",
    });
    expect(unlocked.status).toBe(401);
    expect(unlocked.headers["set-cookie"]).toBeUndefined();
    expect(store.rows.size).toBe(0);
  });

  it("still refuses a WRONG password on the durable path", async () => {
    const store = durableStore();
    const { app, routes } = fakeApp();
    registerPrivateEarlyAccessApi(app, { config: config(), repository: store.repository });
    const unlocked = await call(routes, "POST /api/research/early-access/unlock", {
      body: { password: "not-the-password" }, ip: "203.0.113.11",
    });
    expect(unlocked.status).toBe(401);
    expect(store.grants.size).toBe(0);
    expect(store.rows.size).toBe(0);
  });
});
