import type {
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import {
  CART_PURCHASE_AUDIENCES,
  type CartAudienceEligibility,
} from "@shared/research/cart-product-selection";
import {
  isCustomerSafeAmountCents,
  normalizePriceCurrency,
} from "@shared/research/pricing";

export type ProductControlPriceFailureCode =
  | "invalid_context"
  | "audience_unauthorized"
  | "variant_product_mismatch"
  | "variant_unapproved"
  | "variant_inactive"
  | "member_variant_ineligible"
  | "variant_sku_missing"
  | "price_missing"
  | "price_currency_mismatch"
  | "price_unapproved"
  | "price_stale"
  | "price_ambiguous";

export type ProductControlPriceResolution =
  | {
      ok: true;
      price: AdminProductPrice;
      effectiveAt: number;
      expiresAt: number | null;
    }
  | { ok: false; code: ProductControlPriceFailureCode };

export interface ProductControlPriceResolutionInput {
  productId: string;
  variant: AdminProductVariant;
  prices: readonly AdminProductPrice[];
  audienceEligibility: CartAudienceEligibility;
  currency: string;
  evaluatedAt: string;
}

export function parseProductControlTimestamp(value: string): number | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1] ||
    Number(hourText) > 23 ||
    Number(minuteText) > 59 ||
    Number(secondText) > 59
  ) {
    return null;
  }
  if (
    zone !== "Z" &&
    (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)
  ) {
    return null;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function parseProductControlTimestampMicros(
  value: string,
): number | null {
  const milliseconds = parseProductControlTimestamp(value);
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (milliseconds === null || match === null) return null;
  const micros = Number((match[7] ?? "").padEnd(6, "0"));
  const epochMicros = milliseconds * 1000 + (micros % 1000);
  return Number.isSafeInteger(epochMicros) ? epochMicros : null;
}

function rejected(
  code: ProductControlPriceFailureCode,
): ProductControlPriceResolution {
  return { ok: false, code };
}

/**
 * Select the one customer-safe Product Control price row for an exact
 * product, variant, server-authorized audience, currency, and instant.
 *
 * This is the sole production authority for current-row selection. It is
 * deliberately pure: callers supply immutable facts and receive either one
 * exact row with parsed window instants or a closed failure code.
 */
export function resolveProductControlPrice(
  input: ProductControlPriceResolutionInput,
): ProductControlPriceResolution {
  const evaluatedAt = parseProductControlTimestamp(input.evaluatedAt);
  const currency = normalizePriceCurrency(input.currency);
  if (
    evaluatedAt === null ||
    !input.productId.trim() ||
    !input.variant.id.trim() ||
    !input.currency.trim() ||
    input.currency !== input.currency.toUpperCase() ||
    currency === null ||
    !(CART_PURCHASE_AUDIENCES as readonly string[]).includes(
      input.audienceEligibility.audience,
    )
  ) {
    return rejected(
      currency === null && Boolean(input.currency.trim())
        ? "price_currency_mismatch"
        : "invalid_context",
    );
  }

  if (
    input.audienceEligibility.state !== "authorized" ||
    !input.audienceEligibility.sourceVersion.trim() ||
    parseProductControlTimestamp(input.audienceEligibility.evaluatedAt) !==
      evaluatedAt
  ) {
    return rejected("audience_unauthorized");
  }
  if (input.variant.productId !== input.productId) {
    return rejected("variant_product_mismatch");
  }
  if (input.variant.status !== "approved") {
    return rejected("variant_unapproved");
  }
  if (!input.variant.active) {
    return rejected("variant_inactive");
  }
  if (
    input.audienceEligibility.audience === "member" &&
    !input.variant.memberEligible
  ) {
    return rejected("member_variant_ineligible");
  }
  if (!input.variant.sku.trim()) {
    return rejected("variant_sku_missing");
  }

  const identityMatches = input.prices.filter(
    (price) =>
      price.productId === input.productId &&
      price.variantId === input.variant.id &&
      price.audience === input.audienceEligibility.audience,
  );
  if (identityMatches.length === 0) return rejected("price_missing");

  const currencyMatches = identityMatches.filter(
    (price) => price.currency === currency,
  );
  if (currencyMatches.length === 0) {
    return rejected("price_currency_mismatch");
  }

  const approved = currencyMatches.filter(
    (price) =>
      price.status === "active" &&
      typeof price.approvedBy === "string" &&
      Boolean(price.approvedBy.trim()),
  );
  if (approved.length === 0) return rejected("price_unapproved");
  if (approved.some((price) => price.amountCents <= 0)) {
    return rejected("price_missing");
  }

  const wellFormed = approved
    .map((price) => {
      const effectiveAt = parseProductControlTimestamp(price.effectiveAt);
      const expiresAt =
        price.expiresAt === null
          ? null
          : parseProductControlTimestamp(price.expiresAt);
      const valid =
        Boolean(price.id.trim()) &&
        isCustomerSafeAmountCents(price.amountCents) &&
        Number.isInteger(price.version) &&
        price.version > 0 &&
        effectiveAt !== null &&
        (price.expiresAt === null ||
          (expiresAt !== null && expiresAt > effectiveAt));
      return valid && effectiveAt !== null
        ? { price, effectiveAt, expiresAt }
        : null;
    })
    .filter(
      (
        value,
      ): value is {
        price: AdminProductPrice;
        effectiveAt: number;
        expiresAt: number | null;
      } => value !== null,
    );
  if (wellFormed.length === 0) return rejected("price_unapproved");

  const current = wellFormed.filter(
    ({ effectiveAt, expiresAt }) =>
      effectiveAt <= evaluatedAt &&
      (expiresAt === null || expiresAt > evaluatedAt),
  );
  if (current.length === 0) return rejected("price_stale");
  if (current.length !== 1) return rejected("price_ambiguous");

  return { ok: true, ...current[0] };
}
