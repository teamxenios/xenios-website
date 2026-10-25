// xenios research: the SECOND blocker on the partner portal, made executable.
//
// Registering the partner router in server/index.ts is necessary and not
// sufficient. In password-gated mode (RESEARCH_PUBLIC unset, an access password
// configured) the /api/research gateway wall in server/research/index.ts runs
// BEFORE route matching, and it admits a bearer-only request only when the path
// appears in one of its allow lists:
//
//   MEMBER_AUTHED_PREFIXES        = ["/member", "/activation", "/catalog", "/orders"]
//   MEMBER_SESSION_READ_PATHS     exact paths, none of them partner
//   MEMBER_SESSION_WRITE_PATHS    exact paths, none of them partner
//   DOWNSTREAM_MEMBER_GUARDED_*   exact paths and anchored shapes, none partner
//
// "/partner" appears in NONE of them. The string "partner" does not appear
// anywhere in server/research/index.ts. So a signed-in partner who authenticated
// with Member Login and never typed the shared review password is answered
// 401 {"ok":false,"message":"Access required."} by the wall, and the partner
// route's own guard never runs. This is a lockout, not an exposure: it fails
// closed. But the portal stays dark even after the registration lands.
//
// The scope is wider than the sixteen new contracts. The four partner paths the
// commerce lane already publishes (/partner/me, /partner/dashboard,
// /partner/apply, /partner/links) are walled by the same omission today, which is
// why the partner pages have never had a working authenticated read in
// password-gated mode.
//
// This file states that definitively, in three blocks:
//
//   PERMANENT       assertions that hold identically before and after the fix, so
//                   they survive it untouched. They also prove the harness is
//                   sound: an already-admitted sibling namespace (/catalog)
//                   reaches its guard on the same app with the same bearer.
//   CURRENT STATE   two tests, passing on main, proving every partner path with a
//                   member bearer is answered by the WALL and never reaches its
//                   own guard. Deleted by the commit that makes the fix.
//   THE FIX         two `it.fails` expectations carrying the REAL positive
//                   assertion (a member bearer reaches the partner route's guard).
//                   Green while the gap exists, RED the moment "/partner" is
//                   admitted. So the gap lives in CI rather than in a document
//                   nobody re-reads, and the fix announces itself.
//
// Both directions were exercised before this file was committed: with "/partner"
// appended to MEMBER_AUTHED_PREFIXES, the two CURRENT STATE tests fail and the two
// THE FIX bodies pass on all twenty paths, and the PERMANENT block is unaffected.
//
// This file does not edit server/research/index.ts. The exact one-line change and
// the exact edits to this file are in docs/qa/PARTNER_REGISTRATION_PACKET.md.

import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const GUARD_HEADER = "x-test-guard";

/** Stands in for the merged member guard. Only this can set GUARD_HEADER. */
function denyAsDownstreamGuard(_req: unknown, res: Response): unknown {
  res.setHeader(GUARD_HEADER, "member");
  return res.status(401).json({ ok: false, message: "Sign in required." });
}

vi.mock("../member-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../member-auth")>();
  return {
    ...actual,
    requireActiveMember: denyAsDownstreamGuard,
    requireMember: denyAsDownstreamGuard,
    requireResearchSubject: denyAsDownstreamGuard,
  };
});

import { registerResearchApi } from "../index";
import { registerCommerceApi, type CommerceGuards } from "../commerce/routes";
import { buildCommerceDependencies } from "../commerce/production-deps";
import { createInMemoryPartnerPortalPort } from "./portal";
import { PARTNER_PORTAL_PATHS, registerPartnerPortalApi } from "./portal-routes";

const BEARER = "Bearer member-jwt-without-review-cookie";

/** server/index.ts:209-213, copied verbatim. */
const adaptGuard =
  (guard: (req: Request, res: Response, next: NextFunction) => unknown) =>
  async (req: Request, res: Response, next: () => void): Promise<void> => {
    await guard(req, res, next as unknown as NextFunction);
  };

/**
 * The app as it will exist AFTER the registration packet is applied, in
 * server/index.ts's order: the wall, then the commerce lane (which owns the four
 * older partner paths), then the partner router. So this file tests the state the
 * release authority is about to create, not today's dark portal, and the four
 * commerce paths genuinely exist here rather than 404ing as a harness artifact.
 */
