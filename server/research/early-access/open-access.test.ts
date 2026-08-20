import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerResearchApi } from "../index";
import { registerPrivateEarlyAccessApi } from "./register";
import { resolveEarlyAccessConfig } from "./private-access-config";
import { hashPrivateAccessPassword } from "./private-access-password";

/**
 * OPEN ACCESS: no customer-facing Early Access password (founder decision,
 * 2026-08-20).
 *
 * The password is gone from the JOURNEY. The session is not: it stopped being
 * proof of access and became the anonymous identity that decides which order a
 * browser may read back. Removing it as well would have turned every ownership
 * check in the lane into an oracle over other customers' requests.
 *
 * These are the eight guarantees the founder asked to be pinned, plus the trap
 * that motivated the config change: an operator removing the now-unused
 * password secret must not take the ordering surface dark.
 */

const SESSION_SECRET = "open-access-suite-session-secret-0123456789-abcdef";
const WALLED = "Access required.";

const saved: Record<string, string | undefined> = {};
const TOUCHED = [
  "RESEARCH_ACCESS_PASSWORD",
  "RESEARCH_SESSION_SECRET",
  "RESEARCH_PUBLIC",
  "RESEARCH_EARLY_ACCESS_ENABLED",
  "RESEARCH_EARLY_ACCESS_OPEN_ACCESS",
  "RESEARCH_EARLY_ACCESS_PASSWORD_HASH",
  "RESEARCH_EARLY_ACCESS_SESSION_SECRET",
];

beforeEach(() => {
  for (const key of TOUCHED) saved[key] = process.env[key];
  // The outer research wall stays CONFIGURED and CLOSED for this whole suite.
  // Proving Early Access opens while the wall is shut is the entire point; a
  // suite that quietly disabled the wall would prove nothing.
  process.env.RESEARCH_ACCESS_PASSWORD = "outer-shared-password";
  process.env.RESEARCH_SESSION_SECRET = "outer-session-secret-0123456789-abcdefghij";
  process.env.RESEARCH_PUBLIC = "false";
  process.env.RESEARCH_EARLY_ACCESS_ENABLED = "true";
  process.env.RESEARCH_EARLY_ACCESS_OPEN_ACCESS = "true";
  process.env.RESEARCH_EARLY_ACCESS_SESSION_SECRET = SESSION_SECRET;
  delete process.env.RESEARCH_EARLY_ACCESS_PASSWORD_HASH;
});

afterEach(() => {
  for (const key of TOUCHED) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function makeApp() {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  registerResearchApi(app);
  registerPrivateEarlyAccessApi(app);
  return app;
}

describe("the deployment configuration with no password", () => {
  it("stays ENABLED with no password hash set at all", () => {
    // THE TRAP THIS EXISTS FOR. `enabled` requires zero problems, and a missing
    // hash used to BE a problem, so the moment an operator removed the secret
    // that is no longer used, every Early Access door would answer 503 and the
    // ordering surface would look like an outage.
    const config = resolveEarlyAccessConfig(process.env);
    expect(config.openAccess).toBe(true);
    expect(config.enabled).toBe(true);
    expect(config.problems).toEqual([]);
  });

  it("still refuses to run without a session secret, because sessions still exist", () => {
    delete process.env.RESEARCH_EARLY_ACCESS_SESSION_SECRET;
    const config = resolveEarlyAccessConfig(process.env);
    expect(config.enabled).toBe(false);
    expect(config.problems).toContain("SESSION_SECRET_MISSING");
  });

  it("still reports a MALFORMED hash, so a half-finished change is not silent", () => {
    process.env.RESEARCH_EARLY_ACCESS_PASSWORD_HASH = "not-a-scrypt-hash";
    expect(resolveEarlyAccessConfig(process.env).problems).toContain("PASSWORD_HASH_INVALID");
  });

  it("keeps requiring the password when open access is NOT set", () => {
    process.env.RESEARCH_EARLY_ACCESS_OPEN_ACCESS = "false";
    const config = resolveEarlyAccessConfig(process.env);
    expect(config.openAccess).toBe(false);
    expect(config.problems).toContain("PASSWORD_HASH_MISSING");
  });
});

describe("the customer journey opens without any password", () => {
  it("tells the browser there is no password to ask for", async () => {
    const res = await request(makeApp()).get("/api/research/early-access/session");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ authenticated: false, openAccess: true });
  });

  it("issues a session for an unlock carrying NO password", async () => {
    const res = await request(makeApp())
      .post("/api/research/early-access/unlock")
      .send({});
    expect(res.status).toBe(200);
    const cookie = res.headers["set-cookie"];
    expect(cookie).toBeTruthy();
  });

  it("and that session then reads back as authenticated", async () => {
    const app = makeApp();
    const opened = await request(app).post("/api/research/early-access/unlock").send({});
    const cookies = opened.headers["set-cookie"] as unknown as string[];
    const session = await request(app)
      .get("/api/research/early-access/session")
      .set("Cookie", cookies);
    expect(session.body).toMatchObject({ authenticated: true, openAccess: true });
  });

  it("reaches the order-flow APIs through the outer wall, which is still closed", async () => {
    // The wall is configured and shut for this whole suite. These doors are
    // admitted door-by-door, so they must answer on their own terms and never
    // with the wall's refusal.
    const app = makeApp();
    for (const path of [
      "/api/research/early-access/assisted-orders/config",
      "/api/research/early-access/catalog",
      "/api/research/early-access/session",
    ]) {
      const res = await request(app).get(path);
      expect(res.body?.message, path).not.toBe(WALLED);
    }
  });
});

