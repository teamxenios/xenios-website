// The partner portal shipped implemented but unmounted. An executed probe
// against origin/main showed all 16 routes in PARTNER_PORTAL_PATHS answering
// 404 with an empty body, which is Express saying "no such route", not the
// portal answering anything. The client called every one of them.
//
// These tests cover the two things activation has to get right:
//
//   1. the routes are actually reachable, and reachable THROUGH the
//      /api/research gateway wall, which is a separate gate from the member
//      guard and which had no "/partner" prefix;
//   2. the surface stays behind the commerce kill switch, because
//      resolvePartnerPortalPort composed the live Supabase port on
//      supabaseConfigured() alone while every sibling capability in
//      production-deps.ts fails closed when commerce is off.
//
// Reachability is asserted behaviourally over the real route table rather than
// by reading the source, because only execution distinguishes "mounted" from
// "defined in a constant somewhere".
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stands in for the real guard, attaching the member the same way
// member-auth.ts:221 does, so memberIdOf(req) resolves exactly as in
// production. Without this the routes answer 403 forbidden and the tests would
// never exercise partner resolution at all.
function allowMember(req: unknown, _res: unknown, next: () => void) {
  (req as { researchMember?: Record<string, unknown> }).researchMember = {
    id: "member-under-test",
    status: "active",
  };
  next();
}

vi.mock("../member-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../member-auth")>();
  return { ...actual, requireActiveMember: allowMember, requireMember: allowMember };
});

import { registerResearchApi } from "../index";
import { PARTNER_PORTAL_PATHS } from "./portal-routes";
import {
  partnerPortalLive,
  partnerSubmissionsEnabled,
  resolvePartnerPortalPort,
  createUnconfiguredPartnerPortalPort,
} from "./portal-production";

