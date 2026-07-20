import { describe, expect, it } from "vitest";
import { products as LIVE_PRODUCTS } from "../products-data";
import {
  LEGACY_SLUG_TO_SKU,
  adaptLegacyCatalog,
} from "./legacy-adapter";
import {
  COMMERCE_CRITICAL_FACTS,
  evaluatePurchaseEligibility,
  isMemberDisplayable,
} from "@shared/research/catalog";

const REVIEWED_ON = "2026-07-20";

// Run against the REAL catalog module, not a fixture. A fixture would prove the
// adapter works on data the test authored; this proves it works on the data that
// actually ships.
const adapted = adaptLegacyCatalog(LIVE_PRODUCTS, REVIEWED_ON);

describe("adapting the live legacy catalog", () => {
  it("adapts every record whose lane is determinable", () => {
    expect(adapted.products.length).toBeGreaterThan(0);
    expect(adapted.products.length + adapted.unmapped.length).toBe(LIVE_PRODUCTS.length);
  });

  it("assigns the founder SKUs to the 15 catalog records", () => {
    for (const [slug, sku] of Object.entries(LEGACY_SLUG_TO_SKU)) {
      const found = adapted.products.find((p) => p.slug === slug);
      expect(found, `expected a product for slug ${slug}`).toBeDefined();
      expect(found!.sku).toBe(sku);
    }
  });

  it("maps peptides to the research_material lane and Quantum to its own lane", () => {
    const p001 = adapted.products.find((p) => p.sku === "P001")!;
    expect(p001.lane).toBe("research_material");

    const quantum = adapted.products.find((p) => p.lane === "quantum");
    expect(quantum).toBeDefined();
  });

  // Guessing a lane would mis-apply that lane's authorization and claims rules.
  it("refuses to force programs into a product lane and surfaces them for a decision", () => {
    expect(adapted.unmapped.length).toBeGreaterThan(0);
    for (const u of adapted.unmapped) {
      expect(u.reason).toContain("founder decision");
    }
  });

  it("routes fulfillment by lane per the founder decision", () => {
    for (const p of adapted.products) {
      if (p.lane === "research_material" || p.lane === "quantum") expect(p.fulfillmentOwner).toBe("mitch");
      if (p.lane === "supplement") expect(p.fulfillmentOwner).toBe("xenios");
    }
  });
});

describe("the safety properties that matter", () => {
  // The single most important assertion in this file.
  it("makes NOTHING purchasable, even with commerce fully enabled", () => {
    for (const p of adapted.products) {
      const decision = evaluatePurchaseEligibility(p, {
        productCommerceEnabled: true,
        quantumCommerceEnabled: true,
      });
      expect(decision.purchasable, `${p.sku} must not be purchasable`).toBe(false);
    }
  });

  it("blocks every product on unconfirmed commerce-critical facts", () => {
    for (const p of adapted.products) {
      const decision = evaluatePurchaseEligibility(p, {
        productCommerceEnabled: true,
        quantumCommerceEnabled: true,
      });
      expect(decision.blockReasons).toContain("unconfirmed_commerce_critical_facts");
      expect(decision.unconfirmedFacts.length).toBeGreaterThan(0);
    }
  });

  it("never marks a legacy fact confirmed, so none is member-displayable", () => {
    for (const p of adapted.products) {
      for (const key of COMMERCE_CRITICAL_FACTS) {
        const fact = p.facts[key as keyof typeof p.facts];
        expect(fact.confirmation).not.toBe("confirmed");
        expect(isMemberDisplayable(fact), `${p.sku}.${key} must not be displayable`).toBe(false);
      }
    }
  });

  it("arrives with commerce approval blocked pending written approval", () => {
    for (const p of adapted.products) {
      expect(p.commerceApproval).toBe("blocked_pending_written_approval");
    }
  });

  // Legacy "live" must not silently become purchasable, because stock was never
  // tracked and commerce was never approved.
  it("never maps any legacy status to in_stock", () => {
    for (const p of adapted.products) {
      expect(p.availability).not.toBe("in_stock");
      expect(p.availability).not.toBe("low_stock");
    }
  });

  it("treats quality, storage, and shipping documentation as missing", () => {
    for (const p of adapted.products) {
      expect(p.qualityDocumentState).toBe("missing");
      expect(p.storageDataState).toBe("missing");
      expect(p.shippingProfileState).toBe("missing");
    }
  });

  it("marks nothing subscription eligible", () => {
    for (const p of adapted.products) {
      expect(p.subscriptionEligible).toBe(false);
    }
  });
});

