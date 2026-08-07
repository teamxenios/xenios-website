import { createHash } from "node:crypto";

import type { AffiliateCommissionScheduleSnapshot } from "@shared/research/affiliate-system";

/**
 * THE FOUNDER'S COMMISSION SCHEDULE, AS A DRAFT THAT PAYS NOBODY.
 *
 * The execution brief names exact numbers: 2000 basis points on a first
 * eligible order, 1500 on a repeat, a 30-day attribution window, a 30-day
 * hold before a commission may be paid, and a $100 minimum payout. They are
 * recorded here so there is one place to review them and one place to change
 * them.
 *
 * IT IS `draft` AND IT STAYS `draft`. `calculateAffiliateCommission` refuses
 * to compute anything unless the schedule it is handed is active, so this
 * constant cannot accrue a cent to anyone in the state it ships in. Moving it
 * to `approved` and then `active` is a founder decision with a signature
 * attached, exactly as the brief requires, and it is deliberately NOT a code
 * change anyone can make by editing a boolean here: the state travels on the
 * snapshot the caller loads, and no loader in this successor returns an
 * active one.
 *
 * WHY A VERSION. The repository already learned this lesson with product
 * promotions: a rate that is edited later must not silently rewrite what a
 * historical commission was calculated under. The version is a fingerprint of
 * the schedule's own content, so a stored commission can be re-checked
 * against the numbers that actually applied to it rather than against
 * today's table.
 */

export const AFFILIATE_DRAFT_SCHEDULE_ID = "xenios-affiliate-schedule-2026-draft-1";

/** Basis points on the first eligible order from an attributed customer. */
export const AFFILIATE_FIRST_ORDER_RATE_BPS = 2_000;
/** Basis points on every eligible order after the first. */
export const AFFILIATE_REPEAT_ORDER_RATE_BPS = 1_500;
/** Days a click/code attribution remains the primary one. */
export const AFFILIATE_ATTRIBUTION_WINDOW_DAYS = 30;
/** Days a settled commission is held before it may be paid. */
export const AFFILIATE_COMMISSION_HOLD_DAYS = 30;
/** The smallest balance that may be paid out at all. */
export const AFFILIATE_MINIMUM_PAYOUT_CENTS = 10_000;

function scheduleVersion(input: Readonly<Record<string, string | number>>): string {
  const canonical = Object.keys(input)
    .sort()
    .map((key) => `${key.length}:${key}=${String(input[key]).length}:${String(input[key])}`)
    .join("|");
  return createHash("sha256")
    .update("xenios:affiliate-schedule:v1|", "utf8")
    .update(canonical, "utf8")
    .digest("hex")
    .slice(0, 32);
}

/**
 * The draft schedule, with its own fingerprint.
 *
 * `state: "draft"` is the load-bearing field. Nothing in this successor
 * returns it in any other state, and the commission engine treats a
 * non-active schedule as "no commission" rather than as an error, so an
 * un-approved schedule produces silence rather than an accrual nobody
 * authorized.
 */
export const AFFILIATE_DRAFT_COMMISSION_SCHEDULE: AffiliateCommissionScheduleSnapshot =
  Object.freeze({
    scheduleId: AFFILIATE_DRAFT_SCHEDULE_ID,
    version: 1,
    firstOrderRateBps: AFFILIATE_FIRST_ORDER_RATE_BPS,
    repeatOrderRateBps: AFFILIATE_REPEAT_ORDER_RATE_BPS,
    attributionWindowDays: AFFILIATE_ATTRIBUTION_WINDOW_DAYS,
    holdDays: AFFILIATE_COMMISSION_HOLD_DAYS,
    minimumPayoutCents: AFFILIATE_MINIMUM_PAYOUT_CENTS,
    recurringTermMonths: null,
    currency: "USD",
  });

/**
 * The fingerprint of the schedule's own content.
 *
 * Separate from the snapshot because the shared type is the shape the rest of
 * the system stores; this is the value a stored commission is bound to, so a
 * rate edited later can be told apart from the rate that actually applied.
 */
export const AFFILIATE_DRAFT_SCHEDULE_VERSION_HASH = scheduleVersion({
  scheduleId: AFFILIATE_DRAFT_SCHEDULE_ID,
  version: AFFILIATE_DRAFT_COMMISSION_SCHEDULE.version,
  firstOrderRateBps: AFFILIATE_FIRST_ORDER_RATE_BPS,
  repeatOrderRateBps: AFFILIATE_REPEAT_ORDER_RATE_BPS,
  attributionWindowDays: AFFILIATE_ATTRIBUTION_WINDOW_DAYS,
  holdDays: AFFILIATE_COMMISSION_HOLD_DAYS,
  minimumPayoutCents: AFFILIATE_MINIMUM_PAYOUT_CENTS,
});

/**
 * THE APPROVAL STATE LIVES OUTSIDE THE SNAPSHOT, DELIBERATELY.
 *
 * The shared snapshot type carries rates, not governance. Whether a schedule
 * may actually pay anyone is a separate fact, and it is `false` here: this
 * successor contains no loader that returns an approved schedule, and
 * `calculateAffiliateCommission` is only ever handed `scheduleActive` from a
 * caller that must decide it. Turning this on is a founder decision with a
 * signature, not an edit to a constant.
 */
export const AFFILIATE_DRAFT_SCHEDULE_STATE = "draft" as const;

export function affiliateScheduleIsActive(
  state: string = AFFILIATE_DRAFT_SCHEDULE_STATE,
): boolean {
  return state === "active";
}
