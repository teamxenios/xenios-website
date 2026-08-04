import { describe, expect, it } from "vitest";
import {
  blockedOffers,
  decidedDiscountBasisPoints,
  decidedOffers,
  discountWithinCap,
  DISCOUNT_ARCHITECTURE_DOCTRINE,
  draftOffers,
  draftUnitDiscount,
  findOffer,
  isDecidedDoctrine,
  LOCKED_PRICING_RULES,
  MAXIMUM_DISCOUNT_BASIS_POINTS,
  OFFER_STATUSES,
  offerIsPermitted,
  PEPTIDE_OFFER_ARCHITECTURE,
  PEPTIDE_OFFER_COUNT,
  resolveUnitDiscount,
  unitTierForQuantity,
} from "./peptide-discount-policy";

// Written as escapes on purpose. This directory forbids both characters in every file.
const EM_DASH = "\u2014";
const EN_DASH = "\u2013";

/**
 * The sheet's twelve offer rows, transcribed a second time:
 * [id, offer type, threshold, status]. The rate table is checked separately, so a
 * status and its number cannot both be edited quietly.
 */
const OFFER_TRANSCRIPTION: ReadonlyArray<[string, string, string, string]> = [
  ["single_unit", "Single unit", "1-2 units", "APPROVED_DOCTRINE"],
  ["small_multi_unit_order", "Small multi-unit order", "3-4 units", "DRAFT"],
  ["standard_volume", "Standard volume", "5-9 units", "DRAFT"],
  ["large_volume", "Large volume", "10-19 units", "DRAFT"],
  ["enterprise_volume", "Enterprise volume", "20+ units", "DRAFT"],
  ["multi_item_research_order", "Multi-item research order", "3+ distinct eligible items", "DRAFT"],
  ["free_shipping", "Free shipping", "Order value", "DRAFT"],
  ["founding_member_benefit", "Founding-member benefit", "Account status", "OPTIONAL"],
  ["affiliate_attribution", "Affiliate attribution", "Completed paid order", "DRAFT"],
  ["auto_renew_peptide_subscription", "Auto-renew peptide subscription", "Any", "BLOCKED"],
  ["bogo_or_sitewide_sale", "BOGO or sitewide 20% sale", "Any", "BLOCKED"],
  ["struck_through_msrp", "Struck-through MSRP", "Any", "BLOCKED"],
];

/** The volume ladder the sheet proposes, in basis points. All of it DRAFT. */
const DRAFT_LADDER: ReadonlyArray<[string, number]> = [
  ["small_multi_unit_order", 300],
  ["standard_volume", 500],
  ["large_volume", 800],
  ["enterprise_volume", 1000],
];

describe("the offer architecture", () => {
  it("transcribes all twelve rows in sheet order", () => {
    expect(PEPTIDE_OFFER_ARCHITECTURE).toHaveLength(PEPTIDE_OFFER_COUNT);
    expect(
      PEPTIDE_OFFER_ARCHITECTURE.map((offer) => [
        offer.id,
        offer.offerType,
        offer.threshold,
        offer.status,
      ]),
    ).toEqual(OFFER_TRANSCRIPTION.map((row) => [...row]));
  });

  it("uses unique ids and the closed status vocabulary", () => {
    expect(new Set(PEPTIDE_OFFER_ARCHITECTURE.map((offer) => offer.id)).size).toBe(
      PEPTIDE_OFFER_COUNT,
    );
    for (const offer of PEPTIDE_OFFER_ARCHITECTURE) {
      expect(OFFER_STATUSES, offer.id).toContain(offer.status);
      expect(offer.why.length, offer.id).toBeGreaterThan(0);
      expect(offer.displayLanguage.length, offer.id).toBeGreaterThan(0);
    }
  });

  it("states the sheet's framing", () => {
    expect(DISCOUNT_ARCHITECTURE_DOCTRINE).toContain("price integrity, not discount addiction");
    expect(DISCOUNT_ARCHITECTURE_DOCTRINE).toContain("No permanent sale anchor");
  });

  it("carries the two locked pricing rules", () => {
    expect(LOCKED_PRICING_RULES).toHaveLength(2);
    expect(LOCKED_PRICING_RULES[0].value).toBe("One clean member price");
    expect(LOCKED_PRICING_RULES[1].value).toBe("No automatic peptide renewal at launch");
  });

  it("returns null for an unknown offer", () => {
    expect(findOffer("half_price_tuesday")).toBeNull();
  });
});

