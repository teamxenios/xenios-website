import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerResearchApi } from "./index";

const KEYS = ["RESEARCH_PUBLIC", "RESEARCH_ACCESS_PASSWORD", "RESEARCH_SESSION_SECRET"];
const saved: Record<string, string | undefined> = {};

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

describe("exact account-access wall bypass", () => {
  it.each([
    ["POST", "/api/research/member/claim"],
    ["POST", "/api/research/member/forgot-password"],
    ["GET", "/api/research/applications/status"],
    ["POST", "/api/research/applications/resend-link"],
  ])("%s %s reaches its downstream handler without the review cookie", async (method, path) => {
    const app = makeWalledApp();
    const response = method === "GET" ? await request(app).get(path) : await request(app).post(path).send({});
    expect(response.status).not.toBe(401);
    expect(response.body?.message).not.toBe("Access required.");
  });

  it.each([
    ["GET", "/api/research/member/claim"],
    ["PUT", "/api/research/member/claim"],
    ["GET", "/api/research/member/forgot-password"],
    ["POST", "/api/research/applications/status"],
    ["GET", "/api/research/applications/resend-link"],
    ["POST", "/api/research/applications"],
    ["POST", "/api/research/applications/resubmit"],
    ["GET", "/api/research/policies"],
    ["GET", "/api/research/member/profile"],
    ["POST", "/api/research/orders"],
    ["POST", "/api/research/member/claim-other"],
  ])("%s %s remains behind the wall", async (method, path) => {
    const app = makeWalledApp();
    const agent = request(app);
    const response =
      method === "GET"
        ? agent.get(path)
        : method === "PUT"
          ? agent.put(path).send({})
          : agent.post(path).send({});
    const result = await response;
    expect(result.status).toBe(401);
    expect(result.body?.message).toBe("Access required.");
  });
});
