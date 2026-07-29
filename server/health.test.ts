import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { buildHealthPayload, healthHandler } from "./routes";
import { requestId } from "./request-logging";

// /api/health is liveness plus config PRESENCE booleans. These tests pin:
// the backward-compatible status field and 200, the exact payload shape,
// booleans-only (no env VALUES ever leak into the body), the requestId echo,
// and fast execution (no network: the handler only reads process.env).
//
// The handler is exercised directly (exported from server/routes.ts) rather
// than through registerRoutes, which needs a live http.Server and seeds the
// waitlist counter.

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_API_KEY",
  "ADMIN_EMAIL",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function buildApp(withRequestId = false) {
  const app = express();
  if (withRequestId) app.use(requestId());
  app.get("/api/health", healthHandler);
  return app;
}

describe("GET /api/health", () => {
  it("stays a fast 200 liveness check with the original status field", async () => {
    const started = Date.now();
    const res = await request(buildApp()).get("/api/health");
    expect(Date.now() - started).toBeLessThan(2000); // no network probes
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.status).toBe("Xenios API is running");
  });

  it("returns exactly the expected shape, with booleans only in config", async () => {
    const res = await request(buildApp()).get("/api/health");
    expect(Object.keys(res.body).sort()).toEqual(
      ["config", "status", "timestamp", "uptimeSeconds"], // no requestId without the middleware
    );
    expect(Object.keys(res.body.config).sort()).toEqual([
      "adminConfigured",
      "commerceEnabled",
      "supabaseConfigured",
      "turnstileConfigured",
    ]);
    for (const value of Object.values(res.body.config)) {
      expect(typeof value).toBe("boolean");
    }
    expect(Number.isInteger(res.body.uptimeSeconds)).toBe(true);
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  it("reports false for every flag when nothing is configured", async () => {
    const res = await request(buildApp()).get("/api/health");
    expect(res.body.config).toEqual({
      supabaseConfigured: false,
      adminConfigured: false,
      turnstileConfigured: false,
      commerceEnabled: false,
    });
  });

  it("reports presence booleans and never leaks env values into the body", async () => {
    process.env.SUPABASE_URL = "https://example-project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_value_never_shown";
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.TURNSTILE_SECRET_KEY = "turnstile_secret_never_shown";
    process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED = "true";
    const res = await request(buildApp()).get("/api/health");
    expect(res.body.config).toEqual({
      supabaseConfigured: true,
      adminConfigured: true,
      turnstileConfigured: true,
      commerceEnabled: true,
    });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("sb_secret_value_never_shown");
    expect(raw).not.toContain("turnstile_secret_never_shown");
    expect(raw).not.toContain("admin@example.com");
    expect(raw).not.toContain("example-project.supabase.co");
  });

  it("requires BOTH Supabase env vars, and accepts ADMIN_API_KEY for admin", async () => {
    process.env.SUPABASE_URL = "https://example-project.supabase.co"; // key missing
    process.env.ADMIN_API_KEY = "legacy-admin-key";
    const res = await request(buildApp()).get("/api/health");
    expect(res.body.config.supabaseConfigured).toBe(false);
    expect(res.body.config.adminConfigured).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("legacy-admin-key");
  });

  it("treats commerce as disabled unless the flag is exactly 'true'", async () => {
    process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED = "TRUE";
    const res = await request(buildApp()).get("/api/health");
    expect(res.body.config.commerceEnabled).toBe(false);
  });

  it("echoes the sanitized correlation id when the requestId middleware is mounted", async () => {
    const res = await request(buildApp(true)).get("/api/health").set("x-request-id", "deploy-check-7");
    expect(res.headers["x-request-id"]).toBe("deploy-check-7");
    expect(res.body.requestId).toBe("deploy-check-7");
  });

  it("echoes the generated UUID, never a rejected hostile inbound id", async () => {
    // Space and angle brackets are transmittable in a header but rejected by
    // the sanitizer (CR/LF variants are already blocked by Node itself).
    const res = await request(buildApp(true)).get("/api/health").set("x-request-id", "bad id <script>");
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
    expect(JSON.stringify(res.body)).not.toContain("script");
  });
});

describe("buildHealthPayload", () => {
  it("includes requestId only for a non-empty string", () => {
    expect(buildHealthPayload("abc").requestId).toBe("abc");
    expect("requestId" in buildHealthPayload()).toBe(false);
    expect("requestId" in buildHealthPayload("")).toBe(false);
    expect("requestId" in buildHealthPayload(42)).toBe(false);
    expect("requestId" in buildHealthPayload(["a"])).toBe(false);
  });
});