function walledApiWithPartnerRegistered() {
  const app = express();
  app.use(express.json());
  registerResearchApi(app);
  const commerceGuards: CommerceGuards = {
    requireActiveMember: (req: Request, res: Response) => denyAsDownstreamGuard(req, res) as never,
    requireMember: (req: Request, res: Response) => denyAsDownstreamGuard(req, res) as never,
    requireAdmin: (req: Request, res: Response) => denyAsDownstreamGuard(req, res) as never,
  };
  registerCommerceApi(
    app,
    buildCommerceDependencies(() => new Date("2026-07-21T00:00:00.000Z"), {}),
    commerceGuards,
  );
  registerPartnerPortalApi(
    app,
    { port: createInMemoryPartnerPortalPort({}), submissionsEnabled: false },
    { requireMember: adaptGuard(denyAsDownstreamGuard) },
  );
  return app;
}

async function call(method: "get" | "post", path: string, headers: Record<string, string> = {}) {
  const agent = request(walledApiWithPartnerRegistered());
  let pending = (method === "get" ? agent.get(path) : agent.post(path)) as never as {
    set: (k: string, v: string) => typeof pending;
    send: (b: object) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
  } & Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
  for (const [name, value] of Object.entries(headers)) pending = pending.set(name, value);
  return method === "get" ? await pending : await pending.send({});
}

/** The wall answered. The partner route's own guard was never reached. */
function expectWalledByGateway(response: { status: number; headers: Record<string, string>; body: unknown }) {
  expect(response.status).toBe(401);
  expect(response.headers[GUARD_HEADER]).toBeUndefined();
  expect(response.body).toEqual({ ok: false, message: "Access required." });
}

/** The partner route's own guard answered. The wall was passed. */
function expectReachedPartnerGuard(response: {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}) {
  expect(response.headers[GUARD_HEADER]).toBe("member");
  expect(response.body).toEqual({ ok: false, message: "Sign in required." });
}

/** All sixteen new contracts, with the verb each is published under. */
const PARTNER_CONTRACTS: ReadonlyArray<readonly ["get" | "post", string]> = [
  ["get", PARTNER_PORTAL_PATHS.onboarding],
  ["get", PARTNER_PORTAL_PATHS.training],
  ["get", PARTNER_PORTAL_PATHS.leads],
  ["get", PARTNER_PORTAL_PATHS.conversions],
  ["get", PARTNER_PORTAL_PATHS.commissions],
  ["get", PARTNER_PORTAL_PATHS.payouts],
  ["get", PARTNER_PORTAL_PATHS.resources],
  ["get", PARTNER_PORTAL_PATHS.campaigns],
  ["get", PARTNER_PORTAL_PATHS.events],
  ["get", PARTNER_PORTAL_PATHS.organizations],
  ["get", PARTNER_PORTAL_PATHS.compliance],
  ["get", PARTNER_PORTAL_PATHS.securitySessions],
  ["post", PARTNER_PORTAL_PATHS.campaignRequest],
  ["post", PARTNER_PORTAL_PATHS.eventRequest],
  ["post", PARTNER_PORTAL_PATHS.organizationRequest],
  ["post", PARTNER_PORTAL_PATHS.complianceSubmissions],
] as const;

/** The four partner paths the commerce lane already publishes, walled by the same omission. */
const COMMERCE_OWNED_PARTNER_PATHS: ReadonlyArray<readonly ["get" | "post", string]> = [
  ["get", "/api/research/partner/me"],
  ["get", "/api/research/partner/dashboard"],
  ["get", "/api/research/partner/links"],
  ["post", "/api/research/partner/apply"],
] as const;

const KEYS = ["RESEARCH_PUBLIC", "RESEARCH_ACCESS_PASSWORD", "RESEARCH_SESSION_SECRET"] as const;
const saved: Partial<Record<(typeof KEYS)[number], string>> = {};

