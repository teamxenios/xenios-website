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

// The Early Access admin routes sit behind this guard, which is registered on
// the same app. Standing it in keeps this file about the WALL rather than about
// Supabase, and lets the admin paths be probed for the property that matters
// here: they are not under /api/research, so the wall never answers for them.
vi.mock("../routes", () => ({
  requireSupabaseAdmin(
    _req: unknown,
    res: { status(code: number): { json(body: unknown): unknown } },
  ) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
  },
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

/** A well-formed order number, in the generated alphabet. */
const ORDER_NUMBER = "XEA-7F3K9QW2TM4BXYZ1";

describe("the research wall lets Private Early Access reach its own gate", () => {
  it.each([
    ["GET", "/api/research/early-access/session"],
    ["GET", "/api/research/early-access/catalog"],
    ["POST", "/api/research/early-access/unlock"],
    ["POST", "/api/research/early-access/logout"],
    // The commerce routes. Each one owns a STRONGER gate than this wall: the
    // durable session, then the resolved customer, then ownership of the exact
    // order. Getting past the wall reaches a refusal, never an order.
    ["POST", "/api/research/early-access/orders"],
    // The verification doors: session-gated, and redemption is additionally
    // bound to the token minted for the presenting session.
    ["POST", "/api/research/early-access/verification/request"],
    ["POST", "/api/research/early-access/verify"],
    ["GET", `/api/research/early-access/orders/${ORDER_NUMBER}`],
    ["GET", `/api/research/early-access/orders/${ORDER_NUMBER}/invoice`],
    ["POST", `/api/research/early-access/orders/${ORDER_NUMBER}/payment-proof`],
  ])("%s %s is answered by its own handler, not by the wall", async (method, path) => {
    const app = makeApp();
    const res =
      method === "GET"
        ? await request(app).get(path)
        : await request(app).post(path).send({ password: "whatever" });
    expect(res.body?.message).not.toBe(WALLED);
  });

  it("and the commerce routes refuse on their OWN terms, not the wall's", async () => {
    const app = makeApp();
    // The flag is false, so the Early Access session can never be live and every
    // one of these answers SESSION_REQUIRED from its own handler.
    for (const [method, path] of [
      ["POST", "/api/research/early-access/orders"],
      ["POST", "/api/research/early-access/verification/request"],
      ["POST", "/api/research/early-access/verify"],
      ["GET", `/api/research/early-access/orders/${ORDER_NUMBER}`],
      ["GET", `/api/research/early-access/orders/${ORDER_NUMBER}/invoice`],
      ["POST", `/api/research/early-access/orders/${ORDER_NUMBER}/payment-proof`],
    ] as const) {
      const res =
        method === "GET" ? await request(app).get(path) : await request(app).post(path).send({});
      expect(res.status).toBe(401);
      expect(res.body?.code).toBe("SESSION_REQUIRED");
    }
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
    // The order paths are method-exact too: the collection is write-only, the
    // detail and the invoice are read-only, and the proof path is write-only.
    ["GET", "/api/research/early-access/orders"],
    ["POST", `/api/research/early-access/orders/${ORDER_NUMBER}`],
    ["POST", `/api/research/early-access/orders/${ORDER_NUMBER}/invoice`],
    ["GET", `/api/research/early-access/orders/${ORDER_NUMBER}/payment-proof`],
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

  it("an order path that is not an order NUMBER is walled", async () => {
    // The exemption is anchored on the generated shape, not on the prefix, so
    // the order namespace cannot be used as a door into anything else. I, L, O
    // and U are outside the alphabet; so are lowercase, the wrong length, a
    // traversal segment, and an extra leaf.
    const app = makeApp();
    for (const path of [
      "/api/research/early-access/orders/1",
      "/api/research/early-access/orders/XEA-7F3K9QW2TM4BXYZ",
      "/api/research/early-access/orders/XEA-7F3K9QW2TM4BXYZ12",
      "/api/research/early-access/orders/XEA-7f3k9qw2tm4bxyz1",
      "/api/research/early-access/orders/XEA-IIIIIIIIIIIIIIII",
      "/api/research/early-access/ordersX/XEA-7F3K9QW2TM4BXYZ1",
      `/api/research/early-access/orders/${ORDER_NUMBER}/invoice/extra`,
      `/api/research/early-access/orders/${ORDER_NUMBER}/refund`,
    ]) {
      const res = await request(app).get(path);
      expect(res.body?.message).toBe(WALLED);
    }
  });

  it("a lookalike order write path is walled", async () => {
    const app = makeApp();
    for (const path of [
      `/api/research/early-access/orders/${ORDER_NUMBER}/payment-proofs`,
      `/api/research/early-access/orders/${ORDER_NUMBER}/payment-proof/extra`,
      "/api/research/early-access/orders/XEA-lowercase00000/payment-proof",
      "/api/research/early-access/orders//payment-proof",
    ]) {
      const res = await request(app).post(path).send({});
      expect(res.body?.message).toBe(WALLED);
    }
  });
});

describe("the operator routes are not the wall's business", () => {
  it.each([
    ["GET", "/api/admin/research/payments"],
    ["POST", `/api/admin/research/payments/${ORDER_NUMBER}/confirm`],
    ["GET", `/api/admin/research/supplier-orders/${ORDER_NUMBER}`],
    ["POST", `/api/admin/research/supplier-orders/${ORDER_NUMBER}/tracking`],
  ])("%s %s is answered by the admin guard, never by the research wall", async (method, path) => {
    // They live outside /api/research on purpose, so the shared review-password
    // wall never runs for them and the Supabase admin guard is the only gate.
    const app = makeApp();
    const res =
      method === "GET" ? await request(app).get(path) : await request(app).post(path).send({});
    expect(res.status).toBe(401);
    expect(res.body?.message).toBe("Unauthorized");
    expect(res.body?.message).not.toBe(WALLED);
  });
});
