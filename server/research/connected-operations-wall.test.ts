import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerResearchApi, researchPageGate } from "./index";

vi.mock("../supabase", () => ({ supabaseConfigured: () => false,
  getSupabaseAdmin: () => { throw new Error("No provider in synthetic wall check"); },
  getSupabaseAnon: () => { throw new Error("No provider in synthetic wall check"); } }));
const keys = ["RESEARCH_PUBLIC", "RESEARCH_ACCESS_PASSWORD", "RESEARCH_SESSION_SECRET"];
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const key of keys) saved[key] = process.env[key];
  process.env.RESEARCH_PUBLIC = "false"; process.env.RESEARCH_ACCESS_PASSWORD = "synthetic-reviewer-password";
  process.env.RESEARCH_SESSION_SECRET = "synthetic-separate-secret-000000000000";
});
afterEach(() => { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
function api() {
  const app = express(); registerResearchApi(app);
  // This marker models the separately tested private handler. Getting through
  // the legacy wall must reach a refusal, never a role grant or customer data.
  app.use("/api/research/account-executive", (_req, res) => {
    res.set("X-Downstream-Guard", "ae").status(403).json({ ok: false, code: "access_denied" });
  });
  return app;
}
describe("connected AE exact method/path admission through the real legacy wall", () => {
  it.each([
    ["get", "/context"], ["head", "/context"], ["get", "/workspace"], ["head", "/workspace"],
    ["post", "/commands"], ["post", "/assignments"], ["post", "/identity-claims"],
  ] as const)("admits only %s %s to its independent private boundary", async (method, path) => {
    const response = await request(api())[method]("/api/research/account-executive" + path);
    expect(response.status).toBe(403); expect(response.headers["x-downstream-guard"]).toBe("ae");
  });
  it.each([
    ["post", "/context"], ["post", "/workspace"], ["get", "/commands"], ["get", "/assignments"],
    ["get", "/identity-claims"], ["get", "/workspace/extra"], ["get", "/context/extra"],
    ["post", "/commands/extra"], ["delete", "/commands"], ["patch", "/assignments"], ["options", "/workspace"],
  ] as const)("keeps %s %s behind the legacy wall", async (method, path) => {
    const response = await request(api())[method]("/api/research/account-executive" + path);
    expect(response.status).not.toBe(200); expect(response.headers["x-downstream-guard"]).toBeUndefined();
  });
  it("opens only the exact private AE document without requiring the unrelated review secret", async () => {
    delete process.env.RESEARCH_ACCESS_PASSWORD; delete process.env.RESEARCH_SESSION_SECRET;
    const app = express(); app.use(researchPageGate);
    app.get("/research/account-executive", (_req, res) => res.send("private staff shell; no authority"));
    app.use((_req, res) => res.status(404).end());
    const response = await request(app).get("/research/account-executive");
    expect(response.status).toBe(200); expect(response.headers["x-robots-tag"]).toContain("noindex");
    expect(response.headers["cache-control"]).toContain("no-store");
    expect((await request(app).post("/research/account-executive")).status).not.toBe(200);
    expect((await request(app).get("/research/account-executive/extra")).status).not.toBe(200);
  });
});
