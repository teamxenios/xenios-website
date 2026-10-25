import { describe, expect, it } from "vitest";

import {
  PEPTIDE_CATALOG,
  allVariantsWithProduct,
} from "@shared/research/catalog/peptide-catalog";
import {
  PARTNER_QUOTE_UNAVAILABLE_REASONS,
  PARTNER_QUOTE_UNAVAILABLE_SENTENCES,
  WHITE_LABEL_LEDGERS,
  type PartnerWholesaleQuote,
} from "@shared/research/white-label/contracts";
import {
  partnerQuoteExistsForSku,
  recordPartnerWholesaleQuote,
  resolvePartnerWholesalePrice,
} from "./partner-quotes";

const SKU = "R360-PT141-10MG-VIAL";
const PARTNER = "partner_northstar";

function quote(overrides: Partial<PartnerWholesaleQuote> = {}): PartnerWholesaleQuote {
  const result = recordPartnerWholesaleQuote({
    quoteId: "wlq_1",
    partnerId: PARTNER,
    sku: SKU,
    amountCents: 6400,
    currency: "USD",
    effectiveDate: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-10-01T00:00:00.000Z",
    quoteVersion: 1,
    recordedByAdminId: "admin_samuel",
    recordedAt: "2026-06-30T12:00:00.000Z",
  });
  if (!result.ok) throw new Error(`fixture quote rejected: ${result.rejections.join(", ")}`);
  return { ...result.quote, ...overrides };
}

