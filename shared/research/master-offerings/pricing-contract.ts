/**
 * Buyer-facing price vocabulary for the full master offerings catalog.
 *
 * Display authority is not commerce authority, and price display is not price
 * authority. Every value in this file originates from one place only: an
 * approved, active, in-window Product Control price row resolved through the
 * existing authoritative price resolver. There is no planning price, no
 * workbook price, no recommended launch price, and no fallback amount here.
 *
 * The two states are exhaustive on purpose. A variant either has exactly one
 * approved price the buyer may see, or it has none and the catalog says so in
 * words. There is no third shape, so a missing price can never render as zero,
 * as an empty string, or as an invented number.
 */

import type { SupportedPriceCurrency } from "../pricing";

/** Shown wherever no approved price exists. Never a number, never blank. */
export const MASTER_OFFERING_PRICE_ON_REQUEST_LABEL = "Price on request";

/**
 * One variant's buyer price view. The `priced` shape carries only the
 * customer-safe identity of the approved price row, so a downstream surface
 * can pin what the buyer saw without ever seeing cost, margin, approval note,
 * or approver identity.
 */
export type MasterOfferingPriceView =
  | {
      state: "priced";
      amountCents: number;
      currency: SupportedPriceCurrency;
      display: string;
      /**
       * What the amount covers. Today every approved general price covers the
       * exact listed unit (the variant's own specification), which the master
       * workbook truthfulness audit confirmed for all 417 priced rows. A
       * future pack or tier basis is a deliberate union extension, never a
       * silent reinterpretation of this literal.
       */
      basis: "exact_listed_unit";
      priceId: string;
      priceVersion: number;
      effectiveAt: string;
      expiresAt: string | null;
    }
  | { state: "on_request" };

/** The buyer-facing sentence for the exact-listed-unit basis. */
export const MASTER_OFFERING_PRICE_BASIS_LABEL =
  "Price covers the exact listed unit.";

/** The card-level roll-up across a product's variants. */
export interface MasterOfferingPriceSummary {
  /**
   * `none` when no variant has an approved price, `single` when every priced
   * variant agrees on one amount, `range` when they span a low and a high, and
   * `mixed` when priced variants disagree on currency so no one range is
   * truthful. `mixed` still shows each variant's own price on the card.
   */
  state: "none" | "single" | "range" | "mixed";
  variantCount: number;
  pricedVariantCount: number;
  currency: SupportedPriceCurrency | null;
  fromCents: number | null;
  toCents: number | null;
  /** Always renderable text, including the on-request wording. */
  display: string;
}

/** Shown when priced variants disagree on currency. */
export const MASTER_OFFERING_PRICE_MIXED_LABEL = "See variant prices";

export const MASTER_OFFERING_PRICE_ON_REQUEST: MasterOfferingPriceView = {
  state: "on_request",
};

/**
 * Format positive integer cents for display. Returns null for anything that is
 * not a positive safe integer, so a bad amount becomes "Price on request"
 * rather than a zero, a NaN, or a rounded guess.
 */
export function formatPriceCents(
  amountCents: number,
  currency: SupportedPriceCurrency,
): string | null {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return null;
  const major = Math.trunc(amountCents / 100);
  const minor = String(amountCents % 100).padStart(2, "0");
  const grouped = String(major).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return currency === "USD"
    ? `$${grouped}.${minor}`
    : `${currency} ${grouped}.${minor}`;
}

/** True only for a price view a surface may render as a number. */
export function isDisplayablePrice(
  view: MasterOfferingPriceView,
): view is Extract<MasterOfferingPriceView, { state: "priced" }> {
  return (
    view.state === "priced" &&
    Number.isSafeInteger(view.amountCents) &&
    view.amountCents > 0 &&
    view.display.trim().length > 0
  );
}

/** The export formats the prepared price-list handler accepts. */
export const MASTER_OFFERING_PRICE_LIST_FORMATS = ["csv", "json"] as const;

export type MasterOfferingPriceListFormat =
  (typeof MASTER_OFFERING_PRICE_LIST_FORMATS)[number];

export function isMasterOfferingPriceListFormat(
  value: unknown,
): value is MasterOfferingPriceListFormat {
  return (
    typeof value === "string" &&
    (MASTER_OFFERING_PRICE_LIST_FORMATS as readonly string[]).includes(value)
  );
}

/**
 * One exported price-list row: exactly one offering variant.
 *
 * The field list is the whole privacy contract for the download. It carries no
 * supplier, owner, wholesale cost, planning price, margin, markup, source SKU,
 * source row, canonical key, Product Control identifier, or binding. A test
 * pins this by scanning every emitted key and value.
 */
export interface MasterOfferingPriceListRow {
  offeringId: string;
  offeringSlug: string;
  offeringName: string;
  family: string;
  familyLabel: string;
  category: string;
  subcategory: string;
  brand: string;
  variantId: string;
  /** The strength, size, or format the buyer selects. */
  variant: string;
  availability: string;
  priceState: MasterOfferingPriceView["state"];
  /** Empty string when the price is on request. Never "0". */
  priceAmountCents: string;
  priceCurrency: string;
  price: string;
  /** The basis sentence when priced, empty when on request. */
  priceBasis: string;
  /** How this exact variant may be bought today, in plain words. */
  purchasePath: string;
}

export interface MasterOfferingPriceListDocument {
  ok: true;
  generatedAt: string;
  audience: "member" | "admin";
  rowCount: number;
  pricedRowCount: number;
  /** Restates the authority boundary inside the downloaded artifact itself. */
  notice: string;
  rows: readonly MasterOfferingPriceListRow[];
}

export const MASTER_OFFERING_PRICE_LIST_NOTICE =
  "Prices are approved Product Control prices at the time of export and may change. Catalog visibility does not establish availability, clinical suitability, or purchase eligibility. Product Control remains the purchase authority.";

/** Column order for the CSV rendering. Kept beside the row type on purpose. */
export const MASTER_OFFERING_PRICE_LIST_COLUMNS: ReadonlyArray<{
  key: keyof MasterOfferingPriceListRow;
  header: string;
}> = [
  { key: "offeringName", header: "Product" },
  { key: "variant", header: "Variant" },
  { key: "family", header: "Family" },
  { key: "familyLabel", header: "Family label" },
  { key: "category", header: "Category" },
  { key: "subcategory", header: "Subcategory" },
  { key: "brand", header: "Brand" },
  { key: "availability", header: "Availability" },
  { key: "price", header: "Price" },
  { key: "priceState", header: "Price state" },
  { key: "priceAmountCents", header: "Price amount cents" },
  { key: "priceCurrency", header: "Currency" },
  { key: "priceBasis", header: "Price basis" },
  { key: "purchasePath", header: "How to buy" },
  { key: "offeringSlug", header: "Catalog slug" },
  { key: "offeringId", header: "Offering id" },
  { key: "variantId", header: "Variant id" },
];
