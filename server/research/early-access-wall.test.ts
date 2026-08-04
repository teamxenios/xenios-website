import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerResearchApi } from "./index";
import { registerPrivateEarlyAccessApi } from "./early-access/register";

// Private Early Access has to be reachable by someone who is NOT a research
// member. That is the whole point of the portal: an approved customer holds a
// password, not a membership.
//
// The shared research wall answers "Access required." for everything under
// /api/research that is not explicitly let through, and it runs BEFORE these
// routes. Without an exemption the password prompt is unreachable in production,
// which reads to a customer as broken rather than closed, and it would only have
// surfaced the day the feature flag was turned on.
//
// The exemption must be exact. These tests pin both halves: the Early Access
// routes get through, and nothing else does.

vi.mock("./supabase", () => ({
  supabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
    rpc: async () => ({ data: true, error: null }),
  }),
  getSupabaseAnon: () => ({}),
}));

const WALLED = "Access required.";
const saved: Record<string, string | undefined> = {};
const TOUCHED = [
  "RESEARCH_ACCESS_PASSWORD",
  "RESEARCH_SESSION_SECRET",
  "RESEARCH_PUBLIC",
  "RESEARCH_EARLY_ACCESS_ENABLED",
];

beforeEach(() => {
  for (const key of TOUCHED) saved[key] = process.env[key];
  process.env.RESEARCH_ACCESS_PASSWORD = "review-pw";
  process.env.RESEARCH_SESSION_SECRET = "test-session-secret-0123456789";
  delete process.env.RESEARCH_PUBLIC;
  // The flag stays FALSE. Reachable and closed is the correct production state.
  process.env.RESEARCH_EARLY_ACCESS_ENABLED = "false";
});

afterEach(() => {
  for (const key of TOUCHED) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function makeApp() {
  const app = express();
  app.use(express.json());
  registerResearchApi(app);
  // Registered after the research API, exactly as server/index.ts does.
  registerPrivateEarlyAccessApi(app);
  return app;
}

describe("the research wall lets Private Early Access reach its own gate", () => {
  it.each([
    ["GET", "/api/research/early-access/session"],
    ["GET", "/api/research/early-access/catalog"],
    ["POST", "/api/research/early-access/unlock"],
    ["POST", "/api/research/early-access/logout"],
  ])("%s %s is answered by its own handler, not by the wall", async (method, path) => {
    const app = makeApp();
    const res =
      method === "GET"
        ? await request(app).get(path)
        : await request(app).post(path).send({ password: "whatever" });
    expect(res.body?.message).not.toBe(WALLED);
  });

  it("but the gate is still CLOSED while the flag is false", async () => {
    const app = makeApp();
    // A correct-looking attempt gets the same refusal as any other, and no
    // session cookie comes back.
    const unlock = await request(app)
      .post("/api/research/early-access/unlock")
      .send({ password: "whatever" });
    expect(unlock.status).toBe(401);
    expect(unlock.headers["set-cookie"]).toBeUndefined();

    const session = await request(app).get("/api/research/early-access/session");
    expect(session.body).toMatchObject({ authenticated: false });

    const catalog = await request(app).get("/api/research/early-access/catalog");
    expect(catalog.status).toBe(401);
  });
});

describe("the exemption opened nothing else", () => {
  it.each([
    "/api/research/catalog",
    "/api/research/orders",
    "/api/research/products",
    "/api/research/guides",
  ])("%s is still walled", async (path) => {
    const res = await request(makeApp()).get(path);
    expect(res.status).toBe(401);
    expect(res.body?.message).toBe(WALLED);
  });

  it.each([
    ["GET", "/api/research/early-access/unlock"],
    ["GET", "/api/research/early-access/logout"],
    ["POST", "/api/research/early-access/session"],
    ["POST", "/api/research/early-access/catalog"],
  ])("%s %s is the WRONG method and stays walled", async (method, path) => {
    // Method-exact, so a write path cannot be probed with a read and the
    // exemption cannot be widened by accident.
    const app = makeApp();
    const res = method === "GET" ? await request(app).get(path) : await request(app).post(path).send({});
    expect(res.body?.message).toBe(WALLED);
  });

  it("a neighbouring path that merely looks similar is walled", async () => {
    const app = makeApp();
    for (const path of [
      "/api/research/early-access",
      "/api/research/early-access/unlock/extra",
      "/api/research/early-accessX/session",
    ]) {
      const res = await request(app).get(path);
      expect(res.body?.message).toBe(WALLED);
    }
  });
});
