import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS,
  FOUNDER_COMMAND_CENTER_API_PATH,
  FOUNDER_COMMAND_CENTER_AREA_IDS,
  isFounderCommandCenterResponse,
} from "@shared/research/founder-command-center";
import {
  boundedCount,
  buildFounderCommandCenterSnapshot,
  exactCount,
  registerFounderCommandCenterApi,
  type FounderCommandCenterSourceSnapshot,
  type FounderCommandCenterSourceContext,
  type FounderCommandCenterSources,
} from "./founder-command-center";

// Keep routes.ts and its recovery-purpose guard real. Only the external Auth
// edge is replaced; none of these requests can reach a database or provider.
const authEdge = vi.hoisted(() => ({
  configured: vi.fn(() => true),
  getUser: vi.fn(),
  getAdmin: vi.fn(() => {
    throw new Error("Unexpected database access in command-center auth test");
  }),
}));

vi.mock("../supabase", () => ({
  supabaseConfigured: authEdge.configured,
  getSupabaseAnon: () => ({ auth: { getUser: authEdge.getUser } }),
  getSupabaseAdmin: authEdge.getAdmin,
}));

const NOW = new Date("2026-09-04T20:00:00.000Z");
const OLDEST = "2026-09-01T12:00:00.000Z";

function successfulSnapshot(
  area: (typeof FOUNDER_COMMAND_CENTER_AREA_IDS)[number],
  value = 1,
): FounderCommandCenterSourceSnapshot {
  return {
    source: {
      state: "current",
      authority: `Canonical ${area} test source`,
      observedAt: NOW.toISOString(),
    },
    primaryCount: exactCount(
      `${area}.attention`,
      "Needs attention",
      value,
      "Exact focused test scope.",
    ),
    breakdown: [],
    facts: [],
    oldestWaiting: value > 0
      ? { state: "available", since: OLDEST }
      : { state: "not_applicable", since: null },
    attention: value > 0
      ? {
          severity: "warning",
          code: "attention",
          reason: "A current item requires attention.",
        }
      : {
          severity: "none",
          code: "none",
          reason: "No items are in this exact test scope.",
        },
  };
}

function successfulSources(): FounderCommandCenterSources {
  return Object.fromEntries(
    FOUNDER_COMMAND_CENTER_AREA_IDS.map((area) => [
      area,
      async () => successfulSnapshot(area),
    ]),
  ) as FounderCommandCenterSources;
}

function appFor(
  sources: FounderCommandCenterSources,
  options: { authorized?: boolean; timeoutMs?: number } = {},
) {
  const app = express();
  registerFounderCommandCenterApi(app, sources, {
    timeoutMs: options.timeoutMs,
    now: () => NOW,
    requireAdmin: (_req, res, next) => {
      if (options.authorized === false) {
        res.status(401).json({ ok: false, message: "Unauthorized" });
        return;
      }
      next();
    },
  });
  return app;
}

