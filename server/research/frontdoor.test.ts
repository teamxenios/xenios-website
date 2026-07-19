import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { researchPageGate } from "./index";

// Root-domain invariant (canonical decision, 2026-07-18): the xenios homepage
// stays at / in EVERY mode. Research is a private, password-gated section at
// /research and never takes over the root. These tests exist because a root
// redirect once shipped and was reversed; they keep it from coming back.

const KEYS = ["RESEARCH_PUBLIC", "RESEARCH_ACCESS_PASSWORD", "RESEARCH_SESSION_SECRET"];
const saved: Record<string, string | undefined> = {};

function makeApp() {
  const app = express();
  app.use(researchPageGate);
  app.get("/", (_req, res) => res.send("professional-homepage"));
  app.get("/research", (_req, res) => res.send("research-shell"));
  return app;
}

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.RESEARCH_SESSION_SECRET = "test-secret";
});
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("the homepage stays at the root domain", () => {
  it("serves the homepage at / while the review password gate is on", async () => {
    process.env.RESEARCH_ACCESS_PASSWORD = "gate-password";
    const res = await request(makeApp()).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("professional-homepage");
  });

  it("serves the homepage at / even if RESEARCH_PUBLIC is ever set", async () => {
    process.env.RESEARCH_PUBLIC = "true";
    const res = await request(makeApp()).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("professional-homepage");
    expect(res.headers.location).toBeUndefined();
  });

  it("serves the homepage at / when research is unconfigured", async () => {
    const res = await request(makeApp()).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("professional-homepage");
  });

  it("never redirects the root for any method", async () => {
    process.env.RESEARCH_PUBLIC = "true";
    for (const method of ["get", "post", "head"] as const) {
      const res = await (request(makeApp()) as any)[method]("/");
      expect(res.status).not.toBe(302);
    }
  });

  it("research itself still serves at /research behind the gate middleware", async () => {
    process.env.RESEARCH_ACCESS_PASSWORD = "gate-password";
    const res = await request(makeApp()).get("/research");
    expect(res.status).toBe(200);
    expect(res.text).toBe("research-shell");
  });
});
