// THE canonical billing presentation (P1-C, 2026-08-27). Every surface that
// says anything about billing — badges, rows, summary copy, "up to date"
// language — derives it from this one exhaustive mapping. There is no other
// place billing states become words or colors.
//
// The safety property: NOTHING here defaults to green. Every state maps
// explicitly; an unrecognized value (possible only across wire-version skew)
// falls to the NEUTRAL "unavailable" presentation, and disputed/past_due are
// attention states that can never read as current.

import type { MembershipBillingDisplayState } from "./contract";

export type BillingTone = "success" | "warning" | "danger" | "neutral";

export type BillingPresentation = Readonly<{
  label: string;
  tone: BillingTone;
  /** True when this state demands the customer's attention. */
  attention: boolean;
}>;

const NEUTRAL_UNAVAILABLE: BillingPresentation = Object.freeze({
  label: "Billing status unavailable",
  tone: "neutral",
  attention: false,
});

export function billingPresentation(
  state: MembershipBillingDisplayState | (string & {}),
): BillingPresentation {
  switch (state as MembershipBillingDisplayState) {
    case "current":
      return { label: "Current", tone: "success", attention: false };
    case "past_due":
      return { label: "Past due — attention required", tone: "danger", attention: true };
    case "disputed":
      return { label: "Disputed — attention required", tone: "danger", attention: true };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral", attention: false };
    case "refunded":
      return { label: "Refunded", tone: "warning", attention: false };
    case "none":
      return { label: "No connected billing state", tone: "neutral", attention: false };
    case "unknown":
      return NEUTRAL_UNAVAILABLE;
    default:
      // Unrecognized is NEUTRAL, never green — the reviewer's exact demand.
      return NEUTRAL_UNAVAILABLE;
  }
}
