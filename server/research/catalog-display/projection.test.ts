// The catalog display projection: what reaches the wire, and what never can.
//
// Three families of assertion here.
//   1. PROJECTION SAFETY. The serialized output is walked key by key against
//      a denylist of every internal money, operator, supplier, and readiness
//      field the three catalogs hold, and against the rule that the only key
//      ending in "Cents" anywhere is the approved member amount.
//   2. TIER EXCLUSION. The three regulatory hold products are absent at every
//      breadth, by slug, by name, and by count.
//   3. TRUTHFUL MODES AND AMOUNTS. Every mode is on the closed enum, no
//      peptide carries a price, and no amount is ever zero or negative.

import { describe, expect, it } from "vitest";
import {
  OFFER_AVAILABILITY_MODES,
  describeOfferMode,
  mayDisplayAmount,
  type OfferAvailabilityMode,
} from "@shared/research/catalog/offer-readiness";
import { PEPTIDE_CATALOG, productsInTier } from "@shared/research/catalog/peptide-catalog";
import { SUPPLEMENT_CATALOG } from "@shared/research/catalog/supplement-catalog";
import { QUANTUM_PRODUCT } from "@shared/research/catalog/quantum-product";
import {
  allDisplayableCards,
  displayCatalog,
  displayProductDetail,
  displayableAmount,
  excludedRegulatoryHoldCount,
  heldProductNotices,
  isStandardBreadthCard,
  strongestMode,
} from "./projection";

// Every field name the three catalogs hold that must never reach a browser.
// Read out of the record interfaces in shared/research/catalog/, not guessed.
const INTERNAL_KEYS = [
  // money the customer may never see
  "wholesaleSourceCostCents",
  "computedCustomerAmountCents",
  "priorApprovedMatrixAmountCents",
  "legacyPublishedAmountCents",
  "signedSupplierMasterMemberAmountCents",
  "marketReferencePriceCents",
  "approvedMemberAmountCents",
  // supplier identity and provenance
  "supplierSource",
  "supplierSkuCode",
  "sourceReference",
  "resellerAuthorization",
  "brandSource",
  // operator state
  "regulatoryNote",
  "holdReason",
  "coaStatus",
  "coaEvidence",
  "readiness",
  "readinessStatus",
  "approvalNote",
  "priceApprovalNote",
  "priceStatus",
  "missingInputs",
  "blockingDocuments",
  "identity",
  "clinicalRole",
  "categoryBasis",
  "disputedBySignedSupplierMasterStrength",
  // internal identifiers
  "internalSku",
  "internalProductCode",
  "legacyProductCode",
  "legacyCatalogSlug",
  "matrixDecisionId",
  "decisionId",
  "tier",
  "origin",
  "isPrimary",
] as const;

/** Every key in a serialized value, at every depth. */
function everyKey(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) everyKey(entry, found);
    return found;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      found.push(key);
      everyKey(child, found);
    }
  }
  return found;
}

/** Every number in a serialized value, at every depth. */
function everyNumber(value: unknown, found: number[] = []): number[] {
  if (typeof value === "number") {
    found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const entry of value) everyNumber(entry, found);
    return found;
  }
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) everyNumber(child, found);
  }
  return found;
}

