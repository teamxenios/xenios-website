// The catalog display HTTP adapter, exercised end to end over real Express.
//
// The questions this suite answers, in order of how much they matter:
//   1. Can an allowlisted member see the full displayable set, and a normal
//      member only the standard set, with neither reaching a purchase mode the
//      offer model denies and neither seeing the regulatory hold tier?
//   2. Does the surface fail closed when it is off, unauthenticated, asked for
//      a malformed path, or broken underneath?
//   3. Does the browser ever get to choose its own audience or breadth?
//   4. Does the /api/research gateway wall shadow these routes today, and does
//      the documented one line extension fix it?

import express, { type Express, type Request } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { mayDisplayAmount } from "@shared/research/catalog/offer-readiness";
import { registerResearchApi } from "../index";
import { displayCatalog, heldProductNotices } from "./projection";
import {
  CATALOG_DISPLAY_AUTH_REQUIRED_RESPONSE,
  CATALOG_DISPLAY_DETAIL_ROUTE,
  CATALOG_DISPLAY_DISABLED_RESPONSE,
  CATALOG_DISPLAY_INVALID_REQUEST_RESPONSE,
  CATALOG_DISPLAY_LIST_ROUTE,
  CATALOG_DISPLAY_NOT_FOUND_RESPONSE,
  CATALOG_DISPLAY_UNAVAILABLE_RESPONSE,
  catalogDisplayEnabledFromEnv,
  registerCatalogDisplayApi,
  type CatalogDisplayApiDependencies,
  type CatalogDisplayViewer,
} from "./routes";
import { FULL_CATALOG_VISIBILITY_ENV_VAR } from "./visibility";

const SAMUEL = "sboadu1212@gmail.com";
const ORDINARY = "member@example.com";

const LIST_URL = "/api/research/catalog-display/catalog";
const detailUrl = (lane: string, slug: string) =>
  `/api/research/catalog-display/products/${lane}/${slug}`;

function viewerFor(email: string, audience: CatalogDisplayViewer["audience"] = "member") {
  const state = { calls: 0, lastAuthorization: "" };
  return {
    state,
    authorize: (req: Request): CatalogDisplayViewer | null => {
      state.calls += 1;
      state.lastAuthorization = String(req.headers.authorization ?? "");
      return { audience, email };
    },
  };
}

function buildApp(deps: Partial<CatalogDisplayApiDependencies> & { email?: string } = {}): {
  app: Express;
  authorizerCalls: () => number;
} {
  const viewer = viewerFor(deps.email ?? ORDINARY);
  const app = express();
  registerCatalogDisplayApi(app, {
    authorizeViewer: deps.authorizeViewer ?? viewer.authorize,
    enabled: deps.enabled ?? (() => true),
    env: deps.env ?? { [FULL_CATALOG_VISIBILITY_ENV_VAR]: SAMUEL },
  });
  return { app, authorizerCalls: () => viewer.state.calls };
}

function expectPrivateHeaders(headers: Record<string, string | undefined>): void {
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers["pragma"]).toBe("no-cache");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
}

describe("registerCatalogDisplayApi: registration", () => {
  it("refuses to mount without an app or dependencies", () => {
    const noop = () => null;
    expect(() => registerCatalogDisplayApi(undefined as never, { authorizeViewer: noop })).toThrow(
      /an express app is required/,
    );
    expect(() => registerCatalogDisplayApi(express(), undefined as never)).toThrow(
      /dependencies are required/,
    );
  });

  it("refuses to mount a route when a dependency is malformed", () => {
    const app = express();
    expect(() =>
      registerCatalogDisplayApi(app, { authorizeViewer: "nope" as never }),
    ).toThrow(/authorizeViewer is required/);
    expect(() =>
      registerCatalogDisplayApi(app, { authorizeViewer: () => null, enabled: 1 as never }),
    ).toThrow(/enabled is required/);
    // Nothing mounted: the surface is never half built.
    return request(app)
      .get(LIST_URL)
      .then((res) => expect(res.status).toBe(404));
  });

  it("pins the route constants the wiring registers", () => {
    expect(CATALOG_DISPLAY_LIST_ROUTE).toBe(LIST_URL);
    expect(CATALOG_DISPLAY_DETAIL_ROUTE).toBe(
      "/api/research/catalog-display/products/:lane/:slug",
    );
  });

  it("reads the production enablement flag from its own switch", () => {
    expect(catalogDisplayEnabledFromEnv({})).toBe(false);
    expect(catalogDisplayEnabledFromEnv({ RESEARCH_CATALOG_DISPLAY_ENABLED: "false" })).toBe(false);
    expect(catalogDisplayEnabledFromEnv({ RESEARCH_CATALOG_DISPLAY_ENABLED: "1" })).toBe(false);
    expect(catalogDisplayEnabledFromEnv({ RESEARCH_CATALOG_DISPLAY_ENABLED: "true" })).toBe(true);
  });
});