describe("recording a quote", () => {
  it("accepts a complete quote and freezes it", () => {
    const result = recordPartnerWholesaleQuote({
      quoteId: "wlq_1",
      partnerId: PARTNER,
      sku: SKU,
      amountCents: 6400,
      currency: "usd",
      effectiveDate: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-10-01T00:00:00.000Z",
      quoteVersion: 1,
      recordedByAdminId: "admin_samuel",
      recordedAt: "2026-06-30T12:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.currency).toBe("USD");
    expect(result.quote.amountCents).toBe(6400);
    expect(Object.isFrozen(result.quote)).toBe(true);
  });

  it("refuses a zero amount, so no zero can reach a surface", () => {
    const result = recordPartnerWholesaleQuote({
      quoteId: "wlq_zero",
      partnerId: PARTNER,
      sku: SKU,
      amountCents: 0,
      currency: "USD",
      effectiveDate: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-10-01T00:00:00.000Z",
      quoteVersion: 1,
      recordedByAdminId: "admin_samuel",
      recordedAt: "2026-06-30T12:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejections).toContain("amount_not_usable");
  });

  it("refuses a fractional or negative amount", () => {
    for (const amountCents of [-100, 12.5]) {
      const result = recordPartnerWholesaleQuote({
        quoteId: "wlq_bad",
        partnerId: PARTNER,
        sku: SKU,
        amountCents,
        currency: "USD",
        effectiveDate: "2026-07-01T00:00:00.000Z",
        expiresAt: "2026-10-01T00:00:00.000Z",
        quoteVersion: 1,
        recordedByAdminId: "admin_samuel",
        recordedAt: "2026-06-30T12:00:00.000Z",
      });
      expect(result.ok).toBe(false);
    }
  });

  it("requires a named human, an unexpired window, a version, and a supported currency", () => {
    const result = recordPartnerWholesaleQuote({
      quoteId: "",
      partnerId: "",
      sku: "",
      amountCents: 6400,
      currency: "GBP",
      effectiveDate: "not-a-date",
      expiresAt: "also-not-a-date",
      quoteVersion: 0,
      recordedByAdminId: "   ",
      recordedAt: "nope",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect([...result.rejections].sort()).toEqual([
      "currency_not_supported",
      "effective_date_unparseable",
      "expiry_unparseable",
      "partner_missing",
      "quote_id_missing",
      "recorded_at_unparseable",
      "recorder_not_named",
      "sku_missing",
      "version_not_positive",
    ]);
  });

  it("refuses a window that ends before it begins", () => {
    const result = recordPartnerWholesaleQuote({
      quoteId: "wlq_backwards",
      partnerId: PARTNER,
      sku: SKU,
      amountCents: 6400,
      currency: "USD",
      effectiveDate: "2026-10-01T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
      quoteVersion: 1,
      recordedByAdminId: "admin_samuel",
      recordedAt: "2026-06-30T12:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejections).toContain("expiry_not_after_effective_date");
  });
});

describe("resolving a quote", () => {
  const at = "2026-08-01T00:00:00.000Z";

  it("returns the exact quoted amount, currency, dates, and version", () => {
    const price = resolvePartnerWholesalePrice([quote()], {
      partnerId: PARTNER,
      sku: SKU,
      at,
      currency: "USD",
    });
    expect(price).toEqual({
      state: "QUOTED",
      sku: SKU,
      amountCents: 6400,
      currency: "USD",
      effectiveDate: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-10-01T00:00:00.000Z",
      quoteVersion: 1,
      ledger: "WHITE_LABEL_WHOLESALE",
    });
  });

  it("defaults an unpriced request to QUOTE_REQUIRED, with no amount field at all", () => {
    const price = resolvePartnerWholesalePrice([], {
      partnerId: PARTNER,
      sku: SKU,
      at,
      currency: "USD",
    });
    expect(price.state).toBe("QUOTE_REQUIRED");
    expect(price).not.toHaveProperty("amountCents");
    // Not merely absent: there is no numeric field of any kind on this branch, so a
    // surface has nothing it could read as 0.
    expect(
      Object.values(price).filter((value) => typeof value === "number"),
    ).toEqual([]);
    if (price.state !== "QUOTE_REQUIRED") return;
    expect(price.reason).toBe("no_quote_on_record");
    expect(price.message).toBe(
      PARTNER_QUOTE_UNAVAILABLE_SENTENCES.no_quote_on_record,
    );
  });

  it("never answers another partner's quote", () => {
    const price = resolvePartnerWholesalePrice([quote()], {
      partnerId: "partner_someone_else",
      sku: SKU,
      at,
      currency: "USD",
    });
    expect(price.state).toBe("QUOTE_REQUIRED");
  });

  it("never answers another SKU's quote", () => {
    const price = resolvePartnerWholesalePrice([quote()], {
      partnerId: PARTNER,
      sku: "R360-TESAMORELIN-10MG-VIAL",
      at,
      currency: "USD",
    });
    expect(price.state).toBe("QUOTE_REQUIRED");
  });

  it("distinguishes not-yet-effective from expired", () => {
    const early = resolvePartnerWholesalePrice([quote()], {
      partnerId: PARTNER,
      sku: SKU,
      at: "2026-06-01T00:00:00.000Z",
      currency: "USD",
    });
    expect(early.state === "QUOTE_REQUIRED" && early.reason).toBe(
      "quote_not_yet_effective",
    );
    const late = resolvePartnerWholesalePrice([quote()], {
      partnerId: PARTNER,
      sku: SKU,
      at: "2026-11-01T00:00:00.000Z",
      currency: "USD",
    });
    expect(late.state === "QUOTE_REQUIRED" && late.reason).toBe("quote_expired");
  });

  it("treats the expiry instant as past the window", () => {
    const price = resolvePartnerWholesalePrice([quote()], {
      partnerId: PARTNER,
      sku: SKU,
      at: "2026-10-01T00:00:00.000Z",
      currency: "USD",
    });
    expect(price.state).toBe("QUOTE_REQUIRED");
  });

  it("takes the highest version in effect and keeps the superseded record", () => {
    const quotes = [
      quote({ quoteId: "wlq_1", quoteVersion: 1, amountCents: 6400 }),
      quote({ quoteId: "wlq_2", quoteVersion: 2, amountCents: 5900 }),
    ];
    const price = resolvePartnerWholesalePrice(quotes, {
      partnerId: PARTNER,
      sku: SKU,
      at,
      currency: "USD",
    });
    expect(price.state === "QUOTED" && price.amountCents).toBe(5900);
    expect(quotes).toHaveLength(2);
  });

  it("refuses rather than picking when two records claim the same version", () => {
    const price = resolvePartnerWholesalePrice(
      [
        quote({ quoteId: "wlq_a", quoteVersion: 3, amountCents: 6400 }),
        quote({ quoteId: "wlq_b", quoteVersion: 3, amountCents: 100 }),
      ],
      { partnerId: PARTNER, sku: SKU, at, currency: "USD" },
    );
    expect(price.state === "QUOTE_REQUIRED" && price.reason).toBe("quote_ambiguous");
  });

  it("refuses a currency we hold no quote in", () => {
    const price = resolvePartnerWholesalePrice([quote()], {
      partnerId: PARTNER,
      sku: SKU,
      at,
      currency: "EUR",
    });
    expect(price.state === "QUOTE_REQUIRED" && price.reason).toBe(
      "currency_not_supported",
    );
  });

  it("refuses a quote whose amount was corrupted after recording", () => {
    const price = resolvePartnerWholesalePrice([quote({ amountCents: 0 })], {
      partnerId: PARTNER,
      sku: SKU,
      at,
      currency: "USD",
    });
    expect(price.state === "QUOTE_REQUIRED" && price.reason).toBe(
      "quote_amount_invalid",
    );
  });

  it("tags every outcome to the white-label wholesale ledger", () => {
    const quoted = resolvePartnerWholesalePrice([quote()], {
      partnerId: PARTNER,
      sku: SKU,
      at,
      currency: "USD",
    });
    const required = resolvePartnerWholesalePrice([], {
      partnerId: PARTNER,
      sku: SKU,
      at,
      currency: "USD",
    });
    expect(quoted.ledger).toBe(WHITE_LABEL_LEDGERS.whiteLabelWholesale);
    expect(required.ledger).toBe(WHITE_LABEL_LEDGERS.whiteLabelWholesale);
    expect(quoted.ledger).not.toBe(WHITE_LABEL_LEDGERS.affiliateCommission);
  });

  it("keeps the unavailable vocabulary and its sentences in step", () => {
    expect(Object.keys(PARTNER_QUOTE_UNAVAILABLE_SENTENCES).sort()).toEqual(
      [...PARTNER_QUOTE_UNAVAILABLE_REASONS].sort(),
    );
  });
});

describe("the quote authority cannot see a cost basis", () => {
  it("never reproduces a catalog wholesale cost or any price derived from one", () => {
    // Every operator-only amount recorded on a workbook variant. If the quote
    // authority could reach the cost basis, one of these would be the easy answer.
    const forbidden = new Set<number>();
    for (const entry of allVariantsWithProduct(PEPTIDE_CATALOG)) {
      for (const amount of [
        entry.variant.wholesaleSourceCostCents,
        entry.variant.computedCustomerAmountCents,
        entry.variant.priorApprovedMatrixAmountCents,
        entry.variant.marketReferencePriceCents,
      ]) {
        if (amount !== null) forbidden.add(amount);
      }
    }
    // With no quote recorded there is no amount at all, for any SKU in the catalog.
    for (const entry of allVariantsWithProduct(PEPTIDE_CATALOG)) {
      const price = resolvePartnerWholesalePrice([], {
        partnerId: PARTNER,
        sku: entry.variant.sku,
        at: "2026-08-01T00:00:00.000Z",
        currency: "USD",
      });
      expect(price.state).toBe("QUOTE_REQUIRED");
      expect(price).not.toHaveProperty("amountCents");
    }
    expect(forbidden.size).toBeGreaterThan(0);
  });

  it("reports whether an exact quote exists, for the eligibility price-basis test", () => {
    expect(partnerQuoteExistsForSku([quote()], PARTNER, SKU)).toBe(true);
    expect(partnerQuoteExistsForSku([quote()], PARTNER, "R360-NAD-500MG-VIAL")).toBe(false);
    expect(partnerQuoteExistsForSku([quote()], "partner_other", SKU)).toBe(false);
  });
});
