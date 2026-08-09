import { describe, expect, it } from "vitest";

import {
  PEPTIDE_CATALOG,
  allVariantsWithProduct,
  findVariantBySku,
} from "@shared/research/catalog/peptide-catalog";
import { WHITE_LABEL_LEDGERS } from "@shared/research/white-label/contracts";
import {
  BASE_LABEL_ASSET_MANIFEST,
  assertProtectedLinesPreserved,
  LABEL_ACCESS_NOTATION,
  LABEL_CATALOG_MARK,
  LABEL_EXPIRY_TOKEN,
  LABEL_LOT_TOKEN,
  LABEL_RESEARCH_NOTATION,
  baseLabelAssetFilename,
  buildBaseLabelAsset,
  buildPartnerAssetPacket,
  composePartnerLabel,
  packageDesignation,
  partnerAssetFilename,
  qualityStatusFor,
  serializeBaseLabelAsset,
  validatePartnerBrandOverlay,
  type PartnerBrandOverlay,
} from "./brand-assets";
import {
  supplierRegistryFromSkus,
  whiteLabelEligibilityForSku,
} from "./eligibility";
import { resolvePartnerWholesalePrice } from "./partner-quotes";

const VIAL_SKU = "R360-BPC157_TB500-15MG_15MG-VIAL";
const CAPSULE_SKU = "R360-SLUPP332-250MCGX100-CAP";
const ELIGIBLE_SKU = "R360-PT141-10MG-VIAL";
const ALL_SKUS = allVariantsWithProduct(PEPTIDE_CATALOG).map((e) => e.variant.sku);

function overlay(overrides: Partial<PartnerBrandOverlay> = {}): PartnerBrandOverlay {
  return {
    partnerId: "partner_northstar",
    brandWordmark: "NORTHSTAR",
    catalogMark: "NORTHSTAR PERFORMANCE",
    accentColorHex: "#1E7A4B",
    contactLine: "northstar-performance.example",
    overlayVersion: 1,
    ...overrides,
  };
}

function baseFor(sku: string) {
  const found = findVariantBySku(sku);
  if (found === null) throw new Error(`fixture sku missing: ${sku}`);
  return buildBaseLabelAsset(found.product, found.variant);
}

// ---------------------------------------------------------------------------

