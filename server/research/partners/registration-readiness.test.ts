// xenios research: proving the partner registration seam edit BEFORE it is made.
//
// PR #204 merged sixteen partner API contracts into server/research/partners/, but
// none of them is registered, because registration is one call inside
// server/index.ts, whose content hash is pinned in the core-site protection
// manifest. Only the release authority can move that file and its hash in the same
// commit. So the portal is dark while the code is green.
//
// The existing suite (portal-routes.test.ts) proves the handlers with an Express
// DOUBLE: it records what was registered and invokes a handler function directly.
// That is the right unit test, and it cannot answer the question the release
// authority actually has, which is "if I paste this line into the pinned seam, does
// a real HTTP request work, and does it still refuse what it is supposed to refuse".
// A double never runs the guard middleware, never matches a path through Express's
// router, never parses a JSON body, and never 404s an unregistered method. Those
// are precisely the four ways a registration goes wrong.
//
// This file closes that gap. It mounts registerPartnerPortalApi into a REAL Express
// app the exact way server/index.ts would (same import, same dependency expression,
// same adaptGuard bridge copied from server/index.ts:209-213), then drives all
// sixteen contracts over real HTTP with supertest. What it proves:
//
//   MOUNTS          the production expression compiles and registers, using the
//                   real resolvePartnerPortalPort() / partnerSubmissionsEnabled().
//   ROUTE LIST      exactly sixteen paths, exactly the documented methods, and
//                   nothing else, read out of Express's own router stack.
//   AUTH ENFORCED   a request the guard rejects is answered by the guard, and the
//                   data port is NOT touched. Asserted with a spy count of 0, so a
//                   handler that ran before the guard cannot pass this file.
//   SCOPED          organization and event reads over real HTTP return only the
//                   acting partner's rows, including when an attacker plants a
//                   partner id in the body, the query, and the path.
//   NO LEAKAGE      the #204 assertions still hold at the HTTP layer: no other
//                   partner's names or ids, no wholesale ledger in an affiliate
//                   response, no-store and no-referrer on every answer.
//   READ ONLY       every write verb on the payout path is a real 404 from Express,
//                   not an absence in a recorded list.
//
// Nothing in this file edits or imports server/index.ts. It re-states that file's
// wiring locally so drift is caught here rather than at runtime, and the packet at
// docs/qa/PARTNER_REGISTRATION_PACKET.md carries the same lines for pasting.

import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARTNER_API } from "@/research/adapters/partner";
import {
  PARTNER_LEDGERS,
  createInMemoryPartnerPortalPort,
  type InMemoryPortalData,
  type PartnerPortalPort,
} from "./portal";
import { partnerSubmissionsEnabled, resolvePartnerPortalPort } from "./portal-production";
import { PARTNER_PORTAL_PATHS, registerPartnerPortalApi } from "./portal-routes";

// ---------------------------------------------------------------------------
// The seam, restated. These three fragments are byte-for-byte what the packet
// asks the release authority to paste into server/index.ts. If server/index.ts
// ever gains this wiring for real, this file keeps testing the same shape.
// ---------------------------------------------------------------------------

/** server/index.ts:209-213, copied verbatim. Same guard, awaited, return discarded. */
const adaptGuard =
  (guard: (req: Request, res: Response, next: NextFunction) => unknown) =>
  async (req: Request, res: Response, next: () => void): Promise<void> => {
    await guard(req, res, next as unknown as NextFunction);
  };

/** The dependency expression from the packet, unchanged. */
const productionDependencies = () => ({
  port: resolvePartnerPortalPort(),
  submissionsEnabled: partnerSubmissionsEnabled(),
});

// ---------------------------------------------------------------------------
// Fixtures. Two partners with disjoint organizations and events, so a scoping
// failure has somewhere visible to fail to.
// ---------------------------------------------------------------------------

const ALICE_MEMBER = "member_alice";
const BRUNO_MEMBER = "member_bruno";

