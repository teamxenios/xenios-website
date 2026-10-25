/**
 * xenios research: the white-label PRODUCT and ASSET contract.
 *
 * This module is the vocabulary shared by the three white-label product concerns:
 * which variants may be activated at all (eligibility), what a partner may be told
 * a unit costs them (the wholesale quote authority), and what a partner brand
 * overlay is permitted to change on a Renew 360 asset.
 *
 * It deliberately holds no catalog data and no store. It imports only the pricing
 * core's currency allowlist, so a white-label amount and a member amount can never
 * disagree about what a supported currency is.
 *
 * THREE RULES ARE STRUCTURAL HERE, NOT CONVENTIONS.
 *
 * 1. WHITE-LABEL WHOLESALE IS A SEPARATE AUTHORITY FROM MEMBER PRICING. A member
 *    price is resolved by shared/research/pricing.ts. A partner wholesale amount is
 *    resolved from a QUOTE that a named human recorded for one exact partner and one
 *    exact SKU. Neither authority may read the other, and neither derives from the
 *    other. There is no multiplier in this file and no function that turns a cost
 *    into a partner amount.
 *
 * 2. A PARTNER PAYLOAD CARRIES NO INTERNAL COMMERCIAL FACT. Supplier cost, the
 *    pricing multiplier, margin, and the supplier's identity are operator-only in
 *    this repository (see the field-audience note in
 *    shared/research/catalog/peptide-catalog.ts). The partner-facing shapes below
 *    have no field they could travel in, and PARTNER_FORBIDDEN_PAYLOAD_SUBSTRINGS
 *    is the list a serialization test asserts against, in the pattern PR #204
 *    established for the partner portal.
 *
 * 3. THE TWO PARTNER LEDGERS NEVER MERGE. AFFILIATE_COMMISSION and
 *    WHITE_LABEL_WHOLESALE are distinct, and every white-label payload tags itself,
 *    so a wholesale row appearing in a commission list is a test failure rather than
 *    a judgement call. Nothing here computes or executes a payout.
 */

import {
  normalizePriceCurrency,
  type SupportedPriceCurrency,
} from "../pricing";

// ---------------------------------------------------------------------------
// Ledger identity
// ---------------------------------------------------------------------------

/**
 * The two partner-facing ledgers, tagged identically to
 * server/research/partners/portal.ts PARTNER_LEDGERS. The duplication is
 * deliberate: this module stays free of server imports, and a test pins the two
 * constants equal so they cannot drift apart silently.
 */
export const WHITE_LABEL_LEDGERS = {
  affiliateCommission: "AFFILIATE_COMMISSION",
  whiteLabelWholesale: "WHITE_LABEL_WHOLESALE",
} as const;

export type WhiteLabelLedger =
  (typeof WHITE_LABEL_LEDGERS)[keyof typeof WHITE_LABEL_LEDGERS];

/** Anything carrying a ledger tag. Both partner ledgers use the same field name. */
export interface LedgerTagged {
  ledger: WhiteLabelLedger;
}

/**
 * Split a mixed list into the two ledgers. It is a split, never a sum: there is no
 * total here, no payable amount, and no payout. A caller that wants a number has to
 * write one itself, somewhere a reviewer will see it.
 */
export function partitionByLedger<T extends LedgerTagged>(
  entries: readonly T[],
): { affiliateCommission: T[]; whiteLabelWholesale: T[] } {
  const affiliateCommission: T[] = [];
  const whiteLabelWholesale: T[] = [];
  for (const entry of entries) {
    if (entry.ledger === WHITE_LABEL_LEDGERS.whiteLabelWholesale) {
      whiteLabelWholesale.push(entry);
    } else {
      affiliateCommission.push(entry);
    }
  }
  return { affiliateCommission, whiteLabelWholesale };
}

// ---------------------------------------------------------------------------
// Eligibility vocabulary
// ---------------------------------------------------------------------------

/**
 * What a variant may do in the white-label programme.
 *
 * CLINICAL_PROVIDER_ONLY is a ROUTING, not a softer refusal. A GLP-class compound
 * is never a white-label product at any price, and the routing names where it goes
 * instead so no surface has to invent an answer.
 */
export const WHITE_LABEL_ROUTINGS = [
  "ELIGIBLE",
  "NOT_ELIGIBLE",
  "CLINICAL_PROVIDER_ONLY",
] as const;

export type WhiteLabelRouting = (typeof WHITE_LABEL_ROUTINGS)[number];

/**
 * The closed set of reasons a variant is not eligible. Every reason is a fact this
 * repository can check; none of them is a judgement, and none can be waived by a
 * flag. A variant carries EVERY reason that applies, not just the first, so an
 * operator sees the whole distance to activation in one read.
 */
export const WHITE_LABEL_INELIGIBILITY_REASONS = [
  "canonical_identity_missing",
  "variant_not_in_catalog",
  "supplier_of_record_unknown",
  "no_price_basis",
  "quality_status_not_visible",
  "purchase_mode_excludes_partner_use",
  "variant_strength_disputed",
  "glp_class_clinical_provider_only",
] as const;

export type WhiteLabelIneligibilityReason =
  (typeof WHITE_LABEL_INELIGIBILITY_REASONS)[number];

/** Plain-English sentence per reason. Safe for a partner or an operator to read. */
export const WHITE_LABEL_INELIGIBILITY_SENTENCES: Record<
  WhiteLabelIneligibilityReason,
  string
