/**
 * XCA-W8 cross-lane assembly, Task 3: the full pricing chain over REAL classes.
 *
 * One PricingProductSource fixture (the true external boundary, the only fake)
 * feeds the REAL AuthoritativePriceResolver. The chain is then run exactly as
 * production composes it:
 *
 *   resolver -> bindCartPrice -> recomputeCheckout -> snapshotOrderLinesFromQuote
 *            -> toOrderLinePriceColumns / toOrderLinePriceColumnRows
 *
 * with the presented cart built honestly from the real bound snapshots. The
 * suite asserts end-state integrity: the same priceId, version, and amount at
 * every hop, a quote hash that re-verifies, and DB column rows that are
 * all-six-non-null.
 */

import { describe, expect, it } from "vitest";
import type { AdminProductDetail } from "@shared/research/product-admin";
import {
  authorizeAudienceFromServerIdentity,
  createAuthoritativePriceResolver,
  type PricingProductSource,
  type ServerAuthorizedAudience,
} from "./authoritative-price-resolver";
import {
  bindCartPrice,
  type CartPriceBindingDeps,
  type VariantLookupBySku,
} from "./cart-price-binding";
import {
  computeQuoteHash,
  recomputeCheckout,
  type PresentedCartLine,
} from "./checkout-recompute";
import {
  snapshotOrderLinesFromQuote,
  toOrderLinePriceColumnRows,
  toOrderLinePriceColumns,
} from "./order-price-snapshot";

const AT = "2026-07-29T12:00:00+00:00";
const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VARIANT_A_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const VARIANT_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const PRICE_A_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const PRICE_B_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const SKU_A = "XCA-CHAIN-SKU-A";
const SKU_B = "XCA-CHAIN-SKU-B";
const AMOUNT_A = 12900;
const AMOUNT_B = 5400;
const VERSION_A = 3;
const VERSION_B = 1;
const QTY_A = 2;
const QTY_B = 1;

function detailFixture(): AdminProductDetail {
  const variant = (id: string, sku: string, sortOrder: number) => ({
    id,
    productId: PRODUCT_ID,
    sku,
    catalogNumber: null,
    label: sku === SKU_A ? "Standard vial" : "Large vial",
    strength: null,
    size: null,
    format: "Vial",
    presentation: null,
    shippingClass: "standard",
    memberEligible: true,
    status: "approved" as const,
    active: true,
    sortOrder,
    createdAt: AT,
    updatedAt: AT,
  });
  const price = (
    id: string,
    variantId: string,
    amountCents: number,
    version: number,
  ) => ({
    id,
    productId: PRODUCT_ID,
    variantId,
    audience: "retail" as const,
    amountCents,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00+00:00",
    expiresAt: null,
    status: "active" as const,
    approvalNote: "Approved",
    version,
    createdBy: "admin",
    approvedBy: "reviewer",
    createdAt: AT,
    updatedAt: AT,
  });
  return {
    id: PRODUCT_ID,
    productCode: "XCA-CHAIN-A",
    slug: "xca-chain-a",
    displayName: "Chain Research",
    canonicalName: "Chain",
    aliases: [],
    lane: "research_material",
    category: "Research",
    classification: "Research material",
    status: "published",
    active: true,
    visibility: "public",
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "approved",
    variantCount: 2,
    approvedVariantCount: 2,
    missingInputCount: 0,
    updatedAt: AT,
    publishedAt: AT,
    content: {
      shortDescription: "Chain fixture.",
      longDescription: null,
      overview: null,
      specifications: null,
      researchInformation: null,
      storageInformation: null,
      handlingInformation: null,
      shippingInformation: null,
      returnInformation: null,
      disclaimers: null,
      citations: [],
      reviewDate: null,
    },
    variants: [variant(VARIANT_A_ID, SKU_A, 0), variant(VARIANT_B_ID, SKU_B, 1)],
    prices: [
      price(PRICE_A_ID, VARIANT_A_ID, AMOUNT_A, VERSION_A),
      price(PRICE_B_ID, VARIANT_B_ID, AMOUNT_B, VERSION_B),
    ],
    media: [],
    history: [],
  };
}

