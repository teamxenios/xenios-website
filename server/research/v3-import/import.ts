/**
 * The V3 master importer. Server only, pure, and read only.
 *
 * It turns workbook rows into `V3SourceRecord`s and resolves a readiness state
 * for each. It writes nothing: there is no database call, no file write, and no
 * mutation of any production record in this file. The output is a value the
 * caller inspects, which is what makes a dry run a real dry run rather than a
 * flag on a write path.
 *
 * WHAT IT REFUSES TO DO
 *
 * 1. It never produces an approved customer price. The readiness input it
 *    builds sets `hasApprovedPrice` from an injected approval lookup that
 *    defaults to approving nothing, and the workbook's own sell column is
 *    carried only as `planningPrice`, which no customer projection reads.
 * 2. It never resolves a contested variant presentation. It asks the merged
 *    guard in products-diagnostics/variant-strength-dispute (PR #205) and
 *    passes the answer through. It does not re-derive, cache, or override it.
 * 3. It never invents identity. A row with no offer id, no product name, no
 *    variant, an unknown category, an ambiguous price-book join, or a
 *    conflicting variant is rejected with a reason rather than repaired.
 * 4. It never estimates money. A cost the workbook marks pending stays null,
 *    and a cell that is not an exact amount is a rejection.
 *
 * IDEMPOTENCE. The same workbook produces the same records in the same order
 * with the same record ids, so re-running the import is a no-op against any
 * store keyed on `recordId`. A test pins deep equality across two runs.
 */

import {
  isV3Category,
  type V3AccessIntent,
  type V3AdminCostRecord,
  type V3ApprovedPriceLookup,
  type V3Audience,
  type V3Category,
  type V3DocumentationRecord,
  type V3EvidenceState,
  type V3ImageState,
  type V3ReadinessDecision,
  type V3SourceRecord,
  type V3VariantIdentity,
  type V3VariantLabelOrigin,
  noApprovedPrices,
  resolveV3Readiness,
} from "@shared/research/v3-import";
import {
  findVariantStrengthDispute,
  type StrengthDisputeVariantIdentity,
  type VariantStrengthDispute,
} from "../products-diagnostics/variant-strength-dispute";
import {
  cellAmountCents,
  cellText,
  readV3SheetRows,
  V3_SHEET_IMAGE_MANIFEST,
  V3_SHEET_OFFER_INDEX,
  V3_SHEET_PEPTIDE_MASTER,
  V3_SHEET_PRICE_BOOK,
  type V3RawWorkbook,
  type V3SheetRow,
} from "./workbook";

// ---------------------------------------------------------------------------
// Column names, verbatim from the workbook
// ---------------------------------------------------------------------------

const OFFER_CATEGORY = "Category";
const OFFER_ID = "ID / SKU";
const OFFER_NAME = "Product / Service";
const OFFER_VARIANT = "Variant / Format";
const OFFER_ACCESS = "Access / Status";
const OFFER_RAIL = "Brand / Rail";

const PRICE_ID = "ID / SKU";
const PRICE_VARIANT = "Variant / Format";
const PRICE_SUBCATEGORY = "Subcategory / Brand";
const PRICE_SUPPLIER = "Primary Supplier / Delivery Owner";
const PRICE_WHOLESALE = "Wholesale / Delivery Cost";
const PRICE_WHOLESALE_STATUS = "Wholesale Status";
const PRICE_SELL = "Recommended Sell Price";
const PRICE_ACCESS = "Access / Offer State";
const PRICE_BASIS = "Explanation / Commercial Basis";

const IMAGE_SKU = "SKU";
const IMAGE_VARIANT = "Variant";
const IMAGE_FILE_PATH = "File Path";
const IMAGE_STATUS = "Status";

const PEPTIDE_CODE = "Product Code";
const PEPTIDE_STRENGTH = "Strength";
const PEPTIDE_VARIANT_SKU = "Variant SKU";

/** Spreadsheet placeholders that are an absent identity, not an identity. */
const IDENTITY_PLACEHOLDERS = new Set(["-", "--", "n/a", "na", "tbd", "none"]);

