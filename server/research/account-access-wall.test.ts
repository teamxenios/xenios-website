import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The /api/research review-cookie wall must let the ACCOUNT ACCESS lanes
// through from a fresh browser (founder decision 2026-07-19, extended by the
// 2026-07-30 directive's 9.1/9.2 rule): forgot-password, the one-time claim,
// the token-scoped application-status read, and the rate-limited resend.
// Everything else without a credential keeps the wall's 401.
//
// Only registerResearchApi is mounted here, deliberately: an allowlisted path
// with no downstream handler falls through to Express's 404, which proves the
// WALL let it pass; a walled path answers the wall's own 401 "Access
// required." before any handler could exist.

const KEYS = ["RESEARCH_PUBLIC", "RESEARCH_ACCESS_PASSWORD", "RESEARCH_SESSION_SECRET"];
const saved: Record<string, string | undefined> = {};

import { registerResearchApi } from "./index";

function makeWalledApp() {
  const app = express();
  app.use(express.json());
  registerResearchApi(app);
  return app;
}

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";
  process.env.RESEARCH_ACCESS_PASSWORD = "gate-password";
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("account-access wall bypass (fresh browser, no review cookie, no bearer)", () => {
  it.each([
    ["POST", "/api/research/member/claim"],
    ["POST", "/api/research/member/forgot-password"],
    ["GET", "/api/research/applications/status"],
    ["POST", "/api/research/applications/resend-link"],
  ])("%s %s passes the wall (falls through to the router, never the wall's 401)", async (method, path) => {
    const app = makeWalledApp();
    const res = method === "GET" ? await request(app).get(path) : await request(app).post(path).send({});
    // No downstream handler is mounted in this app, so a pass-through lands
    // on Express's 404. The wall's rejection is a 401 with this exact body.
    expect(res.status).not.toBe(401);
    expect(res.body?.message).not.toBe("Access required.");
  });

  it("every other credential-less call still hits the wall", async () => {
    const app = makeWalledApp();
    for (const [method, path] of [
      ["GET", "/api/research/member/profile"],
      ["POST", "/api/research/orders"],
      ["GET", "/api/research/applications"],
      ["POST", "/api/research/member/claim-other"],
    ] as const) {
      const res = method === "GET" ? await request(app).get(path) : await request(app).post(path).send({});
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.body?.message, `${method} ${path}`).toBe("Access required.");
    }
  });
});
