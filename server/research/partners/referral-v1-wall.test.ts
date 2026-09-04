import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerResearchApi, researchPageGate } from "../index";

beforeEach(() => {
  vi.stubEnv("RESEARCH_PUBLIC", "false");
  vi.stubEnv("RESEARCH_ACCESS_PASSWORD", "synthetic-review-password");
  vi.stubEnv("RESEARCH_SESSION_SECRET", "synthetic-review-session-secret");
});
afterEach(() => vi.unstubAllEnvs());

function wall() {
  const app = express();
  app.use(express.json());
  registerResearchApi(app);
  // A sentinel proves ONLY admission to the existing downstream authority,
  // never authentication or successful referral creation.
  app.use((_req, res) => res.status(418).json({ downstream: true }));
  return app;
}

describe("referral seams in the real Research review wall", () => {
  it.each(["resolve", "bootstrap", "capture"])("admits only public POST %s to downstream authority", async (action) => {
    const app = wall();
    const path = `/api/research/referral/${action}`;
    expect((await request(app).post(path).send({})).status).toBe(418);
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).post(`${path}/extra`).send({})).status).toBe(401);
  });
  it.each([
    ["get", "/api/research/partner/links"],
    ["post", "/api/research/partner/links"],
    ["post", "/api/research/partner/links/10000000-0000-4000-8000-000000000001/revoke"],
    ["post", "/api/research/referral/bind"],
  ] as const)("%s %s still requires a bearer before reaching its canonical guard", async (method, path) => {
    const app = wall();
    expect((await request(app)[method](path).send({})).status).toBe(401);
    expect((await request(app)[method](path).set("Authorization", "Bearer synthetic-not-authenticated").send({})).status).toBe(418);
  });
  it("does not exempt arbitrary revoke identifiers or nested referral actions", async () => {
    const app = wall();
    for (const path of ["/api/research/partner/links/not-a-uuid/revoke", "/api/research/referral/bind/extra", "/api/research/referral/admin"]) {
      expect((await request(app).post(path).set("Authorization", "Bearer synthetic-not-authenticated").send({})).status).toBe(401);
    }
  });
  it("keeps the global unconfigured deployment fail-closed", async () => {
    vi.stubEnv("RESEARCH_ACCESS_PASSWORD", "");
    expect((await request(wall()).post("/api/research/referral/resolve").send({})).status).toBe(503);
  });
  it.each(["/r/synthetic", "/R/synthetic", "/%72/synthetic", "/r", "/r/bad%ZZ"])("protects referral document %s even if Research is unconfigured", async (path) => {
    vi.stubEnv("RESEARCH_ACCESS_PASSWORD", "");
    const app = express(); app.use(researchPageGate); app.use((_req, res) => res.send("synthetic shell"));
    const response = await request(app).get(path);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });
  it("does not change marketing homepage document policy", async () => {
    const app = express(); app.use(researchPageGate); app.use((_req, res) => res.send("synthetic shell"));
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.headers["x-robots-tag"]).toBeUndefined();
    expect(response.headers["referrer-policy"]).toBeUndefined();
  });
});