// ---------------------------------------------------------------------------
// Access wording
// ---------------------------------------------------------------------------

/**
 * Every access value the V3 workbook uses, mapped to an intent. The table is
 * exhaustive against the file as delivered and is matched exactly rather than
 * by substring, so a new wording arrives as `unrecognized` (which the readiness
 * machine holds) instead of being read charitably into an active state.
 *
 * `planning` and `approval_required` do not short circuit. Both mean the row is
 * still a proposal, so it falls through to the evidence chain.
 */
const ACCESS_INTENTS: ReadonlyArray<readonly [string, V3AccessIntent]> = [
  ["planning", "planning"],
  [
    "planning price - verify current official msrp and partner terms before invoice",
    "planning",
  ],
  ["cost-based planning price from uploaded wholesale", "planning"],
  ["available as workflow", "planning"],
  ["approval required", "approval_required"],
  ["request access", "access_request_required"],
  ["request access / reseller authorization", "access_request_required"],
  ["research approval or request access", "access_request_required"],
  ["custom scope", "access_request_required"],
  ["custom scope / membership", "access_request_required"],
  ["custom contract", "access_request_required"],
  ["custom partner contract", "access_request_required"],
  ["custom engagement", "access_request_required"],
  ["operational quote", "access_request_required"],
  ["clinical and operational scope required", "access_request_required"],
  [
    "planning scope; exact integrations, privacy and workflow requirements determine final quote.",
    "access_request_required",
  ],
  ["care only", "care_only"],
  // The research rail cannot sell it and the care rail can reach it, so the
  // honest state is the care pathway. It is not purchasable either way.
  ["care only / research unavailable", "care_only"],
  ["clinical/provider pathway", "clinical_provider_pathway"],
  ["clinical/testing workflow", "clinical_provider_pathway"],
  ["provider/state dependent", "clinical_provider_pathway"],
  ["script ready", "clinical_provider_pathway"],
  ["research / product review", "under_review"],
  ["research review", "under_review"],
  ["care / clinical review", "under_review"],
  ["needs clinical review", "under_review"],
  ["needs medical/legal review", "under_review"],
  ["needs compliance review", "under_review"],
  ["held", "held"],
  ["research hold / care evaluation required", "held"],
  ["unavailable", "unavailable"],
  ["planned / not active direct product", "unavailable"],
];

const ACCESS_INTENT_BY_TEXT = new Map<string, V3AccessIntent>(ACCESS_INTENTS);