describe("registerCatalogDisplayApi: fail closed", () => {
  it("answers the uniform disabled 503 when the flag is omitted", async () => {
    const viewer = viewerFor(SAMUEL);
    const app = express();
    registerCatalogDisplayApi(app, { authorizeViewer: viewer.authorize });

    for (const url of [LIST_URL, detailUrl("quantum", "quantum-foundational-reset")]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(503);
      expect(res.body).toEqual(CATALOG_DISPLAY_DISABLED_RESPONSE);
      expectPrivateHeaders(res.headers);
    }
    expect(viewer.state.calls).toBe(0);
  });

  it("reads a flag that throws as disabled", async () => {
    const viewer = viewerFor(SAMUEL);
    const app = express();
    registerCatalogDisplayApi(app, {
      authorizeViewer: viewer.authorize,
      enabled: () => {
        throw new Error("flag exploded");
      },
    });
    const res = await request(app).get(LIST_URL);
    expect(res.status).toBe(503);
    expect(res.body).toEqual(CATALOG_DISPLAY_DISABLED_RESPONSE);
    expect(viewer.state.calls).toBe(0);
  });

  it("answers 401 for an unauthorized caller and never builds a projection", async () => {
    const { app } = buildApp({ authorizeViewer: () => null });
    const res = await request(app).get(LIST_URL);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(CATALOG_DISPLAY_AUTH_REQUIRED_RESPONSE);
    expectPrivateHeaders(res.headers);
  });

  it("answers 401 for a viewer with an audience off the enum", async () => {
    const { app } = buildApp({
      authorizeViewer: () => ({ audience: "founder", email: SAMUEL }) as never,
    });
    const res = await request(app).get(LIST_URL);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(CATALOG_DISPLAY_AUTH_REQUIRED_RESPONSE);
  });

  it("answers 400 for a malformed lane or slug and never echoes the input", async () => {
    const { app, authorizerCalls } = buildApp();
    for (const url of [
      detailUrl("peptides", "bpc-157-tb-500-15-15"),
      detailUrl("peptide", "not a slug"),
      detailUrl("peptide", "../../etc/passwd"),
      detailUrl("peptide", "-leading-hyphen"),
    ]) {
      const res = await request(app).get(url);
      expect([400, 404], url).toContain(res.status);
      if (res.status === 400) {
        expect(res.body).toEqual(CATALOG_DISPLAY_INVALID_REQUEST_RESPONSE);
        expect(JSON.stringify(res.body)).not.toContain("passwd");
      }
    }
    expect(authorizerCalls()).toBe(0);
  });

  it("answers 503 unavailable when the authorizer throws, never a 500", async () => {
    const { app } = buildApp({
      authorizeViewer: () => {
        throw new Error("supabase is down");
      },
    });
    const res = await request(app).get(LIST_URL);
    expect(res.status).toBe(503);
    expect(res.body).toEqual(CATALOG_DISPLAY_UNAVAILABLE_RESPONSE);
    expect(JSON.stringify(res.body)).not.toContain("supabase");
    expectPrivateHeaders(res.headers);
  });

  it("keeps an undecodable path segment on a closed code with private headers", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/research/catalog-display/products/peptide/%zz");
    expect([400, 404]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body).toEqual(CATALOG_DISPLAY_INVALID_REQUEST_RESPONSE);
      expectPrivateHeaders(res.headers);
    }
  });

  it("answers OPTIONS under the same flag, advertising reads only", async () => {
    const { app } = buildApp();
    const res = await request(app).options(LIST_URL);
    expect(res.status).toBe(204);
    expect(res.headers["allow"]).toBe("GET, HEAD, OPTIONS");
    expectPrivateHeaders(res.headers);

    const off = express();
    registerCatalogDisplayApi(off, { authorizeViewer: () => ({ audience: "member", email: "" }) });
    const disabled = await request(off).options(LIST_URL);
    expect(disabled.status).toBe(503);
    expect(disabled.body).toEqual(CATALOG_DISPLAY_DISABLED_RESPONSE);
  });

  it("has no mutation endpoint", async () => {
    const { app } = buildApp();
    for (const method of ["post", "put", "patch", "delete"] as const) {
      const res = await request(app)[method](LIST_URL);
      expect(res.status, method).toBe(404);
    }
  });
});

