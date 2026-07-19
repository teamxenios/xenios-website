import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Canonical access architecture:
// - the shared password unlocks the gateway + application flows (cookie wall)
// - the catalog and orders are MEMBER content: the shared password does NOT
//   unlock them; they require the member's own verified JWT
// - an authenticated member bypasses the shared password on exactly the
//   member-authed endpoints; every other endpoint keeps the cookie wall
// - policies stay readable behind the shared password (gateway footer links)

const state = vi.hoisted(() => ({
  members: [] as any[],
  goodToken: "good-member-token",
}));

vi.mock("../supabase", () => ({
  supabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const rows = table === "research_members" ? state.members : [];
      const filters: Array<[string, any]> = [];
      const api: any = {
        select: () => api,
        eq: (c: string, v: any) => {
          filters.push([c, v]);
          return api;
        },
        maybeSingle: async () => ({
          data: rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null,
          error: null,
        }),
      };
      return api;
    },
    rpc: async () => ({ data: true, error: null }),
  }),
  getSupabaseAnon: () => ({
    auth: {
      getUser: async (jwt: string) =>
        jwt === state.goodToken
          ? { data: { user: { email: "member@example.com" } }, error: null }
          : { data: { user: null }, error: { message: "bad token" } },
    },
  }),
}));

import { registerResearchApi } from "./index";

const ENV_KEYS = ["RESEARCH_ACCESS_PASSWORD", "RESEARCH_SESSION_SECRET", "RESEARCH_PUBLIC"];
const saved: Record<string, string | undefined> = {};

function makeApp() {
  const app = express();
  app.use(express.json());
  registerResearchApi(app);
  return app;
}

async function passwordCookie(app: express.Express): Promise<string> {
  const res = await request(app).post("/api/research/access").send({ password: "review-pw" });
  expect(res.status).toBe(200);
  return (res.headers["set-cookie"]?.[0] ?? "").split(";")[0];
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.RESEARCH_ACCESS_PASSWORD = "review-pw";
  process.env.RESEARCH_SESSION_SECRET = "test-secret";
  state.members.length = 0;
  state.members.push({ id: "mem-1", email: "member@example.com", status: "active", first_name: "Avery", application_id: "app-1" });
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("the shared password does not unlock member content", () => {
  it("catalog with the password cookie but no member token is refused", async () => {
    const app = makeApp();
    const cookie = await passwordCookie(app);
    const res = await request(app).get("/api/research/catalog").set("Cookie", cookie);
    expect(res.status).toBe(401);
  });

  it("policies stay readable behind the shared password (gateway footer)", async () => {
    const app = makeApp();
    const cookie = await passwordCookie(app);
    const res = await request(app).get("/api/research/policies").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.policies).toBeTruthy();
  });
});

describe("an authenticated member bypasses the shared password on member endpoints only", () => {
  it("catalog with a valid member token and NO cookie is served", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/research/catalog").set("Authorization", `Bearer ${state.goodToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
  });

  it("catalog with a junk bearer token is refused (the bypass still verifies)", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/research/catalog").set("Authorization", "Bearer junk");
    expect(res.status).toBe(401);
  });

  it("a closed membership is refused even with a valid token", async () => {
    state.members[0].status = "closed";
    const app = makeApp();
    const res = await request(app).get("/api/research/catalog").set("Authorization", `Bearer ${state.goodToken}`);
    expect(res.status).toBe(403);
  });

  it("a bearer token does NOT bypass the wall on non-member endpoints", async () => {
    const app = makeApp();
    // policies is cookie-walled; a bearer alone must not open it
    const res = await request(app).get("/api/research/policies").set("Authorization", `Bearer ${state.goodToken}`);
    expect(res.status).toBe(401);
  });
});
