import { describe, expect, it } from "vitest";

import type { EarlyAccessCatalogProjection, EarlyAccessCatalogRow } from "../catalog/early-access-catalog";
import { InMemoryEarlyAccessReleaseLedger, earlyAccessReleaseVersion } from "./founder-release";
import {
  EmptyEarlyAccessCatalogSource,
  createEarlyAccessCatalogRoute,
  createFounderReleaseRoute,
  createReleaseHistoryRoute,
  type EarlyAccessCatalogSource,
} from "./release-routes";

const NOW = Date.parse("2026-08-04T12:00:00.000Z");
const HELD = ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED"] as const;

function row(overrides: Partial<EarlyAccessCatalogRow> = {}): EarlyAccessCatalogRow {
  return {
    productId: "prod-a",
    slug: "product-a",
    displayName: "Product A",
    canonicalName: "product-a",
    variantId: "var-1",
    sku: "A-1",
    strength: "10 mg",
    presentation: "vial",
    priceCents: null,
    currency: "",
    audience: "member",
    availability: "available",
    offerState: "APPROVAL_REQUIRED_PURCHASE",
    description: "",
    imageState: "none",
    quantityLimit: 3,
    supplierReady: false,
    disputeStatus: { identity: "none", strength: "none" },
    purchasable: false,
    blockers: [...HELD],
    ...overrides,
  } as unknown as EarlyAccessCatalogRow;
}

function sourceOf(rows: EarlyAccessCatalogRow[]): EarlyAccessCatalogSource {
  return {
    async load(now: Date) {
      return {
        evaluatedAt: now.toISOString(),
        rows,
        productsWithoutVariants: [],
      } as unknown as EarlyAccessCatalogProjection;
    },
  };
}

