// ANONYMOUS EARLY ACCESS RETAIL PRICING, end to end through the REAL pieces:
// the assisted-order viewer resolvers, the composition-root seam INCLUDING the
// Early Access retail fallback that server/index.ts wires, the real
// master-offerings composition, the real approved-price authority, and the
// assisted-order catalog projection plus its submission-time re-read.
//
// This exists because production measured 420 catalog rows and ZERO prices on
// 2026-08-20: an Early Access visitor has no member row, the pricing grant was
// derived only from one, so every approved price degraded to "Price on
// request" and nothing in the catalog could be ordered at a stated price.
//
// It lives INSIDE the master-offerings lane on purpose: the lane boundary in
// catalog-boundaries.test.ts allows only the composition root to import
// composition and service, and this proof needs both.

import { describe, expect, it } from "vitest";
import type { Request } from "express";
import type { AdminProductDetail } from "@shared/research/product-admin";
import { createAssistedOrderViewerResolvers } from "../assisted-order/express";
import {
  createAssistedOrderMasterCatalogCallbacks,
  type AssistedOrderMasterCatalogService,
} from "../assisted-order/production-catalog";
import { createMasterOfferingCatalogDependencies } from "./composition";
import {
  earlyAccessRetailPricingViewer,
  pricingViewerForCustomerViewer,
  EARLY_ACCESS_RETAIL_PRICE_AUDIENCE,
} from "./early-access-retail-pricing";
import { pricingIdentityFromViewer } from "./member-pricing-viewer";
import { InMemoryMasterOfferingCatalogReader } from "./service";
import { offering, variant } from "./test-fixtures";

const PRICED = offering({
  id: "mo_priced",
  slug: "priced",
  displayName: "BPC-157",
  canonicalName: "BPC-157",
  variants: [variant({ id: "mov_priced", label: "5 mg vial" })],
});

const UNPRICED = offering({
  id: "mo_unpriced",
  slug: "unpriced",
  displayName: "BAM15",
  canonicalName: "BAM15",
  variants: [variant({ id: "mov_unpriced", label: "500 mcg" })],
});

const BINDINGS: Record<string, { productId: string; variantId: string }> = {
  mov_priced: { productId: "pc_priced", variantId: "pcv_priced" },
  mov_unpriced: { productId: "pc_unpriced", variantId: "pcv_unpriced" },
};

/** The live approved amount, mutable so a mid-visit price change can be exercised. */
let currentPriceCents = 6500;

/** A Product Control product with, or deliberately without, one approved price. */
function product(
  id: string,
  variantId: string,
  amountCents: number | null,
): AdminProductDetail {
  return {
    id,
    status: "published",
    visibility: "public",
    active: true,
    variants: [
      {
        id: variantId,
        productId: id,
        status: "approved",
        active: true,
        memberEligible: true,
        sku: "XEN-" + variantId,
      },
    ],
    prices:
      amountCents === null
        ? []
        : [
            {
              id: "price_" + id,
              productId: id,
              variantId,
              // The audience the published retail schedule actually lives on.
              // LITERAL on purpose: a fixture built from the constant under
              // test passes for every value of it, including one with no
              // production price rows at all.
              audience: "member",
              amountCents,
              currency: "USD",
              effectiveAt: "2026-08-01T00:00:00.000Z",
              expiresAt: null,
              status: "active",
              approvalNote: null,
              version: 1,
              createdBy: "ops",
              approvedBy: "founder",
              createdAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z",
            },
          ],
  } as unknown as AdminProductDetail;
}

/**
 * The EXACT seam server/index.ts wires: the same shared derivation, the real
 * composition, the real assisted-order catalog callbacks.
 */