function fixtureSource(product: AdminProductDetail): PricingProductSource {
  return {
    async readProductForPricing(productId) {
      return productId === product.id ? product : null;
    },
  };
}

function lookupFrom(product: AdminProductDetail): VariantLookupBySku {
  return {
    async findVariantBySku(sku) {
      const matches = product.variants.filter((variant) => variant.sku === sku);
      if (matches.length !== 1) return null;
      const variant = matches[0];
      return {
        productId: variant.productId,
        variantId: variant.id,
        sku: variant.sku,
        displayName: `${product.displayName} ${variant.label}`,
      };
    },
  };
}

function audience(): ServerAuthorizedAudience {
  const authorized = authorizeAudienceFromServerIdentity({
    audience: "retail",
    sourceVersion: "session-v1",
    evaluatedAt: AT,
  });
  if (authorized === null) throw new Error("expected authorized audience");
  return authorized;
}

describe("full chain composition over real classes", () => {
  it("carries one price identity intact from resolution to DB column mapping", async () => {
    const product = detailFixture();
    const resolver = createAuthoritativePriceResolver(fixtureSource(product));
    const deps: CartPriceBindingDeps = {
      variants: lookupFrom(product),
      priceResolver: resolver,
    };
    const authorized = audience();

    // Hop 1: bind both cart lines through the real resolver.
    const boundA = await bindCartPrice(
      { sku: SKU_A, quantity: QTY_A, authenticatedAudience: authorized, currency: "USD", at: AT },
      deps,
    );
    const boundB = await bindCartPrice(
      { sku: SKU_B, quantity: QTY_B, authenticatedAudience: authorized, currency: "USD", at: AT },
      deps,
    );
    expect(boundA.state).toBe("bound");
    expect(boundB.state).toBe("bound");
    if (boundA.state !== "bound" || boundB.state !== "bound") return;

    expect(boundA.snapshot.priceId).toBe(PRICE_A_ID);
    expect(boundA.snapshot.priceVersion).toBe(VERSION_A);
    expect(boundA.snapshot.unitAmountCents).toBe(AMOUNT_A);
    expect(boundB.snapshot.priceId).toBe(PRICE_B_ID);
    expect(boundB.snapshot.priceVersion).toBe(VERSION_B);
    expect(boundB.snapshot.unitAmountCents).toBe(AMOUNT_B);

    // Hop 2: the real bound output IS the presented cart for the recompute.
    const presentedLines: PresentedCartLine[] = [boundA.snapshot, boundB.snapshot].map(
      (snapshot) => ({
        sku: snapshot.sku,
        quantity: snapshot.quantity,
        unitAmountCents: snapshot.unitAmountCents,
        lineTotalCents: snapshot.lineTotalCents,
        priceVersion: snapshot.priceVersion,
      }),
    );
    const subtotalCents =
      boundA.snapshot.lineTotalCents + boundB.snapshot.lineTotalCents;
    const recompute = await recomputeCheckout(
      {
        serverLines: [
          { sku: SKU_B, quantity: QTY_B },
          { sku: SKU_A, quantity: QTY_A },
        ],
        presented: { lines: presentedLines, subtotalCents, currency: "USD" },
        authenticatedAudience: authorized,
        currency: "USD",
        at: AT,
      },
      deps,
    );
    expect(recompute.state).toBe("quoted");
    if (recompute.state !== "quoted") return;
    const quote = recompute.quote;

    // The quote emits in SKU order and preserves each identity exactly.
    expect(quote.lines.map((line) => line.sku)).toEqual([SKU_A, SKU_B]);
    expect(quote.lines.map((line) => line.priceId)).toEqual([PRICE_A_ID, PRICE_B_ID]);
    expect(quote.lines.map((line) => line.priceVersion)).toEqual([VERSION_A, VERSION_B]);
    expect(quote.lines.map((line) => line.unitAmountCents)).toEqual([AMOUNT_A, AMOUNT_B]);
    expect(quote.subtotalCents).toBe(subtotalCents);
    expect(quote.quotedAt).toBe(AT);

    // The hash re-verifies from the emitted parts.
    expect(
      computeQuoteHash(quote.lines, quote.subtotalCents, quote.currency, quote.quotedAt),
    ).toBe(quote.quoteHash);

    // Hop 3: order line snapshots, all or none.
    const snapshotResult = snapshotOrderLinesFromQuote(quote);
    expect(snapshotResult.state).toBe("complete");
    if (snapshotResult.state !== "complete") return;
    const orderLines = snapshotResult.lines;
    expect(orderLines).toHaveLength(2);
    expect(orderLines.map((line) => line.priceId)).toEqual([PRICE_A_ID, PRICE_B_ID]);
    expect(orderLines.map((line) => line.priceVersion)).toEqual([VERSION_A, VERSION_B]);
    expect(orderLines.map((line) => line.unitAmountCents)).toEqual([AMOUNT_A, AMOUNT_B]);
    expect(orderLines.every((line) => line.agreedAt === AT)).toBe(true);

    // Hop 4: DB column mapping, all six columns non-null on every row.
    const rowsMapping = toOrderLinePriceColumnRows(orderLines);
    expect(rowsMapping.state).toBe("mapped");
    if (rowsMapping.state !== "mapped") return;
    expect(rowsMapping.rows).toHaveLength(2);
    for (const row of rowsMapping.rows) {
      expect(row.price_id).not.toBeNull();
      expect(row.price_version).not.toBeNull();
      expect(row.audience).not.toBeNull();
      expect(row.unit_amount_cents).not.toBeNull();
      expect(row.currency).not.toBeNull();
      expect(row.priced_at).not.toBeNull();
      expect(Object.keys(row).sort()).toEqual([
        "audience",
        "currency",
        "price_id",
        "price_version",
        "priced_at",
        "unit_amount_cents",
      ]);
    }
    expect(rowsMapping.rows[0]).toEqual({
      price_id: PRICE_A_ID,
      price_version: VERSION_A,
      audience: "retail",
      unit_amount_cents: AMOUNT_A,
      currency: "USD",
      priced_at: AT,
    });
    expect(rowsMapping.rows[1]).toEqual({
      price_id: PRICE_B_ID,
      price_version: VERSION_B,
      audience: "retail",
      unit_amount_cents: AMOUNT_B,
      currency: "USD",
      priced_at: AT,
    });

    // Single-line mapping agrees with the batch mapping.
    const single = toOrderLinePriceColumns(orderLines[0]);
    expect(single.state).toBe("mapped");
    if (single.state !== "mapped") return;
    expect(single.columns).toEqual(rowsMapping.rows[0]);
  });

  it("rejects a tampered quote at the order snapshot hop (hash verifies the chain)", async () => {
    const product = detailFixture();
    const resolver = createAuthoritativePriceResolver(fixtureSource(product));
    const deps: CartPriceBindingDeps = {
      variants: lookupFrom(product),
      priceResolver: resolver,
    };
    const authorized = audience();
    const bound = await bindCartPrice(
      { sku: SKU_A, quantity: 1, authenticatedAudience: authorized, currency: "USD", at: AT },
      deps,
    );
    expect(bound.state).toBe("bound");
    if (bound.state !== "bound") return;
    const recompute = await recomputeCheckout(
      {
        serverLines: [{ sku: SKU_A, quantity: 1 }],
        presented: {
          lines: [
            {
              sku: SKU_A,
              quantity: 1,
              unitAmountCents: AMOUNT_A,
              lineTotalCents: AMOUNT_A,
              priceVersion: VERSION_A,
            },
          ],
          subtotalCents: AMOUNT_A,
          currency: "USD",
        },
        authenticatedAudience: authorized,
        currency: "USD",
        at: AT,
      },
      deps,
    );
    expect(recompute.state).toBe("quoted");
    if (recompute.state !== "quoted") return;

    // Alter a line after quoting: the mutation must not survive into order
    // snapshots. lineTotalCents is recomputed-consistent (amount * quantity)
    // so the hash is the guard that catches it.
    const tampered = {
      ...recompute.quote,
      lines: [
        {
          ...recompute.quote.lines[0],
          unitAmountCents: 1,
          lineTotalCents: 1,
        },
      ],
      subtotalCents: 1,
    };
    const refusal = snapshotOrderLinesFromQuote(tampered);
    expect(refusal).toEqual({ state: "refused", reason: "quote_hash_mismatch" });
  });
});
