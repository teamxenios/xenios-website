import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const guardState = vi.hoisted(() => ({
  allowMember: false,
  allowAdmin: false,
}));

vi.mock("./member-auth", () => ({
  requireActiveMember: (_req: unknown, res: any, next: () => void) => {
    if (guardState.allowMember) next();
    else res.status(401).json({ ok: false, message: "Access required." });
  },
}));

vi.mock("../routes", () => ({
  requireSupabaseAdmin: (_req: unknown, res: any, next: () => void) => {
    if (guardState.allowAdmin) next();
    else res.status(401).json({ ok: false, message: "Access required." });
  },
}));

vi.mock("./agreements", () => ({
  healthAssessmentCollectionReady: () => false,
}));

import {
  registerAdminCapabilityApi,
  registerMemberCapabilityApi,
} from "./capabilities";
import { registerResearchApi } from "./index";

function makeApp() {
  const app = express();
  registerMemberCapabilityApi(app, () => ({
    product_commerce: { enabled: true },
    quantum_commerce: { enabled: false },
  }));
  registerAdminCapabilityApi(app, () => new Date("2026-07-26T00:00:00.000Z"));
  return app;
}

function makeProductionOrderApp() {
  const app = express();
  app.use(express.json());
  registerResearchApi(app);
  registerMemberCapabilityApi(app, () => ({
    product_commerce: { enabled: true },
    quantum_commerce: { enabled: false },
  }));
  return app;
}

function expectPrivateHeaders(headers: Record<string, string | string[] | undefined>) {
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers.pragma).toBe("no-cache");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
}

describe("canonical capabilities routes", () => {
  it("merges member-platform and commerce capability keys in one member payload", async () => {
    guardState.allowMember = true;
    guardState.allowAdmin = false;

    const res = await request(makeApp()).get("/api/research/capabilities");

    expect(res.status).toBe(200);
    expect(res.body.capabilities).toMatchObject({
      identity_verification: { enabled: false },
      assessment: { enabled: false },
      product_commerce: { enabled: true },
      quantum_commerce: { enabled: false },
    });
    expectPrivateHeaders(res.headers);
  });

  it("sets private headers before a signed-out member denial", async () => {
    guardState.allowMember = false;

    const res = await request(makeApp()).get("/api/research/capabilities");

    expect(res.status).toBe(401);
    expectPrivateHeaders(res.headers);
  });

  it("sets private headers before a signed-out admin denial", async () => {
    guardState.allowAdmin = false;

    const res = await request(makeApp()).get("/api/admin/research/capabilities");

    expect(res.status).toBe(401);
    expectPrivateHeaders(res.headers);
  });

  it("is not shadowed by the earlier shared-password gateway in production order", async () => {
    const priorPassword = process.env.RESEARCH_ACCESS_PASSWORD;
    const priorSecret = process.env.RESEARCH_SESSION_SECRET;
    const priorPublic = process.env.RESEARCH_PUBLIC;
    process.env.RESEARCH_ACCESS_PASSWORD = "review-password";
    process.env.RESEARCH_SESSION_SECRET = "review-secret";
    delete process.env.RESEARCH_PUBLIC;

    try {
      guardState.allowMember = false;
      const signedOut = await request(makeProductionOrderApp()).get(
        "/api/research/capabilities",
      );
      expect(signedOut.status).toBe(401);
      expect(signedOut.body).toMatchObject({ ok: false, message: "Access required." });
      expectPrivateHeaders(signedOut.headers);

      guardState.allowMember = true;
      const activeMember = await request(makeProductionOrderApp())
        .get("/api/research/capabilities")
        .set("Authorization", "Bearer member-token");
      expect(activeMember.status).toBe(200);
      expect(activeMember.body.capabilities).toMatchObject({
        identity_verification: { enabled: false },
        product_commerce: { enabled: true },
      });
      expectPrivateHeaders(activeMember.headers);
    } finally {
      if (priorPassword === undefined) delete process.env.RESEARCH_ACCESS_PASSWORD;
      else process.env.RESEARCH_ACCESS_PASSWORD = priorPassword;
      if (priorSecret === undefined) delete process.env.RESEARCH_SESSION_SECRET;
      else process.env.RESEARCH_SESSION_SECRET = priorSecret;
      if (priorPublic === undefined) delete process.env.RESEARCH_PUBLIC;
      else process.env.RESEARCH_PUBLIC = priorPublic;
    }
  });
});