describe("what removing the password must NOT have opened", () => {
  it("leaves every private surface refusing, and never serves one", async () => {
    // This harness mounts only the research API and Early Access, so a path
    // belonging to another registrar answers 404 here rather than its own
    // guard. The property that matters either way is that opening Early Access
    // served NOTHING private. Door-by-door admin, member, supplier and Care
    // coverage lives in early-access-wall.test.ts against the same wall.
    const app = makeApp();
    for (const path of [
      "/api/admin/research/outbox",
      "/api/admin/research/assisted-orders",
      "/api/research/member/me",
      "/api/research/profile",
      "/api/research/documents",
    ]) {
      const res = await request(app).get(path);
      expect(res.status, path).not.toBe(200);
    }
  });

  it("still walls the rest of the research API for an anonymous caller", async () => {
    // Opening Early Access must not have opened the section around it.
    const res = await request(makeApp()).get("/api/research/applications");
    expect(res.status).toBe(401);
    expect(res.body?.message).toBe(WALLED);
  });

  it("still walls a write to a door whose READ is admitted", async () => {
    const res = await request(makeApp()).post("/api/research/subscriptions").send({});
    expect(res.status).toBe(401);
    expect(res.body?.message).toBe(WALLED);
  });

  it("does not admit an Early Access path that was never listed", async () => {
    // The admissions are path-exact on purpose: an open journey must not become
    // a prefix exemption over a namespace that carries orders and documents.
    const res = await request(makeApp()).get("/api/research/early-access/not-a-real-door");
    expect(res.body?.message).toBe(WALLED);
  });
});

describe("agreements and anti-abuse survive the password removal", () => {
  it("does not let an open gate stand in for accepting the agreements", async () => {
    // The founder's requirement in its sharpest form: removing the password
    // must not become a way to skip the Research agreements. Acceptance is a
    // recorded act tied to a session, so an anonymous caller with no session
    // must not be able to record one, and an open gate must not imply consent.
    const app = makeApp();
    const anonymous = await request(app)
      .post("/api/research/early-access/agreements/accept")
      .send({ kind: "early_access_terms", version: "v1" });
    expect(anonymous.status).not.toBe(200);

    // Even holding a freshly minted OPEN-ACCESS session, the standing read must
    // not report the customer as already agreed.
    const opened = await request(app).post("/api/research/early-access/unlock").send({});
    const cookies = opened.headers["set-cookie"] as unknown as string[];
    const standing = await request(app)
      .get("/api/research/early-access/agreements")
      .set("Cookie", cookies);
    expect(JSON.stringify(standing.body)).not.toContain('"accepted":true');
  });

  it("still rate-limits session minting, so open does not mean unbounded", async () => {
    // The limiter used to bound password guessing. With no password it bounds
    // how many durable session rows one caller can demand, which is why it was
    // kept rather than removed with the check it guarded.
    const app = makeApp();
    const ip = "203.0.113.77";
    let refused = 0;
    for (let i = 0; i < 40; i += 1) {
      const res = await request(app)
        .post("/api/research/early-access/unlock")
        .set("X-Forwarded-For", ip)
        .send({});
      if (res.status !== 200) refused += 1;
    }
    expect(refused).toBeGreaterThan(0);
  });
});
