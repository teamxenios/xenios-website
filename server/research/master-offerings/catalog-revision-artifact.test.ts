/**
 * The overlays and the re-scan.
 *
 * Both overlays change a file the catalog will serve, so each one has to come
 * back through the production reader before it is allowed to exist.
 */

import { describe, expect, it } from "vitest";
import {
  ArtifactRefused,
  assertGeneratedArtifactSafe,
  confidentialTermsFromMasterRows,
  pinPreservedIds,
  retainRetiredOfferings,
  withRecountedHeader,
  type GeneratedArtifact,
} from "./catalog-revision-artifact";
import { loadMasterOfferingDataset } from "./dataset-reader";
import type { RawMasterOfferingRow } from "./model";

function offering(
  id: string,
  slug: string,
  displayName: string,
  variants: readonly { id: string; label: string }[],
): Record<string, unknown> {
  return {
    id,
    slug,
    displayName,
    canonicalName: displayName,
    family: "research_vials",
    category: "Peptides & Research",
    subcategory: "Research",
    brand: null,
    aliases: [displayName],
    displayState: "request_access",
    stateExplanation: "Submit a request.",
    copyState: "needs_review",
    variants: variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      displayState: "request_access",
    })),
  };
}

function artifact(
  products: readonly Record<string, unknown>[],
): GeneratedArtifact {
  return withRecountedHeader({
    schemaVersion: 1,
    generatedAt: "2026-08-13T00:00:00.000Z",
    sourceWorkbookSha256: "a".repeat(64),
    sourceRowCount: products.length,
    canonicalProductCount: 0,
    variantCount: 0,
    invariants: {
      containsSupplierIdentity: false,
      containsWholesaleCost: false,
      containsPlanningPrice: false,
      containsMargin: false,
      containsInternalNotes: false,
      containsProviderNames: false,
      planningRowCanBecomePurchasable: false,
    },
    products,
  });
}

const BASE = artifact([
  offering("mo_new_alpha", "research-vials-alpha", "Alpha", [
    { id: "mov_new_alpha_5", label: "5 mg" },
  ]),
  offering("mo_beta", "research-vials-beta", "Beta", [
    { id: "mov_beta_5", label: "5 mg" },
  ]),
]);

describe("privacy re-scan", () => {
  it("accepts an artifact the catalog would serve", () => {
    const result = assertGeneratedArtifactSafe(BASE, []);
    expect(result).toEqual({ offerings: 2, variants: 2, countsAgree: true });
  });

  it("refuses a banned key, using the reader's own list", () => {
    const leaky = artifact([
      { ...offering("mo_x", "x", "X", [{ id: "mov_x", label: "5 mg" }]), sourceSku: "PEP-001" },
    ]);
    expect(() => assertGeneratedArtifactSafe(leaky, [])).toThrow(ArtifactRefused);
    expect(() => assertGeneratedArtifactSafe(leaky, [])).toThrow(/sourceSku/);
  });

  it("refuses an invariant that is not false", () => {
    const wrong = {
      ...BASE,
      invariants: { ...(BASE.invariants as object), containsWholesaleCost: true },
    };
    expect(() => assertGeneratedArtifactSafe(wrong, [])).toThrow(
      /containsWholesaleCost is not false/,
    );
  });

  it("refuses a confidential provider identity", () => {
    const named = artifact([
      offering("mo_p", "p", "Consultation with Jane Rivers", [
        { id: "mov_p", label: "60 minutes" },
      ]),
    ]);
    expect(() => assertGeneratedArtifactSafe(named, ["jane rivers"])).toThrow(
      /confidential provider or team identity/,
    );
  });

  it("refuses a header that disagrees with its own body", () => {
    const lying = { ...BASE, canonicalProductCount: 99 };
    expect(() => assertGeneratedArtifactSafe(lying, [])).toThrow(
      /header disagrees/,
    );
  });

  it("derives confidential terms from the provider network rows only", () => {
    const rows: RawMasterOfferingRow[] = [
      {
        sheetRow: 2,
        sourceGroup: "Existing Xenios master",
        category: "Provider & Performance Network",
        brandOrSubcategory: "Network",
        sourceSku: "PRH-001",
        productName: "Jane Rivers, MD",
        variantOrFormat: "Per product family",
        familyOrTag: "Network",
        supplierOrOwner: "Withheld",
        originalWholesaleCost: null,
        updatedWholesaleCost: null,
        wholesaleStatus: "",
        originalSellPrice: null,
        updatedSellPrice: null,
        targetSellAtUpdatedCost: null,
        recommendedLaunchSellPrice: null,
        updatedMarkupMultiple: null,
        updatedGrossProfit: null,
        updatedGrossMargin: null,
        sourceAccessState: "Request access",
        activationPriority: "",
        austinSupplierBenchmark: false,
        activationRequirement: "",
        sourceNotes: "",
        productUrl: null,
      },
      {
        sheetRow: 3,
        sourceGroup: "Existing Xenios master",
        category: "Peptides & Research",
        brandOrSubcategory: "Research",
        sourceSku: "PEP-001",
        productName: "Alpha Research Material",
        variantOrFormat: "5 mg",
        familyOrTag: "Research",
        supplierOrOwner: "Withheld",
        originalWholesaleCost: null,
        updatedWholesaleCost: null,
        wholesaleStatus: "",
        originalSellPrice: null,
        updatedSellPrice: null,
        targetSellAtUpdatedCost: null,
        recommendedLaunchSellPrice: null,
        updatedMarkupMultiple: null,
        updatedGrossProfit: null,
        updatedGrossMargin: null,
        sourceAccessState: "Request access",
        activationPriority: "",
        austinSupplierBenchmark: false,
        activationRequirement: "",
        sourceNotes: "",
        productUrl: null,
      },
    ];
    expect(confidentialTermsFromMasterRows(rows, {})).toEqual([
      "jane rivers",
      "jane rivers, md",
    ]);
  });
});

