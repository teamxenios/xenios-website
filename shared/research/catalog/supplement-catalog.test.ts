import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePrivateLaneOfferMode } from "./offer-readiness";
import {
  findSupplementByCanonicalName,
  findSupplementBySlug,
  FOUNDATIONAL_CATEGORIES,
  PAIRING_MAP_MEMBERS_NOT_IN_CATALOG,
  PAIRING_MAP_NAME_ALIASES,
  PROTOCOL_BUNDLES,
  PROTOCOL_TAG_CATEGORY_HINTS,
  SUPPLEMENT_CATALOG,
  SUPPLEMENT_CATEGORIES,
  supplementsInCategory,
  supplementsInCollection,
  toMemberSupplementCard,
} from "./supplement-catalog";

/**
 * The workbook rows, transcribed independently of the module so the test is a real
 * second reading rather than a restatement of the same array. Order is the sheet's
 * order: matrix id, exact product name, supplier code (null for the placeholder),
 * wholesale cents, approved member cents.
 */
const WORKBOOK: ReadonlyArray<[string, string, string | null, number, number]> = [
  ["NUT-001", "Longevity Essentials NAD+", null, 2620, 5299],
  ["NUT-002", "Magtein (Magnesium L-Threonate)", "R227", 3550, 7099],
  ["NUT-003", "Mito Recharge", "R167", 3450, 6899],
  ["NUT-004", "Uplift+", null, 3650, 7299],
  ["NUT-005", "Omega Pure EPA-DHA 2400", "R817E", 2875, 5799],
  ["NUT-006", "Chondro Jointaide", "R149C", 5975, 11999],
  ["NUT-007", "Collagen Renew (Dynamic Multi)", "R190", 4695, 9399],
  ["NUT-008", "Inflam-Eze (30-serving)", "R266L", 6550, 13099],
  ["NUT-009", "UltraBiotic Prebiotic", "R222", 4295, 8599],
  ["NUT-010", "GI Defend", "R191", 4325, 8699],
  ["NUT-011", "Hydrate", "R982", 1575, 3199],
  ["NUT-012", "Stress Essentials Balance", "R123L", 3495, 6999],
  ["NUT-013", "PRM Resolve", "R848", 4095, 8199],
  ["NUT-014", "Fruits & Greens", "R305-GFSK", 2720, 5499],
  ["NUT-015", "Brain Restore", "R152", 6750, 13499],
  ["NUT-016", "UltraBiotic Akkermansia Plus", "R196", 3150, 6299],
  ["NUT-017", "Annatto Pro 125", "R271L", 2988, 5999],
  ["NUT-018", "Rejuvenate+", null, 3795, 7599],
  ["NUT-019", "PeriMenopause Support", "R199", 1725, 3499],
  ["NUT-020", "Stress Essentials Calm", "R123C", 3495, 6999],
];

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");

describe("the twenty rows match the workbook", () => {
  it("holds exactly twenty products", () => {
    expect(SUPPLEMENT_CATALOG).toHaveLength(20);
    expect(WORKBOOK).toHaveLength(20);
  });

  it("carries the exact name, supplier code, cost, and approved amount for every row", () => {
    WORKBOOK.forEach(([id, name, supplierSkuCode, wholesale, approved], index) => {
      const product = SUPPLEMENT_CATALOG[index];
      expect(product.matrixDecisionId).toBe(id);
      expect(product.canonicalName).toBe(name);
      expect(product.supplierSkuCode).toBe(supplierSkuCode);
      expect(product.wholesaleSourceCostCents).toBe(wholesale);
      expect(product.approvedMemberAmountCents).toBe(approved);
      expect(product.brand).toBe("NutriDyn");
      expect(product.currency).toBe("USD");
      expect(product.audience).toBe("member");
      expect(product.effectiveDate).toBeNull();
      expect(product.approvalNote).toContain("Founder-approved 2026-07-29");
      expect(product.approvalNote).toContain("NUT-019");
      expect(product.approvalNote).toContain("NUT-020");
      expect(product.sourceReference).toContain("Top peptides nutridyn");
    });
  });

  it("keeps slugs, internal skus, and matrix ids unique", () => {
    expect(new Set(SUPPLEMENT_CATALOG.map((p) => p.slug)).size).toBe(20);
    expect(new Set(SUPPLEMENT_CATALOG.map((p) => p.internalSku)).size).toBe(20);
    expect(new Set(SUPPLEMENT_CATALOG.map((p) => p.matrixDecisionId)).size).toBe(20);
  });

  it("mints internal skus on the documented convention", () => {
    expect(SUPPLEMENT_CATALOG[0].internalSku).toBe("N001");
    expect(SUPPLEMENT_CATALOG[19].internalSku).toBe("N020");
    for (const product of SUPPLEMENT_CATALOG) {
      expect(product.internalSku).toMatch(/^N\d{3}$/);
    }
  });

  it("shows the canonical name until a member facing rename is approved", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      expect(product.displayName).toBe(product.canonicalName);
    }
  });
});

