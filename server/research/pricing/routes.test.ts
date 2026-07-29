import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerResearchApi } from "../index";
import {
  PRICE_RESOLUTION_FAILURE_REASONS,
  type CustomerPrice,
  type PriceResolution,
} from "@shared/research/pricing";
import type { ResolveApprovedResearchPriceInput } from "./authoritative-price-resolver";
import {
  PRICING_AUTH_REQUIRED_RESPONSE,
  PRICING_DISABLED_RESPONSE,
  PRICING_INVALID_REQUEST_RESPONSE,
  PRICING_TEMPORARILY_UNAVAILABLE_RESPONSE,
  pricingEnabledFromCommerceEnv,
  registerPricingApi,
  type PricingApiDependencies,
  type PricingAudienceGrant,
} from "./routes";

const NOW = "2026-07-28T12:00:00.000Z";

const CUSTOMER_PRICE_FIELDS = [
  "amountCents",
  "audience",
  "currency",
  "effectiveAt",
  "expiresAt",
  "priceId",
  "productId",
  "variantId",
  "version",
] as const;

function customerPrice(overrides: Partial<CustomerPrice> = {}): CustomerPrice {
  return {
    priceId: "price-a",
    productId: "product-a",
    variantId: "variant-a",
    audience: "retail",
    amountCents: 14900,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00+00:00",
    expiresAt: null,
    version: 2,
    ...overrides,
  };
}

function available(overrides: Partial<CustomerPrice> = {}): PriceResolution {
  return { state: "available", price: customerPrice(overrides) };
}

function fakeResolver(result: PriceResolution | (() => PriceResolution)) {
  const calls: ResolveApprovedResearchPriceInput[] = [];
  return {
    calls,
    resolveApprovedResearchPrice: async (
      input: ResolveApprovedResearchPriceInput,
    ): Promise<PriceResolution> => {
      calls.push(input);
      return typeof result === "function" ? result() : result;
    },
  };
}

function fakeAuthorizer(
  grant: PricingAudienceGrant | null | (() => PricingAudienceGrant | null),
) {
  const state = { calls: 0 };
  return {
    state,
    authorize: async (): Promise<PricingAudienceGrant | null> => {
      state.calls += 1;
      return typeof grant === "function" ? grant() : grant;
    },
  };
}

function retailGrant(): PricingAudienceGrant {
  return { audience: "retail", sourceVersion: "member-row-v1" };
}

function makeApp(deps: PricingApiDependencies) {
  const app = express();
  registerPricingApi(app, deps);
  return app;
}

function enabledDeps(
  resolver: ReturnType<typeof fakeResolver>,
  authorizer: ReturnType<typeof fakeAuthorizer>,
  overrides: Partial<PricingApiDependencies> = {},
): PricingApiDependencies {
  return {
    resolver,
    authorizeAudience: authorizer.authorize,
    enabled: () => true,
    now: () => new Date(NOW),
    ...overrides,
  };
}

function priceUrl(productId: string, variantId: string): string {
  return `/api/research/pricing/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}/price`;
}

function cardUrl(productId: string, variantId: string): string {
  return `/api/research/pricing/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}/card-price`;
}

function expectPrivateHeaders(
  headers: Record<string, string | string[] | undefined>,
) {
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers.pragma).toBe("no-cache");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
}