function catalogCallbacks() {
  const dependencies = createMasterOfferingCatalogDependencies(
    {
      bindings: {
        // The composition asks by {offeringId, offeringVariantId}, not by a
        // bare string. Keying this wrong silently unprices the whole catalog,
        // which is the exact class of defect this file exists to catch.
        readBinding: (ref: { offeringVariantId: string }) =>
          BINDINGS[ref.offeringVariantId]
            ? { offeringVariantId: ref.offeringVariantId, ...BINDINGS[ref.offeringVariantId] }
            : null,
      },
      selections: {
        select: async () => ({ ok: false, code: "product_commerce_unapproved" as const }),
      },
      pricingSource: {
        readProductForPricing: async (id: string) =>
          id === "pc_priced"
            ? product("pc_priced", "pcv_priced", currentPriceCents)
            : id === "pc_unpriced"
              ? product("pc_unpriced", "pcv_unpriced", null)
              : null,
      },
      identityFor: (viewer) => pricingIdentityFromViewer(viewer),
      catalogReader: new InMemoryMasterOfferingCatalogReader([PRICED, UNPRICED]),
      env: {},
    },
    () => null,
  );
  return createAssistedOrderMasterCatalogCallbacks({
    serviceFor: (viewer) => {
      // The SAME derivation server/index.ts calls, not a copy of it.
      const pricingViewer = pricingViewerForCustomerViewer(viewer);
      const service = dependencies.serviceForViewer(pricingViewer as never);
      return service instanceof Promise
        ? null
        : (service as unknown as AssistedOrderMasterCatalogService);
    },
    bindingFor: (id) => BINDINGS[id] ?? null,
    offeringVariantFor: (identity) =>
      Object.keys(BINDINGS).find(
        (key) =>
          BINDINGS[key].productId === identity.productId &&
          BINDINGS[key].variantId === identity.variantId,
      ) ?? null,
    catalogVersion: "catalog-v1",
  });
}

function resolvers() {
  return createAssistedOrderViewerResolvers({
    resolveMember: async () => null,
    earlyAccess: () => ({
      identity: {
        resolve: async () => ({
          customerRef: "eac_0123456789abcdef0123456789abcdef",
          displayName: "Early Access customer",
          boundBy: "verified_link" as const,
        }),
      },
      // The production resolver now proves the session before it reads either
      // its id or its customer binding. Omitting this authority makes the
      // fixture fail closed to the capability-free viewer, which correctly
      // receives no retail pricing but does not model the scenario under test.
      resolveSession: async () => ({ authenticated: true }),
      readSessionId: () => "ea-session-1",
    }),
    // This anonymous-Early-Access pricing test does not resolve a member, so
    // the member/customer binding directory is deliberately absent.
    earlyAccessBindings: () => null,
    adminEmail: () => "research@xeniostechnology.com",
  });
}

async function earlyAccessViewer() {
  const viewer = await resolvers().customer({
    headers: { cookie: "ea=1" },
  } as unknown as Request);
  expect(viewer.actorType).toBe("early_access_session");
  return viewer;
}

