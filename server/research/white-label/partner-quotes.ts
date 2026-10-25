/**
 * xenios research: the PARTNER WHOLESALE QUOTE authority. Server only.
 *
 * White-label wholesale is a SEPARATE AUTHORITY from member pricing. A member price
 * is resolved by the pricing core from an approved price row. A partner wholesale
 * amount is resolved here, and only from a quote a named human recorded for one
 * exact partner and one exact SKU.
 *
 * THE SEPARATION IS STRUCTURAL, NOT A PROMISE.
 *
 *   This module imports no catalog, no cost, and no multiplier. There is no code
 *   path here that could turn a wholesale source cost into a partner amount, because
 *   the cost is not reachable from this file. The only number that can come out is a
 *   number a human put in.
 *
 * UNPRICED DEFAULTS TO QUOTE_REQUIRED.
 *
 *   Not to zero, and not to a guess. The QUOTE_REQUIRED branch of
 *   PartnerWholesalePrice has no amount field at all, so a surface rendering it
 *   cannot read an absent amount as $0. Every refusal names its reason from a closed
 *   vocabulary and carries a sentence a partner can read.
 *
 * VERSIONING AND EXPIRY.
 *
 *   A quote records effectiveDate, expiresAt, and quoteVersion. Resolution takes the
 *   HIGHEST version that is in effect at the instant asked. Two records claiming the
 *   same version for the same partner and SKU are ambiguous, and an ambiguous quote
 *   resolves to QUOTE_REQUIRED rather than to whichever the array happened to hold
 *   first. A superseded or expired quote is retained: the ledger of what was quoted
 *   when is the point of recording a version at all.
 *
 * NO PAYOUT. Nothing here computes a payable amount, builds a batch, or moves money.
 */

import {
  PARTNER_QUOTE_UNAVAILABLE_SENTENCES,
  WHITE_LABEL_LEDGERS,
  isUsableAmountCents,
  normalizePriceCurrency,
  toInstant,
  type PartnerQuoteUnavailableReason,
  type PartnerWholesalePrice,
  type PartnerWholesaleQuote,
  type SupportedPriceCurrency,
} from "@shared/research/white-label/contracts";

// ---------------------------------------------------------------------------
// Recording a quote
// ---------------------------------------------------------------------------

export interface RecordPartnerQuoteInput {
  quoteId: string;
  partnerId: string;
  sku: string;
  amountCents: number;
  currency: string;
  effectiveDate: string;
  expiresAt: string;
  quoteVersion: number;
  recordedByAdminId: string;
  recordedAt: string;
}

/** Why a submitted quote was refused. Closed, and every member is fail-closed. */
export const PARTNER_QUOTE_REJECTIONS = [
  "quote_id_missing",
  "partner_missing",
  "sku_missing",
  "amount_not_usable",
  "currency_not_supported",
  "effective_date_unparseable",
  "expiry_unparseable",
  "expiry_not_after_effective_date",
  "version_not_positive",
  "recorder_not_named",
  "recorded_at_unparseable",
] as const;

export type PartnerQuoteRejection = (typeof PARTNER_QUOTE_REJECTIONS)[number];

export type RecordPartnerQuoteResult =
  | { ok: true; quote: PartnerWholesaleQuote }
  | { ok: false; rejections: readonly PartnerQuoteRejection[] };

/**
 * Validate and freeze one quote. Every rejection that applies is returned, so an
 * operator fixes the whole record once rather than one field per round trip.
 *
 * The amount is checked as a positive whole number of cents. Zero is rejected here,
 * which is the earliest possible point: a zero that never enters the store can never
 * be rendered as a price.
 */
export function recordPartnerWholesaleQuote(
  input: RecordPartnerQuoteInput,
): RecordPartnerQuoteResult {
  const rejections: PartnerQuoteRejection[] = [];

  if (input.quoteId.trim().length === 0) rejections.push("quote_id_missing");
  if (input.partnerId.trim().length === 0) rejections.push("partner_missing");
  if (input.sku.trim().length === 0) rejections.push("sku_missing");
  if (!isUsableAmountCents(input.amountCents)) rejections.push("amount_not_usable");

  const currency = normalizePriceCurrency(input.currency);
  if (currency === null) rejections.push("currency_not_supported");

  const effective = toInstant(input.effectiveDate);
  if (effective === null) rejections.push("effective_date_unparseable");
  const expires = toInstant(input.expiresAt);
  if (expires === null) rejections.push("expiry_unparseable");
  if (effective !== null && expires !== null && expires <= effective) {
    rejections.push("expiry_not_after_effective_date");
  }

  if (!Number.isSafeInteger(input.quoteVersion) || input.quoteVersion <= 0) {
    rejections.push("version_not_positive");
  }
  if (input.recordedByAdminId.trim().length === 0) rejections.push("recorder_not_named");
  if (toInstant(input.recordedAt) === null) rejections.push("recorded_at_unparseable");

  if (rejections.length > 0 || currency === null) {
    return { ok: false, rejections: Object.freeze(rejections) };
  }

  return {
    ok: true,
    quote: Object.freeze({
      quoteId: input.quoteId.trim(),
      partnerId: input.partnerId.trim(),
      sku: input.sku.trim(),
      amountCents: input.amountCents,
      currency,
      effectiveDate: input.effectiveDate,
      expiresAt: input.expiresAt,
      quoteVersion: input.quoteVersion,
      recordedByAdminId: input.recordedByAdminId.trim(),
      recordedAt: input.recordedAt,
    }),
  };
}

