/**
 * xenios research: white-label BRAND ASSETS. Server only, derived, read only.
 *
 * A partner brand overlay is CONFIGURATION LAYERED OVER A BASE ASSET. It is never an
 * edit of the base asset. The Renew 360 label system
 * (docs/research-commerce/PEPTIDE_LABEL_SYSTEM.md) is the base, and this module
 * rebuilds it from the same authority the document generates from, the canonical
 * peptide catalog, so a label can never state something the data layer does not.
 *
 * FOUR RULES, ALL ENFORCED BY THE SHAPE OF THE CODE.
 *
 * 1. THE BASE IS IMMUTABLE. Every base asset is deeply frozen at module load, and
 *    composition returns a NEW object that holds the same frozen base by reference.
 *    A test serializes every base asset to bytes, composes an overlay over all of
 *    them, and asserts the bytes are identical afterwards.
 *
 * 2. AN OVERLAY CAN ONLY REACH THE BRAND. PartnerBrandOverlay has fields for the
 *    wordmark, the catalog mark, the accent colour, and an optional contact line.
 *    It has NO field for the product name, the compound name, the strength, the
 *    package designation, the SKU, the lot or expiry placeholders, or the compliance
 *    lines, so those cannot be overwritten by any value a caller supplies.
 *    assertProtectedLinesPreserved re-checks that after composition and throws, so
 *    the guarantee survives a future edit to the composer.
 *
 * 3. NOTHING IS FABRICATED. There is no lot number and no expiry date in this
 *    module: the base carries the label system's `{{LOT}}` and `{{EXP}}` tokens and
 *    the packet carries nulls beside them. There is no certificate of analysis
 *    either. The packet states the REAL quality status from the catalog, including
 *    "not available", in a plain sentence.
 *
 * 4. NO INTERNAL COMMERCIAL FACT TRAVELS. A packet carries the partner's own quoted
 *    price or an honest QUOTE_REQUIRED, and nothing about our cost, multiplier, or
 *    margin. A serialization test over the whole packet pins that.
 */

import {
  PEPTIDE_CATALOG,
  findVariantBySku,
  allVariantsWithProduct,
  type PeptideCoaStatus,
  type PeptideProduct,
  type PeptideVariant,
} from "@shared/research/catalog/peptide-catalog";
import {
  WHITE_LABEL_LEDGERS,
  type PartnerWholesalePrice,
  type WhiteLabelRouting,
} from "@shared/research/white-label/contracts";
import { findVariantStrengthDispute } from "../products-diagnostics/variant-strength-dispute";
import type { WhiteLabelEligibility } from "./eligibility";

// ---------------------------------------------------------------------------
// The base asset, rebuilt from the catalog
// ---------------------------------------------------------------------------

/** The three zones of the Renew 360 label, top to bottom. */
export type LabelZone = "A" | "B" | "C";

/**
 * What a line's text came from. `fixed` is label-system copy, `catalog` is a value
 * read verbatim from the data layer, `placeholder` is a token replaced at fill time
 * from a real record or the label does not print.
 */
export type LabelLineSource = "fixed" | "catalog" | "placeholder";

export interface BaseLabelLine {
  index: number;
  zone: LabelZone;
  field: string;
  text: string;
  source: LabelLineSource;
  /**
   * True when a partner brand overlay may replace or drop this line. False for
   * identity, SKU, lot, expiry, and compliance, which no overlay may touch.
   */
  brandOwned: boolean;
}

export interface BaseLabelAsset {
  sku: string;
  productCode: string;
  slug: string;
  /** The filename from the label system's naming convention, section 5. */
  assetFilename: string;
  faceMillimetres: { readonly width: number; readonly height: number };
  lines: readonly BaseLabelLine[];
}

/** The label system's fixed copy, verbatim. Never paraphrased, never softened. */
export const LABEL_BRAND_WORDMARK = "XENIOS";
export const LABEL_CATALOG_MARK = "RENEW 360";
export const LABEL_STORAGE_POINTER =
  "Storage and handling: see accompanying documentation.";