function res() {
  const headers: Record<string, string> = {};
  const state: { status: number; body: any; headers: Record<string, string> } = {
    status: 0,
    body: null,
    headers,
  };
  const port: any = {
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
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

function releaseBody(target: EarlyAccessCatalogRow, overrides: Record<string, unknown> = {}) {
  return {
    releaseId: "rel-0001",
    productId: target.productId,
    variantId: target.variantId,
    productVersion: earlyAccessReleaseVersion(target),
    status: "approved",
    approvedPriceCents: 24_900,
    currency: "USD",
    waivedBlockers: [...target.blockers],
    approvedQuantityLimit: 3,
    expiresAt: null,
    reason: "Founder release for the private early access pilot.",
    ...overrides,
  };
}

describe("the catalog behind the gate", () => {
  it("refuses an unauthenticated caller instead of returning an empty catalog", async () => {
    // An empty list and a rejected session must not look the same, or a
    // signed-out customer reads "nothing available" and believes it.
    const { port, state } = res();
    const route = createEarlyAccessCatalogRoute(
      deps({ resolveSession: async () => ({ authenticated: false, expiresAtEpochMs: null }) }),
    );
    await route({ cookieHeader: "nope=1" }, port);
    expect(state.status).toBe(401);
    expect(state.body).toMatchObject({ ok: false, code: "not_authenticated" });
    expect(JSON.stringify(state.body)).not.toMatch(/product-a|prod-a/);
  });

  it("serves only founder-released units to a signed-in customer", async () => {
    // A unit no founder ever released is ABSENT from the customer catalog,
    // not shown as coming soon: the portal sells the first release, and an
    // empty ledger truthfully means there is nothing in it yet.
    const { port, state } = res();
    await createEarlyAccessCatalogRoute(deps())({ cookieHeader: "x=1" }, port);
    expect(state.status).toBe(200);
    expect(state.body.units).toHaveLength(0);
    expect(state.body.purchasableCount).toBe(0);

    // The same unit becomes visible the moment a release names it, in any
    // status, and an EXPIRED release keeps it visible and truthfully held.
    const unit = row();
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    await ledger.append({
      ...releaseBody(unit),
      expiresAt: "2026-08-04T11:30:00.000Z",
      actor: "Samuel Boadu",
      recordedAt: "2026-08-04T11:00:00.000Z",
    });
    const second = res();
    await createEarlyAccessCatalogRoute(deps({ ledger }))({ cookieHeader: "x=1" }, second.port);
    expect(second.state.body.units).toHaveLength(1);
    expect(second.state.body.purchasableCount).toBe(0);
    expect(second.state.body.units[0].availability).toBe("TEMPORARILY_HELD");
    expect(second.state.body.units[0].priceCents).toBeNull();
  });

  it("shows a founder-released unit as purchasable at the release price", async () => {
    const unit = row();
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    await ledger.append({ ...releaseBody(unit), actor: "Samuel Boadu", recordedAt: "2026-08-04T11:00:00.000Z" });
    const { port, state } = res();
    await createEarlyAccessCatalogRoute(deps({ ledger }))({ cookieHeader: "x=1" }, port);
    expect(state.body.purchasableCount).toBe(1);
    expect(state.body.units[0].priceCents).toBe(24_900);
    expect(state.body.units[0].basis).toBe("founder_release");
  });

  it("a broken catalog is unavailable, not empty", async () => {
    const { port, state } = res();
    const broken: EarlyAccessCatalogSource = {
      async load() {
        throw new Error("product control is down");
      },
    };
    await createEarlyAccessCatalogRoute(deps({ catalog: broken }))({ cookieHeader: "x=1" }, port);
    expect(state.status).toBe(503);
  });

  it("never lets a protected response be cached or indexed", async () => {
    const { port, state } = res();
    await createEarlyAccessCatalogRoute(deps())({ cookieHeader: "x=1" }, port);
    expect(state.headers["cache-control"]).toContain("no-store");
    expect(state.headers["x-robots-tag"]).toContain("noindex");
  });

  it("an empty source is genuinely empty", async () => {
    const { port, state } = res();
    await createEarlyAccessCatalogRoute(deps({ catalog: new EmptyEarlyAccessCatalogSource() }))(
      { cookieHeader: "x=1" },
      port,
    );
    expect(state.status).toBe(200);
    expect(state.body.units).toEqual([]);
  });
});

describe("recording a founder release", () => {
  it("records the release and returns it", async () => {
    const { port, state } = res();
    const d = deps();
    await createFounderReleaseRoute(d)({ body: releaseBody(row()), actor: "Samuel Boadu" }, port);
    expect(state.status).toBe(201);
    expect(state.body.release.actor).toBe("Samuel Boadu");
    expect(await d.ledger.all()).toHaveLength(1);
  });

  it("NEVER takes the actor from the request body", async () => {
    // An audit trail that records a name the caller typed is not an audit trail.
    const { port, state } = res();
    const d = deps();
    await createFounderReleaseRoute(d)(
      { body: { ...releaseBody(row()), actor: "Someone Else" }, actor: "Samuel Boadu" },
      port,
    );
    expect(state.status).toBe(201);
    expect(state.body.release.actor).toBe("Samuel Boadu");
  });

  it("refuses when the admin guard resolved no actor", async () => {
    const { port, state } = res();
    const d = deps();
    await createFounderReleaseRoute(d)({ body: releaseBody(row()) }, port);
    expect(state.status).toBe(403);
    expect(await d.ledger.all()).toHaveLength(0);
  });

  it("REFUSES when the product changed since the founder looked", async () => {
    // Optimistic locking: approving a picture that has since changed would
    // approve the new state unseen.
    const { port, state } = res();
    const stale = earlyAccessReleaseVersion(row({ strength: "5 mg" }));
    const d = deps();
    await createFounderReleaseRoute(d)(
      { body: releaseBody(row(), { productVersion: stale }), actor: "Samuel Boadu" },
      port,
    );
    expect(state.status).toBe(409);
    expect(state.body.code).toBe("product_changed");
    // It tells the founder what it is NOW, so they can review and resubmit.
    expect(state.body.currentVersion).toBe(earlyAccessReleaseVersion(row()));
    expect(await d.ledger.all()).toHaveLength(0);
  });

  it("refuses a unit that does not exist", async () => {
    const { port, state } = res();
    await createFounderReleaseRoute(deps())(
      { body: releaseBody(row(), { variantId: "var-nope" }), actor: "Samuel Boadu" },
      port,
    );
    expect(state.status).toBe(404);
  });

  it("REFUSES an attempt to waive a non-waivable blocker, and names it", async () => {
    const { port, state } = res();
    const d = deps();
    await createFounderReleaseRoute(d)(
      { body: releaseBody(row(), { waivedBlockers: [...HELD, "STRENGTH_DISPUTE_UNRESOLVED"] }), actor: "Samuel Boadu" },
      port,
    );
    expect(state.status).toBe(422);
    expect(state.body.code).toBe("NONWAIVABLE_BLOCKER");
    expect(state.body.nonwaivableBlockers).toContain("STRENGTH_DISPUTE_UNRESOLVED");
    expect(await d.ledger.all()).toHaveLength(0);
  });

  it("REFUSES to offer approval at all on a unit whose contents are in doubt", async () => {
    const disputed = row({ blockers: [...HELD, "IDENTITY_DISPUTE_UNRESOLVED"] });
    const { port, state } = res();
    const d = deps({ catalog: sourceOf([disputed]) });
    await createFounderReleaseRoute(d)(
      { body: releaseBody(disputed, { waivedBlockers: [...HELD] }), actor: "Samuel Boadu" },
      port,
    );
    expect(state.status).toBe(422);
    expect(state.body.nonwaivableBlockers).toContain("IDENTITY_DISPUTE_UNRESOLVED");
    expect(await d.ledger.all()).toHaveLength(0);
  });

  it("refuses a body that is not an object", async () => {
    for (const body of [null, "release", 42, []]) {
      const { port, state } = res();
      await createFounderReleaseRoute(deps())({ body, actor: "Samuel Boadu" }, port);
      expect(state.status).toBe(400);
    }
  });

  it("refuses a non-string blocker list rather than coercing it", async () => {
    const { port, state } = res();
    await createFounderReleaseRoute(deps())(
      { body: releaseBody(row(), { waivedBlockers: [{ evil: true }] }), actor: "Samuel Boadu" },
      port,
    );
    expect(state.status).toBe(400);
  });
});

describe("the release history", () => {
  it("returns every record for a unit, including the revocation", async () => {
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    const unit = row();
    await ledger.append({ ...releaseBody(unit), actor: "Samuel Boadu", recordedAt: "2026-08-04T11:00:00.000Z" });
    await ledger.append({
      ...releaseBody(unit, { releaseId: "rel-0002", status: "revoked" }),
      actor: "Samuel Boadu",
      recordedAt: "2026-08-04T11:30:00.000Z",
    });
    const { port, state } = res();
    await createReleaseHistoryRoute(deps({ ledger }))(
      { query: { productId: "prod-a", variantId: "var-1" } },
      port,
    );
    expect(state.status).toBe(200);
    expect(state.body.history).toHaveLength(2);
    expect(state.body.history[0].status).toBe("approved");
  });

  it("refuses a query missing the unit", async () => {
    const { port, state } = res();
    await createReleaseHistoryRoute(deps())({ query: { productId: "prod-a" } }, port);
    expect(state.status).toBe(400);
  });
});
