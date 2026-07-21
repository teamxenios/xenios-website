// Shared presentation vocabulary for the member commerce pages (catalog,
// guides, orders, subscriptions, claims). One place turns the frozen wire
// vocabulary (shared/research/commerce-api.ts and its domain contracts) into
// member-facing labels and badge tones, so every page renders the same state
// the same way. Copy is ours, calm, and plain; raw machine codes never reach
// the member.

import type { GuideState, MemberGoal, ProductAvailability, ProductLane } from "@shared/research/catalog";
import { MEMBER_GOAL_LABELS } from "@shared/research/catalog";
import type { OrderState, SubscriptionFrequencyDays, SubscriptionState } from "@shared/research/commerce";
import type { ClaimDto, ClaimReason, GuideSummaryDto } from "@shared/research/commerce-api";
import type { BadgeTone } from "../../ui/kit";

// ---------------------------------------------------------------------------
// Money and dates
// ---------------------------------------------------------------------------

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: number): string {
  return USD.format(cents / 100);
}

/**
 * The canonical null-price rule: an unconfirmed price renders as
 * "Pricing not yet confirmed", never $0.00 and never a blank.
 */
export const PRICE_NOT_CONFIRMED = "Pricing not yet confirmed";

export function priceLabel(priceCents: number | null): string {
  return priceCents === null ? PRICE_NOT_CONFIRMED : formatCents(priceCents);
}

// A calendar date sent as a date-only string, or as an instant at exactly
// midnight UTC, means the DAY, not a moment. Rendering those in local time
// moves them backwards for every member west of UTC, so a charge dated the
// 5th reads as the 4th in Chicago. Those two forms are rendered in UTC; a
// value with a real time of day still renders in the member's own zone.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const isCalendarDate =
    DATE_ONLY.test(value) ||
    (parsed.getUTCHours() === 0 &&
      parsed.getUTCMinutes() === 0 &&
      parsed.getUTCSeconds() === 0 &&
      parsed.getUTCMilliseconds() === 0);
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(isCalendarDate ? { timeZone: "UTC" } : {}),
  });
}

// ---------------------------------------------------------------------------
// Catalog vocabulary
// ---------------------------------------------------------------------------

export const LANE_LABELS: Record<ProductLane, string> = {
  supplement: "Supplement",
  research_material: "Research material",
  quantum: "Quantum",
  future_clinical: "Future clinical",
  non_product_program: "Program",
};

export const AVAILABILITY_META: Record<ProductAvailability, { label: string; tone: BadgeTone }> = {
  in_stock: { label: "In stock", tone: "success" },
  low_stock: { label: "Low stock", tone: "warning" },
  out_of_stock: { label: "Out of stock", tone: "neutral" },
  waitlist: { label: "Waitlist", tone: "info" },
  documentation_review: { label: "Documentation review", tone: "pending" },
  commerce_review: { label: "Commerce review", tone: "pending" },
  temporarily_unavailable: { label: "Temporarily unavailable", tone: "warning" },
  coming_soon: { label: "Coming soon", tone: "pending" },
};

export const GUIDE_STATE_LABELS: Record<GuideState, string> = {
  guide_published: "Guide published",
  guide_updated: "Guide updated",
  guide_in_review: "Guide in review",
  guide_in_development: "Guide in development",
  guide_coming_soon: "Guide coming soon",
};

export function goalLabel(goal: MemberGoal): string {
  return MEMBER_GOAL_LABELS[goal] ?? goal;
}

// ---------------------------------------------------------------------------
// Guide library vocabulary (GuideSummaryDto.status)
// ---------------------------------------------------------------------------

export const GUIDE_STATUS_META: Record<GuideSummaryDto["status"], { label: string; tone: BadgeTone; readable: boolean }> = {
  published: { label: "Published", tone: "success", readable: true },
  updated: { label: "Updated", tone: "success", readable: true },
  in_review: { label: "In review", tone: "pending", readable: false },
  in_development: { label: "In development", tone: "pending", readable: false },
  coming_soon: { label: "Coming soon", tone: "info", readable: false },
};

// ---------------------------------------------------------------------------
// Order vocabulary (OrderState)
// ---------------------------------------------------------------------------

// manual_review is deliberately a calm informational state: the order exists
// and a person is reviewing it. It is never presented as an error.
export const ORDER_STATE_META: Record<OrderState, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  checkout_pending: { label: "Checkout pending", tone: "pending" },
  payment_authorized: { label: "Payment authorized", tone: "info" },
  manual_review: { label: "Pending review", tone: "info" },
  approved: { label: "Approved", tone: "info" },
  payment_captured: { label: "Payment received", tone: "info" },
  processing: { label: "Processing", tone: "info" },
  partially_fulfilled: { label: "Partially shipped", tone: "info" },
  fulfilled: { label: "Shipped", tone: "success" },
  delivered: { label: "Delivered", tone: "success" },
  exception: { label: "Needs attention", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  refunded: { label: "Refunded", tone: "neutral" },
  replaced: { label: "Replaced", tone: "neutral" },
};

export function orderStateMeta(state: OrderState | string): { label: string; tone: BadgeTone } {
  const meta = (ORDER_STATE_META as Record<string, { label: string; tone: BadgeTone }>)[state];
  if (meta) return meta;
  // Unknown vocabulary from the server: show it plainly, never hide it.
  const label = String(state).replace(/_/g, " ");
  return { label: label.charAt(0).toUpperCase() + label.slice(1), tone: "neutral" };
}

export const SHIPMENT_OWNER_LABELS: Record<"mitch" | "xenios", string> = {
  mitch: "Mitch",
  xenios: "Xenios",
};

// ---------------------------------------------------------------------------
// Subscription vocabulary (SubscriptionState)
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_STATE_META: Record<SubscriptionState, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "pending" },
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "neutral" },
  skip_scheduled: { label: "Skip scheduled", tone: "info" },
  rescheduled: { label: "Rescheduled", tone: "info" },
  payment_issue: { label: "Payment issue", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function subscriptionStateMeta(state: SubscriptionState | string): { label: string; tone: BadgeTone } {
  const meta = (SUBSCRIPTION_STATE_META as Record<string, { label: string; tone: BadgeTone }>)[state];
  if (meta) return meta;
  const label = String(state).replace(/_/g, " ");
  return { label: label.charAt(0).toUpperCase() + label.slice(1), tone: "neutral" };
}

export function frequencyLabel(days: SubscriptionFrequencyDays | number): string {
  return `Every ${days} days`;
}

// ---------------------------------------------------------------------------
// Claims vocabulary
// ---------------------------------------------------------------------------

export const CLAIM_REASON_LABELS: Record<ClaimReason, string> = {
  damaged: "Arrived damaged",
  lost: "Never arrived",
  incorrect: "Wrong item received",
  missing: "Item missing from the order",
  temperature_concern: "Temperature concern",
};

export const CLAIM_STATE_META: Record<ClaimDto["state"], { label: string; tone: BadgeTone }> = {
  submitted: { label: "Submitted", tone: "info" },
  under_review: { label: "Under review", tone: "pending" },
  information_requested: { label: "Information requested", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  resolved: { label: "Resolved", tone: "success" },
};

export const CLAIM_RESOLUTION_LABELS: Record<Exclude<ClaimDto["resolution"], null>, string> = {
  replacement: "Replacement",
  refund: "Refund",
  partial_refund: "Partial refund",
  none: "No adjustment",
};