export const LABEL_RESEARCH_NOTATION =
  "Research use only. Not for human or veterinary use.";
export const LABEL_ACCESS_NOTATION = "Private catalog. Access by approval.";
export const LABEL_LOT_TOKEN = "{{LOT}}";
export const LABEL_EXPIRY_TOKEN = "{{EXP}}";

const VIAL_FACE_MM = Object.freeze({ width: 60, height: 30 });
const CAPSULE_FACE_MM = Object.freeze({ width: 100, height: 50 });

/**
 * The label system's asset naming convention, section 5: the SKU lowercased, the
 * `R360-` prefix dropped, underscores turned into hyphens, prefixed and versioned.
 */
export function baseLabelAssetFilename(sku: string, extension = "svg"): string {
  const body = sku
    .trim()
    .replace(/^R360-/i, "")
    .toLowerCase()
    .replace(/_/g, "-");
  return `r360-label-${body}-v1.${extension}`;
}

/** The package designation line, exactly as the per-SKU specs record it. */
export function packageDesignation(variant: PeptideVariant): string {
  if (variant.format === "capsule_bottle") {
    const count = variant.capsuleCount ?? 0;
    return `Capsule bottle, ${count} capsules`;
  }
  return "Single vial";
}

function line(
  index: number,
  zone: LabelZone,
  field: string,
  text: string,
  source: LabelLineSource,
  brandOwned: boolean,
): BaseLabelLine {
  return Object.freeze({ index, zone, field, text, source, brandOwned });
}

/**
 * The base label asset for one exact variant. Twelve lines in layout order, exactly
 * the set the per-SKU specifications in the label system document print.
 */
export function buildBaseLabelAsset(
  product: PeptideProduct,
  variant: PeptideVariant,
): BaseLabelAsset {
  const lines: readonly BaseLabelLine[] = Object.freeze([
    line(1, "A", "brand_wordmark", LABEL_BRAND_WORDMARK, "fixed", true),
    line(2, "A", "catalog_mark", LABEL_CATALOG_MARK, "fixed", true),
    line(3, "B", "product_name", product.displayName, "catalog", false),
    line(4, "B", "compound_name", product.canonicalName, "catalog", false),
    line(5, "B", "strength", variant.strength, "catalog", false),
    line(6, "B", "package_designation", packageDesignation(variant), "catalog", false),
    line(7, "C", "sku", variant.sku, "catalog", false),
    line(8, "C", "lot", `LOT ${LABEL_LOT_TOKEN}`, "placeholder", false),
    line(9, "C", "expiry", `EXP ${LABEL_EXPIRY_TOKEN}`, "placeholder", false),
    line(10, "C", "storage_pointer", LABEL_STORAGE_POINTER, "fixed", false),
    line(11, "C", "research_notation", LABEL_RESEARCH_NOTATION, "fixed", false),
    line(12, "C", "access_notation", LABEL_ACCESS_NOTATION, "fixed", false),
  ]);
  return Object.freeze({
    sku: variant.sku,
    productCode: product.internalProductCode,
    slug: product.slug,
    assetFilename: baseLabelAssetFilename(variant.sku),
    faceMillimetres:
      variant.format === "capsule_bottle" ? CAPSULE_FACE_MM : VIAL_FACE_MM,
    lines,
  });
}

/** Every base label asset in the catalog, keyed by SKU. Built once, frozen. */
export const BASE_LABEL_ASSET_MANIFEST: ReadonlyMap<string, BaseLabelAsset> = (() => {
  const manifest = new Map<string, BaseLabelAsset>();
  for (const entry of allVariantsWithProduct(PEPTIDE_CATALOG)) {
    manifest.set(entry.variant.sku, buildBaseLabelAsset(entry.product, entry.variant));
  }
  return manifest;
})();

/** Deterministic bytes for one base asset. The test compares these before and after. */
export function serializeBaseLabelAsset(asset: BaseLabelAsset): string {
  return JSON.stringify(asset);
}