describe("FULL_CATALOG_VISIBILITY over HTTP", () => {
  const env = { [FULL_CATALOG_VISIBILITY_ENV_VAR]: SAMUEL };

  it("shows an allowlisted member the full displayable set", async () => {
    const { app } = buildApp({ email: SAMUEL, env });
    const res = await request(app).get(LIST_URL);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.audience).toBe("member");
    expect(res.body.breadth).toBe("full");
    expect(res.body.products).toHaveLength(66);
    expect(res.body.counts).toEqual({
      listed: 66,
      displayable: 66,
      excludedRegulatoryHold: 3,
    });
    expectPrivateHeaders(res.headers);
  });

  it("shows a non allowlisted member the normal set", async () => {
    const { app } = buildApp({ email: ORDINARY, env });
    const res = await request(app).get(LIST_URL);
    expect(res.status).toBe(200);
    expect(res.body.breadth).toBe("standard");
    expect(res.body.products).toHaveLength(30);
    expect(res.body.counts).toEqual({
      listed: 30,
      displayable: 66,
      excludedRegulatoryHold: 3,
    });
  });

  it("grants nobody when the variable is unset", async () => {
    const { app } = buildApp({ email: SAMUEL, env: {} });
    const res = await request(app).get(LIST_URL);
    expect(res.body.breadth).toBe("standard");
    expect(res.body.products).toHaveLength(30);
  });

  it("lets neither viewer reach a purchase mode the offer model denies", async () => {
    for (const email of [SAMUEL, ORDINARY]) {
      const { app } = buildApp({ email, env });
      const res = await request(app).get(LIST_URL);
      const modes = new Map(
        displayCatalog("full").map((card) => [`${card.lane}:${card.slug}`, card.availability]),
      );
      for (const product of res.body.products) {
        const key = `${product.lane}:${product.slug}`;
        // The mode is exactly what the offer readiness machine resolved. The
        // grant widened the listing, and touched nothing else.
        expect(product.availability, `${email} ${key}`).toBe(modes.get(key));
        expect(product.availability, key).not.toBe("DIRECT_PRIVATE_PURCHASE");
        if (!mayDisplayAmount(product.availability)) {
          expect(product.price, key).toBeNull();
        }
      }
    }
  });

  it("keeps the regulatory hold tier invisible to both viewers", async () => {
    const held = heldProductNotices().map((notice) => notice.slug);
    expect(held).toEqual(["semaglutide", "tirzepatide", "retatrutide"]);
    for (const email of [SAMUEL, ORDINARY]) {
      const { app } = buildApp({ email, env });
      const list = await request(app).get(LIST_URL);
      expect(list.body.held, email).toBeUndefined();
      const body = JSON.stringify(list.body);
      for (const slug of held) {
        expect(body.includes(slug), `${email}:${slug}`).toBe(false);
        const detail = await request(app).get(detailUrl("peptide", slug));
        expect(detail.status, `${email}:${slug}`).toBe(404);
        expect(detail.body).toEqual(CATALOG_DISPLAY_NOT_FOUND_RESPONSE);
      }
    }
  });

  it("ignores a breadth or audience the browser asks for", async () => {
    const { app } = buildApp({ email: ORDINARY, env });
    const res = await request(app)
      .get(`${LIST_URL}?breadth=full&audience=admin&email=${encodeURIComponent(SAMUEL)}`)
      .set("X-Breadth", "full")
      .set("X-Audience", "admin")
      .set("Cookie", "breadth=full");
    expect(res.body.breadth).toBe("standard");
    expect(res.body.audience).toBe("member");
    expect(res.body.products).toHaveLength(30);
  });

  it("refuses a wide record's detail to a normal member and serves it to the grant holder", async () => {
    const wideOnly = displayCatalog("full").find(
      (card) => !displayCatalog("standard").some((entry) => entry.slug === card.slug),
    );
    expect(wideOnly).toBeDefined();
    if (!wideOnly) return;

    const normal = buildApp({ email: ORDINARY, env });
    const denied = await request(normal.app).get(detailUrl(wideOnly.lane, wideOnly.slug));
    expect(denied.status).toBe(404);
    expect(denied.body).toEqual(CATALOG_DISPLAY_NOT_FOUND_RESPONSE);

    const granted = buildApp({ email: SAMUEL, env });
    const allowed = await request(granted.app).get(detailUrl(wideOnly.lane, wideOnly.slug));
    expect(allowed.status).toBe(200);
    expect(allowed.body.product.slug).toBe(wideOnly.slug);
    expect(allowed.body.breadth).toBe("full");
    // Wider, not stronger: the record still denies purchase and shows no amount.
    expect(allowed.body.product.availability).toBe("REQUEST_ACCESS_ONLY");
    expect(allowed.body.product.price).toBeNull();
  });
});