beforeEach(() => {
  for (const key of KEYS) {
    const value = process.env[key];
    if (value === undefined) delete saved[key];
    else saved[key] = value;
    delete process.env[key];
  }
  process.env.RESEARCH_SESSION_SECRET = "test-secret-for-partner-gateway-wall";
  process.env.RESEARCH_ACCESS_PASSWORD = "gate-password";
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// ---------------------------------------------------------------------------
// PERMANENT. These hold identically before and after the fix, so nothing here
// has to be touched when the one-line change lands. They are what makes the two
// state-dependent blocks below trustworthy rather than harness artifacts.
// ---------------------------------------------------------------------------

describe("the wall, characterised where the fix does not change it", () => {
  it("proves the wall and not the route is answering: an admitted sibling namespace reaches its own guard", async () => {
    // /catalog is already in MEMBER_AUTHED_PREFIXES. Same app, same bearer, same
    // wall, different answer. So a partner 401 is the wall's omission and not a
    // property of this harness.
    const admitted = await call("get", "/api/research/catalog", { Authorization: BEARER });
    expect(admitted.headers[GUARD_HEADER]).toBe("member");
  });

  it("is not a public-mode problem: with RESEARCH_PUBLIC the same partner request reaches the partner guard", async () => {
    // The wall short-circuits in public mode, so the partner routes would work
    // there. The lockout is specific to password-gated mode, which is the mode
    // the research surface actually ships in, so public mode is no mitigation.
    process.env.RESEARCH_PUBLIC = "true";
    expectReachedPartnerGuard(await call("get", PARTNER_PORTAL_PATHS.commissions, { Authorization: BEARER }));
  });

  it("keeps every partner path walled when no credential is presented at all", async () => {
    // Rule 2 of the SEN-0023 bypass, restated for the partner prefix: the
    // widening must stay tied to a real member credential. This is the assertion
    // the fix must NOT break, so it is deliberately outside both blocks below.
    for (const [method, path] of [...PARTNER_CONTRACTS, ...COMMERCE_OWNED_PARTNER_PATHS]) {
      expectWalledByGateway(await call(method, path));
    }
  });
});

// ---------------------------------------------------------------------------
// CURRENT STATE ON MAIN. Two tests, both passing today, and both expected to go
// red the moment "/partner" is admitted. That is the intended signal: they are
// the "before" half of the flip and are DELETED by the same commit that makes
// the change. Kept to two tests so the deletion is unambiguous.
// ---------------------------------------------------------------------------

describe("BLOCKER, current state: the gateway wall answers partner requests before any partner route runs", () => {
  it("DELETE WITH THE FIX: walls all sixteen contracts for a member bearer, even with the router registered", async () => {
    for (const [method, path] of PARTNER_CONTRACTS) {
      expectWalledByGateway(await call(method, path, { Authorization: BEARER }));
    }
  });

  it("DELETE WITH THE FIX: walls the commerce lane's four older partner paths by the same omission", async () => {
    for (const [method, path] of COMMERCE_OWNED_PARTNER_PATHS) {
      expectWalledByGateway(await call(method, path, { Authorization: BEARER }));
    }
  });
});

// ---------------------------------------------------------------------------
// THE FIX, as an executable expectation.
//
// Each body below is the assertion that SHOULD hold: a member bearer reaches the
// partner route's own guard in password-gated mode. It throws today, so `it.fails`
// keeps CI green and honest while the gap exists, and turns RED the moment the
// one-line change lands. Verified both ways: with "/partner" appended to
// MEMBER_AUTHED_PREFIXES these two bodies pass on all twenty paths.
//
// RELEASE AUTHORITY: in the SAME commit that adds "/partner" to
// MEMBER_AUTHED_PREFIXES in server/research/index.ts, delete the `.fails` on the
// two tests below and delete the two "DELETE WITH THE FIX" tests above. The exact
// edit is in docs/qa/PARTNER_REGISTRATION_PACKET.md.
// ---------------------------------------------------------------------------

describe("THE FIX: /partner belongs in MEMBER_AUTHED_PREFIXES", () => {
  it.fails(
    "PENDING ONE-LINE FIX: a member bearer should reach the partner route's own guard on all sixteen contracts",
    async () => {
      for (const [method, path] of PARTNER_CONTRACTS) {
        expectReachedPartnerGuard(await call(method, path, { Authorization: BEARER }));
      }
    },
  );

  it.fails(
    "PENDING ONE-LINE FIX: a member bearer should reach the commerce lane's four partner paths too",
    async () => {
      for (const [method, path] of COMMERCE_OWNED_PARTNER_PATHS) {
        expectReachedPartnerGuard(await call(method, path, { Authorization: BEARER }));
      }
    },
  );
});
