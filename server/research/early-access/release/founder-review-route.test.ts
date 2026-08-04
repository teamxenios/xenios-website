import { describe, expect, it } from "vitest";

import type {
  EarlyAccessCatalogProjection,
  EarlyAccessCatalogRow,
} from "../catalog/early-access-catalog";
import { EarlyAccessCatalogSourceError } from "../catalog/product-control-source";
import {
  InMemoryEarlyAccessReleaseLedger,
  earlyAccessReleaseVersion,
} from "./founder-release";
import {
  createEarlyAccessCatalogRoute,
  createFounderReleaseReviewRoute,
  createFounderReleaseRoute,
  type EarlyAccessCatalogContext,
  type EarlyAccessCatalogSource,
} from "./release-routes";

const NOW = Date.parse("2026-08-04T12:00:00.000Z");
const ACTOR = "founder@example.com";

function row(overrides: Partial<EarlyAccessCatalogRow> = {}): EarlyAccessCatalogRow {
  return {
    productId: "prod-a",
    slug: "product-a",
    displayName: "Product A",
    canonicalName: "Product A",
    variantId: "var-1",
    sku: "A-1",
    strength: "10 mg",
    presentation: "Single-use vial",
    priceCents: null,
    currency: "",
    audience: "member",
    availability: "available",
    offerState: "APPROVAL_REQUIRED_PURCHASE",
    description: "",
    imageState: "none",
    quantityLimit: 3,
    supplierReady: true,
    fulfillmentOwner: "mitch",
    disputeStatus: { identity: "cleared", strength: "cleared" },
    purchasable: false,
    blockers: ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED"],
    ...overrides,
  } as unknown as EarlyAccessCatalogRow;
}

/** A regulatory-hold SKU, joined from the founder-locked canonical record. */
const HELD_COMPOUND = row({
  productId: "prod-reta",
  variantId: "var-reta",
  slug: "retatrutide",
  displayName: "Retatrutide",
  canonicalName: "Retatrutide",
  sku: "R360-RETATRUTIDE-10MG-VIAL",
  blockers: ["PRICE_NOT_APPROVED", "QUANTITY_LIMIT_MISSING"],
});

function sourceOf(rows: EarlyAccessCatalogRow[]): EarlyAccessCatalogSource & {
  contexts: EarlyAccessCatalogContext[];
} {
  const contexts: EarlyAccessCatalogContext[] = [];
  return {
    contexts,
    async load(now: Date, context?: EarlyAccessCatalogContext) {
      contexts.push(context ?? {});
      return {
        evaluatedAt: now.toISOString(),
        rows,
        productsWithoutVariants: [],
      } as unknown as EarlyAccessCatalogProjection;
    },
  };
}

const FAILING_SOURCE: EarlyAccessCatalogSource = {
  async load() {
    throw new EarlyAccessCatalogSourceError("Product Control is unreachable.");
  },
};

function res() {
  const headers: Record<string, string> = {};
  const state: { status: number; body: any; headers: Record<string, string> } = {
    status: 0,
    body: null,
    headers,
  };
  const port: any = {
    setHeader: (key: string, value: string) => {
      headers[key.toLowerCase()] = value;
    },
    status(code: number) {
      state.status = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  };
  return { port, state };
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    resolveSession: async () => ({ authenticated: true, expiresAtEpochMs: NOW + 1_000 }),
    catalog: sourceOf([row()]),
    ledger: new InMemoryEarlyAccessReleaseLedger(),
    now: () => NOW,
    ...overrides,
  } as any;
}