> = {
  canonical_identity_missing:
    "This product has no complete canonical identity on record, so there is nothing exact to activate.",
  variant_not_in_catalog:
    "No variant with this SKU exists in the canonical catalog.",
  supplier_of_record_unknown:
    "No named supplier of record is available to this system for this exact variant.",
  no_price_basis:
    "No wholesale cost basis and no exact partner quote exist for this variant.",
  quality_status_not_visible:
    "The quality status of this variant is not visible to this system.",
  purchase_mode_excludes_partner_use:
    "The purchase mode on this variant does not permit partner use.",
  variant_strength_disputed:
    "The strength printed on this variant is contested and unresolved, so it cannot be labelled or sold under a partner brand.",
  glp_class_clinical_provider_only:
    "This is a GLP-class compound. It is not a white-label product and routes to a clinical provider.",
};

// ---------------------------------------------------------------------------
// The partner wholesale quote
// ---------------------------------------------------------------------------

/**
 * One exact quoted wholesale amount, for one partner and one SKU.
 *
 * A quote is a settlement between two named parties, so it records what was quoted,
 * in what currency, from when, until when, at which version, and who recorded it.
 * Nothing here is derived: there is no cost field, no multiplier, and no rule that
 * could produce this amount from anything else in the repository.
 */
export interface PartnerWholesaleQuote {
  quoteId: string;
  partnerId: string;
  sku: string;
  /** The exact quoted amount, integer cents. Always positive. Never zero. */
  amountCents: number;
  currency: SupportedPriceCurrency;
  /** ISO-8601 instant the quote takes effect. */
  effectiveDate: string;
  /** ISO-8601 instant the quote expires. Required: a quote without an end is a standing price. */
  expiresAt: string;
  /** Monotonic per partner and SKU. The highest effective version wins. */
  quoteVersion: number;
  /** The named human who recorded it. Never "the system". */
  recordedByAdminId: string;
  recordedAt: string;
}

/** Why no quoted amount could be resolved. Closed, and every member is fail-closed. */
export const PARTNER_QUOTE_UNAVAILABLE_REASONS = [
  "no_quote_on_record",
  "quote_not_yet_effective",
  "quote_expired",
  "quote_ambiguous",
  "currency_not_supported",
  "quote_amount_invalid",
] as const;

export type PartnerQuoteUnavailableReason =
  (typeof PARTNER_QUOTE_UNAVAILABLE_REASONS)[number];

export const PARTNER_QUOTE_UNAVAILABLE_SENTENCES: Record<
  PartnerQuoteUnavailableReason,
  string
> = {
  no_quote_on_record: "No wholesale quote is on record for this variant.",
  quote_not_yet_effective:
    "The wholesale quote on record for this variant has not taken effect yet.",
  quote_expired: "The wholesale quote on record for this variant has expired.",
  quote_ambiguous:
    "More than one wholesale quote claims the same version for this variant, so none is authoritative.",
  currency_not_supported:
    "No wholesale quote is on record for this variant in the requested currency.",
  quote_amount_invalid:
    "The wholesale quote on record for this variant does not carry a usable amount.",
};

/**
 * The partner-facing wholesale price. Two states only.
 *
 * QUOTE_REQUIRED is the DEFAULT for an unpriced request. It is never a guessed
 * number and never a zero: there is no amount field on that branch at all, so a
 * surface rendering it cannot print $0 by reading an amount that happens to be
 * absent.
 */
export type PartnerWholesalePrice =
  | {
      state: "QUOTED";
      sku: string;
      amountCents: number;
      currency: SupportedPriceCurrency;
      effectiveDate: string;
      expiresAt: string;
      quoteVersion: number;
      ledger: typeof WHITE_LABEL_LEDGERS.whiteLabelWholesale;
    }
  | {
      state: "QUOTE_REQUIRED";
      sku: string;
      reason: PartnerQuoteUnavailableReason;
      message: string;
      ledger: typeof WHITE_LABEL_LEDGERS.whiteLabelWholesale;
    };

/** A positive, whole, safe number of cents. Zero and negatives are never amounts. */
export function isUsableAmountCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** A parseable ISO-8601 instant. Returns null rather than guessing a date. */
export function toInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Re-exported so a white-label caller uses the same currency allowlist as pricing. */
export { normalizePriceCurrency };
export type { SupportedPriceCurrency };

// ---------------------------------------------------------------------------
// The partner payload boundary
// ---------------------------------------------------------------------------

/**
 * Substrings that may never appear in a serialized partner-facing white-label
 * payload, in either a key or a value. The first group is commercial (supplier
 * cost, multiplier, margin), the second is supplier identity, the third is the
 * internal administrative fields the partner portal already refuses to emit.
 *
 * Compared case-insensitively against JSON.stringify of the payload, exactly as
 * server/research/partners/portal.test.ts does.
 *
 * The bare token "wholesale" is deliberately NOT on this list, and that is not a
 * weakened check. The partner portal forbids it because a commission payload has no
 * business mentioning wholesale at all. A white-label payload is the opposite case:
 * the quoted WHOLESALE AMOUNT is precisely the thing the partner is entitled to see,
 * and the ledger it belongs to is literally named WHITE_LABEL_WHOLESALE. So the
 * tokens that matter here are the ones that would carry OUR cost basis rather than
 * THEIR quoted price, and every one of them is listed above.
 */
export const PARTNER_FORBIDDEN_PAYLOAD_SUBSTRINGS: readonly string[] = [
  "suppliercost",
  "supplier_cost",
  "wholesalesourcecost",
  "wholesale_source_cost",
  "costcents",
  "cost_cents",
  "multiplier",
  "margin",
  "markup",
  "landedcost",
  "landed_cost",
  "suppliername",
  "supplier_name",
  "supplierid",
  "supplier_id",
  "supplierlegalname",
  "supplier_legal_name",
  "marketreferenceprice",
  "market_reference_price",
  "internalnote",
  "internal_notes",
  "legalname",
  "legal_name",
  "contactemail",
  "contact_email",
  "subjectkey",
  "subject_key",
] as const;