describe("only the single clean price is decided", () => {
  it("marks exactly one row approved doctrine, at a zero discount", () => {
    expect(decidedOffers()).toHaveLength(1);
    const single = decidedOffers()[0];
    expect(single.id).toBe("single_unit");
    expect(single.status).toBe("APPROVED_DOCTRINE");
    expect(single.displayLanguage).toBe("Private member price");
    expect(single.recommended).toEqual({ kind: "discount_rate", basisPoints: 0 });
    expect(single.maximum).toEqual({ kind: "discount_rate", basisPoints: 0 });
  });

  it("leaves the whole volume ladder as a draft", () => {
    for (const [id, basisPoints] of DRAFT_LADDER) {
      const offer = findOffer(id);
      expect(offer, id).not.toBeNull();
      expect(offer!.status, id).toBe("DRAFT");
      expect(isDecidedDoctrine(offer!.status), id).toBe(false);
      expect(offer!.recommended, id).toEqual({ kind: "discount_rate", basisPoints });
    }
    expect(draftOffers().map((offer) => offer.id)).toEqual([
      "small_multi_unit_order",
      "standard_volume",
      "large_volume",
      "enterprise_volume",
      "multi_item_research_order",
      "free_shipping",
      "affiliate_attribution",
    ]);
  });

  it("treats the founding-member benefit as optional, not decided", () => {
    const offer = findOffer("founding_member_benefit")!;
    expect(offer.status).toBe("OPTIONAL");
    expect(isDecidedDoctrine(offer.status)).toBe(false);
    expect(offer.recommended).toEqual({ kind: "discount_rate", basisPoints: 500 });
    expect(offer.why).toContain("only if separately approved");
  });

  it("applies no discount at any quantity, because no volume tier is approved", () => {
    for (const units of [1, 2, 3, 4, 5, 9, 10, 19, 20, 100, 5000]) {
      expect(decidedDiscountBasisPoints(units), `${units} units`).toBe(0);
      expect(resolveUnitDiscount(units).appliedBasisPoints, `${units} units`).toBe(0);
    }
  });

  it("reports a quantity as decided only inside the single-unit doctrine", () => {
    expect(resolveUnitDiscount(1).decided).toBe(true);
    expect(resolveUnitDiscount(2).decided).toBe(true);
    expect(resolveUnitDiscount(3).decided).toBe(false);
    expect(resolveUnitDiscount(20).decided).toBe(false);
    expect(resolveUnitDiscount(1).explanation).toContain("one clean member price");
    expect(resolveUnitDiscount(20).explanation).toContain("DRAFT");
  });

  it("hands the draft tier back with its status attached, never as a bare number", () => {
    expect(draftUnitDiscount(3)).toEqual({
      offerId: "small_multi_unit_order",
      offerType: "Small multi-unit order",
      basisPoints: 300,
      status: "DRAFT",
      displayLanguage: "Research quantity adjustment",
    });
    expect(draftUnitDiscount(20)?.basisPoints).toBe(1000);
    expect(draftUnitDiscount(20)?.status).toBe("DRAFT");
    expect(draftUnitDiscount(1)?.status).toBe("APPROVED_DOCTRINE");
  });

  it("maps a quantity to exactly one unit tier, and never to an item-count offer", () => {
    expect(unitTierForQuantity(1)?.id).toBe("single_unit");
    expect(unitTierForQuantity(4)?.id).toBe("small_multi_unit_order");
    expect(unitTierForQuantity(9)?.id).toBe("standard_volume");
    expect(unitTierForQuantity(19)?.id).toBe("large_volume");
    expect(unitTierForQuantity(999)?.id).toBe("enterprise_volume");
    for (const units of [1, 3, 5, 10, 20, 999]) {
      expect(unitTierForQuantity(units)!.thresholdBasis, `${units}`).toBe("unit_count");
    }
  });

  it("refuses a zero, a negative, and a fractional quantity", () => {
    expect(() => decidedDiscountBasisPoints(0)).toThrow(RangeError);
    expect(() => decidedDiscountBasisPoints(-1)).toThrow(RangeError);
    expect(() => decidedDiscountBasisPoints(2.5)).toThrow(RangeError);
  });
});

