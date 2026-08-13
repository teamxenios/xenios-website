/**
 * Pure projection of approved variant prices into the buyer-facing card and
 * detail shapes. No input, no output, and no branch in this file can create an
 * amount: it only summarizes prices the authority already resolved.
 */

import {
  MASTER_OFFERING_DISPLAY_LABELS,
  type MasterOfferingVariantSummary,
} from "@shared/research/master-offerings/contract";
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

/**
 * Card-level variant rows. These carry the strength and the price and
 * deliberately carry no action, so a browsing card can never look
 * transaction-ready before an exact variant has been resolved on detail.
 */
export function projectMasterOfferingVariantSummaries(
  offering: NormalizedMasterOffering,
  prices: MasterOfferingPriceMap = NO_MASTER_OFFERING_PRICES,
): readonly MasterOfferingVariantSummary[] {
  return offering.variants.map((variant) => ({
    id: variant.id,
    label: variant.label,
    displayState: variant.displayState,
    displayLabel: MASTER_OFFERING_DISPLAY_LABELS[variant.displayState],
    price: priceForVariant(prices, variant),
  }));
}

export function summarizeOfferingPrices(
  offering: NormalizedMasterOffering,
  prices: MasterOfferingPriceMap = NO_MASTER_OFFERING_PRICES,
): MasterOfferingPriceSummary {
  return summarizeMasterOfferingPrices(
    offering.variants.map((variant) => priceForVariant(prices, variant)),
  );
}
