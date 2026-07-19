import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { researchPageGate } from "./index";

// Front door behavior: once research is PUBLIC, the root domain serves the
// research experience; while the review gate is on, the root page is untouched
// so the public site never hides behind a password.

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

describe("root front door", () => {
  it("redirects / to /research when research is public", async () => {
    process.env.RESEARCH_PUBLIC = "true";
    const res = await request(makeApp()).get("/");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/research");
  });

  it("leaves / untouched while the review password gate is on", async () => {
    process.env.RESEARCH_ACCESS_PASSWORD = "SupremeLight";
    const res = await request(makeApp()).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("professional-homepage");
  });

  it("leaves / untouched when research is unconfigured", async () => {
    const res = await request(makeApp()).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("professional-homepage");
  });

  it("does not redirect non-GET methods", async () => {
    process.env.RESEARCH_PUBLIC = "true";
    const res = await request(makeApp()).post("/");
    expect(res.status).not.toBe(302);
  });

  it("research itself still serves in public mode", async () => {
    process.env.RESEARCH_PUBLIC = "true";
    const res = await request(makeApp()).get("/research");
    expect(res.status).toBe(200);
    expect(res.text).toBe("research-shell");
  });
});
