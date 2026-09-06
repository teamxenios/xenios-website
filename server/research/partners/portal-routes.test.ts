import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { PARTNER_API } from "@/research/adapters/partner";
import { RESOURCE_HUB_PARTNER_DOWNLOAD_PATH, RESOURCE_HUB_PARTNER_LIBRARY_PATH } from "@shared/research/resource-hub/contract";
import { createMemoryResourceBytesStore } from "../resource-hub/bytes-store";
import { createResourceHubService, type ResourceHubService } from "../resource-hub/service";
import { createInMemoryResourceHubStore } from "../resource-hub/store";
import { PARTNER_LEDGERS, createInMemoryPartnerPortalPort, type InMemoryPortalData } from "./portal";
import { PARTNER_PORTAL_PATHS, memberIdOf, parseSubmission, registerPartnerPortalApi } from "./portal-routes";

// ---------------------------------------------------------------------------
// Minimal Express double, matching the shape the commerce route tests use: it
// records what was registered and lets a test invoke one route directly.
// ---------------------------------------------------------------------------

type Handler = (req: Request, res: Response, next?: () => void) => unknown;

interface Registered {
  method: string;
  path: string;
  guard: Handler;
  handler: Handler;
}

function fakeApp() {
  const routes: Registered[] = [];
  const add = (method: string) => (path: string, guard: Handler, handler: Handler) => {
    routes.push({ method, path, guard, handler });
  };
  return {
    app: { get: add("get"), post: add("post"), patch: add("patch"), delete: add("delete"), put: add("put") } as never,
    routes,
  };
}

function fakeRes() {
  const captured = { status: 200, body: undefined as any, headers: {} as Record<string, string>, sent: null as Buffer | null };
  const res = {
    set(key: string, value: string) {
      captured.headers[key] = value;
      return res;
    },
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
    send(payload: Buffer) {
      captured.sent = payload;
      return res;
    },
  };
  return { res: res as unknown as Response, captured };
}

function reqWith(member: Record<string, unknown> | undefined, body: unknown = {}): Request {
  return { researchMember: member, params: {}, body, query: {}, headers: {} } as unknown as Request;
}

const ALICE = {
  partnerId: "partner_alice",
  memberId: "member_alice",
  role: "research_rep" as const,
  state: "active" as const,
  identityVerified: true,
  taxStatus: "verified" as const,
  payoutStatus: "verified" as const,
  certifiedAt: "2026-05-01T00:00:00.000Z",
  activatedAt: "2026-05-02T00:00:00.000Z",
};

const BRUNO = {
  partnerId: "partner_bruno",
  memberId: "member_bruno",
  role: "affiliate" as const,
  state: "active" as const,
  identityVerified: false,
  taxStatus: "not_started" as const,
  payoutStatus: "not_started" as const,
  certifiedAt: null,
  activatedAt: null,
};

const DATA: InMemoryPortalData = {
  partners: [ALICE, BRUNO],
  links: {
    partner_alice: [
      { linkId: "l1", channel: "signed_link", campaign: "spring", createdAt: "2026-03-01T00:00:00.000Z", revokedAt: null },
    ],
  },
  touches: { partner_alice: [{ channel: "signed_link", occurredAt: "2026-05-02T00:00:00.000Z" }] },
  conversions: { partner_alice: [{ convertedAt: "2026-05-10T00:00:00.000Z" }] },
  commissions: {
    partner_alice: [{ id: "c1", state: "held", amountCents: 1250, reversesLedgerId: null, createdAt: "2026-05-10T00:00:00.000Z" }],
  },
  payoutBatches: {
    partner_alice: [
      {
        batchId: "b1",
        totalCents: 4200,
        state: "settled",
        providerName: "stripe_connect",
        builtAt: "2026-06-01T00:00:00.000Z",
        settledAt: "2026-06-03T00:00:00.000Z",
      },
    ],
  },
  organizations: {
    partner_alice: [{ orgId: "org_a", name: "Northside Strength", state: "active", ownerPartnerId: "partner_alice" }],
    partner_bruno: [{ orgId: "org_b", name: "Bruno Gym", state: "active", ownerPartnerId: "partner_bruno" }],
  },
  organizationEvents: [
    { eventId: "e1", organizationId: "org_a", name: "Launch night", campaign: "spring", startsAt: "2026-06-10T18:00:00.000Z" },
    { eventId: "e_secret", organizationId: "org_b", name: "Bruno private session", campaign: null, startsAt: null },
  ],
  contentSubmissions: {
    partner_alice: [{ assetId: "a1", title: "Intro post", state: "submitted", createdAt: "2026-05-04T00:00:00.000Z" }],
  },
};