/** Everything that survives JSON serialization, which is what a browser sees. */
function onTheWire(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function expectNoInternalFields(payload: unknown, what: string): void {
  const keys = everyKey(onTheWire(payload));
  for (const banned of INTERNAL_KEYS) {
    expect(keys.includes(banned), `${what} leaked ${banned}`).toBe(false);
  }
  const moneyKeys = Array.from(new Set(keys.filter((key) => key.endsWith("Cents"))));
  // The one permitted money key, and only that one.
  expect(moneyKeys.every((key) => key === "amountCents"), `${what}: ${moneyKeys.join(",")}`).toBe(
    true,
  );
}

describe("catalog display projection: safety", () => {
  it("puts no internal field on the wire, at any breadth", () => {
    expectNoInternalFields(displayCatalog("full"), "full breadth list");
    expectNoInternalFields(displayCatalog("standard"), "standard breadth list");
  });

  it("puts no internal field on a detail response", () => {
    for (const card of displayCatalog("full")) {
      const detail = displayProductDetail(card.lane, card.slug, "full");
      expect(detail, `${card.lane}:${card.slug}`).not.toBeNull();
      expectNoInternalFields(detail, `${card.lane}:${card.slug}`);
    }
  });

  it("exposes only the agreed card keys", () => {
    const expected = [
      "availability",
      "brand",
      "canonicalName",
      "category",
      "collections",
      "displayName",
      "lane",
      "positioning",
      "price",
      "slug",
      "variantCount",
    ];
    for (const card of displayCatalog("full")) {
      expect(Object.keys(onTheWire(card) as object).sort(), card.slug).toEqual(expected);
    }
  });

  it("exposes only the agreed detail and variant keys", () => {
    const detailKeys = [
      "availability",
      "brand",
      "canonicalName",
      "category",
      "collections",
      "disclosures",
      "displayName",
      "lane",
      "overview",
      "positioning",
      "price",
      "researchContext",
      "slug",
      "storageAndHandling",
      "variantCount",
      "variants",
      "whyItPairs",
    ];
    const variantKeys = [
      "availability",
      "format",
      "id",
      "label",
      "memberEligible",
      "size",
      "strength",
    ];
    for (const card of displayCatalog("full")) {
      const detail = displayProductDetail(card.lane, card.slug, "full");
      expect(Object.keys(onTheWire(detail) as object).sort(), card.slug).toEqual(detailKeys);
      for (const variant of detail?.variants ?? []) {
        expect(Object.keys(onTheWire(variant) as object).sort(), variant.id).toEqual(variantKeys);
      }
    }
  });

  it("never carries a market reference price, which is a competitor's shelf price", () => {
    // The strongest single leak to pin: these numbers are not ours and are not
    // costs, so a browser that could read one would be reading a rival's price.
    const referenced = new Set(
      PEPTIDE_CATALOG.flatMap((product) =>
        product.variants
          .map((variant) => variant.marketReferencePriceCents)
          .filter((value): value is number => typeof value === "number"),
      ),
    );
    expect(referenced.size).toBeGreaterThan(0);
    // Scoped to the peptide lane, which is the only lane that records a market
    // reference price, and compared as VALUES rather than as text. The check is
    // stronger than "this number is absent": a peptide payload is asserted to
    // carry NO number at all except its presentation count, so there is no
    // slot a price of any provenance could occupy.
    const peptideDetails = displayCatalog("full")
      .filter((card) => card.lane === "peptide")
      .map((card) => displayProductDetail("peptide", card.slug, "full"));
    expect(peptideDetails.length).toBe(42);
    for (const detail of peptideDetails) {
      const numbers = everyNumber(onTheWire(detail));
      expect(numbers, detail?.slug).toEqual([detail?.variantCount]);
      for (const number of numbers) {
        expect(referenced.has(number), `${detail?.slug}:${number}`).toBe(false);
      }
    }
  });
});

describe("catalog display projection: tier exclusion", () => {
  it("excludes the three regulatory hold products from every breadth", () => {
    const held = productsInTier("regulatory_hold");
    expect(held.map((product) => product.slug)).toEqual([
      "semaglutide",
      "tirzepatide",
      "retatrutide",
    ]);
    expect(excludedRegulatoryHoldCount()).toBe(3);

    for (const breadth of ["standard", "full"] as const) {
      const slugs = displayCatalog(breadth).map((card) => card.slug);
      const names = displayCatalog(breadth).map((card) => card.displayName);
      for (const product of held) {
        expect(slugs.includes(product.slug), `${breadth}:${product.slug}`).toBe(false);
        expect(names.includes(product.displayName), `${breadth}:${product.displayName}`).toBe(
          false,
        );
      }
    }
  });

  it("returns null for a held slug on the detail read, at every breadth", () => {
    for (const breadth of ["standard", "full"] as const) {
      for (const slug of ["semaglutide", "tirzepatide", "retatrutide"]) {
        expect(displayProductDetail("peptide", slug, breadth), `${breadth}:${slug}`).toBeNull();
      }
    }
  });

  it("surfaces the held records only through the labelled admin notice", () => {
    const notices = heldProductNotices();
    expect(notices).toHaveLength(3);
    for (const notice of notices) {
      expect(notice.status).toBe("regulatory_hold");
      expect(notice.lane).toBe("peptide");
      expect(notice.holdReason.length).toBeGreaterThan(20);
      // No price, no variants, no offer mode: nothing a member could act on.
      expect(Object.keys(notice).sort()).toEqual([
        "displayName",
        "holdReason",
        "lane",
        "slug",
        "status",
      ]);
    }
  });
});

describe("catalog display projection: truthful modes and amounts", () => {
  it("counts the displayable catalog exactly", () => {
    const full = displayCatalog("full");
    expect(full).toHaveLength(63);
    expect(allDisplayableCards()).toHaveLength(63);
    // 45 peptide products less the 3 held, plus 20 supplements, plus Quantum.
    expect(full.filter((card) => card.lane === "peptide")).toHaveLength(42);
    expect(full.filter((card) => card.lane === "supplement")).toHaveLength(
      SUPPLEMENT_CATALOG.length,
    );
    expect(full.filter((card) => card.lane === "quantum")).toHaveLength(1);
    expect(PEPTIDE_CATALOG).toHaveLength(45);
  });

  it("keeps every mode on the closed enum and gives every one words", () => {
    for (const card of displayCatalog("full")) {
      expect(OFFER_AVAILABILITY_MODES.includes(card.availability), card.slug).toBe(true);
      expect(describeOfferMode(card.availability).length, card.slug).toBeGreaterThan(0);
      const detail = displayProductDetail(card.lane, card.slug, "full");
      for (const variant of detail?.variants ?? []) {
        expect(OFFER_AVAILABILITY_MODES.includes(variant.availability), variant.id).toBe(true);
      }
    }
  });

  it("shows no peptide price at all, because no peptide formula is confirmed", () => {
    const peptides = displayCatalog("full").filter((card) => card.lane === "peptide");
    expect(peptides.length).toBeGreaterThan(0);
    for (const card of peptides) {
      expect(card.price, card.slug).toBeNull();
      const detail = displayProductDetail("peptide", card.slug, "full");
      expect(detail?.price, card.slug).toBeNull();
    }
  });

  it("shows an amount only where a founder approved one and the mode permits it", () => {
    const priced = displayCatalog("full").filter((card) => card.price !== null);
    // Seventeen supplements at approval required purchase, plus Quantum.
    expect(priced).toHaveLength(18);
    for (const card of priced) {
      expect(card.lane, card.slug).not.toBe("peptide");
      expect(mayDisplayAmount(card.availability), card.slug).toBe(true);
      expect(card.price?.currency, card.slug).toBe("USD");
      expect(card.price?.amountCents ?? 0, card.slug).toBeGreaterThan(0);
      expect(Number.isSafeInteger(card.price?.amountCents), card.slug).toBe(true);
    }
    const quantum = displayCatalog("full").find((card) => card.lane === "quantum");
    expect(quantum?.price).toEqual({
      amountCents: QUANTUM_PRODUCT.approvedMemberAmountCents,
      currency: "USD",
    });
  });

  it("never renders an amount for a mode that does not permit one", () => {
    for (const card of displayCatalog("full")) {
      if (mayDisplayAmount(card.availability)) continue;
      expect(card.price, card.slug).toBeNull();
    }
  });

  it("refuses a zero, negative, or withheld amount at the gate", () => {
    expect(displayableAmount("APPROVAL_REQUIRED_PURCHASE", 0)).toBeNull();
    expect(displayableAmount("APPROVAL_REQUIRED_PURCHASE", -100)).toBeNull();
    expect(displayableAmount("APPROVAL_REQUIRED_PURCHASE", null)).toBeNull();
    expect(displayableAmount("APPROVAL_REQUIRED_PURCHASE", 12.5)).toBeNull();
    // The mode gate wins even for a perfectly good amount.
    expect(displayableAmount("REQUEST_ACCESS_ONLY", 180000)).toBeNull();
    expect(displayableAmount("DISPLAY_ONLY", 180000)).toBeNull();
    expect(displayableAmount("UNAVAILABLE", 180000)).toBeNull();
    expect(displayableAmount("APPROVAL_REQUIRED_PURCHASE", 180000)).toEqual({
      amountCents: 180000,
      currency: "USD",
    });
  });

  it("takes the strongest mode across presentations, and fails closed on none", () => {
    expect(strongestMode(["REQUEST_ACCESS_ONLY", "APPROVAL_REQUIRED_PURCHASE"])).toBe(
      "APPROVAL_REQUIRED_PURCHASE",
    );
    expect(strongestMode(["DISPLAY_ONLY", "UNAVAILABLE"])).toBe("DISPLAY_ONLY");
    expect(strongestMode([])).toBe("UNAVAILABLE");
    expect(strongestMode(["not-a-mode" as OfferAvailabilityMode])).toBe("UNAVAILABLE");
  });
});

describe("catalog display projection: breadth", () => {
  it("lists only purchase mode records at standard breadth", () => {
    const standard = displayCatalog("standard");
    expect(standard).toHaveLength(30);
    for (const card of standard) {
      expect(mayDisplayAmount(card.availability), card.slug).toBe(true);
      expect(isStandardBreadthCard(card), card.slug).toBe(true);
    }
  });

  it("adds the request access only range at full breadth, unchanged", () => {
    const standard = displayCatalog("standard");
    const full = displayCatalog("full");
    expect(full.length).toBeGreaterThan(standard.length);
    const standardKeys = new Set(standard.map((card) => `${card.lane}:${card.slug}`));
    const extra = full.filter((card) => !standardKeys.has(`${card.lane}:${card.slug}`));
    expect(extra).toHaveLength(33);
    for (const card of extra) {
      // The grant widened the listing and nothing else: every extra record
      // arrives at a mode that denies purchase, with no amount.
      expect(card.availability, card.slug).toBe("REQUEST_ACCESS_ONLY");
      expect(card.price, card.slug).toBeNull();
    }
  });

  it("keeps a standard record's mode identical at full breadth", () => {
    const byKey = new Map(
      displayCatalog("full").map((card) => [`${card.lane}:${card.slug}`, card]),
    );
    for (const card of displayCatalog("standard")) {
      const wide = byKey.get(`${card.lane}:${card.slug}`);
      expect(wide, card.slug).toEqual(card);
    }
  });

  it("refuses a detail read for a record outside the caller's breadth", () => {
    const wideOnly = displayCatalog("full").find((card) => !isStandardBreadthCard(card));
    expect(wideOnly).toBeDefined();
    if (!wideOnly) return;
    expect(displayProductDetail(wideOnly.lane, wideOnly.slug, "standard")).toBeNull();
    expect(displayProductDetail(wideOnly.lane, wideOnly.slug, "full")).not.toBeNull();
  });

  it("resolves a slug case insensitively and refuses a blank or unknown one", () => {
    const card = displayCatalog("standard")[0];
    expect(displayProductDetail(card.lane, card.slug.toUpperCase(), "standard")?.slug).toBe(
      card.slug,
    );
    expect(displayProductDetail(card.lane, `  ${card.slug}  `, "standard")?.slug).toBe(card.slug);
    expect(displayProductDetail(card.lane, "", "full")).toBeNull();
    expect(displayProductDetail(card.lane, "   ", "full")).toBeNull();
    expect(displayProductDetail("peptide", "no-such-product", "full")).toBeNull();
    // A lane mismatch is a miss, so a supplement slug cannot be read as a peptide.
    const supplement = displayCatalog("full").find((entry) => entry.lane === "supplement");
    expect(displayProductDetail("peptide", supplement?.slug ?? "x", "full")).toBeNull();
  });

  it("carries the research context disclosure wherever research context is shown", () => {
    let withContext = 0;
    for (const card of displayCatalog("full")) {
      const detail = displayProductDetail(card.lane, card.slug, "full");
      if (!detail || detail.researchContext.length === 0) continue;
      withContext += 1;
      expect(
        detail.disclosures.some((line) => line.startsWith("Research context lists")),
        card.slug,
      ).toBe(true);
    }
    expect(withContext).toBeGreaterThan(0);
  });
});