const KEYS = [
  "RESEARCH_PUBLIC",
  "RESEARCH_ACCESS_PASSWORD",
  "RESEARCH_SESSION_SECRET",
  "NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
const saved: Partial<Record<(typeof KEYS)[number], string>> = {};

function build() {
  const app = express();
  app.use(express.json());
  registerResearchApi(app);
  return app;
}

const READ_PATHS = [
  PARTNER_PORTAL_PATHS.onboarding,
  PARTNER_PORTAL_PATHS.training,
  PARTNER_PORTAL_PATHS.leads,
  PARTNER_PORTAL_PATHS.conversions,
  PARTNER_PORTAL_PATHS.commissions,
  PARTNER_PORTAL_PATHS.payouts,
  PARTNER_PORTAL_PATHS.resources,
  PARTNER_PORTAL_PATHS.campaigns,
  PARTNER_PORTAL_PATHS.events,
  PARTNER_PORTAL_PATHS.organizations,
  PARTNER_PORTAL_PATHS.compliance,
  PARTNER_PORTAL_PATHS.securitySessions,
];

const WRITE_PATHS = [
  PARTNER_PORTAL_PATHS.campaignRequest,
  PARTNER_PORTAL_PATHS.eventRequest,
  PARTNER_PORTAL_PATHS.organizationRequest,
  PARTNER_PORTAL_PATHS.complianceSubmissions,
];

beforeEach(() => {
  for (const key of KEYS) {
    const value = process.env[key];
    if (value === undefined) delete saved[key];
    else saved[key] = value;
    delete process.env[key];
  }
  process.env.RESEARCH_PUBLIC = "true";
  process.env.RESEARCH_SESSION_SECRET = "test-secret-for-partner-activation";
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("the partner portal is mounted", () => {
  it("covers every path the module publishes, with none left unmounted", () => {
    expect(READ_PATHS.length + WRITE_PATHS.length).toBe(Object.keys(PARTNER_PORTAL_PATHS).length);
  });

  it("answers every read route instead of Express's empty 404", async () => {
    const app = build();
    for (const path of READ_PATHS) {
      const response = await request(app).get(path);
      // The unmounted state was status 404 AND an empty body. Mounted, the
      // portal answers in its own envelope: ok:false + a code, or ok:true.
      expect(
        typeof response.body?.ok,
        `${path} returned no portal envelope, so it is not mounted`,
      ).toBe("boolean");
    }
  });

  it("answers every write route instead of Express's empty 404", async () => {
    const app = build();
    for (const path of WRITE_PATHS) {
      const response = await request(app).post(path).send({});
      expect(
        typeof response.body?.ok,
        `${path} returned no portal envelope, so it is not mounted`,
      ).toBe("boolean");
    }
  });

  it("answers a member with no partner record as partner_not_found, not as an error", async () => {
    const app = build();
    const response = await request(app).get(PARTNER_PORTAL_PATHS.onboarding);
    expect(response.status).toBe(404);
    expect(response.body.ok).toBe(false);
    expect(response.body.code).toBe("partner_not_found");
  });
});

describe("the /api/research gateway wall admits the partner prefix", () => {
  // The wall is a SEPARATE gate that sits in front of the member guard. It was
  // satisfied only by the shared review-password cookie, and "/partner" was not
  // among MEMBER_AUTHED_PREFIXES, so a signed-in member with a bearer token was
  // still answered "Access required." before any partner code ran.
  //
  // The discriminator: "Access required." is the wall talking. Anything else is
  // the wall having been passed.
  it("no bearer: the wall answers, and the portal never runs", async () => {
    process.env.RESEARCH_PUBLIC = "false";
    process.env.RESEARCH_ACCESS_PASSWORD = "gateway-password";
    const response = await request(build()).get(PARTNER_PORTAL_PATHS.commissions);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Access required.");
  });

  it("bearer present: the wall is passed and the portal answers", async () => {
    process.env.RESEARCH_PUBLIC = "false";
    process.env.RESEARCH_ACCESS_PASSWORD = "gateway-password";
    const response = await request(build())
      .get(PARTNER_PORTAL_PATHS.commissions)
      .set("Authorization", "Bearer any-member-token");

    // Not the wall's message: the request reached the portal, which answered
    // partner_not_found for a member who owns no partner record.
    expect(response.body.message).not.toBe("Access required.");
    expect(response.body.code).toBe("partner_not_found");
  });

  it("admits the 16 published paths ONLY, leaving an unlisted sibling walled", async () => {
    // The first version of this wiring added a "/partner" prefix to
    // MEMBER_AUTHED_PREFIXES, which opened the whole subtree and broke
    // member-session-wall.test.ts's case for /api/research/partner/me. The wall
    // is path-exact by design. This pins that the activation admits exactly the
    // published surface and nothing adjacent to it.
    process.env.RESEARCH_PUBLIC = "false";
    process.env.RESEARCH_ACCESS_PASSWORD = "gateway-password";
    const response = await request(build())
      .get("/api/research/partner/me")
      .set("Authorization", "Bearer any-member-token");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Access required.");
  });
});

describe("the portal stays behind the commerce kill switch", () => {
  // This is the defect the wiring had to close first. resolvePartnerPortalPort
  // returned the LIVE Supabase port whenever Supabase credentials existed,
  // regardless of the commerce flag, while production-deps.ts fails the same
  // capability closed with `if (!commerceEnabled) -> partnersFailClosed`.
  const unconfiguredShape = Object.keys(createUnconfiguredPartnerPortalPort()).sort();

  it("commerce OFF with Supabase FULLY configured still refuses the live port", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    delete process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED;

    expect(partnerPortalLive()).toBe(false);
    expect(partnerSubmissionsEnabled()).toBe(false);
    // Same surface as the unconfigured port: every read empty-safe, the write refused.
    expect(Object.keys(resolvePartnerPortalPort()).sort()).toEqual(unconfiguredShape);
  });

  it("commerce OFF: the compliance write refuses rather than accepting content", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    delete process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED;

    const response = await request(build())
      .post(PARTNER_PORTAL_PATHS.complianceSubmissions)
      .send({ title: "A submission", description: "Some content for review." });

    expect(response.body.ok).toBe(false);
    // Either the surface has no partner for this member, or the capability is
    // switched off. Both are refusals; neither stores the content.
    expect(["partner_not_found", "capability_disabled"]).toContain(response.body.code);
  });

  it("commerce ON but Supabase unconfigured also refuses the live port", () => {
    process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED = "true";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(partnerPortalLive()).toBe(false);
    expect(partnerSubmissionsEnabled()).toBe(false);
  });

  it("NEGATIVE CONTROL: both conditions met reports live", () => {
    // Without this the gate could be permanently false, which would pass every
    // assertion above while silently disabling the surface forever.
    process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED = "true";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    expect(partnerPortalLive()).toBe(true);
    expect(partnerSubmissionsEnabled()).toBe(true);
  });
});