function register(overrides: InMemoryPortalData = {}, submissionsEnabled = false, resourceHub?: ResourceHubService) {
  const { app, routes } = fakeApp();
  registerPartnerPortalApi(
    app,
    { port: createInMemoryPartnerPortalPort({ ...DATA, ...overrides }), submissionsEnabled, resourceHub: resourceHub ?? emptyResourceHub() },
    { requireMember: (_req, _res, next) => next() },
  );
  return routes;
}

// A Resource Hub with nothing published: the library answers empty and every
// delivery is not found, which is also what production answers while dark.
function emptyResourceHub(): ResourceHubService {
  return createResourceHubService({
    store: createInMemoryResourceHubStore(),
    bytes: createMemoryResourceBytesStore(),
    now: () => new Date(0),
    newId: () => "id",
  });
}

function route(routes: Registered[], method: string, path: string): Registered {
  const found = routes.find((r) => r.method === method && r.path === path);
  if (!found) throw new Error(`no ${method.toUpperCase()} route registered for ${path}`);
  return found;
}

// `member` takes null for "no authenticated member". An explicit `undefined`
// would re-trigger the default parameter, which is exactly how a fail-closed
// assertion silently turns into a signed-in one.
async function call(
  routes: Registered[],
  method: string,
  path: string,
  member: Record<string, unknown> | null = { id: "member_alice" },
  body: unknown = {},
) {
  const { res, captured } = fakeRes();
  await route(routes, method, path).handler(reqWith(member ?? undefined, body), res);
  return captured;
}

// ---------------------------------------------------------------------------

describe("the partner adapter has no dead calls", () => {
  // The five partner paths the commerce lane already publishes
  // (server/research/commerce/routes.ts, "G8 partner portal"). Listed here so the
  // coverage assertion below is over EVERY path the UI can call, not only this
  // module's. /partner/me is served there and is not in the client adapter.
  const COMMERCE_OWNED = new Set([
    "/api/research/partner/me",
    "/api/research/partner/dashboard",
    "/api/research/partner/apply",
    "/api/research/partner/links",
  ]);

  it("every path in the client's PARTNER_API is served by a registered route", () => {
    const published = new Set(register().map((r) => r.path));
    const unserved = Object.entries(PARTNER_API).filter(
      ([, path]) => !published.has(path) && !COMMERCE_OWNED.has(path),
    );
    expect(unserved).toEqual([]);
  });

  it("publishes exactly the sixteen paths the commerce lane left unserved plus the resource delivery door, and nothing else", () => {
    const paths = register().map((r) => r.path).sort();
    expect(paths).toEqual(Object.values(PARTNER_PORTAL_PATHS).slice().sort());
    // Sixteen inherited read/request doors plus the Resource Hub's one
    // authorized delivery door (GET .../resources/:resourceId/download).
    expect(paths).toHaveLength(17);
    // No overlap with the paths another module owns.
    paths.forEach((path) => expect(COMMERCE_OWNED.has(path)).toBe(false));
  });

  it("keeps the resource paths identical to the shared resource-hub contract", () => {
    expect(PARTNER_PORTAL_PATHS.resources).toBe(RESOURCE_HUB_PARTNER_LIBRARY_PATH);
    expect(PARTNER_PORTAL_PATHS.resourceDownload).toBe(RESOURCE_HUB_PARTNER_DOWNLOAD_PATH);
  });

  it("uses the method the client actually calls on each path", () => {
    const routes = register();
    const method = (path: string) => routes.find((r) => r.path === path)?.method;
    expect(method(PARTNER_API.leads)).toBe("get");
    expect(method(PARTNER_API.commissions)).toBe("get");
    expect(method(PARTNER_API.payouts)).toBe("get");
    expect(method(PARTNER_API.securitySessions)).toBe("get");
    expect(method(PARTNER_API.campaignRequest)).toBe("post");
    expect(method(PARTNER_API.eventRequest)).toBe("post");
    expect(method(PARTNER_API.organizationRequest)).toBe("post");
    expect(method(PARTNER_API.complianceSubmissions)).toBe("post");
  });
});

