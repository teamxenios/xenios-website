import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./member-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./member-auth")>();
  return {
    ...actual,
    requireActiveMember: (_req: unknown, res: any) =>
      res.status(401).json({ ok: false, message: "Sign in required." }),
  };
});

import { registerResearchApi, researchPageGate } from "./index";
import { registerMemberPlatformApi } from "./member-platform";

const KEYS = [
  "RESEARCH_PUBLIC",
  "RESEARCH_ACCESS_PASSWORD",
  "RESEARCH_SESSION_SECRET",
] as const;
const saved: Partial<Record<(typeof KEYS)[number], string>> = {};

function makeWalledApi() {
  const app = express();
  app.use(express.json());
  registerResearchApi(app);
  registerMemberPlatformApi(app);
  return app;
}

beforeEach(() => {
  for (const key of KEYS) {
    const value = process.env[key];
    if (value === undefined) delete saved[key];
    else saved[key] = value;
    delete process.env[key];
  }
  process.env.RESEARCH_SESSION_SECRET = "test-secret-for-account-access";
  process.env.RESEARCH_ACCESS_PASSWORD = "gate-password";
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("fresh-browser account-access wall", () => {
  it.each([
    ["post", "/api/research/member/forgot-password"],
    ["post", "/api/research/member/claim"],
    ["get", "/api/research/applications/status"],
    ["head", "/api/research/applications/status"],
    ["post", "/api/research/applications/resend-link"],
    ["get", "/api/research/policies"],
    ["head", "/api/research/policies"],
  ] as const)("allows only the canonical %s %s boundary", async (method, path) => {
    const call = (request(makeWalledApi()) as any)[method](path);
    const response = method === "post" ? await call.send({}) : await call;
    expect(response.body?.message).not.toBe("Access required.");
  });

  it.each([
    ["get", "/api/research/member/forgot-password"],
    ["put", "/api/research/member/forgot-password"],
    ["get", "/api/research/member/claim"],
    ["put", "/api/research/member/claim"],
    ["post", "/api/research/applications/status"],
    ["post", "/api/research/policies"],
    ["get", "/api/research/applications/resend-link"],
    ["post", "/api/research/applications"],
    ["post", "/api/research/member/claim-other"],
    ["get", "/api/research/member/profile"],
    ["get", "/api/research/catalog"],
    ["put", "/api/research/profile"],
    ["post", "/api/research/profile/sensitive"],
  ] as const)("keeps wrong-method, lookalike, and private %s %s calls walled", async (method, path) => {
    const call = (request(makeWalledApi()) as any)[method](path);
    const response = method === "get" ? await call : await call.send({});
    expect(response.status).toBe(401);
    expect(response.body?.message).toBe("Access required.");
  });

  it.each([
    ["get", "/api/research/profile"],
    ["head", "/api/research/profile"],
    ["get", "/api/research/profile/sensitive"],
    ["head", "/api/research/profile/sensitive"],
  ] as const)("lets the downstream profile guard own private headers for %s %s", async (method, path) => {
    const response = await (request(makeWalledApi()) as any)[method](path);
    expect(response.status).toBe(401);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });
});

describe("account-access document privacy", () => {
  it.each([
    "/research/reset-password",
    "/research/activate",
    "/research/apply/status",
    "/research/application/status",
    "/research/application-status",
    "/Research/Activate",
    "/research/%61pply/status",
  ])("sets private document headers for %s", async (path) => {
    const app = express();
    app.use(researchPageGate);
    app.use((_req, res) => res.send("spa"));

    const response = await request(app).get(path);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });
});