describe("an anonymous Early Access customer sees the approved retail price", () => {
  it("prices the catalog, where before it saw no price at all", async () => {
    const page = await catalogCallbacks().list(await earlyAccessViewer(), {
      page: 1,
      pageSize: 24,
    });
    const priced = page.items.find((item) => item.productName === "BPC-157");
    expect(priced?.unitPriceCents).toBe(6500);
    expect(priced?.priceVersion).toBe("price_pc_priced");
    expect(priced?.workflowMode).toBe("direct_order_request");
  });

  it("still shows Price on request for a genuinely unpriced row, and never zero", async () => {
    const page = await catalogCallbacks().list(await earlyAccessViewer(), {
      page: 1,
      pageSize: 24,
    });
    // Anchor the page first: without this the assertions below also pass in a
    // world where NOTHING prices, which is the very state being repaired.
    expect(page.items.some((item) => item.unitPriceCents !== null)).toBe(true);
    const unpriced = page.items.find((item) => item.productName === "BAM15");
    expect(unpriced?.unitPriceCents).toBeNull();
    expect(unpriced?.unitPriceCents).not.toBe(0);
    expect(unpriced?.workflowMode).toBe("request_pricing");
  });

  it("resolves the SAME price at submission time as it showed in the catalog", async () => {
    // The failure this guards against is a customer being quoted a number and
    // then told at submit that the product has no price.
    const callbacks = catalogCallbacks();
    const viewer = await earlyAccessViewer();
    const page = await callbacks.list(viewer, { page: 1, pageSize: 24 });
    const listed = page.items.find((item) => item.productName === "BPC-157");
    // Both sides must be a real number, or "they agree" would just mean they
    // agree on nothing.
    expect(listed?.unitPriceCents).toBe(6500);
    const resolved = await callbacks.resolve(
      viewer,
      listed!.productId,
      listed!.variantId,
    );
    expect(resolved?.unitPriceCents).toBe(listed!.unitPriceCents);
    expect(resolved?.priceVersion).toBe(listed!.priceVersion);
    expect(callbacks.fingerprint(resolved!)).toBe(callbacks.fingerprint(listed!));
  });

  it("gains no pricing when there is no Early Access session at all", async () => {
    // The authority exists for a REAL session. A viewer without one must not
    // be handed a price, or the fallback would become a way to price anything.
    const viewer = await earlyAccessViewer();
    const page = await catalogCallbacks().list(
      { ...viewer, earlyAccessSessionHash: null } as never,
      { page: 1, pageSize: 24 },
    );
    const priced = page.items.find((item) => item.productName === "BPC-157");
    expect(priced?.unitPriceCents).toBeNull();
  });

  it("cannot be selected or influenced by the browser", async () => {
    // Every request-shaped input the browser controls, pushed at the resolver.
    const hostile = {
      headers: {
        cookie: "ea=1",
        "x-pricing-audience": "wholesale",
        "x-price-profile": "professional",
      },
      body: {
        audience: "wholesale",
        pricingGrant: { sourceVersion: "forged", audience: "wholesale" },
      },
      query: { audience: "wholesale" },
    } as unknown as Request;
    const viewer = await resolvers().customer(hostile);
    expect(viewer.actorType).toBe("early_access_session");
    const page = await catalogCallbacks().list(viewer, { page: 1, pageSize: 24 });
    // The one retail price, not a wholesale one, and not a forged grant.
    const priced = page.items.find((item) => item.productName === "BPC-157");
    expect(priced?.unitPriceCents).toBe(6500);
    expect(priced?.priceVersion).toBe("price_pc_priced");
  });

  it("charges the price the SERVER resolves at submit, not the one the customer saw", async () => {
    // A customer must never be able to pin a stale, cheaper price by holding a
    // page open. The submit seam re-resolves; this proves the re-resolution is
    // the live one and that the fingerprint moves with it, so a replay of the
    // old line cannot silently pass as the same request.
    const callbacks = catalogCallbacks();
    const viewer = await earlyAccessViewer();
    currentPriceCents = 6500;
    const page = await callbacks.list(viewer, { page: 1, pageSize: 24 });
    const listed = page.items.find((item) => item.productName === "BPC-157")!;
    expect(listed.unitPriceCents).toBe(6500);

    // Product Control approves a new price while the page sits open.
    currentPriceCents = 7500;
    const resolved = await callbacks.resolve(
      viewer,
      listed.productId,
      listed.variantId,
    );
    expect(resolved?.unitPriceCents).toBe(7500);
    expect(callbacks.fingerprint(resolved!)).not.toBe(
      callbacks.fingerprint(listed),
    );
    currentPriceCents = 6500;
  });

  it("escalates no privilege: the grant buys a price and nothing else", async () => {
    const viewer = earlyAccessRetailPricingViewer();
    // Not an admin, however the audience field is read.
    expect(viewer.audience).not.toBe("admin");
    // No identity to impersonate a buyer with.
    expect(viewer.email).toBe("");
    // Frozen, so no later code path can quietly widen it in place.
    expect(Object.isFrozen(viewer)).toBe(true);
    expect(Object.isFrozen(viewer.pricingGrant)).toBe(true);
    // The grant names ONE audience and carries nothing else.
    expect(Object.keys(viewer.pricingGrant ?? {}).sort()).toEqual([
      "audience",
      "sourceVersion",
    ]);
    // Two separate calls cannot accumulate state across visitors.
    expect(earlyAccessRetailPricingViewer()).not.toBe(viewer);
    expect(earlyAccessRetailPricingViewer()).toEqual(viewer);
  });

  it("carries no member identity, capability, or email with the grant", async () => {
    const viewer = earlyAccessRetailPricingViewer();
    expect(viewer.email).toBe("");
    expect(JSON.stringify(viewer)).not.toMatch(/memberId|capabilit|token|secret/i);
    const identity = pricingIdentityFromViewer(viewer);
    expect(identity?.audience).toBe(EARLY_ACCESS_RETAIL_PRICE_AUDIENCE);
    expect(identity?.currency).toBe("USD");
  });

  it("leaks no procurement economics into the customer projection", async () => {
    const page = await catalogCallbacks().list(await earlyAccessViewer(), {
      page: 1,
      pageSize: 24,
    });
    const wire = JSON.stringify(page).toLowerCase();
    // Prove the payload under inspection is the priced one.
    expect(wire).toContain("6500");
    for (const forbidden of [
      "wholesale",
      "supplierprice",
      "supplier_price",
      "margin",
      "markup",
      "multiplier",
      "benchmark",
      "grossprofit",
    ]) {
      expect(wire).not.toContain(forbidden);
    }
  });
});