describe("payouts are read only", () => {
  it("registers no write of any kind on the payout path", () => {
    const payoutRoutes = register().filter((r) => r.path.includes("payout"));
    expect(payoutRoutes.map((r) => r.method)).toEqual(["get"]);
  });

  it("registers no non-GET route outside the four request-style forms", () => {
    const writes = register()
      .filter((r) => r.method !== "get")
      .map((r) => r.path)
      .sort();
    expect(writes).toEqual(
      [
        PARTNER_PORTAL_PATHS.campaignRequest,
        PARTNER_PORTAL_PATHS.complianceSubmissions,
        PARTNER_PORTAL_PATHS.eventRequest,
        PARTNER_PORTAL_PATHS.organizationRequest,
      ].sort(),
    );
  });
});

describe("authentication and partner resolution", () => {
  it("puts the member guard in front of every route", () => {
    const routes = register();
    expect(routes.every((r) => typeof r.guard === "function")).toBe(true);
    expect(routes).toHaveLength(17);
  });

  it("fails closed with no authenticated member", async () => {
    const routes = register();
    for (const path of Object.values(PARTNER_PORTAL_PATHS)) {
      const method = routes.find((r) => r.path === path)!.method;
      const captured = await call(routes, method, path, null);
      expect(captured.status).toBe(403);
      expect(captured.body).toMatchObject({ ok: false, code: "forbidden" });
    }
  });

  it("answers partner_not_found for a member who owns no partner account", async () => {
    const captured = await call(register(), "get", PARTNER_PORTAL_PATHS.commissions, { id: "member_stranger" });
    expect(captured.status).toBe(404);
    expect(captured.body).toEqual({ ok: false, code: "partner_not_found" });
  });

  it("reads the acting member only from the guard's attachment", () => {
    expect(memberIdOf(reqWith({ id: "m1" }))).toBe("m1");
    expect(memberIdOf(reqWith({ member_id: "m2" }))).toBe("m2");
    expect(memberIdOf(reqWith(undefined))).toBeNull();
    expect(memberIdOf(reqWith({ id: 42 }))).toBeNull();
    // A body cannot supply an identity.
    expect(memberIdOf(reqWith(undefined, { memberId: "m3", partnerId: "p1" }))).toBeNull();
  });

  it("marks every response no-store", async () => {
    const captured = await call(register(), "get", PARTNER_PORTAL_PATHS.onboarding);
    expect(captured.headers["Cache-Control"]).toBe("no-store");
    expect(captured.headers["Referrer-Policy"]).toBe("no-referrer");
  });

  it("answers a storage failure as a capability that is not reachable, never as data", async () => {
    const { app, routes } = fakeApp();
    const base = createInMemoryPartnerPortalPort(DATA);
    registerPartnerPortalApi(
      app,
      {
        port: {
          ...base,
          async commissionsFor() {
            throw new Error("connection lost");
          },
        },
        submissionsEnabled: false,
      },
      { requireMember: (_req, _res, next) => next() },
    );
    const captured = await call(routes, "get", PARTNER_PORTAL_PATHS.commissions);
    expect(captured.status).toBe(503);
    expect(captured.body).toMatchObject({ ok: false, code: "capability_disabled" });
  });
});

