import { describe, expect, it, beforeAll, afterAll } from "vitest";

import { registerPrivateEarlyAccessApi } from "./register";
import type { EarlyAccessConfig } from "./private-access-config";
import { SupabasePrivateAccessSessionRepository } from "./private-access-session-repository";

// RESTART SURVIVAL, end to end, against a REAL PostgreSQL running the REAL
// migration through the REAL Supabase adapter.
//
// Every other test in this directory uses a fake store, so none of them can
// answer the only question that matters for a durable session: if the process
// that issued the cookie disappears, does the cookie still work? Here the first
// app instance is destroyed entirely (pool closed, references dropped) and a
// second, independently constructed instance is handed the same cookie.
//
// Opt in with a database URL; skipped otherwise so CI stays green without one:
//   XENIOS_TEST_PG_URL=postgres://postgres:xf5@localhost:55432/xf5 npx vitest run ...

const PG_URL = process.env.XENIOS_TEST_PG_URL;
const OWNER = "00000000-0000-4000-8000-000000000001";
const PASSWORD = "restart-survival-password";
const run = PG_URL ? describe : describe.skip;

function scryptHash(password: string): string {
  const { randomBytes, scryptSync } = require("node:crypto");
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  return ["scrypt", 32768, 8, 1, salt.toString("base64url"), digest.toString("base64url")].join("$");
}

const PASSWORD_HASH = scryptHash(PASSWORD);

function config(): EarlyAccessConfig {
  return Object.freeze({
    enabled: true,
    passwordHash: PASSWORD_HASH,
    sessionSecret: "s".repeat(64),
    sessionTtlMinutes: 240,
    maxAttempts: 8,
    lockoutMinutes: 15,
    cookieName: "xenios_early_access",
    problems: Object.freeze([]),
  }) as unknown as EarlyAccessConfig;
}

/** One app instance: its own pool, its own repository, its own routes. */
async function bootInstance() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: PG_URL, max: 4 });
  const repository = new SupabasePrivateAccessSessionRepository({
    ownerId: OWNER,
    // The executor the integration lane supplies in production is
    // client.rpc(fn, args); here it is the same call over plain SQL. Named
    // notation keeps it order-independent, and the keys come from the adapter's
    // own constants, never from a request.
    query: async ({ fn, args }) => {
      for (const key of Object.keys(args)) {
        if (!/^p_[a-z_]+$/.test(key)) throw new Error(`unexpected argument ${key}`);
      }
      const names = Object.keys(args);
      const placeholders = names.map((n, i) => `${n} => $${i + 1}`).join(", ");
      const values = names.map((n) => args[n]);
      const result = await pool.query(`select public.${fn}(${placeholders}) as value`, values);
      return result.rows[0]?.value ?? null;
    },
  });
  const routes = new Map<string, Function>();
  const app = {
    post: (p: string, h: Function) => routes.set(`POST ${p}`, h),
    get: (p: string, h: Function) => routes.set(`GET ${p}`, h),
  } as any;
  registerPrivateEarlyAccessApi(app, { config: config(), repository });
  return { routes, shutdown: () => pool.end() };
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
  for (let i = 0; i < 20 && state.status === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return state;
}

run("a durable session survives the process that issued it", () => {
  let cookieName = "";
  let cookieValue = "";

  it("instance A: a correct password mints a session in PostgreSQL", async () => {
    const a = await bootInstance();
    const unlocked = await call(a.routes, "POST /api/research/early-access/unlock", {
      body: { password: PASSWORD }, ip: "203.0.113.20",
    });
    expect(unlocked.status).toBe(200);
    const setCookie = unlocked.headers["set-cookie"];
    const pair = setCookie.slice(0, setCookie.indexOf(";"));
    cookieName = pair.slice(0, pair.indexOf("="));
    cookieValue = pair.slice(pair.indexOf("=") + 1);
    expect(cookieName).toMatch(/^__Host-/);

    // THE RESTART: instance A ceases to exist.
    await a.shutdown();
  });

  it("instance B: a brand-new process accepts the cookie A issued", async () => {
    const b = await bootInstance();
    const session = await call(b.routes, "GET /api/research/early-access/session", {
      headers: { cookie: `${cookieName}=${cookieValue}` },
    });
    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({ authenticated: true });
    await b.shutdown();
  });

  it("instance C: after logout, no later process will accept it again", async () => {
    const c = await bootInstance();
    const out = await call(c.routes, "POST /api/research/early-access/logout", {
      headers: { cookie: `${cookieName}=${cookieValue}` },
    });
    expect(out.status).toBe(200);
    await c.shutdown();

    const d = await bootInstance();
    const session = await call(d.routes, "GET /api/research/early-access/session", {
      headers: { cookie: `${cookieName}=${cookieValue}` },
    });
    expect(session.body).toMatchObject({ authenticated: false });
    await d.shutdown();
  });

  it("a forged cookie is refused by a fresh process", async () => {
    const e = await bootInstance();
    const session = await call(e.routes, "GET /api/research/early-access/session", {
      headers: { cookie: `${cookieName}=xpa-cookie-v1.primary.${"A".repeat(43)}.1785858693.1785873093.${"B".repeat(43)}` },
    });
    expect(session.body).toMatchObject({ authenticated: false });
    await e.shutdown();
  });
});
