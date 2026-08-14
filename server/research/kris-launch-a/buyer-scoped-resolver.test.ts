/**
 * The Buy Now shelf under buyer-scoped pricing: the resolver offers the
 * buyer's authorized amount when the seam answers, the ledger amount when it
 * does not, and a failing provider can only ever restore the public price.
 * The projection's own safeLegacyOrder remains the last word beside the
 * rendered partner price.
 */
import { describe, expect, it, vi } from "vitest";

import type { EarlyAccessCatalogRow } from "../early-access/catalog/early-access-catalog";
import {
  earlyAccessReleaseVersion,
  validateEarlyAccessRelease,
  type EarlyAccessRelease,
} from "../early-access/release/founder-release";
import type { BuyerPriceSheet, BuyerScopedPricing } from "../early-access/commerce/buyer-scoped-pricing";
import {
  buildKrisLegacyOrderResolver,
  type KrisLegacyBindingRecord,
} from "./legacy-order-production";
import { projectKrisItem } from "./projection";
import { krisProduct, pricedAt } from "./test-fixtures";

const HELD_BLOCKERS = ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED"] as const;
const LEDGER_CENTS = 24_900;
const PARTNER_CENTS = 2_464;

function row(overrides: Partial<EarlyAccessCatalogRow> = {}): EarlyAccessCatalogRow {
  return {
    productId: "prod-retatrutide",
    slug: "retatrutide",
    displayName: "Retatrutide",
    canonicalName: "retatrutide",
    variantId: "var-10mg",
    sku: "RETA-10",
    strength: "10 mg",
    presentation: "lyophilised vial",
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
    blockers: [...HELD_BLOCKERS],
    ...overrides,
  } as unknown as EarlyAccessCatalogRow;
}

function approved(overrides: Record<string, unknown> = {}): EarlyAccessRelease {
  const validated = validateEarlyAccessRelease({
    releaseId: "rel-0001",
    productId: "prod-retatrutide",
    variantId: "var-10mg",
    productVersion: earlyAccessReleaseVersion(row()),
    status: "approved",
    approvedPriceCents: LEDGER_CENTS,
    currency: "USD",
    waivedBlockers: [...HELD_BLOCKERS],
    approvedQuantityLimit: 3,
    expiresAt: null,
    actor: "Samuel Boadu",
    reason: "Founder release for the private early access pilot.",
    recordedAt: "2026-08-04T12:00:00.000Z",
    ...overrides,
  });
  if (!validated.ok) throw new Error(`fixture invalid: ${validated.code}`);
  return validated.release;
}

const KRIS_ID = "kli_testalpha0001";
const BINDING: KrisLegacyBindingRecord = {
  krisId: KRIS_ID,
  productId: "prod-retatrutide",
  variantId: "var-10mg",
};
const VIEWER = { memberId: "member-1" };

const PARTNER_SHEET: BuyerPriceSheet = Object.freeze({
  profileKey: "KRIS_VOLUME_PARTNER",
  entitlementId: "ent_kris_v1",
  priceFor: (productId: string, variantId: string) =>
    productId === "prod-retatrutide" && variantId === "var-10mg"
      ? { amountCents: PARTNER_CENTS, currency: "USD" }
      : null,
});

function deps(overrides: Record<string, unknown> = {}) {
  return {
    catalog: { load: vi.fn(async () => ({ rows: [row()] })) },
    releases: { all: vi.fn(async () => [approved()]) },
    customers: { customerRefsFor: vi.fn(async () => ["XEA-0001"]) },
    bindings: [BINDING] as readonly KrisLegacyBindingRecord[],
    now: () => Date.parse("2026-08-14T12:00:00.000Z"),
    ...overrides,
  };
}

describe("the Buy Now shelf under buyer-scoped pricing", () => {
  it("offers the buyer's authorized amount when the seam answers", async () => {
    const scoped: BuyerScopedPricing = { forCustomer: async () => PARTNER_SHEET };
    const resolver = await buildKrisLegacyOrderResolver(
      deps({ buyerScopedPrices: scoped }) as never,
      VIEWER,
    );
    expect(resolver).toBeDefined();
    const selection = resolver!(krisProduct({ id: KRIS_ID, channel: "ruo_research" }), pricedAt(PARTNER_CENTS));
    expect(selection).not.toBeNull();
    expect(selection?.unitPriceCents).toBe(PARTNER_CENTS);
    expect(selection?.currency).toBe("USD");
    // And the projection accepts it beside the rendered partner price.
    const projected = projectKrisItem(
      krisProduct({ id: KRIS_ID, channel: "ruo_research" }),
      pricedAt(PARTNER_CENTS),
      resolver,
    );
    expect(projected.canBuyNow).toBe(true);
    expect(projected.legacyOrder?.unitPriceCents).toBe(PARTNER_CENTS);
  });

  it("offers the ledger amount when no seam is configured, exactly as before", async () => {
    const resolver = await buildKrisLegacyOrderResolver(deps() as never, VIEWER);
    const selection = resolver!(krisProduct({ id: KRIS_ID, channel: "ruo_research" }), pricedAt(LEDGER_CENTS));
    expect(selection?.unitPriceCents).toBe(LEDGER_CENTS);
  });

  it("restores the ledger amount when the provider throws, and safeLegacyOrder closes Buy Now beside a partner rendering", async () => {
    const failing: BuyerScopedPricing = {
      forCustomer: async () => {
        throw new Error("supabase unreachable");
      },
    };
    const resolver = await buildKrisLegacyOrderResolver(
      deps({ buyerScopedPrices: failing }) as never,
      VIEWER,
    );
    const selection = resolver!(krisProduct({ id: KRIS_ID, channel: "ruo_research" }), pricedAt(PARTNER_CENTS));
    // The offer fell back to the LEDGER amount...
    expect(selection?.unitPriceCents).toBe(LEDGER_CENTS);
    // ...so beside a partner-price rendering the projection refuses Buy Now
    // rather than offering a price the door would not authorize.
    const projected = projectKrisItem(
      krisProduct({ id: KRIS_ID, channel: "ruo_research" }),
      pricedAt(PARTNER_CENTS),
      resolver,
    );
    expect(projected.canBuyNow).toBe(false);
    expect(projected.legacyOrder).toBeNull();
  });

  it("an unentitled customer (null sheet) stays at the ledger amount", async () => {
    const unentitled: BuyerScopedPricing = { forCustomer: async () => null };
    const resolver = await buildKrisLegacyOrderResolver(
      deps({ buyerScopedPrices: unentitled }) as never,
      VIEWER,
    );
    const selection = resolver!(krisProduct({ id: KRIS_ID, channel: "ruo_research" }), pricedAt(LEDGER_CENTS));
    expect(selection?.unitPriceCents).toBe(LEDGER_CENTS);
  });

  it("NEGATIVE CONTROL: a scoped price never revives an unreleased unit", async () => {
    const scoped: BuyerScopedPricing = { forCustomer: async () => PARTNER_SHEET };
    const resolver = await buildKrisLegacyOrderResolver(
      deps({ releases: { all: vi.fn(async () => []) }, buyerScopedPrices: scoped }) as never,
      VIEWER,
    );
    // No released unit means nothing may be offered at all.
    expect(resolver).toBeUndefined();
  });
});