describe("the founder review route", () => {
  it("refuses a request the admin guard did not name a human for", async () => {
    const { port, state } = res();
    await createFounderReleaseReviewRoute(deps())({ actor: undefined }, port);
    expect(state.status).toBe(403);
    expect(state.body).toEqual({ ok: false, code: "actor_unknown" });
  });

  it("classifies every unit and reports the counts", async () => {
    const { port, state } = res();
    await createFounderReleaseReviewRoute(deps())({ actor: ACTOR }, port);
    expect(state.status).toBe(200);
    expect(state.body.candidates).toHaveLength(1);
    expect(state.body.counts.APPROVABLE_FOR_EARLY_ACCESS).toBe(1);
    expect(state.body.candidates[0].productVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(state.body.candidates[0].waivableBlockers).toEqual([
      "PRICE_NOT_APPROVED",
      "DOCUMENTATION_NOT_SATISFIED",
    ]);
    expect(state.body.candidates[0].nonwaivableBlockers).toEqual([]);
  });

  it("projects under the admin identity the guard authenticated, never a body field", async () => {
    const catalog = sourceOf([row()]);
    const { port } = res();
    await createFounderReleaseReviewRoute(deps({ catalog }))(
      { actor: ACTOR, body: { reviewActor: "somebody-else" } },
      port,
    );
    expect(catalog.contexts).toEqual([{ reviewActor: ACTOR }]);
  });

  it("answers unavailable, not an empty list, when the catalog cannot be read", async () => {
    const { port, state } = res();
    await createFounderReleaseReviewRoute(deps({ catalog: FAILING_SOURCE }))(
      { actor: ACTOR },
      port,
    );
    expect(state.status).toBe(503);
    expect(state.body).toEqual({ ok: false, code: "unavailable" });
    // The mutation this pins: catching the read failure and sending
    // `{ ok: true, candidates: [] }` would read as "there is nothing to
    // release", which is a decision nobody made.
    expect(state.body.candidates).toBeUndefined();
  });

  it("MUTATION: a source that swallows the read failure answers 200 with nothing", async () => {
    // The mutation: `catch { return { rows: [], ... } }` inside the catalog
    // source, which is the shape a "make it resilient" edit takes. Both routes
    // are driven here, so the difference is a status code a caller can see and
    // not an internal detail.
    const swallowing: EarlyAccessCatalogSource = {
      async load(now: Date) {
        return {
          evaluatedAt: now.toISOString(),
          rows: [],
          productsWithoutVariants: [],
        } as unknown as EarlyAccessCatalogProjection;
      },
    };
    const mutated = res();
    await createFounderReleaseReviewRoute(deps({ catalog: swallowing }))(
      { actor: ACTOR },
      mutated.port,
    );
    expect(mutated.state.status).toBe(200);
    expect(mutated.state.body.candidates).toEqual([]);

    const real = res();
    await createFounderReleaseReviewRoute(deps({ catalog: FAILING_SOURCE }))(
      { actor: ACTOR },
      real.port,
    );
    expect(real.state.status).toBe(503);

    const customerMutated = res();
    await createEarlyAccessCatalogRoute(deps({ catalog: swallowing }))(
      { cookieHeader: "x=1" },
      customerMutated.port,
    );
    expect(customerMutated.state.status).toBe(200);
    expect(customerMutated.state.body.units).toEqual([]);

    const customerReal = res();
    await createEarlyAccessCatalogRoute(deps({ catalog: FAILING_SOURCE }))(
      { cookieHeader: "x=1" },
      customerReal.port,
    );
    expect(customerReal.state.status).toBe(503);
  });

  it("stays private and uncached", async () => {
    const { port, state } = res();
    await createFounderReleaseReviewRoute(deps())({ actor: ACTOR }, port);
    expect(state.headers["cache-control"]).toContain("no-store");
    expect(state.headers["x-robots-tag"]).toContain("noindex");
  });
});

describe("the customer catalog route and an unreachable catalog", () => {
  it("answers unavailable rather than an empty catalog", async () => {
    const { port, state } = res();
    await createEarlyAccessCatalogRoute(deps({ catalog: FAILING_SOURCE }))(
      { cookieHeader: "x=1" },
      port,
    );
    expect(state.status).toBe(503);
    expect(state.body).toEqual({ ok: false, code: "unavailable" });
  });

  it("passes the authenticated member through, and nothing else", async () => {
    const catalog = sourceOf([row()]);
    const member = { id: "member-1" } as never;
    const { port } = res();
    await createEarlyAccessCatalogRoute(deps({ catalog }))(
      { cookieHeader: "x=1", member },
      port,
    );
    // An absent customer is passed as an explicit null, never omitted: an
    // unbound session must arrive as "nobody", not as a missing key a reader
    // could default.
    expect(catalog.contexts).toEqual([{ member, earlyAccessCustomer: null }]);
  });
});

describe("a blocker the eligibility vocabulary does not emit still stops a release", () => {
  it("refuses a founder release for a compound on a recorded regulatory hold", async () => {
    const catalog = sourceOf([HELD_COMPOUND]);
    const { port, state } = res();
    await createFounderReleaseRoute(deps({ catalog }))(
      {
        actor: ACTOR,
        body: {
          releaseId: "rel-0001",
          productId: HELD_COMPOUND.productId,
          variantId: HELD_COMPOUND.variantId,
          productVersion: earlyAccessReleaseVersion(HELD_COMPOUND),
          status: "approved",
          approvedPriceCents: 24_900,
          currency: "USD",
          waivedBlockers: [...HELD_COMPOUND.blockers],
          approvedQuantityLimit: 3,
          expiresAt: null,
          reason: "Founder release for the private early access pilot.",
        },
      },
      port,
    );
    // Every blocker Product Control reported here is waivable, so without the
    // derived check this release would have been recorded.
    expect(state.status).toBe(422);
    expect(state.body.code).toBe("NONWAIVABLE_BLOCKER");
    expect(state.body.nonwaivableBlockers).toContain("REGULATORY_HOLD");
  });

  it("MUTATION: dropping the derived blockers from the founder route lets the same release through", async () => {
    // The mutation is removing `...earlyAccessDerivedBlockers(row)` from the
    // non-waivable list in createFounderReleaseRoute. This asserts the exact
    // state that mutation produces: with only Product Control's own codes, the
    // held compound has no non-waivable blocker at all.
    const productControlOnly = HELD_COMPOUND.blockers.filter((blocker) =>
      ["IDENTITY_NOT_CONFIRMED", "SUPPLIER_NOT_ASSIGNED", "FULFILLMENT_UNAVAILABLE"].includes(
        blocker,
      ),
    );
    expect(productControlOnly).toEqual([]);
  });

  it("still records a release for a unit with no derived blocker", async () => {
    const unit = row();
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    const { port, state } = res();
    await createFounderReleaseRoute(deps({ catalog: sourceOf([unit]), ledger }))(
      {
        actor: ACTOR,
        body: {
          releaseId: "rel-0002",
          productId: unit.productId,
          variantId: unit.variantId,
          productVersion: earlyAccessReleaseVersion(unit),
          status: "approved",
          approvedPriceCents: 24_900,
          currency: "USD",
          waivedBlockers: [...unit.blockers],
          approvedQuantityLimit: 3,
          expiresAt: null,
          reason: "Founder release for the private early access pilot.",
        },
      },
      port,
    );
    expect(state.status).toBe(201);
    expect(state.body.release.actor).toBe(ACTOR);
  });

  it("records the actor the guard authenticated, never the one in the body", async () => {
    const unit = row();
    const { port, state } = res();
    await createFounderReleaseRoute(deps({ catalog: sourceOf([unit]) }))(
      {
        actor: ACTOR,
        body: {
          releaseId: "rel-0003",
          productId: unit.productId,
          variantId: unit.variantId,
          productVersion: earlyAccessReleaseVersion(unit),
          status: "approved",
          approvedPriceCents: 24_900,
          currency: "USD",
          waivedBlockers: [...unit.blockers],
          approvedQuantityLimit: 3,
          expiresAt: null,
          reason: "Founder release for the private early access pilot.",
          actor: "somebody-else@example.com",
        },
      },
      port,
    );
    expect(state.status).toBe(201);
    expect(state.body.release.actor).toBe(ACTOR);
  });
});