export function classifyV3AccessIntent(text: string | null): V3AccessIntent {
  if (text === null) return "unrecognized";
  const key = text.trim().toLowerCase().replace(/\s+/g, " ");
  return ACCESS_INTENT_BY_TEXT.get(key) ?? "unrecognized";
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

/**
 * The audience a category resolves to once every block clears. Care and the
 * provider network never resolve to a public surface, which is also what keeps
 * the confidential physician roster off a public page by construction.
 */
const AUDIENCE_BY_CATEGORY: Readonly<Record<V3Category, V3Audience>> = {
  "Peptides & Research": "qualified_research",
  "Quantum & Regenerative": "qualified_research",
  Supplements: "public",
  "Shipping & Fulfillment": "public",
  "Bloodwork & Testing": "clinical_provider",
  "Provider & Performance Network": "clinical_provider",
  "Care & Telemedicine": "care",
  "Membership & Programs": "member",
  "Programs & Services": "member",
  "AI & Tracking": "member",
  "Education & Video": "member",
  "White Label & Partners": "partner",
};

// ---------------------------------------------------------------------------
// Rejections
// ---------------------------------------------------------------------------

export const V3_REJECTION_REASONS = [
  "missing_offer_id",
  "missing_product_name",
  "unknown_category",
  "missing_variant_identity",
  "ambiguous_variant_identity",
  "variant_identity_conflict",
  "no_price_book_row",
  "duplicate_identity",
  "unparsable_amount",
] as const;

export type V3RejectionReason = (typeof V3_REJECTION_REASONS)[number];

export interface V3ImportRejection {
  readonly sheet: string;
  readonly rowNumber: number;
  readonly reason: V3RejectionReason;
  /** The offer id where one could be read, so an operator can find the row. */
  readonly offerId: string | null;
  readonly detail: string;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** One imported row with its resolved readiness and any dispute against it. */
export interface V3ImportedOffer {
  readonly record: V3SourceRecord;
  readonly readiness: V3ReadinessDecision;
  /** The contested presentation, when one exists. Never resolved here. */
  readonly strengthDispute: VariantStrengthDispute | null;
}

export interface V3ImportResult {
  /** Data rows read from the offer index, before any acceptance decision. */
  readonly sourceRowCount: number;
  readonly offers: readonly V3ImportedOffer[];
  readonly rejections: readonly V3ImportRejection[];
  /**
   * Price-book rows whose offer id appears in no offer-index row. They are not
   * imported, because the offer index is the canonical set of offers, and they
   * are counted here because an uncovered commercial row is a real gap.
   */
  readonly priceBookRowsWithoutOffer: number;
  /** Access values the table above does not recognize, deduplicated. */
  readonly unrecognizedAccessValues: readonly string[];
}

export interface V3ImportOptions {
  /**
   * Approved customer prices, if any exist. Defaults to approving nothing.
   * Import never populates this; the caller supplies the approved production
   * record, and that is the separation the whole contract depends on.
   */
  readonly approvedPrices?: V3ApprovedPriceLookup;
  /** Offer ids an operator has archived. Defaults to none. */
  readonly archivedOfferIds?: ReadonlySet<string>;
  /**
   * COA and lot evidence. Defaults to missing for every row, because the V3
   * workbook carries no COA column and no lot column. Missing evidence stays
   * missing; nothing here infers a certificate that was never delivered.
   */
  readonly documentation?: (record: {
    offerId: string;
    variantSku: string | null;
  }) => V3DocumentationRecord;
  /** Injected for tests. Defaults to the merged strength guard. */
  readonly strengthDispute?: (
    identity: StrengthDisputeVariantIdentity,
  ) => VariantStrengthDispute | null;
}

const MISSING_DOCUMENTATION: V3DocumentationRecord = Object.freeze({
  coaState: "missing" as V3EvidenceState,
  lotState: "missing" as V3EvidenceState,
});

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** Case and whitespace are not a different offer. Nothing else is collapsed. */
function identityKey(value: string | null): string {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function isPlaceholderIdentity(value: string): boolean {
  return IDENTITY_PLACEHOLDERS.has(value.trim().toLowerCase());
}

function recordIdFor(offerId: string, variantLabel: string | null): string {
  return `v3:${identityKey(offerId)}:${identityKey(variantLabel)}`;
}

// ---------------------------------------------------------------------------
// The import
// ---------------------------------------------------------------------------

export function importV3Master(
  workbook: V3RawWorkbook,
  options: V3ImportOptions = {},
): V3ImportResult {
  const approvedPrices = options.approvedPrices ?? noApprovedPrices;
  const archived = options.archivedOfferIds ?? new Set<string>();
  const documentationFor = options.documentation ?? (() => MISSING_DOCUMENTATION);
  const disputeFor = options.strengthDispute ?? findVariantStrengthDispute;

  const offerRows = readV3SheetRows(workbook.offerIndex);
  const priceRows = readV3SheetRows(workbook.priceBook);
  const imageRows = readV3SheetRows(workbook.imageManifest);
  const peptideRows =
    workbook.peptideMaster === undefined
      ? []
      : readV3SheetRows(workbook.peptideMaster);

  const priceByOffer = groupRows(priceRows, (row) => cellText(row, PRICE_ID));
  const imageByKey = indexImages(imageRows);
  const variantSkuByCode = indexPeptideVariantSkus(peptideRows);

  const rejections: V3ImportRejection[] = [];
  const offers: V3ImportedOffer[] = [];
  const seenIdentities = new Set<string>();
  const unrecognizedAccess = new Set<string>();

  for (const row of offerRows) {
    const rawOfferId = cellText(row, OFFER_ID);
    if (rawOfferId === null || isPlaceholderIdentity(rawOfferId)) {
      rejections.push(
        reject(row, "missing_offer_id", null, "the offer id cell is blank or a placeholder"),
      );
      continue;
    }
    const productName = cellText(row, OFFER_NAME);
    if (productName === null) {
      rejections.push(
        reject(row, "missing_product_name", rawOfferId, "the product cell is blank"),
      );
      continue;
    }
    const category = cellText(row, OFFER_CATEGORY);
    if (!isV3Category(category)) {
      rejections.push(
        reject(
          row,
          "unknown_category",
          rawOfferId,
          `category "${category ?? ""}" is not one of the workbook categories`,
        ),
      );
      continue;
    }

    const priceCandidates = priceByOffer.get(identityKey(rawOfferId)) ?? [];
    if (priceCandidates.length === 0) {
      rejections.push(
        reject(row, "no_price_book_row", rawOfferId, "no price book row carries this offer id"),
      );
      continue;
    }

    const variant = resolveVariant(row, priceCandidates);
    if (variant.ok === false) {
      rejections.push(reject(row, variant.reason, rawOfferId, variant.detail));
      continue;
    }

    const identity = recordIdFor(rawOfferId, variant.label);
    if (seenIdentities.has(identity)) {
      rejections.push(
        reject(
          row,
          "duplicate_identity",
          rawOfferId,
          `offer id and variant "${variant.label ?? "(unstated)"}" already appeared in this sheet`,
        ),
      );
      continue;
    }

    const cost = readCost(variant.priceRow);
    if (cost === "unparsable") {
      rejections.push(
        reject(row, "unparsable_amount", rawOfferId, "the wholesale cost cell is not an exact amount"),
      );
      continue;
    }
    const proposedAmountCents = cellAmountCents(variant.priceRow, PRICE_SELL);
    if (proposedAmountCents === "unparsable") {
      rejections.push(
        reject(row, "unparsable_amount", rawOfferId, "the planning sell cell is not an exact amount"),
      );
      continue;
    }

    const accessText =
      cellText(row, OFFER_ACCESS) ?? cellText(variant.priceRow, PRICE_ACCESS);
    const accessIntent = classifyV3AccessIntent(accessText);
    if (accessIntent === "unrecognized" && accessText !== null) {
      unrecognizedAccess.add(accessText);
    }

    const variantSku =
      variant.label === null
        ? null
        : variantSkuByCode.get(peptideKey(rawOfferId, variant.label)) ?? null;

    const record: V3SourceRecord = Object.freeze({
      recordId: identity,
      sourceSheet: V3_SHEET_OFFER_INDEX,
      sourceRowNumber: row.rowNumber,
      category,
      rail:
        cellText(row, OFFER_RAIL) ?? cellText(variant.priceRow, PRICE_SUBCATEGORY),
      offerId: rawOfferId,
      productName,
      variantLabel: variant.label,
      variantLabelOrigin: variant.origin,
      variantIdentity: variant.identity,
      variantSku,
      audience: AUDIENCE_BY_CATEGORY[category],
      accessIntent,
      accessStatusText: accessText,
      cost,
      planningPrice: Object.freeze({
        // A positive amount only. The workbook carries one zero, and a zero is
        // an absent proposal rather than a free offer.
        proposedAmountCents:
          proposedAmountCents !== null && proposedAmountCents > 0
            ? proposedAmountCents
            : null,
        basisText: cellText(variant.priceRow, PRICE_BASIS),
      }),
      documentation: documentationFor({ offerId: rawOfferId, variantSku }),
      imageState: readImageState(imageByKey, rawOfferId, variant.label),
      strengthDisputed: false,
      effectiveDate: null,
    });

    const dispute = disputeFor({
      sku: variantSku ?? "",
      catalogNumber: null,
      strength: variant.label ?? "",
    });

    const withDispute: V3SourceRecord = Object.freeze({
      ...record,
      strengthDisputed: dispute !== null,
    });

    const approved = approvedPrices(withDispute);
    const readiness = resolveV3Readiness({
      archived: archived.has(identityKey(rawOfferId)),
      accessIntent: withDispute.accessIntent,
      strengthDisputed: withDispute.strengthDisputed,
      variantIdentity: withDispute.variantIdentity,
      costState: withDispute.cost.state,
      hasApprovedPrice: approved !== null,
      documentation: withDispute.documentation,
      imageState: withDispute.imageState,
      audience: withDispute.audience,
    });

    seenIdentities.add(identity);
    offers.push(Object.freeze({ record: withDispute, readiness, strengthDispute: dispute }));
  }

  const offerIds = new Set(
    offerRows
      .map((row) => cellText(row, OFFER_ID))
      .filter((value): value is string => value !== null)
      .map(identityKey),
  );
  let priceBookRowsWithoutOffer = 0;
  for (const row of priceRows) {
    const id = cellText(row, PRICE_ID);
    if (id === null || !offerIds.has(identityKey(id))) priceBookRowsWithoutOffer += 1;
  }

  return Object.freeze({
    sourceRowCount: offerRows.length,
    offers: Object.freeze(offers),
    rejections: Object.freeze(rejections),
    priceBookRowsWithoutOffer,
    unrecognizedAccessValues: Object.freeze(Array.from(unrecognizedAccess).sort()),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reject(
  row: V3SheetRow,
  reason: V3RejectionReason,
  offerId: string | null,
  detail: string,
): V3ImportRejection {
  return Object.freeze({
    sheet: row.sheet,
    rowNumber: row.rowNumber,
    reason,
    offerId,
    detail,
  });
}

function groupRows(
  rows: readonly V3SheetRow[],
  keyOf: (row: V3SheetRow) => string | null,
): Map<string, V3SheetRow[]> {
  const grouped = new Map<string, V3SheetRow[]>();
  for (const row of rows) {
    const raw = keyOf(row);
    if (raw === null || isPlaceholderIdentity(raw)) continue;
    const key = identityKey(raw);
    const bucket = grouped.get(key);
    if (bucket === undefined) grouped.set(key, [row]);
    else bucket.push(row);
  }
  return grouped;
}

type VariantResolution =
  | {
      ok: true;
      label: string | null;
      origin: V3VariantLabelOrigin;
      identity: V3VariantIdentity;
      priceRow: V3SheetRow;
    }
  | {
      ok: false;
      reason: V3RejectionReason;
      detail: string;
    };

/**
 * Establish the exact variant, or record honestly that there is none.
 *
 * The offer index is the authority when it states a variant. When it does not,
 * the price book may supply one only if it offers exactly one candidate: a
 * choice between two presentations is an identity question a human answers, and
 * attaching a cost to the wrong presentation is precisely the failure the
 * strength guard exists to prevent, arriving one join earlier.
 *
 * When neither sheet states a presentation, the row is kept as a product with
 * an `unstated` identity rather than dropped or filled in. It can never reach a
 * purchasable state, and the gap is counted in the dry run instead of vanishing
 * from it.
 */
function resolveVariant(
  offerRow: V3SheetRow,
  priceCandidates: readonly V3SheetRow[],
): VariantResolution {
  const stated = cellText(offerRow, OFFER_VARIANT);
  if (stated !== null && !isPlaceholderIdentity(stated)) {
    const key = identityKey(stated);
    const matches = priceCandidates.filter(
      (row) => identityKey(cellText(row, PRICE_VARIANT)) === key,
    );
    if (matches.length === 1) {
      return {
        ok: true,
        label: stated,
        origin: "offer_index",
        identity: "exact",
        priceRow: matches[0],
      };
    }
    if (matches.length === 0) {
      // One commercial row and a different label on it. The cost attaches
      // unambiguously, so the row is kept with its identity marked contested.
      // Two or more rows and no match is a real ambiguity and is refused.
      if (priceCandidates.length === 1) {
        return {
          ok: true,
          label: stated,
          origin: "offer_index",
          identity: "contested",
          priceRow: priceCandidates[0],
        };
      }
      return {
        ok: false,
        reason: "variant_identity_conflict",
        detail: `the offer index states variant "${stated}" and none of the ${priceCandidates.length} price book rows for this offer id carries it`,
      };
    }
    return {
      ok: false,
      reason: "ambiguous_variant_identity",
      detail: `${matches.length} price book rows carry variant "${stated}" for this offer id`,
    };
  }

  if (priceCandidates.length > 1) {
    return {
      ok: false,
      reason: "ambiguous_variant_identity",
      detail: `the offer index states no variant and the price book offers ${priceCandidates.length} candidates`,
    };
  }
  const supplied = cellText(priceCandidates[0], PRICE_VARIANT);
  if (supplied === null || isPlaceholderIdentity(supplied)) {
    return {
      ok: true,
      label: null,
      origin: "unstated",
      identity: "unstated",
      priceRow: priceCandidates[0],
    };
  }
  return {
    ok: true,
    label: supplied,
    origin: "price_book",
    identity: "exact",
    priceRow: priceCandidates[0],
  };
}

function readCost(priceRow: V3SheetRow): V3AdminCostRecord | "unparsable" {
  const statusText = cellText(priceRow, PRICE_WHOLESALE_STATUS) ?? "Pending";
  const amount = cellAmountCents(priceRow, PRICE_WHOLESALE);
  if (amount === "unparsable") return "unparsable";
  // "Known" is the workbook's own prefix for a sourced cost. A cost with no
  // amount is pending whatever the status column claims, because a status
  // cannot stand in for a number.
  const known = statusText.trim().toLowerCase().startsWith("known") && amount !== null && amount > 0;
  return Object.freeze({
    state: known ? "known" : "pending",
    wholesaleAmountCents: known ? amount : null,
    statusText,
    supplierName: cellText(priceRow, PRICE_SUPPLIER),
  });
}

function indexImages(rows: readonly V3SheetRow[]): Map<string, V3SheetRow> {
  const index = new Map<string, V3SheetRow>();
  for (const row of rows) {
    const sku = cellText(row, IMAGE_SKU);
    if (sku === null || isPlaceholderIdentity(sku)) continue;
    const key = `${identityKey(sku)}::${identityKey(cellText(row, IMAGE_VARIANT))}`;
    if (!index.has(key)) index.set(key, row);
  }
  return index;
}

/**
 * Whether a rights-cleared, variant-matched image exists.
 *
 * Approved requires both a file path and an explicitly approved status. A
 * manifest row that only says an image is needed is pending, and an offer with
 * no manifest row at all is pending too. No image is ever assumed to exist, and
 * no competitor asset can satisfy this: the manifest is the only source.
 */
function readImageState(
  index: ReadonlyMap<string, V3SheetRow>,
  offerId: string,
  variantLabel: string | null,
): V3ImageState {
  const row = index.get(`${identityKey(offerId)}::${identityKey(variantLabel)}`);
  if (row === undefined) return "pending";
  const filePath = cellText(row, IMAGE_FILE_PATH);
  const status = (cellText(row, IMAGE_STATUS) ?? "").trim().toLowerCase();
  return filePath !== null && status === "approved" ? "approved" : "pending";
}

function peptideKey(offerId: string, variantLabel: string | null): string {
  return `${identityKey(offerId)}::${identityKey(variantLabel)}`;
}

/**
 * Exact variant SKUs from the peptide master, keyed by product code and
 * strength. A code and strength pair that the sheet lists more than once, or
 * that carries no SKU, yields no SKU: an ambiguous or absent identity is left
 * absent rather than picked from.
 */
function indexPeptideVariantSkus(
  rows: readonly V3SheetRow[],
): Map<string, string> {
  const counts = new Map<string, number>();
  const skus = new Map<string, string>();
  for (const row of rows) {
    const code = cellText(row, PEPTIDE_CODE);
    const strength = cellText(row, PEPTIDE_STRENGTH);
    const sku = cellText(row, PEPTIDE_VARIANT_SKU);
    if (code === null || strength === null || sku === null) continue;
    const key = peptideKey(code, strength);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    skus.set(key, sku);
  }
  // Array.from rather than iterating the Map directly: this repository's
  // tsconfig sets no target, so for-of over a Map fails the typecheck.
  for (const [key, count] of Array.from(counts.entries())) {
    if (count > 1) skus.delete(key);
  }
  return skus;
}
