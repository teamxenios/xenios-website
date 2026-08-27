import type { BadgeTone } from "../ui/kit";

export function sentenceCase(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function formatAccountDate(value: string | null, withTime = false): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  const isUtcCalendarDate = !withTime && (
    /^\d{4}-\d{2}-\d{2}$/.test(value)
    || /T00:00:00(?:\.000)?Z$/.test(value)
  );
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(isUtcCalendarDate ? { timeZone: "UTC" } : {}),
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

export function statusTone(value: string): BadgeTone {
  if (["active", "paid", "delivered", "completed", "resolved", "shipped"].includes(value)) {
    return "success";
  }
  if (["past_due", "exception", "cancelled", "canceled", "unavailable", "held"].includes(value)) {
    return "danger";
  }
  if (["awaiting_payment", "follow_up_required", "waiting_on_customer", "pending_activation"].includes(value)) {
    return "warning";
  }
  if (["provider_review", "processing", "open", "trial"].includes(value)) return "info";
  return "neutral";
}

export function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function safeAccountPath(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