describe("the base asset is the Renew 360 label system, not a second one", () => {
  it("reproduces the recorded spec for a vial, line for line", () => {
    expect(baseFor(VIAL_SKU).lines.map((l) => l.text)).toEqual([
      "XENIOS",
      "RENEW 360",
      "BPC-157 + TB-500 Research Blend",
      "BPC-157 (pentadecapeptide BPC-157) and TB-500 (thymosin beta-4 fragment)",
      "15 mg / 15 mg",
      "Single vial",
      "R360-BPC157_TB500-15MG_15MG-VIAL",
      "LOT {{LOT}}",
      "EXP {{EXP}}",
      "Storage and handling: see accompanying documentation.",
      "Research use only. Not for human or veterinary use.",
      "Private catalog. Access by approval.",
    ]);
  });

  it("reproduces the recorded spec for a capsule bottle, line for line", () => {
    const base = baseFor(CAPSULE_SKU);
    expect(base.lines.map((l) => l.text)).toEqual([
      "XENIOS",
      "RENEW 360",
      "SLU-PP-332 Research Capsules",
      "SLU-PP-332",
      "250 mcg",
      "Capsule bottle, 100 capsules",
      "R360-SLUPP332-250MCGX100-CAP",
      "LOT {{LOT}}",
      "EXP {{EXP}}",
      "Storage and handling: see accompanying documentation.",
      "Research use only. Not for human or veterinary use.",
      "Private catalog. Access by approval.",
    ]);
    expect(base.faceMillimetres).toEqual({ width: 100, height: 50 });
    expect(baseFor(VIAL_SKU).faceMillimetres).toEqual({ width: 60, height: 30 });
  });

  it("uses the recorded asset naming convention", () => {
    expect(baseLabelAssetFilename(VIAL_SKU)).toBe(
      "r360-label-bpc157-tb500-15mg-15mg-vial-v1.svg",
    );
    expect(baseLabelAssetFilename(CAPSULE_SKU)).toBe(
      "r360-label-slupp332-250mcgx100-cap-v1.svg",
    );
  });

  it("covers every variant in the catalog with a unique filename", () => {
    expect(BASE_LABEL_ASSET_MANIFEST.size).toBe(70);
    expect(BASE_LABEL_ASSET_MANIFEST.size).toBe(ALL_SKUS.length);
    const filenames = Array.from(BASE_LABEL_ASSET_MANIFEST.values()).map(
      (asset) => asset.assetFilename,
    );
    expect(new Set(filenames).size).toBe(filenames.length);
  });

  it("takes every identity line verbatim from the catalog, never reformatted", () => {
    for (const entry of allVariantsWithProduct(PEPTIDE_CATALOG)) {
      const base = BASE_LABEL_ASSET_MANIFEST.get(entry.variant.sku);
      expect(base).toBeDefined();
      const byField = new Map(base!.lines.map((l) => [l.field, l.text]));
      expect(byField.get("product_name")).toBe(entry.product.displayName);
      expect(byField.get("compound_name")).toBe(entry.product.canonicalName);
      expect(byField.get("strength")).toBe(entry.variant.strength);
      expect(byField.get("sku")).toBe(entry.variant.sku);
      expect(byField.get("package_designation")).toBe(packageDesignation(entry.variant));
    }
  });

  it("prints a placeholder lot and expiry, never a value", () => {
    for (const base of BASE_LABEL_ASSET_MANIFEST.values()) {
      const byField = new Map(base.lines.map((l) => [l.field, l.text]));
      expect(byField.get("lot")).toBe(`LOT ${LABEL_LOT_TOKEN}`);
      expect(byField.get("expiry")).toBe(`EXP ${LABEL_EXPIRY_TOKEN}`);
    }
  });

  it("asserts no purity, sterility, endotoxin, or certificate claim on any face", () => {
    const serialized = JSON.stringify(
      Array.from(BASE_LABEL_ASSET_MANIFEST.values()),
    ).toLowerCase();
    for (const banned of [
      "purity",
      "sterile",
      "sterility",
      "endotoxin",
      "certificate of analysis",
      "coa",
      "usp",
      "pharmaceutical grade",
      "gmp",
    ]) {
      expect(serialized, `a base label asserted "${banned}"`).not.toContain(banned);
    }
  });
});

// ---------------------------------------------------------------------------