// ---------------------------------------------------------------------------
// The overlay
// ---------------------------------------------------------------------------

/**
 * A partner brand overlay. Configuration, layered, additive.
 *
 * Note what is NOT here: no product name, no compound, no strength, no package
 * designation, no SKU, no lot, no expiry, no storage line, no research notation, no
 * access notation, no quality claim. A partner brand cannot restate what is in the
 * container, because there is no field in which to say it.
 */
export interface PartnerBrandOverlay {
  partnerId: string;
  /** The partner's brand name. Replaces the XENIOS wordmark in zone A. */
  brandWordmark: string;
  /**
   * The partner's own catalog mark for zone A, or null to DROP that line. Null drops
   * it rather than leaving "RENEW 360" on a partner-branded face; a dropped line is
   * honest, a borrowed mark is not.
   */
  catalogMark: string | null;
  /** Hex colour for the accent arc only. Null keeps the Renew 360 accent. */
  accentColorHex: string | null;
  /** One optional partner contact line, appended after the compliance block. */
  contactLine: string | null;
  /** Increments on any overlay change. Part of the partner asset filename. */
  overlayVersion: number;
}

export const OVERLAY_REJECTIONS = [
  "partner_missing",
  "brand_wordmark_missing",
  "catalog_mark_blank",
  "accent_color_not_hex",
  "contact_line_blank",
  "overlay_version_not_positive",
] as const;

export type OverlayRejection = (typeof OVERLAY_REJECTIONS)[number];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Validate an overlay. A blank-but-present value is rejected rather than coerced:
 * a caller that sends an empty catalog mark meant something, and guessing which
 * thing is how a wrong line reaches a vial.
 */
export function validatePartnerBrandOverlay(
  overlay: PartnerBrandOverlay,
): readonly OverlayRejection[] {
  const rejections: OverlayRejection[] = [];
  if (overlay.partnerId.trim().length === 0) rejections.push("partner_missing");
  if (overlay.brandWordmark.trim().length === 0) rejections.push("brand_wordmark_missing");
  if (overlay.catalogMark !== null && overlay.catalogMark.trim().length === 0) {
    rejections.push("catalog_mark_blank");
  }
  if (overlay.accentColorHex !== null && !HEX_COLOR.test(overlay.accentColorHex)) {
    rejections.push("accent_color_not_hex");
  }
  if (overlay.contactLine !== null && overlay.contactLine.trim().length === 0) {
    rejections.push("contact_line_blank");
  }
  if (!Number.isSafeInteger(overlay.overlayVersion) || overlay.overlayVersion <= 0) {
    rejections.push("overlay_version_not_positive");
  }
  return Object.freeze(rejections);
}

export interface ComposedLabelLine extends BaseLabelLine {
  /** Where this line's text came from in the composition. */
  origin: "base" | "overlay";
}

export interface PartnerLabelComposition {
  /** The same frozen base asset, by reference. Composition never copies or edits it. */
  base: BaseLabelAsset;
  partnerId: string;
  overlayVersion: number;
  partnerAssetFilename: string;
  lines: readonly ComposedLabelLine[];
  accentColorHex: string | null;
}