describe("cross-organization access is denied over HTTP", () => {
  it("NEGATIVE: partner B's request never returns partner A's organization", async () => {
    const routes = register();
    const bruno = await call(routes, "get", PARTNER_PORTAL_PATHS.organizations, { id: "member_bruno" });
    expect(bruno.body.organizations).toEqual([
      { id: "org_b", name: "Bruno Gym", role: "Owner", status: "active" },
    ]);
    expect(JSON.stringify(bruno.body)).not.toContain("Northside Strength");
    expect(JSON.stringify(bruno.body)).not.toContain("org_a");
  });

  it("NEGATIVE: partner B's request never returns partner A's events", async () => {
    const routes = register();
    const bruno = await call(routes, "get", PARTNER_PORTAL_PATHS.events, { id: "member_bruno" });
    expect(bruno.body.events.map((e: { id: string }) => e.id)).toEqual(["e_secret"]);
    expect(JSON.stringify(bruno.body)).not.toContain("Launch night");

    const alice = await call(routes, "get", PARTNER_PORTAL_PATHS.events, { id: "member_alice" });
    expect(alice.body.events.map((e: { id: string }) => e.id)).toEqual(["e1"]);
    expect(JSON.stringify(alice.body)).not.toContain("Bruno private session");
  });

  it("NEGATIVE: a partner id planted in the body or query changes nothing", async () => {
    const routes = register();
    const { res, captured } = fakeRes();
    const planted = {
      researchMember: { id: "member_bruno" },
      params: { partnerId: "partner_alice" },
      query: { partnerId: "partner_alice", organizationId: "org_a" },
      body: { partnerId: "partner_alice", orgId: "org_a" },
      headers: {},
    } as unknown as Request;
    await route(routes, "get", PARTNER_PORTAL_PATHS.organizations).handler(planted, res);
    expect(captured.body.organizations).toEqual([
      { id: "org_b", name: "Bruno Gym", role: "Owner", status: "active" },
    ]);
  });

  it("NEGATIVE: a partner sees only their own commissions and payouts", async () => {
    const routes = register();
    const bruno = await call(routes, "get", PARTNER_PORTAL_PATHS.commissions, { id: "member_bruno" });
    expect(bruno.body.entries).toEqual([]);
    const brunoPayouts = await call(routes, "get", PARTNER_PORTAL_PATHS.payouts, { id: "member_bruno" });
    expect(brunoPayouts.body.payouts).toEqual([]);
    expect(brunoPayouts.body.method.configured).toBe(false);
  });
});

describe("ledger separation", () => {
  it("tags commission entries as the affiliate ledger and never emits a wholesale entry", async () => {
    const captured = await call(register(), "get", PARTNER_PORTAL_PATHS.commissions);
    expect(captured.body.entries[0].ledger).toBe(PARTNER_LEDGERS.affiliateCommission);
    expect(JSON.stringify(captured.body)).not.toContain(PARTNER_LEDGERS.whiteLabelWholesale);
  });
});

describe("request-style forms refuse honestly", () => {
  it.each([
    ["campaign", PARTNER_PORTAL_PATHS.campaignRequest],
    ["event", PARTNER_PORTAL_PATHS.eventRequest],
    ["organization", PARTNER_PORTAL_PATHS.organizationRequest],
  ])("%s requests answer capability_disabled instead of a false success", async (_label, path) => {
    const captured = await call(register(), "post", path, { id: "member_alice" }, { name: "Anything" });
    expect(captured.status).toBe(503);
    expect(captured.body.ok).toBe(false);
    expect(captured.body.code).toBe("capability_disabled");
    expect(captured.body.message).toContain("nothing was submitted");
  });
});

