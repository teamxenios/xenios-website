/**
 * Pure projection of approved variant prices into the buyer-facing card and
 * detail shapes. No input, no output, and no branch in this file can create an
 * amount: it only summarizes prices the authority already resolved.
 */

import {
  isDisplayablePrice,
  formatPriceCents,
  MASTER_OFFERING_PRICE_MIXED_LABEL,
  MASTER_OFFERING_PRICE_ON_REQUEST,
  MASTER_OFFERING_PRICE_ON_REQUEST_LABEL,
  type MasterOfferingPriceSummary,
  type MasterOfferingPriceView,
} from "@shared/research/master-offerings/pricing-contract";
import type {
  NormalizedMasterOffering,
  NormalizedMasterOfferingVariant,
} from "./model";

export type MasterOfferingPriceMap = ReadonlyMap<string, MasterOfferingPriceView>;

export const NO_MASTER_OFFERING_PRICES: MasterOfferingPriceMap = new Map();

/** A missing entry is on request, never an assumed or inherited price. */
export function priceForVariant(
  prices: MasterOfferingPriceMap,
  variant: NormalizedMasterOfferingVariant,
): MasterOfferingPriceView {
  const view = prices.get(variant.id);
  if (view === undefined) return MASTER_OFFERING_PRICE_ON_REQUEST;
  return isDisplayablePrice(view) || view.state === "on_request"
    ? view
    : MASTER_OFFERING_PRICE_ON_REQUEST;
}

export function summarizeMasterOfferingPrices(
  views: readonly MasterOfferingPriceView[],
): MasterOfferingPriceSummary {
  const variantCount = views.length;
  const priced = views.filter(isDisplayablePrice);
  const base = {
    variantCount,
    pricedVariantCount: priced.length,
  };

  if (priced.length === 0) {
    return {
      ...base,
      state: "none",
      currency: null,
      fromCents: null,
      toCents: null,
      display: MASTER_OFFERING_PRICE_ON_REQUEST_LABEL,
    };
  }

  const currencies = new Set(priced.map((view) => view.currency));
  if (currencies.size > 1) {
    // No single range is truthful across currencies, so the card defers to the
    // per-variant prices instead of picking one to lead with.
    return {
      ...base,
      state: "mixed",
      currency: null,
      fromCents: null,
      toCents: null,
      display: MASTER_OFFERING_PRICE_MIXED_LABEL,
    };
  }

  const currency = priced[0].currency;
  const amounts = priced.map((view) => view.amountCents);
  const fromCents = Math.min(...amounts);
  const toCents = Math.max(...amounts);
  const from = formatPriceCents(fromCents, currency);
  const to = formatPriceCents(toCents, currency);
  if (from === null || to === null) {
    return {
      ...base,
      state: "none",
      currency: null,
      fromCents: null,
      toCents: null,
      display: MASTER_OFFERING_PRICE_ON_REQUEST_LABEL,
    };
  }

  return fromCents === toCents
    ? {
        ...base,
        state: "single",
        currency,
        fromCents,
        toCents,
        display: from,
      }
    : {
        ...base,
        state: "range",
        currency,
        fromCents,
        toCents,
        display: `${from} to ${to}`,
      };
}

// Card variant rows are no longer built here. The variant summary now carries
// the server-resolved action, and action resolution belongs to the customer
// projection; a price-only builder would emit a summary this file cannot make
// truthful. `projectMasterOfferingCard` is the one card path.

export function summarizeOfferingPrices(
  offering: NormalizedMasterOffering,
  prices: MasterOfferingPriceMap = NO_MASTER_OFFERING_PRICES,
): MasterOfferingPriceSummary {
  return summarizeMasterOfferingPrices(
    offering.variants.map((variant) => priceForVariant(prices, variant)),
  );
}