describe("preserving legacy values as evidence", () => {
  it("retains the legacy price rather than deleting it, marked unverified_legacy", () => {
    const p001 = adapted.products.find((p) => p.sku === "P001")!;
    expect(p001.facts.priceCents.value).not.toBeNull();
    expect(p001.facts.priceCents.confirmation).toBe("unverified_legacy");
    expect(p001.facts.priceCents.source.kind).toBe("legacy_catalog_file");
    expect(p001.facts.priceCents.source.reference).toBe("server/research/products-data.ts");
  });

  it("records facts that never existed in the legacy file as not_confirmed", () => {
    for (const p of adapted.products) {
      for (const key of ["shelfLife", "storage", "coa"] as const) {
        expect(p.facts[key].confirmation).toBe("not_confirmed");
        expect(p.facts[key].value).toBeNull();
      }
    }
  });

  it("produces a reconciliation list naming every legacy value needing confirmation", () => {
    expect(adapted.reconciliation.length).toBeGreaterThan(0);
    const p003Entries = adapted.reconciliation.filter((r) => r.sku === "P003");
    expect(p003Entries.length).toBeGreaterThan(0);
  });
});

describe("the KLOW discrepancy specifically", () => {
  const klow = () => adapted.products.find((p) => p.sku === "P003")!;

  it("carries an explicit conflict note on composition and strength", () => {
    expect(klow().facts.composition.conflictNote).toBeDefined();
    expect(klow().facts.composition.conflictNote).toContain("no supplier document");
    expect(klow().facts.strength.conflictNote).toBeDefined();
  });

  // A conflict note blocks display regardless of confirmation state.
  it("is not member-displayable even though a legacy value exists", () => {
    expect(klow().facts.composition.value).not.toBeNull();
    expect(isMemberDisplayable(klow().facts.composition)).toBe(false);
  });

  it("asks for the ingredient ratio as the first open supplier question", () => {
    expect(klow().openSupplierQuestions[0]).toContain("ingredient ratio");
  });

  it("appears in the reconciliation list with its conflict note attached", () => {
    const entry = adapted.reconciliation.find((r) => r.sku === "P003" && r.fact === "composition");
    expect(entry).toBeDefined();
    expect(entry!.note).toContain("no supplier document");
  });
});

describe("every blend flags its unconfirmed ratio", () => {
  const blendSkus = ["P001", "P002", "P003", "P004", "P005", "P015"];

  it("attaches a conflict note to each blend's strength", () => {
    for (const sku of blendSkus) {
      const p = adapted.products.find((x) => x.sku === sku)!;
      expect(p.facts.strength.conflictNote, `${sku} strength should be disputed`).toBeDefined();
    }
  });

  it("asks each blend for a component-by-component ratio document", () => {
    for (const sku of blendSkus) {
      const p = adapted.products.find((x) => x.sku === sku)!;
      expect(p.openSupplierQuestions[0]).toContain("component by component");
    }
  });
});

describe("guide linkage", () => {
  it("links each catalog record to its evidence Guides", () => {
    const p001 = adapted.products.find((p) => p.sku === "P001")!;
    expect(p001.relatedGuideSlugs).toContain("bpc-157");
    expect(p001.relatedGuideSlugs).toContain("tb-500");
    expect(p001.relatedGuideSlugs).toContain("bpc-157-tb-500");
  });

  it("starts every Guide state as in development, since none is approved", () => {
    for (const p of adapted.products) {
      expect(p.guideState).toBe("guide_in_development");
    }
  });
});