describe("registration refusal", () => {
  it("refuses without dependencies and mounts nothing", async () => {
    const app = express();
    expect(() =>
      registerPricingApi(app, undefined as unknown as PricingApiDependencies),
    ).toThrow(/dependencies are required/);
    const res = await request(app).get(priceUrl("product-a", "variant-a"));
    expect(res.status).toBe(404);
  });

  it("refuses without a resolver and mounts nothing", async () => {
    const app = express();
    expect(() =>
      registerPricingApi(app, {
        authorizeAudience: fakeAuthorizer(retailGrant()).authorize,
      } as unknown as PricingApiDependencies),
    ).toThrow(/resolver is required/);
    const res = await request(app).get(priceUrl("product-a", "variant-a"));
    expect(res.status).toBe(404);
  });

  it("refuses a resolver without the resolve function", () => {
    expect(() =>
      registerPricingApi(express(), {
        resolver: {} as never,
        authorizeAudience: fakeAuthorizer(retailGrant()).authorize,
      }),
    ).toThrow(/resolveApprovedResearchPrice is required/);
  });

  it("refuses without an authorizer and mounts nothing", async () => {
    const app = express();
    expect(() =>
      registerPricingApi(app, {
        resolver: fakeResolver(available()),
      } as unknown as PricingApiDependencies),
    ).toThrow(/authorizeAudience is required/);
    const res = await request(app).get(priceUrl("product-a", "variant-a"));
    expect(res.status).toBe(404);
  });

  it("refuses a non function enablement flag", () => {
    expect(() =>
      registerPricingApi(express(), {
        resolver: fakeResolver(available()),
        authorizeAudience: fakeAuthorizer(retailGrant()).authorize,
        enabled: true as unknown as () => boolean,
      }),
    ).toThrow(/enabled is required/);
  });

  it("refuses without an express app", () => {
    expect(() =>
      registerPricingApi(undefined as unknown as express.Express, {
        resolver: fakeResolver(available()),
        authorizeAudience: fakeAuthorizer(retailGrant()).authorize,
      }),
    ).toThrow(/express app is required/);
  });
});

describe("enablement flag", () => {
  it("defaults to disabled with the uniform 503 pricing_disabled body", async () => {
    const resolver = fakeResolver(available());
    const authorizer = fakeAuthorizer(retailGrant());
    const app = makeApp({
      resolver,
      authorizeAudience: authorizer.authorize,
    });

    for (const url of [
      priceUrl("product-a", "variant-a"),
      cardUrl("product-a", "variant-a"),
    ]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(503);
      expect(res.body).toEqual(PRICING_DISABLED_RESPONSE);
      expectPrivateHeaders(res.headers);
    }
    expect(authorizer.state.calls).toBe(0);
    expect(resolver.calls).toHaveLength(0);
  });

  it("answers disabled while the flag returns false", async () => {
    const resolver = fakeResolver(available());
    const authorizer = fakeAuthorizer(retailGrant());
    const app = makeApp(
      enabledDeps(resolver, authorizer, { enabled: () => false }),
    );

    const res = await request(app).get(priceUrl("product-a", "variant-a"));
    expect(res.status).toBe(503);
    expect(res.body).toEqual(PRICING_DISABLED_RESPONSE);
    expect(authorizer.state.calls).toBe(0);
    expect(resolver.calls).toHaveLength(0);
  });

  it("reads a throwing flag as disabled, fail closed", async () => {
    const resolver = fakeResolver(available());
    const authorizer = fakeAuthorizer(retailGrant());
    const app = makeApp(
      enabledDeps(resolver, authorizer, {
        enabled: () => {
          throw new Error("flag store down");
        },
      }),
    );

    const res = await request(app).get(priceUrl("product-a", "variant-a"));
    expect(res.status).toBe(503);
    expect(res.body).toEqual(PRICING_DISABLED_RESPONSE);
    expect(resolver.calls).toHaveLength(0);
  });

  it("derives the production flag from the commerce env flag", () => {
    const prior = process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED;
    try {
      delete process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED;
      expect(pricingEnabledFromCommerceEnv()).toBe(false);
      process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED = "false";
      expect(pricingEnabledFromCommerceEnv()).toBe(false);
      process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED = "true";
      expect(pricingEnabledFromCommerceEnv()).toBe(true);
    } finally {
      if (prior === undefined) {
        delete process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED = prior;
      }
    }
  });
});