describe("what may never be offered", () => {
  it("blocks the subscription, the BOGO or sitewide sale, and the struck-through MSRP", () => {
    expect(blockedOffers().map((offer) => offer.id)).toEqual([
      "auto_renew_peptide_subscription",
      "bogo_or_sitewide_sale",
      "struck_through_msrp",
    ]);
    for (const offer of blockedOffers()) {
      expect(offerIsPermitted(offer), offer.id).toBe(false);
      expect(offer.recommended, offer.id).toEqual({ kind: "not_recommended" });
      expect(offer.maximum, offer.id).toEqual({ kind: "not_recommended" });
      expect(offer.customerFacing, offer.id).toBe(false);
    }
  });

  it("permits every offer that is not blocked", () => {
    for (const offer of PEPTIDE_OFFER_ARCHITECTURE) {
      expect(offerIsPermitted(offer), offer.id).toBe(offer.status !== "BLOCKED");
    }
  });

  it("never gives a blocked offer a rate a caller could apply", () => {
    for (const offer of blockedOffers()) {
      expect(offer.recommended.kind, offer.id).not.toBe("discount_rate");
      expect(offer.maximum.kind, offer.id).not.toBe("discount_rate");
    }
  });

  it("keeps the affiliate commission off the customer's price", () => {
    const offer = findOffer("affiliate_attribution")!;
    expect(offer.customerFacing).toBe(false);
    expect(offer.displayLanguage).toBe("Not customer-facing");
    expect(offer.why).toContain("should not create a customer discount");
  });
});

describe("the ten percent cap", () => {
  it("holds every recommended and maximum rate inside the cap", () => {
    for (const offer of PEPTIDE_OFFER_ARCHITECTURE) {
      for (const value of [offer.recommended, offer.maximum]) {
        if (value.kind !== "discount_rate") continue;
        expect(discountWithinCap(value.basisPoints), offer.id).toBe(true);
        expect(value.basisPoints, offer.id).toBeLessThanOrEqual(MAXIMUM_DISCOUNT_BASIS_POINTS);
      }
    }
  });

  it("never lets a recommended rate exceed its own maximum", () => {
    for (const offer of PEPTIDE_OFFER_ARCHITECTURE) {
      if (offer.recommended.kind !== "discount_rate") continue;
      if (offer.maximum.kind !== "discount_rate") continue;
      expect(offer.recommended.basisPoints, offer.id).toBeLessThanOrEqual(
        offer.maximum.basisPoints,
      );
    }
  });

  it("rejects a rate above the cap, a negative rate, and a fractional basis point", () => {
    expect(discountWithinCap(1001)).toBe(false);
    expect(discountWithinCap(2000)).toBe(false);
    expect(discountWithinCap(-1)).toBe(false);
    expect(discountWithinCap(10.5)).toBe(false);
    expect(discountWithinCap(0)).toBe(true);
    expect(discountWithinCap(1000)).toBe(true);
  });

  it("keeps the free-shipping threshold an order value, not a discount", () => {
    const offer = findOffer("free_shipping")!;
    expect(offer.recommended).toEqual({ kind: "order_value_threshold", cents: 25000 });
    expect(offer.thresholdBasis).toBe("order_value");
    expect(offer.unitRange).toBeNull();
  });
});

describe("house style", () => {
  it("stores no em or en dash in any offer field", () => {
    const everyString = JSON.stringify([
      PEPTIDE_OFFER_ARCHITECTURE,
      LOCKED_PRICING_RULES,
      DISCOUNT_ARCHITECTURE_DOCTRINE,
    ]);
    expect(everyString).not.toContain(EM_DASH);
    expect(everyString).not.toContain(EN_DASH);
  });
});