const ALICE = {
  partnerId: "partner_alice",
  memberId: ALICE_MEMBER,
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
  memberId: BRUNO_MEMBER,
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
      {
        linkId: "l1",
        channel: "signed_link",
        campaign: "spring",
        createdAt: "2026-03-01T00:00:00.000Z",
        revokedAt: null,
      },
    ],
  },
  touches: { partner_alice: [{ channel: "signed_link", occurredAt: "2026-05-02T00:00:00.000Z" }] },
  conversions: { partner_alice: [{ convertedAt: "2026-05-10T00:00:00.000Z" }] },
  commissions: {
    partner_alice: [
      {
        id: "c1",
        state: "held",
        amountCents: 1250,
        reversesLedgerId: null,
        createdAt: "2026-05-10T00:00:00.000Z",
      },
    ],
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
    partner_alice: [
      { orgId: "org_a", name: "Northside Strength", state: "active", ownerPartnerId: "partner_alice" },
    ],
    partner_bruno: [{ orgId: "org_b", name: "Bruno Gym", state: "active", ownerPartnerId: "partner_bruno" }],
  },
  organizationEvents: [
    {
      eventId: "e1",
      organizationId: "org_a",
      name: "Launch night",
      campaign: "spring",
      startsAt: "2026-06-10T18:00:00.000Z",
    },
    { eventId: "e_secret", organizationId: "org_b", name: "Bruno private session", campaign: null, startsAt: null },
  ],
  contentSubmissions: {
    partner_alice: [
      { assetId: "a1", title: "Intro post", state: "submitted", createdAt: "2026-05-04T00:00:00.000Z" },
    ],
  },
};