describe("resolved price endpoint", () => {
  it("returns exactly the allowlisted CustomerPrice fields on the wire", async () => {
    const resolver = fakeResolver(available());
    const authorizer = fakeAuthorizer(retailGrant());
    const app = makeApp(enabledDeps(resolver, authorizer));

    const res = await request(app).get(priceUrl("product-a", "variant-a"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      state: "available",
      price: customerPrice(),
    });
    expect(Object.keys(res.body.price).sort()).toEqual([
      ...CUSTOMER_PRICE_FIELDS,
    ]);
    expectPrivateHeaders(res.headers);
  });

  it("strips internal fields a misbehaving resolver attaches to the price", async () => {
    const smuggled = {
      ...customerPrice(),
      approvalNote: "approved by pricing review",
      approvedBy: "reviewer",
      createdBy: "admin",
      supplierCostCents: 4200,
      marginPercent: 71,
      sourceUrl: "https://supplier.example/internal",
    } as unknown as CustomerPrice;
    const resolver = fakeResolver({ state: "available", price: smuggled });
    const app = makeApp(enabledDeps(resolver, fakeAuthorizer(retailGrant())));

    const res = await request(app).get(priceUrl("product-a", "variant-a"));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.price).sort()).toEqual([
      ...CUSTOMER_PRICE_FIELDS,
    ]);
    const wire = JSON.stringify(res.body);
    expect(wire).not.toContain("approvalNote");
    expect(wire).not.toContain("approvedBy");
    expect(wire).not.toContain("createdBy");
    expect(wire).not.toContain("supplier");
    expect(wire).not.toContain("margin");
    expect(wire).not.toContain("sourceUrl");
  });

  it("maps every closed taxonomy reason through with a 200, never a 500", async () => {
    for (const reason of PRICE_RESOLUTION_FAILURE_REASONS) {
      const resolution: PriceResolution =
        reason === "price_ambiguous"
          ? { state: "ambiguous", reason }
          : { state: "unavailable", reason };
      const app = makeApp(
        enabledDeps(fakeResolver(resolution), fakeAuthorizer(retailGrant())),
      );

      const res = await request(app).get(priceUrl("product-a", "variant-a"));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, state: "unavailable", reason });
    }
  });

  it("collapses an off enum reason to price_missing", async () => {
    const resolver = fakeResolver({
      state: "unavailable",
      reason: "supplier_cost_hidden",
    } as unknown as PriceResolution);
    const app = makeApp(enabledDeps(resolver, fakeAuthorizer(retailGrant())));

    const res = await request(app).get(priceUrl("product-a", "variant-a"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      state: "unavailable",
      reason: "price_missing",
    });
  });

  it("never serializes a zero or negative amount as an available price", async () => {
    for (const amountCents of [0, -14900, 149.5]) {
      const app = makeApp(
        enabledDeps(
          fakeResolver(available({ amountCents })),
          fakeAuthorizer(retailGrant()),
        ),
      );

      const res = await request(app).get(priceUrl("product-a", "variant-a"));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        state: "unavailable",
        reason: "price_missing",
      });
      expect(JSON.stringify(res.body)).not.toContain("amountCents");
    }
  });

  it("answers 503 pricing_unavailable when the resolver throws, never a 500", async () => {
    const resolver = fakeResolver(() => {
      throw new Error("repository offline: connection string postgres://secret");
    });
    const app = makeApp(enabledDeps(resolver, fakeAuthorizer(retailGrant())));

    const res = await request(app).get(priceUrl("product-a", "variant-a"));

    expect(res.status).toBe(503);
    expect(res.body).toEqual(PRICING_TEMPORARILY_UNAVAILABLE_RESPONSE);
    expect(JSON.stringify(res.body)).not.toContain("postgres");
  });
});

describe("card price endpoint", () => {
  it("returns the priced catalog projection", async () => {
    const app = makeApp(
      enabledDeps(fakeResolver(available()), fakeAuthorizer(retailGrant())),
    );

    const res = await request(app).get(cardUrl("product-a", "variant-a"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      projection: { state: "priced", price: customerPrice() },
    });
    expectPrivateHeaders(res.headers);
  });

  it("carries no reason on a not available card, only the closed state", async () => {
    const app = makeApp(
      enabledDeps(
        fakeResolver({ state: "unavailable", reason: "member_ineligible" }),
        fakeAuthorizer(retailGrant()),
      ),
    );

    const res = await request(app).get(cardUrl("product-a", "variant-a"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      projection: { state: "not_currently_available" },
    });
    expect(Object.keys(res.body.projection)).toEqual(["state"]);
  });
});

