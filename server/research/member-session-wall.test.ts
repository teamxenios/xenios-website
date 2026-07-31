import express from "express";
import request from "supertest";
import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// SEN-0023, the member-platform half.
//
// The /api/research gateway wall ran before route matching and was satisfied
// only by the shared review-password cookie (xr_access), which Member Login
// never mints. Every route below already owns a requireActiveMember or
// requireMember guard, so the wall was a functional LOCKOUT of signed-in
// members, not an exposure. This suite proves two things at once for each
// admitted route:
//
//   REACHES THE GUARD  a request carrying a member bearer credential passes
//                      the wall and is answered by the route's own downstream
//                      guard (identified here by x-test-guard, which only the
//                      stubbed guard can set).
//   STILL WALLED       a near-miss shape (wrong verb, wrong id format, a
//                      sibling path, or the same path with no bearer) is still
//                      answered by the wall itself.
//
// The negative half is the point: it is what proves the bypass discriminates
// on an exact shape rather than matching a namespace prefix.
// ---------------------------------------------------------------------------

const GUARD_HEADER = "x-test-guard";

function denyAsDownstreamGuard(_req: unknown, res: any) {
  res.setHeader(GUARD_HEADER, "member");
  res.status(401).json({ ok: false, message: "Sign in required." });
}

vi.mock("./member-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./member-auth")>();
  return {
    ...actual,
    requireActiveMember: denyAsDownstreamGuard,
    requireMember: denyAsDownstreamGuard,
  };
});

import { registerResearchApi } from "./index";
import { registerMemberPlatformApi } from "./member-platform";
import { registerCommerceApi, type CommerceGuards } from "./commerce/routes";
import { buildCommerceDependencies } from "./commerce/production-deps";

const MEDIA_ID = "3f1c2d4e-5a6b-4c8d-9e0f-1a2b3c4d5e6f";
const QUESTION_ID = "8c7b6a59-4d3e-4f2a-8b1c-0d9e8f7a6b5c";
const GUIDE_SLUG = "thymosin-alpha-1-kpv-ll-37";
const BEARER = "Bearer member-jwt-without-review-cookie";

const KEYS = [
  "RESEARCH_PUBLIC",
  "RESEARCH_ACCESS_PASSWORD",
  "RESEARCH_SESSION_SECRET",
] as const;
const saved: Partial<Record<(typeof KEYS)[number], string>> = {};

function makeWalledApi() {
  const app = express();
  app.use(express.json());
  // Production registration order (server/index.ts): the wall first, then the
  // member platform, then the commerce lane with its injected guards.
  registerResearchApi(app);
  registerMemberPlatformApi(app);
  const commerceGuards: CommerceGuards = {
    requireActiveMember: (req: Request, res: Response) => denyAsDownstreamGuard(req, res),
    requireMember: (req: Request, res: Response) => denyAsDownstreamGuard(req, res),
    requireAdmin: (req: Request, res: Response) => denyAsDownstreamGuard(req, res),
  };
  registerCommerceApi(
    app,
    buildCommerceDependencies(() => new Date("2026-07-21T00:00:00.000Z"), {}),
    commerceGuards,
  );
  return app;
}

async function call(method: string, path: string, headers: Record<string, string> = {}) {
  let pending = (request(makeWalledApi()) as any)[method](path);
  for (const [name, value] of Object.entries(headers)) pending = pending.set(name, value);
  return method === "get" || method === "head" ? await pending : await pending.send({});
}

/** The route's own guard answered: the wall was passed. */
function expectReachedDownstreamGuard(response: any, method: string) {
  expect(response.status).toBe(401);
  expect(response.headers[GUARD_HEADER]).toBe("member");
  if (method !== "head") {
    expect(response.body).toEqual({ ok: false, message: "Sign in required." });
  }
}

/** The wall answered: the route's guard was never reached. */
function expectStillWalled(response: any, method: string) {
  expect(response.status).toBe(401);
  expect(response.headers[GUARD_HEADER]).toBeUndefined();
  if (method !== "head") {
    expect(response.body).toEqual({ ok: false, message: "Access required." });
  }
}

