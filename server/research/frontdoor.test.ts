import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerResearchApi, researchPageGate } from "./index";

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
  app.get("/admin/research", (_req, res) => res.send("admin-shell"));
  app.get("/admin/research/products", (_req, res) => res.send("admin-products"));
  app.head("/admin/research", (_req, res) => res.sendStatus(200));
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

  it.each([
    ["get", "/admin/research"],
    ["head", "/admin/research"],
    ["get", "/admin/research/products"],
    ["get", "/Admin/Research"],
    ["get", "/%61dmin/research"],
    ["get", "/admin/%72esearch/products"],
  ] as const)("protects the admin document boundary for %s %s", async (method, path) => {
    const app = express();
    app.use(researchPageGate);
    app.use((_req, res) => res.send("spa"));

    const res = await (request(app) as any)[method](path);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers.pragma).toBe("no-cache");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it("does not apply admin document headers to the API namespace", async () => {
    const app = express();
    app.use(researchPageGate);
    app.get("/api/admin/research/products", (_req, res) => res.sendStatus(401));

    const res = await request(app).get("/api/admin/research/products");
    expect(res.status).toBe(401);
    expect(res.headers["x-robots-tag"]).toBeUndefined();
  });
});

describe("the public Research application boundary", () => {
  function makeResearchApiApp() {
    const app = express();
    app.use(express.json());
    registerResearchApi(app);
    app.get("/api/research/applications/status", (_req, res) => res.json({ route: "status" }));
    app.post("/api/research/applications/resend-link", (_req, res) => res.json({ route: "resend" }));
    return app;
  }

  it.each([
    ["get", "/api/research/applications/status", "status"],
    ["post", "/api/research/applications/resend-link", "resend"],
  ] as const)("allows the exact public applicant route for %s %s", async (method, path, route) => {
    process.env.RESEARCH_ACCESS_PASSWORD = "gate-password";
    const res = await (request(makeResearchApiApp()) as any)[method](path);
    expect(res.status).toBe(200);
    expect(res.body.route).toBe(route);
  });

  it("allows applicant policies without opening catalog or application writes", async () => {
    process.env.RESEARCH_ACCESS_PASSWORD = "gate-password";
    const app = makeResearchApiApp();

    const policies = await request(app).get("/api/research/policies");
    expect(policies.status).toBe(200);
    expect(policies.body.policies).toBeTruthy();

    const catalog = await request(app).get("/api/research/catalog");
    expect(catalog.status).toBe(401);

    const applicationList = await request(app).get("/api/research/applications");
    expect(applicationList.status).toBe(401);

    for (const path of [
      "/api/research/applications",
      "/api/research/applications/resubmit",
    ]) {
      expect((await request(app).post(path).send({})).status).toBe(401);
    }

    expect((await request(app).delete("/api/research/applications")).status).toBe(401);
  });
});
