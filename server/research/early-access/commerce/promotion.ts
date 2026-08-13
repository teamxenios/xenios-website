/**
 * The Early Access promotion table. Server only, pure, side effect free.
 *
 * A promotion here is a SERVER FACT. It is resolved from the quantity alone, and the
 * quantity is the only thing a customer supplies, so there is no code path on which a
 * request names its own discount, its own promotion, or its own rate. The request
 * projection in `order-service.ts` never carries a promotion field at all, so this is
 * structural rather than a validation the deny list has to keep up with.
 *
 * WHY A VERSION
 * -------------
 * A promotion that is edited or withdrawn later must not change what a historical order
 * was sold under. Every rule therefore carries a fingerprint of its own content, and
 * the fingerprint is stored on the order. Reading a historical order validates its
 * stored discount against its STORED basis points, never against today's table, so
 * withdrawing the bundle tomorrow leaves yesterday's order readable and unchanged.
 *
 * WHY INTEGER ARITHMETIC
 * ----------------------
 * `subtotal * basisPoints` is an exact integer well inside the safe range, and the
 * remainder is removed before dividing, so no floating point value is ever rounded and
 * two runs on two platforms cannot differ by a cent. The remainder is dropped rather
 * than rounded up, so the discount is never larger than the approved percentage of the
 * approved price. The customer pays at most one cent more than an exact percentage,
 * which is the direction that cannot overstate what the founder released.
 */

import { createHash } from "node:crypto";
import { EARLY_ACCESS_MAX_QUANTITY } from "@shared/research/early-access-quantity";

/** The only rule shape this table can express today. */
export const EARLY_ACCESS_PROMOTION_RULES = ["bundle_quantity_percentage"] as const;
export type EarlyAccessPromotionRuleKind = (typeof EARLY_ACCESS_PROMOTION_RULES)[number];

/** One promotion as it is authored, before its version is derived from it. */
export type EarlyAccessPromotionRule = Readonly<{
  promotionId: string;
  rule: EarlyAccessPromotionRuleKind;
  /** The exact quantity this rule applies to. Nothing else qualifies. */
  eligibleQuantity: number;
  /** Basis points off the merchandise subtotal. One basis point is a hundredth of a percent. */
  discountBasisPoints: number;
  label: string;
}>;

/** An authored rule plus the fingerprint of its own content. */
export type EarlyAccessPromotion = EarlyAccessPromotionRule &
  Readonly<{ promotionVersion: string }>;

/**
 * The fingerprint an order's discount is bound to.
 *
 * Fields are length prefixed rather than joined by a separator, because any separator
 * can appear inside a label and two genuinely different rules would then collide. A
 * collision would let an order claim a discount that a different rule authorized.
 */