describe("audience authorization", () => {
  it("ignores audience and currency forgery in query and headers", async () => {
    const resolver = fakeResolver(available());
    const app = makeApp(enabledDeps(resolver, fakeAuthorizer(retailGrant())));

    const res = await request(app)
      .get(
        `${priceUrl("product-a", "variant-a")}?audience=wholesale&currency=EUR`,
      )
      .set("x-audience", "wholesale")
      .set("x-currency", "EUR");

    expect(res.status).toBe(200);
    expect(res.body.price.audience).toBe("retail");
    expect(res.body.price.currency).toBe("USD");
    expect(resolver.calls).toHaveLength(1);
    expect(resolver.calls[0].authenticatedAudience.audience).toBe("retail");
    expect(resolver.calls[0].currency).toBe("USD");
  });

  it("resolves at the exact instant the audience was authorized", async () => {
    const resolver = fakeResolver(available());
    const app = makeApp(enabledDeps(resolver, fakeAuthorizer(retailGrant())));

    await request(app).get(priceUrl("product-a", "variant-a"));

    expect(resolver.calls).toHaveLength(1);
    expect(resolver.calls[0].at).toBe(NOW);
    expect(resolver.calls[0].authenticatedAudience.evaluatedAt).toBe(NOW);
    expect(resolver.calls[0].authenticatedAudience.sourceVersion).toBe(
      "member-row-v1",
    );
  });

  it("answers 401 and never calls the resolver for an unauthenticated caller", async () => {
    const resolver = fakeResolver(available());
    const authorizer = fakeAuthorizer(null);
    const app = makeApp(enabledDeps(resolver, authorizer));

    const res = await request(app).get(priceUrl("product-a", "variant-a"));

    expect(res.status).toBe(401);
    expect(res.body).toEqual(PRICING_AUTH_REQUIRED_RESPONSE);
    expect(authorizer.state.calls).toBe(1);
    expect(resolver.calls).toHaveLength(0);
    expectPrivateHeaders(res.headers);
  });

  it("answers 401 and never calls the resolver for an off allowlist audience", async () => {
    const resolver = fakeResolver(available());
    const authorizer = fakeAuthorizer({
      audience: "compare_at" as never,
      sourceVersion: "member-row-v1",
    });
    const app = makeApp(enabledDeps(resolver, authorizer));

    const res = await request(app).get(priceUrl("product-a", "variant-a"));

    expect(res.status).toBe(401);
    expect(res.body).toEqual(PRICING_AUTH_REQUIRED_RESPONSE);
    expect(resolver.calls).toHaveLength(0);
  });

  it("answers 401 and never calls the resolver for an empty sourceVersion", async () => {
    const resolver = fakeResolver(available());
    const authorizer = fakeAuthorizer({
      audience: "retail",
      sourceVersion: "   ",
    });
    const app = makeApp(enabledDeps(resolver, authorizer));

    const res = await request(app).get(priceUrl("product-a", "variant-a"));

    expect(res.status).toBe(401);
    expect(resolver.calls).toHaveLength(0);
  });

  it("answers 503 pricing_unavailable when the authorizer throws", async () => {
    const resolver = fakeResolver(available());
    const app = makeApp(
      enabledDeps(resolver, {
        state: { calls: 0 },
        authorize: async () => {
          throw new Error("identity provider offline");
        },
      }),
    );

    const res = await request(app).get(priceUrl("product-a", "variant-a"));

    expect(res.status).toBe(503);
    expect(res.body).toEqual(PRICING_TEMPORARILY_UNAVAILABLE_RESPONSE);
    expect(resolver.calls).toHaveLength(0);
  });
});