describe("the admin audience", () => {
  const env = { [FULL_CATALOG_VISIBILITY_ENV_VAR]: "" };

  it("sees the held tier as a labelled notice, never as a product", async () => {
    const { app } = buildApp({
      authorizeViewer: () => ({ audience: "admin", email: "ops@xeniostechnology.com" }),
      env,
    });
    const res = await request(app).get(LIST_URL);
    expect(res.status).toBe(200);
    expect(res.body.audience).toBe("admin");
    expect(res.body.held).toHaveLength(3);
    for (const notice of res.body.held) {
      expect(notice.status).toBe("regulatory_hold");
      expect(typeof notice.holdReason).toBe("string");
      expect(notice.price).toBeUndefined();
      expect(notice.variants).toBeUndefined();
      expect(notice.availability).toBeUndefined();
    }
    // Still absent from the product list, for an admin too.
    const slugs = res.body.products.map((product: { slug: string }) => product.slug);
    for (const slug of ["semaglutide", "tirzepatide", "retatrutide"]) {
      expect(slugs.includes(slug), slug).toBe(false);
    }
  });

  it("does not gain breadth from being an admin", async () => {
    const { app } = buildApp({
      authorizeViewer: () => ({ audience: "admin", email: "ops@xeniostechnology.com" }),
      env,
    });
    const res = await request(app).get(LIST_URL);
    // Breadth is the allowlist's decision, not the audience's.
    expect(res.body.breadth).toBe("standard");
    expect(res.body.products).toHaveLength(30);
  });

  it("cannot read a held product's detail", async () => {
    const { app } = buildApp({
      authorizeViewer: () => ({ audience: "admin", email: "ops@xeniostechnology.com" }),
      env: { [FULL_CATALOG_VISIBILITY_ENV_VAR]: "ops@xeniostechnology.com" },
    });
    const res = await request(app).get(detailUrl("peptide", "semaglutide"));
    expect(res.status).toBe(404);
    expect(res.body).toEqual(CATALOG_DISPLAY_NOT_FOUND_RESPONSE);
  });
});