/** The verb each of the sixteen contracts is published under. */
const CONTRACTS: ReadonlyArray<readonly ["get" | "post", string]> = [
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

// ---------------------------------------------------------------------------
// The unconfigured precondition, ESTABLISHED rather than inherited.
//
// Two blocks below call the real resolvePartnerPortalPort() / partnerSubmissionsEnabled(),
// which read ambient env: server/supabase.ts supabaseConfigured() is
// Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY). With those present the
// Supabase-backed port is built instead, and this file starts making real outbound
// calls:
//
//   * "answers partner_not_found honestly ... when Supabase is unconfigured" issues
//     sixteen live queries and times out at 5s, so the file is a false CI blocker in
//     any environment that carries those variables.
//   * "mounts with the production dependency expression" fires one request as a side
//     effect of construction alone: getSupabaseAdmin() runs its service-key self-test
//     (GET /auth/v1/admin/users). It is fire-and-forget, so that test still passes,
//     which is exactly why it needs pinning too. Its assertions hold under either
//     port; the outbound call is the defect, not the expectations.
//
// Passing by inheriting an unconfigured shell is an accidental pass. The same
// saved / deleted / restored pattern as partner-gateway-wall.test.ts:170-190 makes
// the precondition a fact of the test.
// ---------------------------------------------------------------------------

const SUPABASE_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const savedEnv: Partial<Record<(typeof SUPABASE_KEYS)[number], string>> = {};

beforeEach(() => {
  for (const key of SUPABASE_KEYS) {
    const value = process.env[key];
    if (value === undefined) delete savedEnv[key];
    else savedEnv[key] = value;
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of SUPABASE_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// ---------------------------------------------------------------------------
// Mounting helpers.
// ---------------------------------------------------------------------------

type MemberResolver = (req: Request) => Record<string, unknown> | null;

/**
 * A stand-in for the merged requireMember guard with the same contract: it
 * resolves a credential and either attaches `researchMember` and calls next(), or
 * answers 401 itself and never calls next(). `x-test-member` stands in for the
 * Supabase bearer so the test needs no JWT machinery.
 */
function memberGuard(resolve: MemberResolver) {
  return (req: Request, res: Response, next: NextFunction): unknown => {
    const member = resolve(req);
    if (member === null) {
      res.setHeader("x-test-guard", "member");
      return res.status(401).json({ ok: false, message: "Sign in required." });
    }
    (req as unknown as { researchMember?: Record<string, unknown> }).researchMember = member;
    return next();
  };
}

const bearerMember: MemberResolver = (req) => {
  const id = req.header("x-test-member");
  return typeof id === "string" && id.length > 0 ? { id } : null;
};

interface MountOptions {
  port?: PartnerPortalPort;
  submissionsEnabled?: boolean;
  resolve?: MemberResolver;
}

/**
 * Mounts the partner portal exactly as the packet's call site does, on a real
 * Express app with the same JSON body parser server/index.ts installs.
 */
function mount(options: MountOptions = {}) {
  const app = express();
  app.use(express.json());
  registerPartnerPortalApi(
    app,
    {
      port: options.port ?? createInMemoryPartnerPortalPort(DATA),
      submissionsEnabled: options.submissionsEnabled ?? false,
    },
    { requireMember: adaptGuard(memberGuard(options.resolve ?? bearerMember)) },
  );
  return app;
}

/** Reads Express's own router stack, so the route list is observed, not declared. */
function registeredRoutes(app: express.Express): Array<{ method: string; path: string }> {
  const stack = (app as unknown as { router?: { stack: unknown[] }; _router?: { stack: unknown[] } });
  const layers = (stack.router ?? stack._router)?.stack ?? [];
  const found: Array<{ method: string; path: string }> = [];
  for (const layer of layers as Array<{ route?: { path: string; methods: Record<string, boolean> } }>) {
    if (!layer.route) continue;
    for (const [method, enabled] of Object.entries(layer.route.methods)) {
      if (enabled) found.push({ method, path: layer.route.path });
    }
  }
  return found;
}

function send(app: express.Express, method: "get" | "post", path: string, member?: string, body: unknown = {}) {
  const agent = request(app);
  let pending = method === "get" ? agent.get(path) : agent.post(path);
  if (member !== undefined) pending = pending.set("x-test-member", member);
  return method === "get" ? pending : pending.send(body as object);
}

// ---------------------------------------------------------------------------

describe("the registration the release authority is being asked to make", () => {
  it("mounts with the production dependency expression the packet specifies", () => {
    // The real resolvers, not a fixture. This is the line the packet asks for, so
    // if resolvePartnerPortalPort or partnerSubmissionsEnabled ever changes shape,
    // the packet is wrong and this fails before anyone edits the pinned seam.
    //
    // PINNED, do not "simplify" the beforeEach away. Every assertion here holds
    // under either port, so this test looks environment-independent and is not:
    // with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set, resolvePartnerPortalPort()
    // builds the Supabase port, and getSupabaseAdmin()'s service-key self-test sends
    // a real GET /auth/v1/admin/users. It is fire-and-forget, so the test still
    // passes while the suite quietly talks to the network. The file-level beforeEach
    // deletes those two variables, so what is exercised is the resolver's SHAPE and
    // nothing leaves the process.
    const deps = productionDependencies();
    expect(typeof deps.port.findPartnerForMember).toBe("function");
    expect(typeof deps.submissionsEnabled).toBe("boolean");

    const app = express();
    app.use(express.json());
    expect(() =>
      registerPartnerPortalApi(app, deps, { requireMember: adaptGuard(memberGuard(bearerMember)) }),
    ).not.toThrow();
    expect(registeredRoutes(app)).toHaveLength(16);
  });

  it("publishes exactly the sixteen documented contracts, read out of the Express router", () => {
    const routes = registeredRoutes(mount())
      .map((r) => `${r.method.toUpperCase()} ${r.path}`)
      .sort();
    const expected = CONTRACTS.map(([method, path]) => `${method.toUpperCase()} ${path}`).sort();
    expect(routes).toEqual(expected);
    expect(routes).toHaveLength(16);
  });

  it("serves every partner path the client adapter calls that the commerce lane does not own", () => {
    // /partner/me, /dashboard, /apply and /links belong to
    // server/research/commerce/routes.ts and stay there.
    const commerceOwned = new Set([PARTNER_API.dashboard, PARTNER_API.apply, PARTNER_API.links]);
    const published = new Set(registeredRoutes(mount()).map((r) => r.path));
    const unserved = Object.entries(PARTNER_API).filter(
      ([, path]) => !published.has(path) && !commerceOwned.has(path),
    );
    expect(unserved).toEqual([]);
  });

  it("answers each contract over real HTTP once mounted, and 404s the same paths before mounting", async () => {
    const bare = express();
    bare.use(express.json());
    for (const [method, path] of CONTRACTS) {
      const before = await send(bare, method, path, ALICE_MEMBER);
      expect(before.status).toBe(404);

      const after = await send(mount(), method, path, ALICE_MEMBER);
      // The route exists and answered with one of its documented statuses. 503 is
      // the honest capability_disabled the request-style forms return; 500 would
      // be an unhandled crash and is not in the set.
      expect(after.status).not.toBe(404);
      expect([200, 400, 503]).toContain(after.status);
      expect(after.body).toHaveProperty("ok");
    }
  });
});

describe("partner auth is enforced before any data is read", () => {
  it("NEGATIVE: an anonymous request is answered by the guard and the data port is never called", async () => {
    for (const [method, path] of CONTRACTS) {
      const port = createInMemoryPartnerPortalPort(DATA);
      const spied: PartnerPortalPort = {
        ...port,
        findPartnerForMember: vi.fn(port.findPartnerForMember),
      };
      // No x-test-member header: the guard rejects, exactly as requireMember
      // rejects a request with no Supabase bearer.
      const response = await send(mount({ port: spied }), method, path);
      expect(response.status).toBe(401);
      expect(response.headers["x-test-guard"]).toBe("member");
      expect(response.body).toEqual({ ok: false, message: "Sign in required." });
      // The assertion that matters: the repository was not reached.
      expect(spied.findPartnerForMember).not.toHaveBeenCalled();
    }
  });

  it("NEGATIVE: a guard that admits a request without attaching a member still fails closed", async () => {
    // The wrong-role shape: something upstream let the request through, but there
    // is no authenticated member on it. Every route answers 403, never data.
    const admitEveryone: MemberResolver = () => ({});
    for (const [method, path] of CONTRACTS) {
      const response = await send(mount({ resolve: admitEveryone }), method, path, ALICE_MEMBER);
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ ok: false, code: "forbidden" });
    }
  });

  it("NEGATIVE: an authenticated member who owns no partner account gets partner_not_found, not data", async () => {
    for (const [method, path] of CONTRACTS) {
      const response = await send(mount(), method, path, "member_stranger");
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ ok: false, code: "partner_not_found" });
    }
  });

  it("marks every answer no-store and no-referrer over real HTTP", async () => {
    for (const [method, path] of CONTRACTS) {
      const response = await send(mount(), method, path, ALICE_MEMBER);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
    }
  });
});