// Every route the fix admits, with the verb it is admitted under.
const ADMITTED = [
  ["get", "/api/research/assessment"],
  ["head", "/api/research/assessment"],
  ["get", "/api/research/blueprint"],
  ["get", "/api/research/guides"],
  ["get", `/api/research/guides/${GUIDE_SLUG}`],
  ["get", "/api/research/media"],
  ["get", "/api/research/questions"],
  ["get", "/api/research/telegram"],
  ["get", "/api/research/tracker"],
  ["post", "/api/research/agreements"],
  ["post", "/api/research/assessment/responses"],
  ["post", "/api/research/assessment/submit"],
  ["post", "/api/research/blueprint/acknowledge"],
  ["post", "/api/research/media/intent"],
  ["post", `/api/research/media/${MEDIA_ID}/access`],
  ["post", "/api/research/questions"],
  ["post", `/api/research/questions/${QUESTION_ID}/rate`],
  ["post", "/api/research/telegram/link"],
  ["post", "/api/research/tracker"],
  ["put", "/api/research/profile"],
  ["put", "/api/research/media/retention-election"],
  ["delete", "/api/research/telegram/link"],
  ["delete", `/api/research/media/${MEDIA_ID}`],
] as const;

beforeEach(() => {
  for (const key of KEYS) {
    const value = process.env[key];
    if (value === undefined) delete saved[key];
    else saved[key] = value;
    delete process.env[key];
  }
  process.env.RESEARCH_SESSION_SECRET = "test-secret-for-member-session-wall";
  process.env.RESEARCH_ACCESS_PASSWORD = "gate-password";
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("SEN-0023 member-session wall bypass", () => {
  it.each(ADMITTED)("lets a member-bearer %s %s reach its downstream guard", async (method, path) => {
    expectReachedDownstreamGuard(await call(method, path, { Authorization: BEARER }), method);
  });

  // Rule 2 of the bypass: no member credential, no bypass. This is the
  // negative that keeps the widening tied to an actual member request, and it
  // is why the pre-existing "PUT /api/research/profile is walled" assertion in
  // account-access-wall.test.ts remains true and untouched.
  it.each(ADMITTED)("keeps %s %s walled when no bearer credential is presented", async (method, path) => {
    expectStillWalled(await call(method, path), method);
  });

  it.each([
    // Verbs that were deliberately NOT admitted for an admitted path.
    ["post", "/api/research/assessment"],
    ["put", "/api/research/assessment/responses"],
    ["delete", "/api/research/blueprint"],
    ["put", "/api/research/questions"],
    ["delete", "/api/research/tracker"],
    ["delete", "/api/research/telegram"],
    ["patch", "/api/research/profile"],
    ["post", "/api/research/profile"],
    ["get", "/api/research/agreements"],
    ["post", "/api/research/guides"],
    // Sibling literals one character away from an admitted exact path.
    ["get", "/api/research/blueprints"],
    ["post", "/api/research/assessment/submits"],
    ["post", "/api/research/blueprint/acknowledgements"],
    ["post", "/api/research/media/intents"],
    ["get", "/api/research/guide"],
    ["get", "/api/research/trackers"],
    ["post", "/api/research/telegram/links"],
    ["delete", "/api/research/media"],
    // A deeper path under an admitted exact path: the Set is exact, never a
    // prefix, so nothing below it is admitted by accident.
    ["get", "/api/research/questions/open"],
    ["post", "/api/research/tracker/entries"],
    ["put", "/api/research/profile/sensitive"],
  ] as const)("keeps the near-miss %s %s walled even with a member bearer", async (method, path) => {
    expectStillWalled(await call(method, path, { Authorization: BEARER }), method);
  });

  it.each([
    // The id is a uuid column (research_private_media.id,
    // research_member_questions.id), so anything that is not a canonical
    // lowercase UUID is not a real row address and stays walled.
    ["post", `/api/research/media/${MEDIA_ID.toUpperCase()}/access`],
    ["post", "/api/research/media/private-media-id/access"],
    ["post", "/api/research/media//access"],
    ["post", "/api/research/media/%00/access"],
    ["post", "/api/research/media/%E0%A4%A/access"],
    ["post", `/api/research/media/%33${MEDIA_ID.slice(1)}/access`],
    ["post", `/api/research/media/${MEDIA_ID}%2Fextra/access`],
    ["post", `/api/research/media/${MEDIA_ID}/access/extra`],
    ["post", `/api/research/media/${MEDIA_ID}/accesses`],
    ["post", `/api/research/media/${MEDIA_ID}`],
    ["post", `/api/research/questions/${QUESTION_ID.toUpperCase()}/rate`],
    ["post", "/api/research/questions/private-question-id/rate"],
    ["post", "/api/research/questions//rate"],
    ["post", `/api/research/questions/${QUESTION_ID}%2Fextra/rate`],
    ["post", `/api/research/questions/${QUESTION_ID}/rating`],
    ["post", `/api/research/questions/${QUESTION_ID}/rate/extra`],
    ["delete", `/api/research/media/${MEDIA_ID.toUpperCase()}`],
    ["delete", "/api/research/media/private-media-id"],
    ["delete", "/api/research/media/%00"],
    ["delete", `/api/research/media/${MEDIA_ID}%2Fextra`],
    ["delete", `/api/research/media/${MEDIA_ID}/access`],
  ] as const)("keeps the non-canonical id shape %s %s walled", async (method, path) => {
    expectStillWalled(await call(method, path, { Authorization: BEARER }), method);
  });

  // DELETE /media/:mediaId and PUT /media/retention-election are siblings in
  // the same namespace. The UUID anchor is the only thing separating them, so
  // this asserts the literal sibling cannot be reached through the id shape.
  it.each([
    ["delete", "/api/research/media/retention-election"],
    ["post", "/api/research/media/retention-election"],
    ["get", "/api/research/media/retention-election"],
  ] as const)("keeps %s %s walled: only PUT is admitted there", async (method, path) => {
    expectStillWalled(await call(method, path, { Authorization: BEARER }), method);
  });

  it.each([
    ["get", `/api/research/guides/${GUIDE_SLUG.toUpperCase()}`],
    ["get", "/api/research/guides/Bpc-157"],
    ["get", "/api/research/guides/bpc_157"],
    ["get", "/api/research/guides/-bpc-157"],
    ["get", "/api/research/guides/bpc-157-"],
    ["get", "/api/research/guides/bpc--157"],
    ["get", "/api/research/guides/%62pc-157"],
    ["get", "/api/research/guides/bpc-157%2Fextra"],
    ["get", "/api/research/guides/bpc-157/sources"],
    ["get", "/api/research/guides/"],
    ["get", `/api/research/guides/${"a".repeat(81)}`],
    ["post", `/api/research/guides/${GUIDE_SLUG}`],
    ["delete", `/api/research/guides/${GUIDE_SLUG}`],
  ] as const)("keeps the non-canonical guide slug %s %s walled", async (method, path) => {
    expectStillWalled(await call(method, path, { Authorization: BEARER }), method);
  });

  // Routes that share a namespace with an admitted one but are NOT guarded by
  // requireActiveMember/requireMember. They must stay walled: the Telegram
  // webhook has no member guard at all (it is signature-gated downstream), and
  // the agreements read plus the XR-MEM-012 withdrawal use
  // requireResearchSubject, which is a different guard.
  it.each([
    ["post", "/api/research/telegram/webhook"],
    ["get", "/api/research/telegram/webhook"],
    ["post", "/api/research/agreements/XR-MEM-012/withdraw"],
    ["get", "/api/research/agreements"],
  ] as const)("keeps the non-member-guarded neighbour %s %s walled", async (method, path) => {
    expectStillWalled(await call(method, path, { Authorization: BEARER }), method);
  });

  // A bearer header is a precondition, never an authorization: it must not
  // open anything outside the enumerated shapes.
  it.each([
    ["get", "/api/research/applications"],
    ["post", "/api/research/applications"],
    ["get", "/api/research/catalog-display/catalog"],
    ["get", "/api/research/no-such-surface"],
    ["get", "/api/research/plans/xenios90"],
    ["get", "/api/research/products"],
    ["get", "/api/research/goals"],
    ["get", "/api/research/cart"],
    ["get", "/api/research/partner/me"],
  ] as const)("does not let a bearer open the unlisted %s %s", async (method, path) => {
    expectStillWalled(await call(method, path, { Authorization: BEARER }), method);
  });

  it("keeps a non-Bearer Authorization scheme walled on an admitted route", async () => {
    expectStillWalled(
      await call("get", "/api/research/tracker", { Authorization: "Basic bWVtYmVyOnB3" }),
      "get",
    );
    expectStillWalled(
      await call("get", "/api/research/tracker", { Authorization: "bearer lowercase-scheme" }),
      "get",
    );
  });
});