describe("compliance submissions", () => {
  it("refuses with capability_disabled when there is no durable store", async () => {
    const captured = await call(
      register(),
      "post",
      PARTNER_PORTAL_PATHS.complianceSubmissions,
      { id: "member_alice" },
      { title: "A reel", description: "About the program." },
    );
    expect(captured.status).toBe(503);
    expect(captured.body.code).toBe("capability_disabled");
  });

  it("accepts a valid submission when storage is available and shows it back", async () => {
    const routes = register({ writesEnabled: true, contentSubmissions: {} }, true);
    const posted = await call(
      routes,
      "post",
      PARTNER_PORTAL_PATHS.complianceSubmissions,
      { id: "member_alice" },
      { title: "A reel", description: "About the program.", link: "https://example.test/x" },
    );
    expect(posted.status).toBe(200);
    expect(posted.body.ok).toBe(true);
    const listed = await call(routes, "get", PARTNER_PORTAL_PATHS.compliance, { id: "member_alice" });
    expect(listed.body.submissions.map((s: { title: string }) => s.title)).toEqual(["A reel"]);
    // Another partner's list is untouched.
    const other = await call(routes, "get", PARTNER_PORTAL_PATHS.compliance, { id: "member_bruno" });
    expect(other.body.submissions).toEqual([]);
  });

  it("refuses an incomplete body with a 400 rather than storing a blank submission", async () => {
    const routes = register({ writesEnabled: true, contentSubmissions: {} }, true);
    const captured = await call(
      routes,
      "post",
      PARTNER_PORTAL_PATHS.complianceSubmissions,
      { id: "member_alice" },
      { title: "   ", description: "" },
    );
    expect(captured.status).toBe(400);
    expect(captured.body.code).toBe("forbidden");
  });

  it("reads only the named fields from a submission body", () => {
    expect(parseSubmission({ title: " A ", description: " B ", link: " http://x ", state: "preapproved" })).toEqual({
      title: "A",
      description: "B",
      link: "http://x",
    });
    expect(parseSubmission({ title: "A", description: "B", link: "   " })).toEqual({
      title: "A",
      description: "B",
      link: null,
    });
    expect(parseSubmission({ title: "A" })).toBeNull();
    expect(parseSubmission(null)).toBeNull();
    expect(parseSubmission({ title: "A".repeat(201), description: "B" })).toBeNull();
    expect(parseSubmission({ title: "A", description: "B".repeat(5001) })).toBeNull();
  });
});

