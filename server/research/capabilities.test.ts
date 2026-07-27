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

function makeApp() {
  const app = express();
  registerMemberCapabilityApi(app, () => ({
    product_commerce: { enabled: true },
    quantum_commerce: { enabled: false },
  }));
  registerAdminCapabilityApi(app, () => new Date("2026-07-26T00:00:00.000Z"));
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
});
