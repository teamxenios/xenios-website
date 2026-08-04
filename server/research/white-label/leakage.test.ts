/**
 * The serialization leakage boundary for every white-label partner payload, in the
 * pattern server/research/partners/portal.test.ts established for PR #204.
 *
 * It runs over EVERY variant in the catalog rather than a sample, because the one
 * SKU a sample misses is exactly the one whose cost basis would travel.
 */

import { describe, expect, it } from "vitest";

import {
  PEPTIDE_CATALOG,
  allVariantsWithProduct,
} from "@shared/research/catalog/peptide-catalog";
import {
  PARTNER_FORBIDDEN_PAYLOAD_SUBSTRINGS,
  WHITE_LABEL_LEDGERS,
  partitionByLedger,
} from "@shared/research/white-label/contracts";
import { PARTNER_LEDGERS } from "../partners/portal";
import {
  BASE_LABEL_ASSET_MANIFEST,
  buildPartnerAssetPacket,
  composePartnerLabel,
  type PartnerBrandOverlay,
} from "./brand-assets";
import {
  REPOSITORY_SUPPLIER_REGISTRY,
  evaluateWhiteLabelEligibility,
  supplierRegistryFromSkus,
  whiteLabelEligibilityForSku,
} from "./eligibility";
import { recordPartnerWholesaleQuote, resolvePartnerWholesalePrice } from "./partner-quotes";

const PARTNER = "partner_northstar";
const AT = "2026-08-01T00:00:00.000Z";
const ALL_SKUS = allVariantsWithProduct(PEPTIDE_CATALOG).map((e) => e.variant.sku);

const OVERLAY: PartnerBrandOverlay = {
  partnerId: PARTNER,
  brandWordmark: "NORTHSTAR",
  catalogMark: "NORTHSTAR PERFORMANCE",
  accentColorHex: "#1E7A4B",
  contactLine: "northstar-performance.example",
  overlayVersion: 2,
};

/** A real quote for one SKU, so the QUOTED branch is exercised too, not just the refusal. */
function quotes() {
  const result = recordPartnerWholesaleQuote({
    quoteId: "wlq_1",
    partnerId: PARTNER,
    sku: "R360-PT141-10MG-VIAL",
    amountCents: 6400,
    currency: "USD",
    effectiveDate: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-10-01T00:00:00.000Z",
    quoteVersion: 1,
    recordedByAdminId: "admin_samuel",
    recordedAt: "2026-06-30T12:00:00.000Z",
  });
  if (!result.ok) throw new Error("fixture quote rejected");
  return [result.quote];
}

/** Every partner-facing payload this lane can produce, for every SKU in the catalog. */
function everyPartnerPayload(): unknown[] {
  const recorded = quotes();
  const payloads: unknown[] = [];
  payloads.push(evaluateWhiteLabelEligibility({ suppliers: REPOSITORY_SUPPLIER_REGISTRY }));
  payloads.push(evaluateWhiteLabelEligibility({ suppliers: supplierRegistryFromSkus(ALL_SKUS) }));
  for (const sku of ALL_SKUS) {
    const pricing = resolvePartnerWholesalePrice(recorded, {
      partnerId: PARTNER,
      sku,
      at: AT,
      currency: "USD",
    });
    payloads.push(pricing);
    const base = BASE_LABEL_ASSET_MANIFEST.get(sku);
    if (base !== undefined) payloads.push(composePartnerLabel(base, OVERLAY));
    const result = buildPartnerAssetPacket({
      overlay: OVERLAY,
      eligibility: whiteLabelEligibilityForSku(sku, {
        suppliers: supplierRegistryFromSkus(ALL_SKUS),
        hasPartnerQuote: () => true,
      }),
      pricing,
      generatedAt: AT,
    });
    if (!result.ok) throw new Error(`packet rejected for ${sku}: ${result.rejections.join(", ")}`);
    payloads.push(result.packet);
  }
  return payloads;
}