describe("id pinning", () => {
  it("writes the previous ids back and the result still loads", () => {
    const result = pinPreservedIds(BASE, {
      mo_old_alpha: "mo_new_alpha",
      mov_old_alpha_5: "mov_new_alpha_5",
    });
    expect(result.conflicts).toEqual([]);
    expect(result.pinned.map((entry) => entry.previousId)).toEqual([
      "mo_old_alpha",
      "mov_old_alpha_5",
    ]);
    const loaded = loadMasterOfferingDataset(withRecountedHeader(result.artifact));
    const alpha = loaded.products.find(
      (product) => product.displayName === "Alpha",
    );
    expect(alpha?.id).toBe("mo_old_alpha");
    expect(alpha?.variants[0].id).toBe("mov_old_alpha_5");
    // Nothing else moved.
    expect(
      loaded.products.find((product) => product.displayName === "Beta")?.id,
    ).toBe("mo_beta");
  });

  it("refuses a pin that would duplicate an id already in the file", () => {
    const result = pinPreservedIds(BASE, { mo_beta: "mo_new_alpha" });
    expect(result.pinned).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].reason).toContain("already used by something else");
    // The artifact is untouched, so the reader still loads it.
    expect(() =>
      loadMasterOfferingDataset(withRecountedHeader(result.artifact)),
    ).not.toThrow();
  });

  it("refuses a pin whose new id is not in the regenerated artifact", () => {
    const result = pinPreservedIds(BASE, { mo_old: "mo_absent" });
    expect(result.pinned).toEqual([]);
    expect(result.conflicts[0].reason).toContain("nothing to pin");
  });
});

describe("retiring as a state", () => {
  const previous = artifact([
    offering("mo_new_alpha", "research-vials-alpha", "Alpha", [
      { id: "mov_new_alpha_5", label: "5 mg" },
    ]),
    offering("mo_gone", "research-vials-gone", "Gone", [
      { id: "mov_gone_5", label: "5 mg" },
      { id: "mov_gone_10", label: "10 mg" },
    ]),
  ]);

  it("carries a retired offering in as unavailable, not as a delete", () => {
    const result = retainRetiredOfferings(BASE, previous, ["mo_gone"]);
    expect(result.skipped).toEqual([]);
    expect(result.retained).toEqual([
      {
        id: "mo_gone",
        slug: "research-vials-gone",
        displayName: "Gone",
        variants: 2,
      },
    ]);
    const loaded = loadMasterOfferingDataset(withRecountedHeader(result.artifact));
    expect(loaded.summary.offerings).toBe(3);
    expect(loaded.summary.variants).toBe(4);
    const gone = loaded.products.find((product) => product.id === "mo_gone");
    expect(gone?.displayState).toBe("unavailable");
    expect(gone?.stateExplanation).toBe("This offering is not currently offered.");
    expect(gone?.variants.every((variant) => variant.displayState === "unavailable")).toBe(
      true,
    );
  });

  it("skips a retired offering whose slug is already taken", () => {
    const collision = artifact([
      offering("mo_other", "research-vials-gone", "Something Else", [
        { id: "mov_other", label: "5 mg" },
      ]),
    ]);
    const result = retainRetiredOfferings(collision, previous, ["mo_gone"]);
    expect(result.retained).toEqual([]);
    expect(result.skipped[0].reason).toContain("slug research-vials-gone");
  });

  it("keeps the header honest after the overlay", () => {
    const result = retainRetiredOfferings(BASE, previous, ["mo_gone"]);
    const recounted = withRecountedHeader(result.artifact);
    expect(recounted.canonicalProductCount).toBe(3);
    expect(recounted.variantCount).toBe(4);
    expect(assertGeneratedArtifactSafe(recounted, []).countsAgree).toBe(true);
  });
});