// ---------------------------------------------------------------------------
// Resolving a quote
// ---------------------------------------------------------------------------

export interface ResolvePartnerQuoteInput {
  partnerId: string;
  sku: string;
  /** ISO-8601 instant the question is asked at. */
  at: string;
  currency: string;
}

function unavailable(
  sku: string,
  reason: PartnerQuoteUnavailableReason,
): PartnerWholesalePrice {
  return Object.freeze({
    state: "QUOTE_REQUIRED" as const,
    sku,
    reason,
    message: PARTNER_QUOTE_UNAVAILABLE_SENTENCES[reason],
    ledger: WHITE_LABEL_LEDGERS.whiteLabelWholesale,
  });
}

function sameKey(quote: PartnerWholesaleQuote, partnerId: string, sku: string): boolean {
  return (
    quote.partnerId.trim() === partnerId.trim() &&
    quote.sku.trim().toUpperCase() === sku.trim().toUpperCase()
  );
}

/**
 * The partner-facing wholesale price for one partner and one SKU at one instant.
 *
 * The walk down is fail-closed at every step, and each step reports a DIFFERENT
 * reason, so "we never quoted you" is never confused with "your quote ran out".
 */
export function resolvePartnerWholesalePrice(
  quotes: readonly PartnerWholesaleQuote[],
  input: ResolvePartnerQuoteInput,
): PartnerWholesalePrice {
  const sku = input.sku.trim();
  const currency = normalizePriceCurrency(input.currency);
  const asked = toInstant(input.at);
  if (asked === null) return unavailable(sku, "no_quote_on_record");

  const forVariant = quotes.filter((quote) => sameKey(quote, input.partnerId, sku));
  if (forVariant.length === 0) return unavailable(sku, "no_quote_on_record");
  if (currency === null) return unavailable(sku, "currency_not_supported");

  const inCurrency = forVariant.filter((quote) => quote.currency === currency);
  if (inCurrency.length === 0) return unavailable(sku, "currency_not_supported");

  const dated = inCurrency.filter(
    (quote) => toInstant(quote.effectiveDate) !== null && toInstant(quote.expiresAt) !== null,
  );
  if (dated.length === 0) return unavailable(sku, "no_quote_on_record");

  const inEffect = dated.filter((quote) => {
    const from = toInstant(quote.effectiveDate) as number;
    const until = toInstant(quote.expiresAt) as number;
    return from <= asked && asked < until;
  });

  if (inEffect.length === 0) {
    // Distinguish "not yet" from "no longer". If both exist, the honest answer is
    // that today is not covered, and the expired one is the closer of the two.
    const anyFuture = dated.some(
      (quote) => (toInstant(quote.effectiveDate) as number) > asked,
    );
    const anyExpired = dated.some(
      (quote) => (toInstant(quote.expiresAt) as number) <= asked,
    );
    if (anyExpired) return unavailable(sku, "quote_expired");
    if (anyFuture) return unavailable(sku, "quote_not_yet_effective");
    return unavailable(sku, "no_quote_on_record");
  }

  const highestVersion = inEffect.reduce(
    (best, quote) => Math.max(best, quote.quoteVersion),
    Number.NEGATIVE_INFINITY,
  );
  const winners = inEffect.filter((quote) => quote.quoteVersion === highestVersion);
  if (winners.length !== 1) return unavailable(sku, "quote_ambiguous");

  const winner = winners[0];
  if (!isUsableAmountCents(winner.amountCents)) {
    return unavailable(sku, "quote_amount_invalid");
  }

  // Explicit field picks, never a spread. A field added to the quote record later
  // cannot reach a partner by default.
  return Object.freeze({
    state: "QUOTED" as const,
    sku: winner.sku,
    amountCents: winner.amountCents,
    currency: winner.currency as SupportedPriceCurrency,
    effectiveDate: winner.effectiveDate,
    expiresAt: winner.expiresAt,
    quoteVersion: winner.quoteVersion,
    ledger: WHITE_LABEL_LEDGERS.whiteLabelWholesale,
  });
}

/** Whether an exact quote exists for a SKU, for the eligibility price-basis test. */
export function partnerQuoteExistsForSku(
  quotes: readonly PartnerWholesaleQuote[],
  partnerId: string,
  sku: string,
): boolean {
  return quotes.some((quote) => sameKey(quote, partnerId, sku));
}