describe("organization scoping holds over real HTTP", () => {
  it("NEGATIVE: partner B's request never returns partner A's organization", async () => {
    const response = await send(mount(), "get", PARTNER_PORTAL_PATHS.organizations, BRUNO_MEMBER);
    expect(response.status).toBe(200);
    expect(response.body.organizations).toEqual([
      { id: "org_b", name: "Bruno Gym", role: "Owner", status: "active" },
    ]);
    expect(response.text).not.toContain("Northside Strength");
    expect(response.text).not.toContain("org_a");
    expect(response.text).not.toContain("partner_alice");
  });

  it("NEGATIVE: partner B's request never returns partner A's events, and the reverse", async () => {
    const bruno = await send(mount(), "get", PARTNER_PORTAL_PATHS.events, BRUNO_MEMBER);
    expect(bruno.body.events.map((e: { id: string }) => e.id)).toEqual(["e_secret"]);
    expect(bruno.text).not.toContain("Launch night");

    const alice = await send(mount(), "get", PARTNER_PORTAL_PATHS.events, ALICE_MEMBER);
    expect(alice.body.events.map((e: { id: string }) => e.id)).toEqual(["e1"]);
    expect(alice.text).not.toContain("Bruno private session");
  });

  it("NEGATIVE: a partner id planted in the body, the query, and the path changes nothing", async () => {
    // The double could not prove this, because it never parsed a real body or a
    // real query string. Here Express populates req.body and req.query for real
    // and the answer is still scoped to the credential.
    const response = await request(mount())
      .post(`${PARTNER_PORTAL_PATHS.organizationRequest}?partnerId=partner_alice&organizationId=org_a`)
      .set("x-test-member", BRUNO_MEMBER)
      .send({ partnerId: "partner_alice", orgId: "org_a", memberId: ALICE_MEMBER });
    // The request form refuses honestly, and it refuses as BRUNO, never resolving
    // the planted partner.
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("capability_disabled");
    expect(response.text).not.toContain("partner_alice");

    const read = await request(mount())
      .get(`${PARTNER_PORTAL_PATHS.organizations}?partnerId=partner_alice&organizationId=org_a`)
      .set("x-test-member", BRUNO_MEMBER);
    expect(read.body.organizations).toEqual([
      { id: "org_b", name: "Bruno Gym", role: "Owner", status: "active" },
    ]);
  });

  it("NEGATIVE: a partner sees only their own commissions and payouts", async () => {
    const commissions = await send(mount(), "get", PARTNER_PORTAL_PATHS.commissions, BRUNO_MEMBER);
    expect(commissions.body.entries).toEqual([]);
    expect(commissions.text).not.toContain("1250");

    const payouts = await send(mount(), "get", PARTNER_PORTAL_PATHS.payouts, BRUNO_MEMBER);
    expect(payouts.body.payouts).toEqual([]);
    expect(payouts.body.method.configured).toBe(false);
    expect(payouts.text).not.toContain("4200");
  });
});

describe("the #204 leakage assertions still hold at the HTTP layer", () => {
  it("tags commissions as the affiliate ledger and never emits a wholesale entry", async () => {
    const response = await send(mount(), "get", PARTNER_PORTAL_PATHS.commissions, ALICE_MEMBER);
    expect(response.body.entries[0].ledger).toBe(PARTNER_LEDGERS.affiliateCommission);
    expect(response.text).not.toContain(PARTNER_LEDGERS.whiteLabelWholesale);
  });

  it("never puts a member identity or a supplier economics field in a partner response", async () => {
    // Counts and aggregates only. A member id, a cost, a multiplier, or a margin
    // in any of these payloads is a leak, so the whole set is swept at once.
    const forbidden = ["memberId", "member_id", ALICE_MEMBER, BRUNO_MEMBER, "supplierCost", "multiplier", "margin"];
    for (const [method, path] of CONTRACTS) {
      const response = await send(mount(), method, path, ALICE_MEMBER);
      for (const needle of forbidden) {
        expect(response.text ?? "").not.toContain(needle);
      }
    }
  });
});

