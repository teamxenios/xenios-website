// ---------------------------------------------------------------------------
// Private Early Access order and invoice, read from the mounted API.
//
// Session-cookie authenticated, like the rest of the private area.
//
// THIS ADAPTER COMPUTES NO MONEY. Every amount below is a number the server
// calculated and this file carries it across unchanged. There is no arithmetic
// in this module, deliberately, so a customer can never be shown a total the
// server did not produce.
// ---------------------------------------------------------------------------

import { apiGet, type ApiResult } from "../lib/api";

export const EARLY_ACCESS_ORDERS_PATH = "/api/research/early-access/orders";

export function invoicePathFor(orderNumber: string): string {
  return `${EARLY_ACCESS_ORDERS_PATH}/${encodeURIComponent(orderNumber)}/invoice`;
}

/** Exactly the invoice fields the server projects. No more, and none derived. */
export type EarlyAccessInvoiceView = Readonly<{
  invoiceNumber: string;
  orderNumber: string;
  issuedAt: string;
  status: string;
  lines: ReadonlyArray<Record<string, unknown>>;
  subtotalCents: number;
  discountCents: number;
  discountLabel: string | null;
  payableTotalCents: number;
  currency: string;
  /** How a human matches a bank transfer to this order. */
  paymentReference: string;
  instructions: unknown;
}>;

export type EarlyAccessInvoiceLoad =
  | { kind: "ok"; invoice: EarlyAccessInvoiceView }
  | { kind: "locked" }
  | { kind: "missing" }
  | { kind: "unreadable"; reason: string }
  | { kind: "error"; message: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Reads one invoice.
 *
 * An invoice missing any amount, its currency or its payment reference is
 * `unreadable` rather than rendered with a gap. A payment screen showing a blank
 * total or a blank reference is worse than one that says it could not load: the
 * first invites a customer to send the wrong money to an unmatchable reference.
 */
export async function loadEarlyAccessInvoice(
  orderNumber: string,
  get: <T>(path: string) => Promise<ApiResult<T>> = (path) => apiGet(path),
): Promise<EarlyAccessInvoiceLoad> {
  const result = await get<{ invoice?: unknown }>(invoicePathFor(orderNumber));

  if (result.kind === "unauthorized" || result.kind === "forbidden") return { kind: "locked" };
  if (result.kind === "unavailable") return { kind: "missing" };
  if (result.kind === "denied") return { kind: "unreadable", reason: result.message ?? result.code };
  if (result.kind === "error") return { kind: "error", message: result.message };

  const raw = (result.data ?? {}).invoice as Record<string, unknown> | undefined;
  if (raw === undefined || raw === null || typeof raw !== "object") {
    return { kind: "unreadable", reason: "The invoice response was not in a readable shape." };
  }

  // Every money field must be an exact integer number of cents. A string, a
  // float or a negative is not an amount the server produced.
  for (const field of ["subtotalCents", "discountCents", "payableTotalCents"] as const) {
    if (!Number.isSafeInteger(raw[field]) || (raw[field] as number) < 0) {
      return { kind: "unreadable", reason: `The invoice ${field} was not a whole number of cents.` };
    }
  }
  if ((raw.payableTotalCents as number) <= 0) {
    return { kind: "unreadable", reason: "The invoice had no payable total." };
  }
  if (!isNonEmptyString(raw.currency)) {
    return { kind: "unreadable", reason: "The invoice had no currency." };
  }
  if (!isNonEmptyString(raw.paymentReference)) {
    // Without this a customer's transfer cannot be matched to their order, and
    // a human reviewing the bank feed is guessing.
    return { kind: "unreadable", reason: "The invoice had no payment reference." };
  }
  if (!isNonEmptyString(raw.invoiceNumber) || !isNonEmptyString(raw.orderNumber)) {
    return { kind: "unreadable", reason: "The invoice had no identity." };
  }

  return {
    kind: "ok",
    invoice: {
      invoiceNumber: raw.invoiceNumber,
      orderNumber: raw.orderNumber,
      issuedAt: isNonEmptyString(raw.issuedAt) ? raw.issuedAt : "",
      status: isNonEmptyString(raw.status) ? raw.status : "issued",
      lines: Array.isArray(raw.lines) ? (raw.lines as Record<string, unknown>[]) : [],
      subtotalCents: raw.subtotalCents as number,
      discountCents: raw.discountCents as number,
      discountLabel: isNonEmptyString(raw.discountLabel) ? raw.discountLabel : null,
      payableTotalCents: raw.payableTotalCents as number,
      currency: raw.currency,
      paymentReference: raw.paymentReference,
      instructions: raw.instructions ?? null,
    },
  };
}