describe("Founder Command Center read-only API", () => {
  it("returns the one strict thirteen-card contract in canonical order", async () => {
    const response = await request(appFor(successfulSources()))
      .get(FOUNDER_COMMAND_CENTER_API_PATH)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.readOnly).toBe(true);
    expect(response.body.cards.map((card: { area: string }) => card.area)).toEqual(
      FOUNDER_COMMAND_CENTER_AREA_IDS,
    );
    expect(isFounderCommandCenterResponse(response.body)).toBe(true);
    expect(
      response.body.cards.every(
        (card: { directAction: { href: string }; owningWorkflow: { href: string } }) =>
          FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS.includes(
            card.directAction.href as never,
          ) &&
          FOUNDER_COMMAND_CENTER_ALLOWED_ACTION_HREFS.includes(
            card.owningWorkflow.href as never,
          ),
      ),
    ).toBe(true);
  });

  it("sets private headers before auth and never starts a source for a denied request", async () => {
    const source = vi.fn(async () => successfulSnapshot("applications"));
    const response = await request(
      appFor({ applications: source }, { authorized: false }),
    )
      .get(FOUNDER_COMMAND_CENTER_API_PATH)
      .expect(401);

    expect(source).not.toHaveBeenCalled();
    expect(response.headers["cache-control"]).toBe("no-store, max-age=0");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("isolates rejected and malformed sources without fabricating a zero", async () => {
    const sources = successfulSources() as Record<string, any>;
    sources.care_requests = async () => {
      throw new Error("database detail that must not escape");
    };
    sources.assisted_orders = async () => ({
      ...successfulSnapshot("assisted_orders"),
      email: "pii-sentinel@example.invalid",
    });

    const response = await request(appFor(sources))
      .get(FOUNDER_COMMAND_CENTER_API_PATH)
      .expect(200);
    const care = response.body.cards.find(
      (card: { area: string }) => card.area === "care_requests",
    );
    const assisted = response.body.cards.find(
      (card: { area: string }) => card.area === "assisted_orders",
    );

    for (const card of [care, assisted]) {
      expect(card.source.state).toBe("unavailable");
      expect(card.primaryCount).toMatchObject({
        state: "unavailable",
        value: null,
      });
    }
    expect(JSON.stringify(response.body)).not.toContain("database detail");
    expect(JSON.stringify(response.body)).not.toContain(
      "pii-sentinel@example.invalid",
    );
    expect(response.body.cards).toHaveLength(13);
  });

  it("preserves bounded semantics and accepts an exact zero only from a successful source", async () => {
    const sources = successfulSources() as Record<string, any>;
    sources.referrals = async () => ({
      ...successfulSnapshot("referrals", 0),
      source: {
        state: "partial",
        authority: "Bounded referral source",
        observedAt: NOW.toISOString(),
      },
      primaryCount: boundedCount(
        "referrals.sample",
        "Observed referrals",
        100,
        "At least this many rows were returned by a capped source.",
      ),
      attention: {
        severity: "unknown",
        code: "bounded",
        reason: "The current source supplies a lower bound only.",
      },
    });
    sources.support = async () => successfulSnapshot("support", 0);

    const snapshot = await buildFounderCommandCenterSnapshot(sources, {
      now: () => NOW,
    });
    expect(snapshot.cards.find((card) => card.area === "referrals")?.primaryCount)
      .toMatchObject({ state: "bounded", value: 100 });
    expect(snapshot.cards.find((card) => card.area === "support")?.primaryCount)
      .toMatchObject({ state: "exact", value: 0 });
  });

  it("turns a timed-out source and malformed oldest timestamp into unavailable cards", async () => {
    const sources = successfulSources() as Record<string, any>;
    sources.applications = async () => new Promise(() => undefined);
    sources.care_requests = async () => ({
      ...successfulSnapshot("care_requests"),
      oldestWaiting: { state: "available", since: "not-a-timestamp" },
    });

    const snapshot = await buildFounderCommandCenterSnapshot(sources, {
      timeoutMs: 5,
      now: () => NOW,
    });
    expect(snapshot.cards.find((card) => card.area === "applications")?.source.state)
      .toBe("unavailable");
    expect(snapshot.cards.find((card) => card.area === "care_requests")?.source.state)
      .toBe("unavailable");
  });

  it("rejects query-driven scope changes and exposes no mutation route", async () => {
    const sources = successfulSources();
    await request(appFor(sources))
      .get(`${FOUNDER_COMMAND_CENTER_API_PATH}?status=open`)
      .expect(400, {
        ok: false,
        code: "command_center_query_not_supported",
      });
    await request(appFor(sources))
      .post(FOUNDER_COMMAND_CENTER_API_PATH)
      .send({ status: "closed" })
      .expect(404);
  });
});

describe("Founder Command Center endpoint with the real canonical admin guard", () => {
  const allowedEmail = "founder@command-center.example.invalid";

  function guardedApp() {
    const sources = Object.fromEntries(
      FOUNDER_COMMAND_CENTER_AREA_IDS.map((area) => [
        area,
        vi.fn(async (_context: FounderCommandCenterSourceContext) =>
          successfulSnapshot(area),
        ),
      ]),
    );
    const app = express();
    // Deliberately omit requireAdmin: this exercises the production default.
    registerFounderCommandCenterApi(app, sources, { now: () => NOW });
    return { app, sources };
  }

  function expectNoSourceReads(sources: ReturnType<typeof guardedApp>["sources"]) {
    for (const source of Object.values(sources)) {
      expect(source).not.toHaveBeenCalled();
    }
    expect(authEdge.getAdmin).not.toHaveBeenCalled();
  }

  function syntheticClaims(claims: Record<string, unknown>): string {
    // This is only a claims fixture, accepted by the mocked Auth edge below.
    // It is not a signed session and cannot authenticate against Supabase.
    return [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify(claims)).toString("base64url"),
      "synthetic-test-signature",
    ].join(".");
  }

  beforeEach(() => {
    authEdge.configured.mockReset().mockReturnValue(true);
    authEdge.getUser.mockReset();
    authEdge.getAdmin.mockClear();
    vi.stubEnv("ADMIN_EMAIL", allowedEmail);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([undefined, "Basic synthetic-credentials", "Bearer "])(
    "denies absent or malformed bearer authentication (%s) before any source read",
    async (authorization) => {
      const { app, sources } = guardedApp();
      const probe = request(app).get(FOUNDER_COMMAND_CENTER_API_PATH);
      if (authorization !== undefined) probe.set("Authorization", authorization);
      const response = await probe.expect(401);

      expect(response.body).toEqual({ success: false, message: "Unauthorized" });
      expect(response.headers["cache-control"]).toBe("no-store, max-age=0");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
      expect(authEdge.getUser).not.toHaveBeenCalled();
      expectNoSourceReads(sources);
    },
  );

  it.each(["member", "care_provider", "partner"])(
    "denies a verified %s identity even with client-supplied admin claims",
    async (persona) => {
      authEdge.getUser.mockResolvedValue({
        data: {
          user: {
            id: `synthetic-${persona}`,
            email: `${persona}@command-center.example.invalid`,
            role: "authenticated",
            app_metadata: { role: persona },
            user_metadata: { role: "admin", email: allowedEmail },
          },
        },
        error: null,
      });
      const { app, sources } = guardedApp();
      const bearer = syntheticClaims({ email: allowedEmail, role: "admin", amr: ["password"] });
      const response = await request(app)
        .get(FOUNDER_COMMAND_CENTER_API_PATH)
        .set("Authorization", `Bearer ${bearer}`)
        .set("X-Admin-Email", allowedEmail)
        .set("X-Role", "admin")
        .expect(403);

      expect(response.body).toEqual({ success: false, message: "Forbidden" });
      expect(authEdge.getUser).toHaveBeenCalledExactlyOnceWith(bearer);
      expectNoSourceReads(sources);
    },
  );

  it.each(["admin email missing", "auth service unconfigured"])(
    "fails closed when %s without contacting Auth or reading sources",
    async (condition) => {
      if (condition === "admin email missing") vi.stubEnv("ADMIN_EMAIL", " ");
      else authEdge.configured.mockReturnValue(false);
      const { app, sources } = guardedApp();
      const response = await request(app)
        .get(FOUNDER_COMMAND_CENTER_API_PATH)
        .set("Authorization", "Bearer synthetic-command-center-session")
        .expect(503);

      expect(response.body).toEqual({ success: false, message: "Admin access not configured" });
      expect(authEdge.getUser).not.toHaveBeenCalled();
      expectNoSourceReads(sources);
    },
  );

  it.each([
    ["missing user", { data: { user: null }, error: null }],
    ["missing data", { data: null, error: null }],
    ["rejected admin session", { data: { user: { email: allowedEmail } }, error: { message: "private auth failure" } }],
  ])("fails closed on %s without reading any projection", async (_label, reply) => {
    authEdge.getUser.mockResolvedValue(reply);
    const { app, sources } = guardedApp();
    const response = await request(app)
      .get(FOUNDER_COMMAND_CENTER_API_PATH)
      .set("Authorization", "Bearer synthetic-command-center-session")
      .expect(401);

    expect(response.body).toEqual({ success: false, message: "Unauthorized" });
    expect(authEdge.getUser).toHaveBeenCalledOnce();
    expectNoSourceReads(sources);
  });

  it("fails closed when Auth throws, without returning provider details or reading sources", async () => {
    authEdge.getUser.mockRejectedValue(new Error("synthetic provider outage"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { app, sources } = guardedApp();
    const response = await request(app)
      .get(FOUNDER_COMMAND_CENTER_API_PATH)
      .set("Authorization", "Bearer synthetic-command-center-session")
      .expect(401);

    expect(response.body).toEqual({ success: false, message: "Unauthorized" });
    expectNoSourceReads(sources);
  });

  it.each([
    ["recovery", ["otp"]],
    ["mixed recovery/password", [{ method: "recovery" }, { method: "password" }]],
    ["second-factor only", ["mfa/totp"]],
  ])("denies the allowed admin's %s session before reading sources", async (_label, amr) => {
    authEdge.getUser.mockResolvedValue({ data: { user: { email: allowedEmail } }, error: null });
    const { app, sources } = guardedApp();
    const bearer = syntheticClaims({ email: allowedEmail, amr });
    const response = await request(app)
      .get(FOUNDER_COMMAND_CENTER_API_PATH)
      .set("Authorization", `Bearer ${bearer}`)
      .expect(403);

    expect(response.body.code).toBe("recovery_session");
    expect(authEdge.getUser).toHaveBeenCalledExactlyOnceWith(bearer);
    expectNoSourceReads(sources);
  });

  it("reads all thirteen sources only for the configured, Auth-verified ordinary admin session", async () => {
    vi.stubEnv("ADMIN_EMAIL", `  ${allowedEmail.toUpperCase()}  `);
    const verifiedEmail = allowedEmail.toUpperCase();
    authEdge.getUser.mockResolvedValue({
      data: { user: { id: "synthetic-founder", email: verifiedEmail, role: "authenticated" } },
      error: null,
    });
    const { app, sources } = guardedApp();
    const bearer = syntheticClaims({ amr: ["password", "mfa/totp"] });
    const response = await request(app)
      .get(FOUNDER_COMMAND_CENTER_API_PATH)
      .set("Authorization", `Bearer ${bearer}`)
      .expect(200);

    expect(authEdge.getUser).toHaveBeenCalledExactlyOnceWith(bearer);
    expect(isFounderCommandCenterResponse(response.body)).toBe(true);
    expect(response.body.readOnly).toBe(true);
    expect(response.body.cards.map((card: { area: string }) => card.area)).toEqual(FOUNDER_COMMAND_CENTER_AREA_IDS);
    for (const source of Object.values(sources)) {
      expect(source).toHaveBeenCalledOnce();
      expect(source.mock.calls[0][0].request).toMatchObject({ adminEmail: verifiedEmail });
    }
    expect(authEdge.getAdmin).not.toHaveBeenCalled();
    expect(response.text).not.toContain(verifiedEmail);
    expect(response.text).not.toContain(bearer);
  });
});