describe("payouts stay read only after mounting", () => {
  it("NEGATIVE: every write verb on the payout path is a real 404 from Express", async () => {
    const app = mount();
    for (const verb of ["post", "put", "patch", "delete"] as const) {
      const response = await (request(app) as never as Record<string, (p: string) => never>)
        [verb](PARTNER_PORTAL_PATHS.payouts) as unknown as { status: number };
      expect(response.status).toBe(404);
    }
  });

  it("registers no non-GET route outside the four request-style forms", () => {
    const writes = registeredRoutes(mount())
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

describe("the request-style forms refuse honestly rather than reporting a false success", () => {
  it.each([
    ["campaign", PARTNER_PORTAL_PATHS.campaignRequest],
    ["event", PARTNER_PORTAL_PATHS.eventRequest],
    ["organization", PARTNER_PORTAL_PATHS.organizationRequest],
  ])("a %s request answers capability_disabled over HTTP", async (_label, path) => {
    const response = await send(mount(), "post", path, ALICE_MEMBER, { name: "Anything" });
    expect(response.status).toBe(503);
    expect(response.body.ok).toBe(false);
    expect(response.body.code).toBe("capability_disabled");
    expect(response.body.message).toContain("nothing was submitted");
  });

  it("a compliance submission is refused when there is no durable store", async () => {
    const response = await send(mount({ submissionsEnabled: false }), "post", PARTNER_PORTAL_PATHS.complianceSubmissions, ALICE_MEMBER, {
      title: "A reel",
      description: "About the program.",
    });
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("capability_disabled");
  });

  it("a compliance submission is accepted and read back when storage is available", async () => {
    // One app across both calls, so the write and the read share a port.
    const app = mount({
      port: createInMemoryPartnerPortalPort({ ...DATA, writesEnabled: true, contentSubmissions: {} }),
      submissionsEnabled: true,
    });
    const posted = await request(app)
      .post(PARTNER_PORTAL_PATHS.complianceSubmissions)
      .set("x-test-member", ALICE_MEMBER)
      .send({ title: "A reel", description: "About the program.", link: "https://example.test/x" });
    expect(posted.status).toBe(200);
    expect(posted.body.ok).toBe(true);

    const listed = await send(app, "get", PARTNER_PORTAL_PATHS.compliance, ALICE_MEMBER);
    expect(listed.body.submissions.map((s: { title: string }) => s.title)).toEqual(["A reel"]);

    // Another partner's list is untouched by that write.
    const other = await send(app, "get", PARTNER_PORTAL_PATHS.compliance, BRUNO_MEMBER);
    expect(other.body.submissions).toEqual([]);
  });

  it("refuses an incomplete submission body with a 400 rather than storing a blank row", async () => {
    const app = mount({
      port: createInMemoryPartnerPortalPort({ ...DATA, writesEnabled: true, contentSubmissions: {} }),
      submissionsEnabled: true,
    });
    const response = await request(app)
      .post(PARTNER_PORTAL_PATHS.complianceSubmissions)
      .set("x-test-member", ALICE_MEMBER)
      .send({ title: "   ", description: "" });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("forbidden");
  });
});

describe("what the release authority will actually see on the first deploy", () => {
  it("answers partner_not_found honestly on every contract when Supabase is unconfigured", async () => {
    // The file-level beforeEach has DELETED SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY,
    // so "unconfigured" is a fact this test establishes rather than a property of
    // whatever shell it happens to run in. resolvePartnerPortalPort() therefore
    // returns the unconfigured port, which is the state of any environment that has
    // not wired the database. Nothing is fabricated: every surface says the member
    // owns no partner account, which the pages render as their prepared-state copy.
    // Nothing here reaches the network: with the credentials present this loop used
    // to issue sixteen live queries and time out at five seconds.
    const app = mount({ port: resolvePartnerPortalPort(), submissionsEnabled: partnerSubmissionsEnabled() });
    for (const [method, path] of CONTRACTS) {
      const response = await send(app, method, path, ALICE_MEMBER);
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ ok: false, code: "partner_not_found" });
    }
  });
});
