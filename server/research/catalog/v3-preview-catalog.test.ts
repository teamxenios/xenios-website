import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  V3_PREVIEW_PROFILE_COUNT,
  createV3MemberCatalog,
  createV3MemberProductDetail,
  v3PreviewCatalogProducts,
  v3PreviewProducts,
} from "./v3-preview-catalog";

const AT = "2026-07-29T02:00:00.000Z";

describe("sanitized V3 preview catalog", () => {
  it("contains exactly 49 unique public-safe discovery identities", () => {
    expect(v3PreviewProducts).toHaveLength(V3_PREVIEW_PROFILE_COUNT);
    expect(new Set(v3PreviewProducts.map((item) => item.previewId)).size).toBe(49);
    expect(new Set(v3PreviewProducts.map((item) => item.slug)).size).toBe(49);
    expect(v3PreviewProducts.every((item) => item.displayName.trim().length > 0)).toBe(
      true,
    );
  });

  it("keeps every profile price-pending, variant-free, and purchase-disabled", () => {
    expect(
      v3PreviewProducts.every(
        (item) =>
          item.pricingState === "public_price_pending" &&
          item.approvedPrice === null &&
          item.approvedVariantCount === 0 &&
          item.purchasingEnabled === false,
      ),
    ).toBe(true);
  });

  it("provides no manufactured compatibility Product Control authority", () => {
    expect(v3PreviewCatalogProducts).toEqual([]);
    const serialized = JSON.stringify(v3PreviewProducts);
    expect(serialized).not.toContain('"sku"');
    expect(serialized).not.toContain('"amountCents"');
    expect(serialized).not.toContain('"priceCents"');
  });

  it("projects member cards and details without variants, prices, or selection", () => {
    const catalog = createV3MemberCatalog(AT);
    expect(catalog.items).toHaveLength(49);
    expect(
      catalog.items.every(
        (item) =>
          item.price === null &&
          item.variantCount === 0 &&
          item.selection === null &&
          item.readiness === null,
      ),
    ).toBe(true);

    const detail = createV3MemberProductDetail("glp-1-pathway", AT);
    expect(detail?.displayState).toBe("catalog_only");
    expect(detail?.variants).toEqual([]);
    expect(detail?.price).toBeNull();
    expect(detail?.selection).toBeNull();
    expect(createV3MemberProductDetail("not-a-profile", AT)).toBeNull();
  });

  it("keeps the PR-renderable handoff free of internal pricing evidence", () => {
    const handoff = readFileSync(
      new URL(
        "../../../docs/coordination/session-checkins/products-and-diagnostics.md",
        import.meta.url,
      ),
      "utf8",
    );
    expect(handoff).not.toMatch(/\b[A-Z]{3}-\d{3}\b/);
    expect(handoff).not.toMatch(/(?:USD|[$€£])\s*\d/i);
    expect(handoff).not.toMatch(/\b\d+\s+cents\b/i);
    expect(handoff).not.toMatch(/(?:[A-Z]:\\|\/(?:Users|home)\/)/);
    expect(handoff).not.toMatch(
      /\b(?:decision identifier|proposed amount|pricing source|pricing package|internal cost|supplier cost|wholesale cost)\b/i,
    );
  });
});