describe("the approved amounts hold their shape", () => {
  it("prices every row at roughly twice wholesale, ending in 99", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      const ratio = product.approvedMemberAmountCents / product.wholesaleSourceCostCents;
      expect(ratio).toBeGreaterThanOrEqual(1.95);
      expect(ratio).toBeLessThanOrEqual(2.1);
      expect(product.approvedMemberAmountCents % 100).toBe(99);
      expect(Number.isSafeInteger(product.approvedMemberAmountCents)).toBe(true);
      expect(product.approvedMemberAmountCents).toBeGreaterThan(0);
    }
  });

  it("carries the two rows added after the decision snapshot", () => {
    expect(findSupplementBySlug("perimenopause-support")?.approvedMemberAmountCents).toBe(3499);
    expect(findSupplementBySlug("stress-essentials-calm")?.approvedMemberAmountCents).toBe(6999);
  });
});

describe("categories are closed and traceable", () => {
  it("assigns every product a category from the closed set", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      expect(SUPPLEMENT_CATEGORIES).toContain(product.category);
    }
  });

  it("hints every protocol tag the catalog uses, so no unread tag slips through", () => {
    const used = new Set(SUPPLEMENT_CATALOG.flatMap((p) => [...p.protocolTags]));
    for (const tag of used) {
      expect(Object.prototype.hasOwnProperty.call(PROTOCOL_TAG_CATEGORY_HINTS, tag)).toBe(true);
    }
    // "IC" is in the workbook with no expansion, so it supports no category.
    expect(PROTOCOL_TAG_CATEGORY_HINTS["IC"]).toEqual([]);
  });

  it("keeps every hinted category inside the closed set", () => {
    for (const hinted of Object.values(PROTOCOL_TAG_CATEGORY_HINTS)) {
      for (const category of hinted) {
        expect(SUPPLEMENT_CATEGORIES).toContain(category);
      }
    }
  });

  it("backs a protocol tag basis with a tag the row carries and a category that tag supports", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      if (product.categoryBasis.kind !== "protocol_tag") continue;
      const { tag } = product.categoryBasis;
      expect(product.protocolTags).toContain(tag);
      expect(PROTOCOL_TAG_CATEGORY_HINTS[tag]).toContain(product.category);
    }
  });

  it("backs a clinical role basis with words from that row's own clinical role", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      if (product.categoryBasis.kind !== "clinical_role") continue;
      expect(product.clinicalRole.toLowerCase()).toContain(
        product.categoryBasis.evidence.toLowerCase(),
      );
    }
  });

  it("only reaches a foundational category through a clinical role basis", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      if (!FOUNDATIONAL_CATEGORIES.includes(product.category)) continue;
      expect(product.categoryBasis.kind).toBe("clinical_role");
    }
  });

  it("filters by category", () => {
    expect(supplementsInCategory("gut_immune").map((p) => p.slug)).toEqual([
      "inflam-eze",
      "ultrabiotic-prebiotic",
      "gi-defend",
      "ultrabiotic-akkermansia-plus",
    ]);
  });
});

describe("collections match the pairing map in both directions", () => {
  const bundleSlugs = new Set(PROTOCOL_BUNDLES.map((b) => b.slug));

  it("has ten bundles with unique slugs", () => {
    expect(PROTOCOL_BUNDLES).toHaveLength(10);
    expect(bundleSlugs.size).toBe(10);
  });

  it("only references bundles that exist", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      expect(product.collections.length).toBeGreaterThan(0);
      for (const slug of product.collections) {
        expect(bundleSlugs.has(slug)).toBe(true);
      }
    }
  });

  it("resolves every bundle member to a catalog row or to the recorded gap list", () => {
    for (const bundle of PROTOCOL_BUNDLES) {
      for (const name of bundle.supplementNames) {
        const product = findSupplementByCanonicalName(name);
        if (!product) {
          expect(PAIRING_MAP_MEMBERS_NOT_IN_CATALOG).toContain(name);
          continue;
        }
        expect(product.collections).toContain(bundle.slug);
      }
    }
  });

  it("puts every product's collection membership back in the bundle that names it", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      for (const slug of product.collections) {
        const bundle = PROTOCOL_BUNDLES.find((b) => b.slug === slug);
        expect(bundle).toBeDefined();
        const names = bundle!.supplementNames.map(
          (name) => PAIRING_MAP_NAME_ALIASES[name] ?? name,
        );
        expect(names).toContain(product.canonicalName);
      }
    }
  });

  it("records the one bundle member that has no sku row and no approved amount", () => {
    expect(PAIRING_MAP_MEMBERS_NOT_IN_CATALOG).toEqual(["Core Aminos (BCAA)"]);
    expect(findSupplementByCanonicalName("Core Aminos (BCAA)")).toBeUndefined();
  });

  it("looks a collection up", () => {
    expect(supplementsInCollection("neurological-cognitive").map((p) => p.slug)).toEqual([
      "magtein-magnesium-l-threonate",
      "uplift-plus",
      "brain-restore",
    ]);
  });

  it("labels bundles for members without naming a condition", () => {
    for (const bundle of PROTOCOL_BUNDLES) {
      expect(bundle.memberLabel.length).toBeGreaterThan(0);
      expect(bundle.memberLabel.toLowerCase()).not.toContain("autoimmune");
      expect(bundle.memberLabel.toLowerCase()).not.toContain("perimenopause");
      expect(bundle.memberLabel.toLowerCase()).not.toContain("djd");
    }
  });
});