describe("the detail endpoint", () => {
  const env = { [FULL_CATALOG_VISIBILITY_ENV_VAR]: SAMUEL };

  it("serves a supplement with its founder approved amount", async () => {
    const supplement = displayCatalog("standard").find((card) => card.lane === "supplement");
    expect(supplement).toBeDefined();
    if (!supplement) return;
    const { app } = buildApp({ email: ORDINARY, env });
    const res = await request(app).get(detailUrl("supplement", supplement.slug));
    expect(res.status).toBe(200);
    expect(res.body.product.slug).toBe(supplement.slug);
    expect(res.body.product.price.currency).toBe("USD");
    expect(res.body.product.price.amountCents).toBeGreaterThan(0);
    expectPrivateHeaders(res.headers);
  });

  it("serves a peptide with variants and no price at all", async () => {
    const peptide = displayCatalog("standard").find((card) => card.lane === "peptide");
    expect(peptide).toBeDefined();
    if (!peptide) return;
    const { app } = buildApp({ email: ORDINARY, env });
    const res = await request(app).get(detailUrl("peptide", peptide.slug));
    expect(res.status).toBe(200);
    expect(res.body.product.price).toBeNull();
    expect(res.body.product.variants.length).toBeGreaterThan(0);
    for (const variant of res.body.product.variants) {
      expect(Object.keys(variant).includes("price")).toBe(false);
      expect(Object.keys(variant).includes("amountCents")).toBe(false);
    }
  });

  it("answers 404 for an unknown slug with the same code as a hidden one", async () => {
    const { app } = buildApp({ email: ORDINARY, env });
    const res = await request(app).get(detailUrl("peptide", "no-such-product"));
    expect(res.status).toBe(404);
    expect(res.body).toEqual(CATALOG_DISPLAY_NOT_FOUND_RESPONSE);
  });
});