describe("no white-label partner payload leaks an internal commercial fact", () => {
  const serialized = JSON.stringify(everyPartnerPayload()).toLowerCase();

  it("emits none of the forbidden commercial or administrative tokens", () => {
    for (const token of PARTNER_FORBIDDEN_PAYLOAD_SUBSTRINGS) {
      expect(serialized, `white-label payload leaked "${token}"`).not.toContain(token);
    }
  });

  it("emits no supplier cost, computed price, matrix price, or market reference amount", () => {
    // The operator-only amounts recorded on the catalog. None of them may appear as
    // a number anywhere in a partner payload, for any SKU.
    const forbiddenAmounts = new Set<number>();
    for (const entry of allVariantsWithProduct(PEPTIDE_CATALOG)) {
      for (const amount of [
        entry.variant.wholesaleSourceCostCents,
        entry.variant.computedCustomerAmountCents,
        entry.variant.priorApprovedMatrixAmountCents,
        entry.variant.legacyPublishedAmountCents,
        entry.variant.signedSupplierMasterMemberAmountCents,
        entry.variant.marketReferencePriceCents,
      ]) {
        if (amount !== null) forbiddenAmounts.add(amount);
      }
    }
    expect(forbiddenAmounts.size).toBeGreaterThan(50);

    // Only ONE number may appear on the QUOTED branch: the amount a human quoted.
    const numbers = new Set<number>();
    const walk = (value: unknown): void => {
      if (typeof value === "number") {
        numbers.add(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value !== null && typeof value === "object") {
        Object.values(value as Record<string, unknown>).forEach(walk);
      }
    };
    walk(everyPartnerPayload());
    // 60, 30, 100, and 50 are label face millimetres, and 1, 2, and 12 are line
    // indices and versions, so the comparison ignores numbers at or below 200. That
    // exclusion must never quietly hide a real amount, so assert first that no
    // internal amount is that small. The cheapest one on record is 3499.
    for (const amount of forbiddenAmounts) {
      expect(amount, "an internal amount fell into the structural-number range").toBeGreaterThan(200);
    }
    for (const amount of forbiddenAmounts) {
      expect(numbers.has(amount), `payload emitted internal amount ${amount}`).toBe(false);
    }
    expect(numbers.has(6400)).toBe(true);
  });

  it("never mentions the supplier data relocation note or a supplier source string", () => {
    for (const product of PEPTIDE_CATALOG) {
      expect(serialized).not.toContain(product.supplierSource.toLowerCase());
    }
  });

  it("never emits a certificate number, lot, or expiry value", () => {
    expect(serialized).not.toMatch(/"lotnumber":"[^"]/);
    expect(serialized).not.toMatch(/"expirydate":"[^"]/);
    expect(serialized).toContain('"lotnumber":null');
    expect(serialized).toContain('"expirydate":null');
  });
});

describe("the two partner ledgers stay distinct", () => {
  it("tags white-label payloads to WHITE_LABEL_WHOLESALE and never to AFFILIATE_COMMISSION", () => {
    const serialized = JSON.stringify(everyPartnerPayload());
    expect(serialized).toContain("WHITE_LABEL_WHOLESALE");
    expect(serialized).not.toContain("AFFILIATE_COMMISSION");
  });

  it("keeps the same tags PR #204 established for the partner portal", () => {
    expect(WHITE_LABEL_LEDGERS.affiliateCommission).toBe(PARTNER_LEDGERS.affiliateCommission);
    expect(WHITE_LABEL_LEDGERS.whiteLabelWholesale).toBe(PARTNER_LEDGERS.whiteLabelWholesale);
    expect(WHITE_LABEL_LEDGERS.affiliateCommission).not.toBe(
      WHITE_LABEL_LEDGERS.whiteLabelWholesale,
    );
  });

  it("splits a mixed list without ever summing it", () => {
    const split = partitionByLedger([
      { ledger: WHITE_LABEL_LEDGERS.whiteLabelWholesale, id: "w1" },
      { ledger: WHITE_LABEL_LEDGERS.affiliateCommission, id: "c1" },
      { ledger: WHITE_LABEL_LEDGERS.whiteLabelWholesale, id: "w2" },
    ]);
    expect(split.whiteLabelWholesale.map((e) => e.id)).toEqual(["w1", "w2"]);
    expect(split.affiliateCommission.map((e) => e.id)).toEqual(["c1"]);
    expect(Object.keys(split)).toEqual(["affiliateCommission", "whiteLabelWholesale"]);
    // There is deliberately no total, no payable amount, and no payout on the result.
    expect(split).not.toHaveProperty("totalCents");
    expect(split).not.toHaveProperty("payableCents");
  });
});