describe("nothing is invented", () => {
  it("leaves the form factor null with a named missing input on every row", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      expect(product.formFactor.value).toBeNull();
      expect(product.formFactor.missingInputs.length).toBeGreaterThan(0);
      expect(product.formFactor.missingInputs.join(" ")).toContain("specification sheet");
    }
  });

  it("lists what every row is still waiting on", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      const joined = product.missingInputs.join(" | ");
      expect(joined).toContain("serving");
      expect(joined).toContain("allergen");
      expect(joined).toContain("reseller authorization");
      expect(product.resellerAuthorization).toBe("not_authorized");
    }
  });

  it("names the missing supplier code on exactly the three placeholder rows", () => {
    const withoutCode = SUPPLEMENT_CATALOG.filter((p) => p.supplierSkuCode === null);
    expect(withoutCode.map((p) => p.matrixDecisionId)).toEqual([
      "NUT-001",
      "NUT-004",
      "NUT-018",
    ]);
    for (const product of withoutCode) {
      expect(product.missingInputs.join(" | ")).toContain("Supplier item code");
    }
    for (const product of SUPPLEMENT_CATALOG.filter((p) => p.supplierSkuCode !== null)) {
      expect(product.missingInputs.join(" | ")).not.toContain("Supplier item code");
    }
  });
});

describe("the offer mode is derived, not declared", () => {
  it("never offers direct purchase anywhere in this lane", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      expect(product.availability).not.toBe("DIRECT_PRIVATE_PURCHASE");
    }
  });

  it("matches what the shared resolver derives from each row's own evidence", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      const derived = resolvePrivateLaneOfferMode({
        lane: "supplement",
        approvedMemberAmountCents: product.approvedMemberAmountCents,
        supplierSkuCode: product.supplierSkuCode,
        internalVariantSku: null,
        coaEvidence: product.coaEvidence,
        unavailable: false,
      });
      expect(product.availability).toBe(derived);
    }
  });

  it("splits seventeen approval rows from three access request rows", () => {
    const byMode = SUPPLEMENT_CATALOG.reduce<Record<string, number>>((acc, product) => {
      acc[product.availability] = (acc[product.availability] ?? 0) + 1;
      return acc;
    }, {});
    expect(byMode).toEqual({
      APPROVAL_REQUIRED_PURCHASE: 17,
      REQUEST_ACCESS_ONLY: 3,
    });
  });

  it("ties readiness to the same evidence", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      expect(product.readiness).toBe(
        product.supplierSkuCode === null
          ? "NEEDS_SUPPLIER_DOCUMENTATION"
          : "APPROVED_FOR_PRIVATE_OFFER",
      );
    }
  });
});

describe("the member projection keeps internal fields internal", () => {
  it("carries only the allowed keys", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      const card = toMemberSupplementCard(product);
      expect(Object.keys(card).sort()).toEqual([
        "amountCents",
        "availability",
        "brand",
        "category",
        "collections",
        "currency",
        "displayName",
        "slug",
      ]);
      const serialized = JSON.stringify(card);
      expect(serialized).not.toContain(String(product.wholesaleSourceCostCents));
      expect(serialized).not.toContain("Founder-approved");
      expect(serialized).not.toContain("nutridyn (3).xlsx");
      expect(serialized).not.toContain("not_authorized");
    }
  });

  it("shows an amount only where the mode permits one, and never a zero", () => {
    for (const product of SUPPLEMENT_CATALOG) {
      const card = toMemberSupplementCard(product);
      if (product.availability === "APPROVAL_REQUIRED_PURCHASE") {
        expect(card.amountCents).toBe(product.approvedMemberAmountCents);
      } else {
        expect(card.amountCents).toBeNull();
      }
      expect(card.amountCents).not.toBe(0);
    }
  });
});

describe("boundaries", () => {
  it("is not imported by any client file", () => {
    const clientRoot = path.join(REPO_ROOT, "client");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "node_modules") continue;
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx|js|jsx)$/.test(entry)) continue;
        const source = readFileSync(full, "utf8");
        if (source.includes("catalog/supplement-catalog") || source.includes("catalog/quantum-product")) {
          offenders.push(full);
        }
      }
    };
    walk(clientRoot);
    expect(offenders).toEqual([]);
  });

  it("keeps house style: no em dashes in this directory", () => {
    // Built from its code point so this file does not itself carry the character.
    const emDash = String.fromCharCode(0x2014);
    const dir = HERE;
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".ts")) continue;
      const source = readFileSync(path.join(dir, entry), "utf8");
      expect(source.includes(emDash), `${entry} contains an em dash`).toBe(false);
    }
  });
});