describe("a brand overlay is configuration layered over the base", () => {
  it("leaves the base asset byte for byte unchanged across the whole manifest", () => {
    const before = new Map<string, string>();
    for (const [sku, asset] of BASE_LABEL_ASSET_MANIFEST) {
      before.set(sku, serializeBaseLabelAsset(asset));
    }
    const beforeBytes = Buffer.from(
      Array.from(before.values()).join("\u0000"),
      "utf8",
    );

    for (const [, asset] of BASE_LABEL_ASSET_MANIFEST) {
      const composition = composePartnerLabel(asset, overlay());
      expect(composition.base).toBe(asset);
    }

    const afterBytes = Buffer.from(
      Array.from(BASE_LABEL_ASSET_MANIFEST.values())
        .map(serializeBaseLabelAsset)
        .join("\u0000"),
      "utf8",
    );
    expect(afterBytes.equals(beforeBytes)).toBe(true);
    for (const [sku, asset] of BASE_LABEL_ASSET_MANIFEST) {
      expect(serializeBaseLabelAsset(asset)).toBe(before.get(sku));
    }
  });

  it("freezes the base asset and every line on it", () => {
    const base = baseFor(VIAL_SKU);
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(base.lines)).toBe(true);
    for (const asset_line of base.lines) expect(Object.isFrozen(asset_line)).toBe(true);
  });

  it("replaces the wordmark and the catalog mark, and nothing else", () => {
    const base = baseFor(VIAL_SKU);
    const composed = composePartnerLabel(base, overlay());
    expect(composed.lines[0].text).toBe("NORTHSTAR");
    expect(composed.lines[0].origin).toBe("overlay");
    expect(composed.lines[1].text).toBe("NORTHSTAR PERFORMANCE");
    for (const entry of composed.lines) {
      if (entry.brandOwned) continue;
      const original = base.lines.find((l) => l.index === entry.index);
      expect(entry.text).toBe(original!.text);
      expect(entry.origin).toBe("base");
    }
  });

  it("drops the Renew 360 mark rather than lending it, when the overlay sets null", () => {
    const composed = composePartnerLabel(baseFor(VIAL_SKU), overlay({ catalogMark: null }));
    expect(composed.lines.map((l) => l.text)).not.toContain(LABEL_CATALOG_MARK);
    expect(composed.lines.map((l) => l.field)).not.toContain("catalog_mark");
  });

  it("keeps the compliance block on a partner-branded face", () => {
    const texts = composePartnerLabel(baseFor(VIAL_SKU), overlay()).lines.map(
      (l) => l.text,
    );
    expect(texts).toContain(LABEL_RESEARCH_NOTATION);
    expect(texts).toContain(LABEL_ACCESS_NOTATION);
    expect(texts).toContain("R360-BPC157_TB500-15MG_15MG-VIAL");
    expect(texts).toContain("15 mg / 15 mg");
  });

  it("appends the partner contact line without displacing anything", () => {
    const base = baseFor(VIAL_SKU);
    const composed = composePartnerLabel(base, overlay());
    const last = composed.lines[composed.lines.length - 1];
    expect(last.field).toBe("partner_contact");
    expect(last.text).toBe("northstar-performance.example");
    expect(composed.lines).toHaveLength(base.lines.length + 1);
  });

  it("has no field in which an overlay could restate identity or compliance", () => {
    const keys = Object.keys(overlay()).map((key) => key.toLowerCase());
    for (const forbidden of [
      "strength",
      "sku",
      "compound",
      "productname",
      "lot",
      "expiry",
      "storage",
      "purity",
      "coa",
      "quality",
    ]) {
      expect(keys.some((key) => key.includes(forbidden))).toBe(false);
    }
  });

  it("throws if a future composer ever alters a protected line", () => {
    const base = baseFor(VIAL_SKU);
    const composed = composePartnerLabel(base, overlay());
    const tampered = composed.lines.map((entry) =>
      entry.field === "strength" ? { ...entry, text: "50 mg / 50 mg" } : entry,
    );
    // The guard is exercised directly; the composer itself cannot produce this,
    // because the overlay has no field that reaches a protected line.
    expect(() => assertProtectedLinesPreserved(base, tampered)).toThrow(
      /altered protected line/,
    );
    const dropped = composed.lines.filter((entry) => entry.field !== "sku");
    expect(() => assertProtectedLinesPreserved(base, dropped)).toThrow(
      /dropped protected line/,
    );
  });

  it("validates an overlay and refuses blank-but-present values", () => {
    expect(validatePartnerBrandOverlay(overlay())).toEqual([]);
    expect([
      ...validatePartnerBrandOverlay(
        overlay({
          partnerId: " ",
          brandWordmark: "",
          catalogMark: "  ",
          accentColorHex: "green",
          contactLine: " ",
          overlayVersion: 0,
        }),
      ),
    ].sort()).toEqual([
      "accent_color_not_hex",
      "brand_wordmark_missing",
      "catalog_mark_blank",
      "contact_line_blank",
      "overlay_version_not_positive",
      "partner_missing",
    ]);
  });

  it("names the partner face without losing the base filename inside it", () => {
    const base = baseFor(VIAL_SKU);
    const name = partnerAssetFilename(base, overlay({ overlayVersion: 3 }));
    expect(name).toBe(
      "r360-label-bpc157-tb500-15mg-15mg-vial-v1--partner-partner-northstar-b3.svg",
    );
    expect(name.startsWith(base.assetFilename.replace(/\.svg$/, ""))).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("the partner asset packet tells the truth about quality", () => {
  const generatedAt = "2026-08-01T00:00:00.000Z";

  function packetFor(sku: string) {
    const eligibility = whiteLabelEligibilityForSku(sku, {
      suppliers: supplierRegistryFromSkus(ALL_SKUS),
      hasPartnerQuote: () => false,
    });
    const result = buildPartnerAssetPacket({
      overlay: overlay(),
      eligibility,
      pricing: resolvePartnerWholesalePrice([], {
        partnerId: "partner_northstar",
        sku,
        at: generatedAt,
        currency: "USD",
      }),
      generatedAt,
    });
    if (!result.ok) throw new Error(`packet rejected: ${result.rejections.join(", ")}`);
    return result.packet;
  }

  it("states the real certificate status, including not available", () => {
    const packet = packetFor(VIAL_SKU);
    expect(packet.quality.coaStatus).toBe("PENDING_LAB_DOCUMENTATION");
    expect(packet.quality.coaFileOnRecord).toBe(false);
    expect(packet.quality.statement).toBe(
      "Not available. No certificate of analysis file is on record for this SKU.",
    );
  });

  it("reports coaFileOnRecord false for every product in the catalog today", () => {
    for (const product of PEPTIDE_CATALOG) {
      expect(qualityStatusFor(product).coaFileOnRecord).toBe(false);
    }
  });

  it("carries no lot and no expiry, only the placeholder tokens", () => {
    const packet = packetFor(VIAL_SKU);
    expect(packet.lotNumber).toBeNull();
    expect(packet.expiryDate).toBeNull();
    expect(packet.lotToken).toBe(LABEL_LOT_TOKEN);
    expect(packet.expiryToken).toBe(LABEL_EXPIRY_TOKEN);
  });

  it("names the print blockers rather than assuming them away", () => {
    const packet = packetFor(VIAL_SKU);
    expect(packet.printBlockers).toHaveLength(2);
    expect(packet.printBlockers[0]).toContain("Strength contested and unresolved");
    expect(packet.printBlockers[0]).toContain("15 mg / 15 mg");
    expect(packet.printBlockers[1]).toContain("No certificate of analysis file");
  });

  it("marks an ineligible variant as not ready, with the reasons in plain words", () => {
    const packet = packetFor(VIAL_SKU);
    expect(packet.activationReady).toBe(false);
    expect(packet.routing).toBe("NOT_ELIGIBLE");
    expect(packet.activationBlockers.join(" ")).toContain("contested");
  });

  it("routes a GLP-class variant to a clinical provider even inside a packet", () => {
    const packet = packetFor("R360-SEMAGLUTIDE-10MG-VIAL");
    expect(packet.routing).toBe("CLINICAL_PROVIDER_ONLY");
    expect(packet.activationReady).toBe(false);
  });

  it("marks the eligible variant ready and still refuses to guess a price", () => {
    const packet = packetFor(ELIGIBLE_SKU);
    expect(packet.activationReady).toBe(true);
    expect(packet.routing).toBe("ELIGIBLE");
    expect(packet.pricing.state).toBe("QUOTE_REQUIRED");
    expect(packet.ledger).toBe(WHITE_LABEL_LEDGERS.whiteLabelWholesale);
  });

  it("refuses to build on an invalid overlay or an unknown SKU", () => {
    const eligibility = whiteLabelEligibilityForSku(VIAL_SKU, {
      suppliers: supplierRegistryFromSkus(ALL_SKUS),
    });
    const bad = buildPartnerAssetPacket({
      overlay: overlay({ brandWordmark: "" }),
      eligibility,
      pricing: resolvePartnerWholesalePrice([], {
        partnerId: "partner_northstar",
        sku: VIAL_SKU,
        at: generatedAt,
        currency: "USD",
      }),
      generatedAt,
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.rejections).toContain("brand_wordmark_missing");

    const missing = buildPartnerAssetPacket({
      overlay: overlay(),
      eligibility: whiteLabelEligibilityForSku("R360-NOPE-1MG-VIAL", {
        suppliers: supplierRegistryFromSkus(ALL_SKUS),
      }),
      pricing: resolvePartnerWholesalePrice([], {
        partnerId: "partner_northstar",
        sku: "R360-NOPE-1MG-VIAL",
        at: generatedAt,
        currency: "USD",
      }),
      generatedAt,
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.rejections).toContain("sku_not_in_catalog");
  });
});
