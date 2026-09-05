import type {
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import { readCanonicalPriceTiers } from "@shared/research/price-quantity-tiers";
import {
  CART_PURCHASE_AUDIENCES,
  type CartAudienceEligibility,
} from "@shared/research/cart-product-selection";
import {
  isCustomerSafeAmountCents,
  normalizePriceCurrency,
} from "@shared/research/pricing";
import {
  findVariantStrengthDispute,
  type VariantStrengthDispute,
} from "./variant-strength-dispute";

/**
 * The projected refusal codes. This union is the contract the cart selection
 * lane's exhaustive map consumes (server/research/commerce/cart-product-selection.ts),
 * so it is frozen: widening it would stop that lane compiling. Every refusal
 * this resolver can reach projects onto one of these, and every projection is
 * itself a refusal, so a code added to the fuller union below can never turn a
 * refusal into a price.
 */
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

/**
 * The full refusal taxonomy this resolver decides on. It is the projected set
 * plus the states the projected set collapses:
 *
 *   variant_strength_disputed  the variant's physical presentation is contested
 *   price_inactive             no row for this identity is in the active state
 *   price_not_effective        every well-formed row starts after this instant
 *   price_expired              every well-formed row ended before this instant
 *
 * Read the full code through `decideProductControlPrice`. `resolveProductControlPrice`
 * returns the projection and carries the dispute record alongside it.
 */
export type ProductControlPriceRefusalCode =
  | ProductControlPriceFailureCode
  | "variant_strength_disputed"
  | "price_inactive"
  | "price_not_effective"
  | "price_expired";

/** The one approved, active, in-window row for an exact identity and instant. */
export interface ProductControlPriceMatch {
  ok: true;
  price: AdminProductPrice;
  effectiveAt: number;
  expiresAt: number | null;
}

export type ProductControlPriceDecision =
  | ProductControlPriceMatch
  | {
      ok: false;
      code: ProductControlPriceRefusalCode;
      /** Present only for a contested presentation. Both claims, with provenance. */
      strengthDispute: VariantStrengthDispute | null;
    };

export type ProductControlPriceResolution =
  | ProductControlPriceMatch
  | {
      ok: false;
      code: ProductControlPriceFailureCode;
      strengthDispute?: VariantStrengthDispute;
    };

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
  code: ProductControlPriceRefusalCode,
  strengthDispute: VariantStrengthDispute | null = null,
): ProductControlPriceDecision {
  return { ok: false, code, strengthDispute };
}

/**
 * Project a full refusal code onto the frozen set the cart selection lane maps.
 * Every arm is itself a refusal, so the projection can only ever change the
 * label an operator sees, never the outcome.
 */
function projectRefusalCode(
  code: ProductControlPriceRefusalCode,
): ProductControlPriceFailureCode {
  switch (code) {
    // A contested presentation is a variant that is not approved to be priced,
    // whatever its Product Control lifecycle field says. The reason travels
    // intact on `strengthDispute`.
    case "variant_strength_disputed":
      return "variant_unapproved";
    case "price_inactive":
      return "price_unapproved";
    case "price_not_effective":
    case "price_expired":
      return "price_stale";
    default:
      return code;
  }
}

/**
 * Decide the one customer-safe Product Control price row for an exact product,
 * variant, server-authorized audience, currency, and instant, reporting the
 * full refusal taxonomy.
 *
 * This is the sole production authority for current-row selection. It is
 * deliberately pure with respect to its inputs: callers supply immutable facts
 * and receive either one exact row with parsed window instants or a closed
 * refusal. The one fact it does not take from the caller is whether the
 * variant's presentation is contested, because a caller that forgot to pass it
 * would be a silent way to price a contested unit.
 */
export function decideProductControlPrice(
  input: ProductControlPriceResolutionInput,
): ProductControlPriceDecision {
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

  // Identity is established. Refuse before any price row is considered if that
  // identity's physical presentation is still contested: an authoritative price
  // on a contested unit reads as settled, and a missing price does not.
  const strengthDispute = findVariantStrengthDispute(input.variant);
  if (strengthDispute !== null) {
    return rejected("variant_strength_disputed", strengthDispute);
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

  const active = currencyMatches.filter((price) => price.status === "active");
  if (active.length === 0) return rejected("price_inactive");

  const approved = active.filter(
    (price) =>
      typeof price.approvedBy === "string" && Boolean(price.approvedBy.trim()),
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
        readCanonicalPriceTiers(price.amountCents, price.quantityTiers) !== null &&
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
  if (current.length === 0) {
    return rejected(
      wellFormed.some(({ effectiveAt }) => effectiveAt > evaluatedAt)
        ? "price_not_effective"
        : "price_expired",
    );
  }
  if (current.length !== 1) return rejected("price_ambiguous");

  // Last gate before a number becomes authoritative. Everything above already
  // rejects a non-positive or unsafe amount; this makes it structural, so no
  // future reordering of the filters can put a zero on a customer surface.
  if (!isCustomerSafeAmountCents(current[0].price.amountCents)) {
    return rejected("price_missing");
  }

  return { ok: true, ...current[0] };
}

/**
 * The projected resolution, for callers bound to the frozen failure set.
 * Identical outcomes to `decideProductControlPrice`: a refusal stays a refusal,
 * and the contested-presentation record travels with it.
 */
export function resolveProductControlPrice(
  input: ProductControlPriceResolutionInput,
): ProductControlPriceResolution {
  const decision = decideProductControlPrice(input);
  if (decision.ok) return decision;
  return decision.strengthDispute === null
    ? { ok: false, code: projectRefusalCode(decision.code) }
    : {
        ok: false,
        code: projectRefusalCode(decision.code),
        strengthDispute: decision.strengthDispute,
      };
}