/** Filename for the composed partner face. The base filename is left intact inside it. */
export function partnerAssetFilename(
  base: BaseLabelAsset,
  overlay: PartnerBrandOverlay,
  extension = "svg",
): string {
  const stem = base.assetFilename.replace(/\.[a-z0-9]+$/i, "");
  const partnerToken = overlay.partnerId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${stem}--partner-${partnerToken}-b${overlay.overlayVersion}.${extension}`;
}

/**
 * Re-check, after composition, that every line an overlay may not touch is byte
 * identical to the base. Throws rather than returning false: a composed face that
 * changed a strength or a compliance line must not exist as a value another function
 * could pass along.
 */
export function assertProtectedLinesPreserved(
  base: BaseLabelAsset,
  composed: readonly ComposedLabelLine[],
): void {
  for (const baseLine of base.lines) {
    if (baseLine.brandOwned) continue;
    const match = composed.find((entry) => entry.index === baseLine.index);
    if (match === undefined) {
      throw new Error(
        `white-label overlay dropped protected line ${baseLine.index} (${baseLine.field}) on ${base.sku}`,
      );
    }
    if (match.text !== baseLine.text || match.origin !== "base") {
      throw new Error(
        `white-label overlay altered protected line ${baseLine.index} (${baseLine.field}) on ${base.sku}`,
      );
    }
  }
}

/** Layer an overlay over a base asset. Returns a new composition; the base is untouched. */
export function composePartnerLabel(
  base: BaseLabelAsset,
  overlay: PartnerBrandOverlay,
): PartnerLabelComposition {
  const lines: ComposedLabelLine[] = [];
  for (const baseLine of base.lines) {
    if (baseLine.field === "brand_wordmark") {
      lines.push({ ...baseLine, text: overlay.brandWordmark.trim(), origin: "overlay" });
      continue;
    }
    if (baseLine.field === "catalog_mark") {
      if (overlay.catalogMark === null) continue;
      lines.push({ ...baseLine, text: overlay.catalogMark.trim(), origin: "overlay" });
      continue;
    }
    lines.push({ ...baseLine, origin: "base" });
  }
  if (overlay.contactLine !== null) {
    lines.push({
      index: base.lines.length + 1,
      zone: "C",
      field: "partner_contact",
      text: overlay.contactLine.trim(),
      source: "fixed",
      brandOwned: true,
      origin: "overlay",
    });
  }
  assertProtectedLinesPreserved(base, lines);
  return Object.freeze({
    base,
    partnerId: overlay.partnerId.trim(),
    overlayVersion: overlay.overlayVersion,
    partnerAssetFilename: partnerAssetFilename(base, overlay),
    lines: Object.freeze(lines.map((entry) => Object.freeze(entry))),
    accentColorHex: overlay.accentColorHex,
  });
}

// ---------------------------------------------------------------------------
// Quality, stated honestly
// ---------------------------------------------------------------------------

export interface PacketQualityStatus {
  coaStatus: PeptideCoaStatus;
  /** True only when a certificate file is actually on record for this SKU. */
  coaFileOnRecord: boolean;
  /** Plain sentence, including "Not available" where that is the truth. */
  statement: string;
}

const QUALITY_STATEMENTS: Record<PeptideCoaStatus, string> = {
  VERIFIED_FILE_PRESENT:
    "A certificate of analysis file is on record for this exact SKU.",
  AVAILABLE_ON_REQUEST:
    "Not available in this packet. A certificate of analysis is offered on request and no file is attached to this SKU in this system.",
  INTERNAL_PENDING_UPLOAD:
    "Not available in this packet. A certificate of analysis is held internally and has not been uploaded to this system.",
  PENDING_LAB_DOCUMENTATION:
    "Not available. No certificate of analysis file is on record for this SKU.",
};

export function qualityStatusFor(product: PeptideProduct): PacketQualityStatus {
  return Object.freeze({
    coaStatus: product.coaStatus,
    coaFileOnRecord: product.coaStatus === "VERIFIED_FILE_PRESENT",
    statement: QUALITY_STATEMENTS[product.coaStatus],
  });
}

// ---------------------------------------------------------------------------
// The partner asset packet
// ---------------------------------------------------------------------------

/**
 * The descriptor a partner receives for one SKU.
 *
 * Every field is either an identity fact from the catalog, a state this repository
 * can actually check, or the partner's own quoted price. There is no cost, no
 * multiplier, no margin, no supplier name, no lot, no expiry, and no quality claim
 * that a document does not support.
 */
export interface PartnerAssetPacket {
  partnerId: string;
  brandName: string;
  overlayVersion: number;
  sku: string;
  productCode: string;
  displayName: string;
  routing: WhiteLabelRouting;
  activationReady: boolean;
  /** Plain sentences. Empty only when the variant is eligible. */
  activationBlockers: readonly string[];
  baseAssetFilename: string;
  partnerAssetFilename: string;
  lines: readonly ComposedLabelLine[];
  accentColorHex: string | null;
  quality: PacketQualityStatus;
  /** Always null. A lot and an expiry come from a real fill record, never from here. */
  lotNumber: null;
  expiryDate: null;
  lotToken: string;
  expiryToken: string;
  /** What would stop this artwork going to print today. Derived, never assumed away. */
  printBlockers: readonly string[];
  pricing: PartnerWholesalePrice;
  ledger: typeof WHITE_LABEL_LEDGERS.whiteLabelWholesale;
  generatedAt: string;
}

export interface BuildPartnerAssetPacketInput {
  overlay: PartnerBrandOverlay;
  eligibility: WhiteLabelEligibility;
  pricing: PartnerWholesalePrice;
  generatedAt: string;
  catalog?: readonly PeptideProduct[];
}

export type BuildPartnerAssetPacketResult =
  | { ok: true; packet: PartnerAssetPacket }
  | { ok: false; rejections: readonly (OverlayRejection | "sku_not_in_catalog")[] };

function printBlockersFor(
  product: PeptideProduct,
  variant: PeptideVariant,
): readonly string[] {
  const blockers: string[] = [];
  const dispute = findVariantStrengthDispute(variant);
  if (dispute !== null) {
    blockers.push(
      `Strength contested and unresolved. The catalog records "${dispute.founderLocked.presentation}" and the contesting source records "${dispute.contested.presentation}".`,
    );
  }
  if (product.coaStatus !== "VERIFIED_FILE_PRESENT") {
    blockers.push(QUALITY_STATEMENTS[product.coaStatus]);
  }
  return Object.freeze(blockers);
}

/**
 * Build the packet. A packet is produced even when the variant is NOT eligible,
 * because an honest "here is what is missing" is more useful to a partner than
 * silence, and `activationReady` plus `activationBlockers` say so plainly. Nothing
 * about a blocked packet reads as an approval.
 */
export function buildPartnerAssetPacket(
  input: BuildPartnerAssetPacketInput,
): BuildPartnerAssetPacketResult {
  const rejections = validatePartnerBrandOverlay(input.overlay).slice() as Array<
    OverlayRejection | "sku_not_in_catalog"
  >;
  const catalog = input.catalog ?? PEPTIDE_CATALOG;
  const found = findVariantBySku(input.eligibility.sku, catalog);
  if (found === null) rejections.push("sku_not_in_catalog");
  if (rejections.length > 0 || found === null) {
    return { ok: false, rejections: Object.freeze(rejections) };
  }

  const base = buildBaseLabelAsset(found.product, found.variant);
  const composition = composePartnerLabel(base, input.overlay);

  return {
    ok: true,
    packet: Object.freeze({
      partnerId: composition.partnerId,
      brandName: input.overlay.brandWordmark.trim(),
      overlayVersion: input.overlay.overlayVersion,
      sku: base.sku,
      productCode: base.productCode,
      displayName: found.product.displayName,
      routing: input.eligibility.routing,
      activationReady: input.eligibility.eligible,
      activationBlockers: input.eligibility.explanations,
      baseAssetFilename: base.assetFilename,
      partnerAssetFilename: composition.partnerAssetFilename,
      lines: composition.lines,
      accentColorHex: composition.accentColorHex,
      quality: qualityStatusFor(found.product),
      lotNumber: null,
      expiryDate: null,
      lotToken: LABEL_LOT_TOKEN,
      expiryToken: LABEL_EXPIRY_TOKEN,
      printBlockers: printBlockersFor(found.product, found.variant),
      pricing: input.pricing,
      ledger: WHITE_LABEL_LEDGERS.whiteLabelWholesale,
      generatedAt: input.generatedAt,
    }),
  };
}