export function earlyAccessPromotionVersion(rule: EarlyAccessPromotionRule): string {
  const canonical = [
    rule.promotionId,
    rule.rule,
    String(rule.eligibleQuantity),
    String(rule.discountBasisPoints),
    rule.label,
  ]
    .map((field) => `${field.length}:${field}`)
    .join("");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function versioned(rule: EarlyAccessPromotionRule): EarlyAccessPromotion {
  return Object.freeze({ ...rule, promotionVersion: earlyAccessPromotionVersion(rule) });
}

/**
 * The quantities Early Access sells, and the only discount that exists.
 *
 * Twenty percent at three units is the whole promotion. One and two units carry no
 * discount because none has been decided, and a discount nobody approved is a financial
 * fact this module is not entitled to invent. One and two are still listed, as zero
 * discount rules, so a quantity outside the table is a refusal rather than a silent
 * fall through to no promotion.
 *
 * WHY FOUR THROUGH TWENTY CARRY NO DISCOUNT
 * -----------------------------------------
 * Direct commerce accepts up to twenty units per variant. That widened the QUANTITY
 * band; it decided nothing about price. The only discount any founder release
 * approved is the twenty percent at exactly three units below, so that is the only
 * discount in this table, and four through twenty are listed at zero basis points
 * for the same reason one and two are: a quantity the table does not name is refused
 * outright, and refusing every quantity above three would have made the widened band
 * unreachable.
 *
 * This does mean six units cost more than two separate three-unit orders. That is a
 * pricing question, and it is deliberately left open rather than closed by this
 * module: writing a volume curve here would be inventing an approved price. If the
 * founder approves one later it is added here, as new rules, and every historical
 * order stays bound to the version it was sold under.
 *
 * The three authored rules below are byte-for-byte what they have always been. Their
 * `promotionVersion` hashes are the fingerprints existing orders are validated
 * against, so editing any field of them would invalidate real records.
 */
const AUTHORED_PROMOTIONS: readonly EarlyAccessPromotionRule[] = Object.freeze([
  {
    promotionId: "early-access-single",
    rule: "bundle_quantity_percentage",
    eligibleQuantity: 1,
    discountBasisPoints: 0,
    label: "1 Unit",
  },
  {
    promotionId: "early-access-pair",
    rule: "bundle_quantity_percentage",
    eligibleQuantity: 2,
    discountBasisPoints: 0,
    label: "2 Units",
  },
  {
    promotionId: "early-access-bundle-3",
    rule: "bundle_quantity_percentage",
    eligibleQuantity: 3,
    discountBasisPoints: 2_000,
    label: "3-Unit Bundle",
  },
]);

/**
 * The undiscounted remainder of the band, stated once rather than copied out
 * seventeen times. Every field is derived from the quantity alone and the discount
 * is fixed at zero, so this loop cannot express a price decision even by accident.
 */
const UNDISCOUNTED_PROMOTIONS: readonly EarlyAccessPromotionRule[] = Object.freeze(
  Array.from(
    { length: EARLY_ACCESS_MAX_QUANTITY - AUTHORED_PROMOTIONS.length },
    (_unused, offset): EarlyAccessPromotionRule => {
      const eligibleQuantity = AUTHORED_PROMOTIONS.length + offset + 1;
      return {
        promotionId: `early-access-units-${eligibleQuantity}`,
        rule: "bundle_quantity_percentage",
        eligibleQuantity,
        discountBasisPoints: 0,
        label: `${eligibleQuantity} Units`,
      };
    },
  ),
);

export const EARLY_ACCESS_PROMOTIONS: readonly EarlyAccessPromotion[] = Object.freeze(
  [...AUTHORED_PROMOTIONS, ...UNDISCOUNTED_PROMOTIONS].map(versioned),
);

/**
 * Resolve the promotion for a quantity.
 *
 * The table is injectable so a caller can prove that withdrawing a promotion stops NEW
 * orders without touching historical ones. It defaults to the canonical table, so no
 * production call site can be handed a table a request influenced.
 */
export function earlyAccessPromotionFor(
  quantity: number,
  promotions: readonly EarlyAccessPromotion[] = EARLY_ACCESS_PROMOTIONS,
): EarlyAccessPromotion | null {
  return promotions.find((promotion) => promotion.eligibleQuantity === quantity) ?? null;
}

/** The discount in whole cents, computed in integer arithmetic end to end. */
export function earlyAccessPromotionDiscountCents(
  subtotalCents: number,
  discountBasisPoints: number,
): number {
  const gross = subtotalCents * discountBasisPoints;
  return (gross - (gross % 10_000)) / 10_000;
}

/**
 * What an order stores about the promotion it was sold under.
 *
 * Everything a later reader needs to answer "which rule, in which version, applied to
 * how many units, against which approved price, and what did it produce" is on the
 * order itself. Nothing is looked up, so the answer survives the table changing.
 */
export type EarlyAccessPromotionSnapshot = Readonly<{
  promotionId: string;
  promotionVersion: string;
  rule: EarlyAccessPromotionRuleKind;
  eligibleQuantity: number;
  discountBasisPoints: number;
  subtotalCents: number;
  discountCents: number;
  /** Mirrors the money snapshot's payable total, and is validated equal to it on read. */
  payableTotalCents: number;
}>;

export const EARLY_ACCESS_PROMOTION_SNAPSHOT_KEYS = [
  "promotionId",
  "promotionVersion",
  "rule",
  "eligibleQuantity",
  "discountBasisPoints",
  "subtotalCents",
  "discountCents",
  "payableTotalCents",
] as const;