describe("every read surface answers with the shape its page reads", () => {
  it("returns the documented payload keys", async () => {
    const routes = register();
    const expected: Array<[string, string]> = [
      [PARTNER_PORTAL_PATHS.onboarding, "agreements"],
      [PARTNER_PORTAL_PATHS.training, "modules"],
      [PARTNER_PORTAL_PATHS.leads, "rows"],
      [PARTNER_PORTAL_PATHS.conversions, "rows"],
      [PARTNER_PORTAL_PATHS.commissions, "entries"],
      [PARTNER_PORTAL_PATHS.payouts, "payouts"],
      [PARTNER_PORTAL_PATHS.resources, "resources"],
      [PARTNER_PORTAL_PATHS.campaigns, "campaigns"],
      [PARTNER_PORTAL_PATHS.events, "events"],
      [PARTNER_PORTAL_PATHS.organizations, "organizations"],
      [PARTNER_PORTAL_PATHS.compliance, "submissions"],
      [PARTNER_PORTAL_PATHS.securitySessions, "sessions"],
    ];
    for (const [path, key] of expected) {
      const captured = await call(routes, "get", path);
      expect(captured.status).toBe(200);
      expect(captured.body.ok).toBe(true);
      expect(Array.isArray(captured.body[key])).toBe(true);
    }
  });

  it("leaks no commercial or administrative field on any served surface", async () => {
    const routes = register();
    const bodies: unknown[] = [];
    for (const path of Object.values(PARTNER_PORTAL_PATHS)) {
      const registered = routes.find((r) => r.path === path)!;
      bodies.push((await call(routes, registered.method, path)).body);
    }
    const serialized = JSON.stringify(bodies).toLowerCase();
    ["suppliercost", "supplier_cost", "multiplier", "margin", "wholesale", "cost_cents", "legal_name", "contact_email", "internal_notes", "subject_key"].forEach(
      (field) => {
        expect(serialized).not.toContain(field);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Resource Hub integration: the library door is role-scoped and the delivery
// door re-checks entitlement at use time (RES-01..10 subset at the HTTP seam).
// ---------------------------------------------------------------------------

describe("the resource library and delivery doors", () => {
  const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n", "latin1");

  async function hubWithPublished(audience: Array<"all_partners" | "research_rep" | "affiliate">, usagePolicy: "external_share" | "private" | "draft" = "external_share") {
    let n = 0;
    const hub = createResourceHubService({
      store: createInMemoryResourceHubStore(),
      bytes: createMemoryResourceBytesStore(),
      now: () => new Date(Date.UTC(2026, 8, 6, 12, 0, n)),
      newId: () => `id-${++n}`,
    });
    const created = await hub.createVersion("admin@xenios.test", {
      title: "Partner introduction one-pager",
      purpose: "A one-page introduction a partner may hand to a prospective member.",
      usagePolicy,
      audience,
      originalFilename: "intro.pdf",
      idempotencyKey: "upload-key-0001",
    }, { bytes: new Uint8Array(PDF), contentType: "application/pdf" });
    if (!created.ok) throw new Error("fixture upload failed");
    const resourceId = created.resource.resourceId;
    const versionId = created.resource.versions[0]!.versionId;
    await hub.review("admin@xenios.test", resourceId, versionId, { action: "approve_content", reason: "ok", idempotencyKey: "review-a1" });
    const published = await hub.review("admin@xenios.test", resourceId, versionId, { action: "publish", idempotencyKey: "review-p1" });
    if (!published.ok) throw new Error("fixture publish failed");
    return { hub, resourceId };
  }

  async function download(routes: Registered[], member: Record<string, unknown> | null, resourceId: string) {
    const { res, captured } = fakeRes();
    const request = { ...reqWith(member ?? undefined), params: { resourceId } } as unknown as Request;
    await route(routes, "get", PARTNER_PORTAL_PATHS.resourceDownload).handler(request, res);
    return captured;
  }

  it("lists a published resource to a role in its audience and to nobody else", async () => {
    const { hub, resourceId } = await hubWithPublished(["research_rep"]);
    const routes = register({}, false, hub);
    const alice = await call(routes, "get", PARTNER_PORTAL_PATHS.resources, { id: "member_alice" });
    expect(alice.status).toBe(200);
    expect(alice.body.ok).toBe(true);
    expect(alice.body.resources).toHaveLength(1);
    expect(alice.body.resources[0]).toMatchObject({
      resourceId,
      usagePolicy: "external_share",
      actions: { read: true, download: true, share: false },
      downloadPath: `/api/research/partner/resources/${resourceId}/download`,
    });
    expect(typeof alice.body.asOf).toBe("string");
    expect(alice.headers["Cache-Control"]).toBe("no-store");
    const bruno = await call(routes, "get", PARTNER_PORTAL_PATHS.resources, { id: "member_bruno" });
    expect(bruno.status).toBe(200);
    expect(bruno.body.resources).toEqual([]);
  });

  it("an empty hub answers an empty library, never an error", async () => {
    const captured = await call(register(), "get", PARTNER_PORTAL_PATHS.resources);
    expect(captured.status).toBe(200);
    expect(captured.body).toMatchObject({ ok: true, resources: [] });
  });

  it("a suspended partner sees an empty library", async () => {
    const { hub } = await hubWithPublished(["all_partners"]);
    const routes = register({ partners: [{ ...ALICE, state: "suspended" }, BRUNO] }, false, hub);
    const captured = await call(routes, "get", PARTNER_PORTAL_PATHS.resources, { id: "member_alice" });
    expect(captured.status).toBe(200);
    expect(captured.body.resources).toEqual([]);
  });

  it("streams the bytes to an entitled partner with no-store and an id-only filename", async () => {
    const { hub, resourceId } = await hubWithPublished(["research_rep"]);
    const routes = register({}, false, hub);
    const captured = await download(routes, { id: "member_alice" }, resourceId);
    expect(captured.status).toBe(200);
    expect(captured.headers["Content-Type"]).toBe("application/pdf");
    expect(captured.headers["Content-Disposition"]).toBe(`attachment; filename="${resourceId}-v1.pdf"`);
    expect(captured.headers["Cache-Control"]).toBe("no-store");
    expect(captured.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(captured.sent?.equals(PDF)).toBe(true);
  });

  it("answers 404 (not 403) to a partner outside the audience, and 403 to no member", async () => {
    const { hub, resourceId } = await hubWithPublished(["research_rep"]);
    const routes = register({}, false, hub);
    const bruno = await download(routes, { id: "member_bruno" }, resourceId);
    expect(bruno.status).toBe(404);
    expect(bruno.body).toMatchObject({ ok: false, code: "not_found" });
    expect(bruno.sent).toBeNull();
    const nobody = await download(routes, null, resourceId);
    expect(nobody.status).toBe(403);
    expect(nobody.sent).toBeNull();
    const stranger = await download(routes, { id: "member_nobody" }, resourceId);
    expect(stranger.status).toBe(404);
    expect(stranger.body).toMatchObject({ ok: false, code: "partner_not_found" });
  });

  it("answers 404 for an unknown resource and for a draft-policy version (which can never be published)", async () => {
    const { hub, resourceId } = await hubWithPublished(["all_partners"]);
    const routes = register({}, false, hub);
    const draft = await hub.createVersion(
      "admin@xenios.test",
      {
        title: "Draft outreach script",
        purpose: "Not approved material; admin or assigned reviewer only.",
        usagePolicy: "draft",
        audience: ["all_partners"],
        originalFilename: "draft.pdf",
        idempotencyKey: "upload-key-0002",
      },
      { bytes: new Uint8Array(PDF), contentType: "application/pdf" },
    );
    if (!draft.ok) throw new Error("fixture draft upload failed");
    const draftId = draft.resource.resourceId;
    const draftVersion = draft.resource.versions[0]!.versionId;
    await hub.review("admin@xenios.test", draftId, draftVersion, { action: "approve_content", reason: "ok", idempotencyKey: "review-d1" });
    expect(await hub.review("admin@xenios.test", draftId, draftVersion, { action: "publish", idempotencyKey: "review-d2" })).toMatchObject({ ok: false, code: "resource_state_conflict" });
    expect((await download(routes, { id: "member_alice" }, draftId)).status).toBe(404);
    expect((await download(routes, { id: "member_alice" }, "id-none")).status).toBe(404);
    expect((await download(routes, { id: "member_alice" }, resourceId)).status).toBe(200);
  });

  it("serializes no storage key, admin identity, or review reason on either door", async () => {
    const { hub, resourceId } = await hubWithPublished(["all_partners"]);
    const routes = register({}, false, hub);
    const library = JSON.stringify((await call(routes, "get", PARTNER_PORTAL_PATHS.resources)).body);
    const denied = JSON.stringify((await download(routes, { id: "member_bruno" }, "id-none")).body);
    for (const forbidden of ["storageKey", "resource-library/", "admin@xenios.test", "reviewReason", "uploadIdempotencyKey"]) {
      expect(library, forbidden).not.toContain(forbidden);
      expect(denied, forbidden).not.toContain(forbidden);
    }
    expect(library).toContain(resourceId);
  });
});