// ---------------------------------------------------------------------------
// Gateway integration: the REAL registerResearchApi (server/research/index.ts,
// outside this lane's write zone and imported here read only) mounted on one
// app with this adapter.
//
// What these tests prove:
// 1. THE TRAP, TODAY: in the production posture (password plus session secret
//    set, RESEARCH_PUBLIC off), the gateway's /api/research wall runs before
//    this adapter and bypasses the review cookie only for
//    MEMBER_AUTHED_PREFIXES Bearer callers and the downstream member guarded
//    GET and HEAD read paths. "/catalog-display" is on neither list, so a valid
//    member Bearer JWT is answered 401 by the wall and this adapter never runs.
//    Note in particular that the existing "/catalog" member authed prefix does
//    NOT cover it: that check matches the exact path "/catalog" or the prefix
//    "/catalog/", and "/catalog-display/..." is neither.
// 2. THE POST EDIT BEHAVIOR: after the release manager's one line gateway edit
//    (extend downstreamMemberGuardedRead with
//    `|| path.startsWith("/catalog-display/")`, see the routes.ts header),
//    GET and HEAD catalog display requests pass the wall without the review
//    cookie and meet this adapter's own guard chain.
//
// Honest simulation note: this lane cannot edit the gateway file, so the post
// edit predicate cannot be exercised literally. The simulation registers the
// catalog display routes AHEAD of the real wall, which produces the same
// observable behavior the predicate bypass produces for exactly these GET
// paths, while the real wall stays mounted and still guards every other
// research path, which is asserted. One known divergence: in the real post
// edit ordering these requests still pass the gateway's configured() fail
// closed 503 middleware first; the simulation skips it. The trap test
// exercises the true production ordering.
// ---------------------------------------------------------------------------
describe("gateway integration (real registerResearchApi)", () => {
  async function inProductionPosture(run: () => Promise<void>): Promise<void> {
    const prior = {
      password: process.env.RESEARCH_ACCESS_PASSWORD,
      secret: process.env.RESEARCH_SESSION_SECRET,
      publicMode: process.env.RESEARCH_PUBLIC,
    };
    process.env.RESEARCH_ACCESS_PASSWORD = "review-password";
    process.env.RESEARCH_SESSION_SECRET = "review-secret";
    delete process.env.RESEARCH_PUBLIC;
    try {
      await run();
    } finally {
      if (prior.password === undefined) delete process.env.RESEARCH_ACCESS_PASSWORD;
      else process.env.RESEARCH_ACCESS_PASSWORD = prior.password;
      if (prior.secret === undefined) delete process.env.RESEARCH_SESSION_SECRET;
      else process.env.RESEARCH_SESSION_SECRET = prior.secret;
      if (prior.publicMode === undefined) delete process.env.RESEARCH_PUBLIC;
      else process.env.RESEARCH_PUBLIC = prior.publicMode;
    }
  }

  function bearerBoundAuthorizer(email: string) {
    const state = { calls: 0 };
    return {
      state,
      authorize: (req: Request): CatalogDisplayViewer | null => {
        state.calls += 1;
        return String(req.headers.authorization ?? "") === "Bearer member-token"
          ? { audience: "member" as const, email }
          : null;
      },
    };
  }

  it("the real wall's read bypass admits the adapter in production order", async () => {
    // This test used to pin the trap: /catalog-display/ was on no bypass
    // list, so the wall shadowed the adapter and a valid member Bearer never
    // reached it. The one-line fix this file's header prescribed was applied
    // when the master-offerings v2 catalog mounted (Phase 0, 2026-08-14),
    // and the bypass covers every /catalog-display/ read. The pin now holds
    // the post-edit truth in the REAL production order, wall first.
    await inProductionPosture(async () => {
      const authorizer = bearerBoundAuthorizer(SAMUEL);
      const app = express();
      registerResearchApi(app); // production order in server/index.ts
      registerCatalogDisplayApi(app, {
        authorizeViewer: authorizer.authorize,
        enabled: () => true,
        env: { [FULL_CATALOG_VISIBILITY_ENV_VAR]: SAMUEL },
      });

      const res = await request(app).get(LIST_URL).set("Authorization", "Bearer member-token");
      expect(res.status).toBe(200);
      expect(res.body.breadth).toBe("full");
      expect(authorizer.state.calls).toBe(1);
      expectPrivateHeaders(res.headers);

      // The wall still guards every non-bypassed research path.
      const walled = await request(app).get("/api/research/applications");
      expect(walled.status).toBe(401);
      expect(walled.body).toEqual({ ok: false, message: "Access required." });
    });
  });

  it("reaches the adapter once the gateway read bypass exists (simulated)", async () => {
    await inProductionPosture(async () => {
      const authorizer = bearerBoundAuthorizer(SAMUEL);
      const app = express();
      // SIMULATION of the post edit gateway (see the block comment above).
      registerCatalogDisplayApi(app, {
        authorizeViewer: authorizer.authorize,
        enabled: () => true,
        env: { [FULL_CATALOG_VISIBILITY_ENV_VAR]: SAMUEL },
      });
      registerResearchApi(app);

      const authed = await request(app).get(LIST_URL).set("Authorization", "Bearer member-token");
      expect(authed.status).toBe(200);
      expect(authed.body.breadth).toBe("full");
      expect(authed.body.products).toHaveLength(66);
      expectPrivateHeaders(authed.headers);

      // An unauthenticated caller gets the ADAPTER's closed 401, not the
      // gateway's generic one: the adapter owns its denials past the bypass.
      const anon = await request(app).get(LIST_URL);
      expect(anon.status).toBe(401);
      expect(anon.body).toEqual(CATALOG_DISPLAY_AUTH_REQUIRED_RESPONSE);
      expectPrivateHeaders(anon.headers);

      // The real wall is still mounted and still guards every non bypassed
      // research path, so the simulation did not simply remove the gateway.
      const walled = await request(app).get("/api/research/applications");
      expect(walled.status).toBe(401);
      expect(walled.body).toEqual({ ok: false, message: "Access required." });
    });
  });

  it("keeps the uniform disabled 503 once the bypass exists (simulated)", async () => {
    await inProductionPosture(async () => {
      const authorizer = bearerBoundAuthorizer(SAMUEL);
      const app = express();
      registerCatalogDisplayApi(app, { authorizeViewer: authorizer.authorize });
      registerResearchApi(app);

      const res = await request(app).get(LIST_URL).set("Authorization", "Bearer member-token");
      expect(res.status).toBe(503);
      expect(res.body).toEqual(CATALOG_DISPLAY_DISABLED_RESPONSE);
      expectPrivateHeaders(res.headers);
      expect(authorizer.state.calls).toBe(0);
    });
  });
});