describe("id validation", () => {
  it("rejects malformed ids with a closed code, before auth, without echoing input", async () => {
    const malformed = [
      "product a",
      "../product-a",
      "product$a",
      "-leading-hyphen",
      "a".repeat(129),
    ];
    for (const bad of malformed) {
      const resolver = fakeResolver(available());
      const authorizer = fakeAuthorizer(retailGrant());
      const app = makeApp(enabledDeps(resolver, authorizer));

      const res = await request(app).get(priceUrl(bad, "variant-a"));

      expect(res.status).toBe(400);
      expect(res.body).toEqual(PRICING_INVALID_REQUEST_RESPONSE);
      expect(JSON.stringify(res.body)).not.toContain(bad);
      expect(authorizer.state.calls).toBe(0);
      expect(resolver.calls).toHaveLength(0);
      expectPrivateHeaders(res.headers);
    }
  });

  it("rejects a malformed variant id the same way", async () => {
    const resolver = fakeResolver(available());
    const authorizer = fakeAuthorizer(retailGrant());
    const app = makeApp(enabledDeps(resolver, authorizer));

    const res = await request(app).get(priceUrl("product-a", "variant a"));

    expect(res.status).toBe(400);
    expect(res.body).toEqual(PRICING_INVALID_REQUEST_RESPONSE);
    expect(authorizer.state.calls).toBe(0);
    expect(resolver.calls).toHaveLength(0);
  });

  it("accepts uuid shaped ids", async () => {
    const resolver = fakeResolver(
      available({
        productId: "0b0f8a52-9f10-4a7e-8f4e-2f1f0a9c2d31",
        variantId: "4c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
      }),
    );
    const app = makeApp(enabledDeps(resolver, fakeAuthorizer(retailGrant())));

    const res = await request(app).get(
      priceUrl(
        "0b0f8a52-9f10-4a7e-8f4e-2f1f0a9c2d31",
        "4c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
      ),
    );

    expect(res.status).toBe(200);
    expect(res.body.state).toBe("available");
    expect(resolver.calls[0].productId).toBe(
      "0b0f8a52-9f10-4a7e-8f4e-2f1f0a9c2d31",
    );
  });

  it("answers an undecodable path segment with the closed 400, not the global handler", async () => {
    const resolver = fakeResolver(available());
    const authorizer = fakeAuthorizer(retailGrant());
    const app = makeApp(enabledDeps(resolver, authorizer));
    // The same shape as the global error handler in server/index.ts, which
    // echoes err.message. Registered after the adapter, exactly as in
    // production module order; the path scoped boundary must answer first.
    let globalHandlerCalls = 0;
    app.use(
      (err: unknown, _req: Request, res: Response, next: NextFunction) => {
        globalHandlerCalls += 1;
        if (res.headersSent) return next(err);
        const shaped = err as { status?: number; message?: string };
        res
          .status(shaped.status ?? 500)
          .json({ message: shaped.message ?? "Internal Server Error" });
      },
    );

    // %zz cannot be percent decoded, so this fails inside the router before
    // any pricing handler runs.
    const res = await request(app).get(
      "/api/research/pricing/products/%zz/variants/variant-a/price",
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual(PRICING_INVALID_REQUEST_RESPONSE);
    expectPrivateHeaders(res.headers);
    const wire = JSON.stringify(res.body);
    expect(wire).not.toContain("%zz");
    expect(wire).not.toContain("Failed to decode");
    expect(globalHandlerCalls).toBe(0);
    expect(authorizer.state.calls).toBe(0);
    expect(resolver.calls).toHaveLength(0);
  });

  it("fails closed with 503 for a non client error crossing the boundary", async () => {
    const app = express();
    // A route on the pricing prefix that errors before the adapter's own
    // handlers, registered ahead of registerPricingApi so the boundary
    // (registered after it) is the next error handler downstream. The
    // boundary must keep the error on a closed code with private headers.
    app.get("/api/research/pricing/boom", () => {
      throw new Error("internal detail that must not leak");
    });
    registerPricingApi(
      app,
      enabledDeps(fakeResolver(available()), fakeAuthorizer(retailGrant())),
    );

    const res = await request(app).get("/api/research/pricing/boom");

    expect(res.status).toBe(503);
    expect(res.body).toEqual(PRICING_TEMPORARILY_UNAVAILABLE_RESPONSE);
    expectPrivateHeaders(res.headers);
    expect(JSON.stringify(res.body)).not.toContain("internal detail");
  });
});

describe("http method sanity", () => {
  it("answers HEAD like GET with no body", async () => {
    const app = makeApp(
      enabledDeps(fakeResolver(available()), fakeAuthorizer(retailGrant())),
    );

    const res = await request(app).head(priceUrl("product-a", "variant-a"));

    expect(res.status).toBe(200);
    expect(res.text ?? "").toBe("");
    expectPrivateHeaders(res.headers);
  });

  it("advertises only read methods on an explicit OPTIONS with private headers", async () => {
    const app = makeApp(
      enabledDeps(fakeResolver(available()), fakeAuthorizer(retailGrant())),
    );

    for (const url of [
      priceUrl("product-a", "variant-a"),
      cardUrl("product-a", "variant-a"),
    ]) {
      const res = await request(app).options(url);

      expect(res.status).toBe(204);
      expect(res.headers.allow).toBe("GET, HEAD, OPTIONS");
      expectPrivateHeaders(res.headers);
      expect(res.text ?? "").toBe("");
    }
  });

  it("answers OPTIONS with the uniform disabled body while disabled", async () => {
    const resolver = fakeResolver(available());
    const authorizer = fakeAuthorizer(retailGrant());
    const app = makeApp({
      resolver,
      authorizeAudience: authorizer.authorize,
    });

    const res = await request(app).options(priceUrl("product-a", "variant-a"));

    expect(res.status).toBe(503);
    expect(res.body).toEqual(PRICING_DISABLED_RESPONSE);
    expectPrivateHeaders(res.headers);
    expect(res.headers.allow).toBeUndefined();
    expect(authorizer.state.calls).toBe(0);
    expect(resolver.calls).toHaveLength(0);
  });

  it("has no mutation endpoint of any kind", async () => {
    const app = makeApp(
      enabledDeps(fakeResolver(available()), fakeAuthorizer(retailGrant())),
    );

    for (const method of ["post", "put", "patch", "delete"] as const) {
      const res = await request(app)[method](
        priceUrl("product-a", "variant-a"),
      );
      expect(res.status).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// Gateway integration: the REAL registerResearchApi (server/research/index.ts,
// leased to another lane and imported here read only) mounted on one app with
// this adapter.
//
// What these tests prove:
// 1. THE TRAP, TODAY: in the production posture (password + session secret
//    set, RESEARCH_PUBLIC off), the gateway's /api/research wall runs before
//    this adapter and bypasses the review cookie only for
//    MEMBER_AUTHED_PREFIXES Bearer callers and the downstream member guarded
//    GET/HEAD read paths. "/pricing" is on neither list, so a valid member
//    Bearer JWT is answered 401 by the wall and this adapter never runs.
// 2. THE POST EDIT BEHAVIOR: after the release manager's one line gateway
//    edit (extend downstreamMemberGuardedRead with
//    `|| path.startsWith("/pricing/")`, see the routes.ts header), GET/HEAD
//    pricing requests pass the wall without the review cookie and meet this
//    adapter's own guard chain.
//
// Honest simulation note: this lane cannot edit the leased gateway file, so
// the post edit predicate cannot be exercised literally. The simulation
// registers the pricing routes AHEAD of the real wall, which produces the
// same observable behavior the predicate bypass produces for exactly these
// GET paths (they reach the adapter without the cookie) while the real wall
// stays mounted and still guards every other research path, which is
// asserted. One known divergence: in the real post edit ordering, pricing
// requests still pass the gateway's configured() fail closed 503 middleware
// first; the simulation skips it. The trap tests exercise the true
// production ordering.
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

  /** Grants only the caller presenting the member Bearer token, like the
   *  production authorizer built on requireActiveMember. */
  function bearerBoundAuthorizer() {
    const state = { calls: 0 };
    return {
      state,
      authorize: async (req: Request): Promise<PricingAudienceGrant | null> => {
        state.calls += 1;
        return String(req.headers.authorization ?? "") === "Bearer member-token"
          ? retailGrant()
          : null;
      },
    };
  }

  it("documents the trap: today's wall shadows a Bearer-authorized pricing read", async () => {
    await inProductionPosture(async () => {
      const resolver = fakeResolver(available());
      const authorizer = bearerBoundAuthorizer();
      const app = express();
      registerResearchApi(app); // production order in server/index.ts
      registerPricingApi(app, {
        resolver,
        authorizeAudience: authorizer.authorize,
        enabled: () => true,
        now: () => new Date(NOW),
      });

      const res = await request(app)
        .get(priceUrl("product-a", "variant-a"))
        .set("Authorization", "Bearer member-token");

      // The gateway wall answers; the adapter, its authorizer, and its
      // private headers never run. This is the shadowing the routes.ts
      // header requires the release manager to fix in the gateway file.
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ ok: false, message: "Access required." });
      expect(authorizer.state.calls).toBe(0);
      expect(resolver.calls).toHaveLength(0);
      expect(res.headers["x-robots-tag"]).toBeUndefined();
    });
  });

  it("documents the trap: the disabled state is also shadowed into the wall's 401", async () => {
    await inProductionPosture(async () => {
      const resolver = fakeResolver(available());
      const authorizer = bearerBoundAuthorizer();
      const app = express();
      registerResearchApi(app);
      // Flag omitted: the adapter would answer 503 pricing_disabled, but the
      // wall answers first in today's ordering.
      registerPricingApi(app, {
        resolver,
        authorizeAudience: authorizer.authorize,
      });

      const res = await request(app)
        .get(priceUrl("product-a", "variant-a"))
        .set("Authorization", "Bearer member-token");

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ ok: false, message: "Access required." });
      expect(authorizer.state.calls).toBe(0);
    });
  });

  it("reaches the adapter once the gateway read bypass exists (simulated)", async () => {
    await inProductionPosture(async () => {
      const resolver = fakeResolver(available());
      const authorizer = bearerBoundAuthorizer();
      const app = express();
      // SIMULATION of the post edit gateway (see the block comment above):
      // pricing registered ahead of the real wall stands in for the one line
      // downstreamMemberGuardedRead extension this lane cannot make.
      registerPricingApi(app, {
        resolver,
        authorizeAudience: authorizer.authorize,
        enabled: () => true,
        now: () => new Date(NOW),
      });
      registerResearchApi(app);

      // A Bearer-authorized pricing GET without any review cookie reaches
      // the adapter and resolves.
      const authed = await request(app)
        .get(priceUrl("product-a", "variant-a"))
        .set("Authorization", "Bearer member-token");
      expect(authed.status).toBe(200);
      expect(authed.body).toEqual({
        ok: true,
        state: "available",
        price: customerPrice(),
      });
      expect(resolver.calls).toHaveLength(1);
      expectPrivateHeaders(authed.headers);

      // An unauthenticated caller gets the ADAPTER's closed 401, not the
      // gateway's generic one: the adapter owns its denials past the bypass.
      const anon = await request(app).get(priceUrl("product-a", "variant-a"));
      expect(anon.status).toBe(401);
      expect(anon.body).toEqual(PRICING_AUTH_REQUIRED_RESPONSE);
      expectPrivateHeaders(anon.headers);
      expect(resolver.calls).toHaveLength(1);

      // The real wall is still mounted and still guards every non bypassed
      // research path in this simulated app, so the simulation did not
      // simply remove the gateway.
      const walled = await request(app).get("/api/research/policies");
      expect(walled.status).toBe(401);
      expect(walled.body).toEqual({ ok: false, message: "Access required." });
    });
  });

  it("keeps the uniform disabled 503 once the bypass exists (simulated)", async () => {
    await inProductionPosture(async () => {
      const resolver = fakeResolver(available());
      const authorizer = bearerBoundAuthorizer();
      const app = express();
      registerPricingApi(app, {
        resolver,
        authorizeAudience: authorizer.authorize,
      });
      registerResearchApi(app);

      const res = await request(app)
        .get(priceUrl("product-a", "variant-a"))
        .set("Authorization", "Bearer member-token");

      expect(res.status).toBe(503);
      expect(res.body).toEqual(PRICING_DISABLED_RESPONSE);
      expectPrivateHeaders(res.headers);
      expect(authorizer.state.calls).toBe(0);
      expect(resolver.calls).toHaveLength(0);
    });
  });
});
