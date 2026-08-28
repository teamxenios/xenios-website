import type { BadgeTone } from "../ui/kit";
import type {
  CarePharmacyHistoryAvailabilityDto,
  MembershipDto,
  OrderHistoryAvailabilityDto,
  OrderSummaryDto,
} from "@shared/research/customer-account/contract";
import {
  ORDER_FULFILLMENT_DISPLAY_STATES,
  ORDER_PAYMENT_DISPLAY_STATES,
} from "@shared/research/customer-account/contract";

export function sentenceCase(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function cleanAccountText(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;

function isValidIsoDate(value: string): boolean {
  const match = ISO_CALENDAR_DATE.exec(value) ?? ISO_TIMESTAMP.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export function formatAccountDate(value: string | null, withTime = false): string {
  if (!value || !isValidIsoDate(value)) return "Not available";
  const isCalendarDate = ISO_CALENDAR_DATE.test(value);
  // A calendar date has no time-zone or clock-time evidence. Refuse to invent
  // one when a time was requested rather than letting Date parse it as UTC and
  // roll the visible date backward for users west of UTC.
  if (withTime && isCalendarDate) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  const isUtcCalendarDate = !withTime && (
    isCalendarDate
    || /T00:00(?::00(?:\.0{1,9})?)?Z$/.test(value)
  );
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(isUtcCalendarDate ? { timeZone: "UTC" } : {}),
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

/** MembershipDto.renewal is authoritative; legacy nextRenewalAt is never proof. */
export function formatMembershipRenewal(membership: MembershipDto): string {
  const renewal: unknown = membership.renewal;
  if (
    !renewal
    || typeof renewal !== "object"
    || !("state" in renewal)
    || !("nextRenewalAt" in renewal)
  ) {
    return "Renewal schedule unavailable";
  }
  if (renewal.state === "not_scheduled" && renewal.nextRenewalAt === null) {
    return "Not scheduled";
  }
  if (renewal.state === "scheduled" && typeof renewal.nextRenewalAt === "string") {
    const scheduledDate = formatAccountDate(renewal.nextRenewalAt);
    return scheduledDate === "Not available" ? "Renewal schedule unavailable" : scheduledDate;
  }
  return "Renewal schedule unavailable";
}

/**
 * Lane 01's authoritative count is numeric only for a complete history. The
 * row array is never used as a substitute for that source-owned count.
 */
export function authoritativeOrderCount(history: OrderHistoryAvailabilityDto): number | null {
  if (history.availability !== "complete") return null;
  const value = history.authoritativeRecordCount;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * Lane 01's final three-state Care-history contract is consumed by its exact
 * field names. Pair validation still fails closed if unvalidated JSON violates
 * the exported discriminated union at runtime.
 */
export function carePharmacyHistoryAvailability(
  history: CarePharmacyHistoryAvailabilityDto | null | undefined,
): "available" | "partial" | "unavailable" {
  if (!history || typeof history !== "object") return "unavailable";
  if (
    history.availability === "available"
    && typeof history.authoritativeRecordCount === "number"
    && Number.isSafeInteger(history.authoritativeRecordCount)
    && history.authoritativeRecordCount >= 0
  ) {
    return "available";
  }
  if (
    history.availability === "partial"
    && history.authoritativeRecordCount === null
  ) {
    return "partial";
  }
  return "unavailable";
}

export function authoritativeCarePharmacyCount(
  history: CarePharmacyHistoryAvailabilityDto | null | undefined,
): number | null {
  if (carePharmacyHistoryAvailability(history) !== "available") return null;
  const value = history?.authoritativeRecordCount;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export type CommerceRecordPresentation = Readonly<{
  label: "Order" | "Request" | "Commerce record";
  dateVerb: "Placed" | "Requested" | "Recorded";
}>;

/**
 * A reference is an opaque identifier. Only OrderSummaryDto.recordKind may
 * distinguish an order from a request; absent or malformed evidence stays
 * neutral even when the reference happens to look like XRR/XEA/XEC/XO.
 */
export function commerceRecordPresentation(
  recordKind: OrderSummaryDto["recordKind"],
): CommerceRecordPresentation {
  if (recordKind === "order") return { label: "Order", dateVerb: "Placed" };
  if (recordKind === "request") return { label: "Request", dateVerb: "Requested" };
  return { label: "Commerce record", dateVerb: "Recorded" };
}

export function paymentStatusLabel(value: string): string {
  return value !== "unknown" && (ORDER_PAYMENT_DISPLAY_STATES as readonly string[]).includes(value)
    ? `Payment: ${sentenceCase(value)}`
    : "Payment status unavailable";
}

export function fulfillmentStatusLabel(value: string): string {
  return value !== "unknown" && (ORDER_FULFILLMENT_DISPLAY_STATES as readonly string[]).includes(value)
    ? `Fulfillment: ${sentenceCase(value)}`
    : "Fulfillment status unavailable";
}

export function formatOrderQuantity(value: number | null): string {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : "Not available";
}

// Access, order-payment, and fulfillment tones ONLY. Billing states render
// exclusively through billingPresentation() (shared/research/customer-account/
// billing-presentation.ts) — "current" and "disputed" are billing vocabulary
// and deliberately absent here. past_due stays: membership ACCESS uses it too.
export function statusTone(value: string): BadgeTone {
  if (["active", "paid", "delivered", "completed", "resolved", "shipped"].includes(value)) {
    return "success";
  }
  if (["past_due", "exception", "cancelled", "canceled", "unavailable", "held"].includes(value)) {
    return "danger";
  }
  if (
    ["unpaid", "refunded", "partially_refunded", "paused", "follow_up_required", "waiting_on_customer", "pending", "pending_activation"].includes(value)
  ) {
    return "warning";
  }
  if (["provider_review", "processing", "open", "trial"].includes(value)) return "info";
  // "unknown" and anything unrecognized stay neutral: no tone implies a fact.
  return "neutral";
}

export function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Billing management is a higher-trust action than shipment tracking. Until
 * another provider is explicitly approved, fail closed to Stripe's exact
 * hosted billing-portal origin rather than trusting an arbitrary HTTPS host.
 */
export function safeBillingManagementUrl(value: string | null): string | null {
  const normalized = safeExternalUrl(value);
  if (!normalized) return null;
  const url = new URL(normalized);
  return url.hostname === "billing.stripe.com" && url.port === "" ? normalized : null;
}

export function safeAccountPath(value: string): string | null {
  if (!/^\/api\/research\/customer-account\/documents\/[A-Za-z0-9_-]{1,128}$/.test(value)) {
    return null;
  }
  return value;
}
