/**
 * Cart checkouts on the member order-history page.
 *
 * WHY THIS FILE EXISTS. member-order-history.ts made single-product Early
 * Access placements visible to the signed-in member who owns them. Cart
 * checkouts — the canonical launch order — remained invisible for the same
 * reason placements once were: the join existed, and no statement in the
 * deployment was permitted to ask it. This module is the cart half of that
 * read and nothing more: no second order store, no new route, no new DTO.
 *
 * THE PORT IS OPTIONAL AND ABSENCE IS THE FAIL-CLOSED STATE. The durable RPC
 * (`research_early_access_cart_checkouts_for_customers`, founder-gated
 * candidate SQL) does not exist in production yet. Until it does, production
 * simply does not wire this port, the cart section is structurally absent, and
 * the placements history behaves exactly as before. Once wired, a FAILED read
 * propagates as a thrown error — an honest 5xx — because an order history that
 * silently renders half of itself is indistinguishable from a complete one.
 *
 * EVERY ROW IS RE-PROVEN HERE. The RPC filters on the handles it was given;
 * each answer is validated field by field anyway, because this is the read
 * where being wrong means showing one person another person's order. A row
 * that cannot prove its shape, its money, its provenance, or its standing is
 * dropped, never rendered with a guess — and in money terms "a guess" includes
 * $0, which is why a checkout without a provable positive payable total is not
 * shown at all rather than shown free.
 *
 * WHAT IS DELIBERATELY NEVER READ. `record.attribution`,
 * `record.idempotencyKey`, `record.customerRef` aliases, and every supplier
 * field on the children (`supplierId`, `supplierSku`) are not touched at all
 * rather than touched and then filtered. The projection cannot leak what it
 * never dereferences.
 */

import type { OrderDetailDto, OrderSummaryDto } from "../../../../shared/research/commerce-api";
import type { OrderState } from "../../../../shared/research/commerce";
import {
  expectArray,
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "../persistence/executor";

/** The founder-gated read RPC. Absent in production until the candidate SQL lands. */
const RPC_CART_CHECKOUTS_FOR_CUSTOMERS = "research_early_access_cart_checkouts_for_customers";

/**
 * How the CUSTOMER HANDLE behind a cart checkout was bound to a legal member
 * identity, as reported by the M62 legal-bindings directory. Both admissible
 * values represent a server-verified or named-human-attested fact; everything
 * else — including absence, because a missing answer must never read as a
 * verified one — is excluded from a durable history. This is the cart lane's
 * expression of the same rule the placements history applies to its session
 * provenance.
 */
const CART_HISTORY_GRADE_PROVENANCE: ReadonlySet<string> = new Set([
  "verified_link",
  "admin_attested",
]);

const CART_CHECKOUT_NUMBER = /^XEC-[A-Z0-9]{16,40}$/;
const CUSTOMER_REF = /^eac_[a-f0-9]{32}$/;

/** One durable read: the cart checkouts recorded against a set of handles. */
export interface EarlyAccessCartOrderHistoryPort {
  checkoutsForCustomers(customerRefs: readonly string[]): Promise<readonly unknown[]>;
}

/**
 * The port over the candidate RPC, in the exact shape every other Early Access
 * durable read takes: one named service-role function, opaque errors, and an
 * empty handle list answered locally so the database is never asked a question
 * whose only safe answer is "nothing".
 */
export class SupabaseEarlyAccessCartOrderHistory implements EarlyAccessCartOrderHistoryPort {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async checkoutsForCustomers(customerRefs: readonly string[]): Promise<readonly unknown[]> {
    if (customerRefs.length === 0) return [];
    return expectArray(
      RPC_CART_CHECKOUTS_FOR_CUSTOMERS,
      await runEarlyAccessCall(this.query, {
        fn: RPC_CART_CHECKOUTS_FOR_CUSTOMERS,
        args: { p_customer_refs: [...customerRefs] },
      }),
    );
  }
}

/** The payment-state map, the SAME vocabulary the placements history uses. */
const CART_PAYMENT_STATE_TO_ORDER_STATE: Readonly<Record<string, OrderState>> = Object.freeze({
  awaiting_payment: "checkout_pending",
  under_review: "manual_review",
  payment_verified: "payment_captured",
  payment_rejected: "exception",
});

/** A validated cart history entry. Only ever constructed by the reader below. */
export type EarlyAccessCartHistoryEntry = Readonly<{
  cartCheckoutNumber: string;
  customerRef: string;
  state: OrderState;
  placedAt: string;
  totalCents: number;
  shippingCents: number;
  lines: readonly Readonly<{
    sku: string;
    displayName: string;
    quantity: number;
    lineTotalCents: number;
  }>[];
}>;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function instant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/**
 * Validate one RPC row into an entry a member may be shown, or null.
 *
 * Null is a PER-ROW exclusion, not an error path: a malformed row, a weakly or
 * un-provenanced row, a superseded checkout, a row whose money cannot be
 * proven positive, or a line that would render $0 all drop the row and only
 * the row. A failure of the READ ITSELF (the RPC throwing, or answering
 * something that is not an array) never reaches this function.
 */
export function readCartHistoryEntry(value: unknown): EarlyAccessCartHistoryEntry | null {
  const row = record(value);
  if (row === null) return null;

  if (typeof row.checkoutNumber !== "string" || !CART_CHECKOUT_NUMBER.test(row.checkoutNumber)) {
    return null;
  }
  if (typeof row.customerRef !== "string" || !CUSTOMER_REF.test(row.customerRef)) return null;

  // A superseded checkout stays readable on its own surfaces; in a HISTORY it
  // reads as having been charged twice, so it is excluded here exactly as a
  // duplicate order number is.
  if (row.disposition !== null && row.disposition !== undefined) return null;

  // The provenance gate. Absent is weak, and weak is excluded.
  if (
    typeof row.bindingProvenance !== "string" ||
    !CART_HISTORY_GRADE_PROVENANCE.has(row.bindingProvenance)
  ) {
    return null;
  }

  const state = CART_PAYMENT_STATE_TO_ORDER_STATE[String(row.paymentState)];
  if (state === undefined) return null;
  if (!instant(row.placedAt)) return null;

  const checkout = record(row.record);
  if (checkout === null) return null;
  const invoice = record(checkout.invoice);
  if (invoice === null) return null;
  // NO $0 RENDERING. A missing or malformed total is not free; it is not shown.
  if (invoice.currency !== "USD") return null;
  if (!positiveInt(invoice.payableTotalCents)) return null;
  if (!nonNegativeInt(invoice.shippingCents)) return null;

  const children = checkout.children;
  if (!Array.isArray(children) || children.length === 0) return null;
  const lines: Array<EarlyAccessCartHistoryEntry["lines"][number]> = [];
  for (const child of children) {
    const line = record(child);
    if (line === null) return null;
    if (typeof line.sku !== "string" || line.sku === "") return null;
    if (!positiveInt(line.quantity)) return null;
    if (!positiveInt(line.payableCents)) return null;
    lines.push(
      Object.freeze({
        sku: line.sku,
        // A cart child stores no display name; the SKU the invoice already
        // shows is what appears, never an invented product label.
        displayName: line.sku,
        quantity: line.quantity,
        lineTotalCents: line.payableCents,
      }),
    );
  }

  return Object.freeze({
    cartCheckoutNumber: row.checkoutNumber,
    customerRef: row.customerRef,
    state,
    placedAt: new Date(Date.parse(row.placedAt as string)).toISOString(),
    totalCents: invoice.payableTotalCents,
    shippingCents: invoice.shippingCents,
    lines: Object.freeze(lines),
  });
}

/** One cart checkout as a member order summary. */
export function cartOrderSummary(entry: EarlyAccessCartHistoryEntry): OrderSummaryDto {
  return {
    // The cart checkout number, unchanged: the identifier the customer already
    // has on their invoice, so the two agree.
    orderId: entry.cartCheckoutNumber,
    state: entry.state,
    placedAt: entry.placedAt,
    totalCents: entry.totalCents,
    // P1-A monetary FACTS, same invariant as the placement lane: money counts
    // as received only at verification (entry.state is "payment_captured"
    // exactly when the checkout's payment was verified), and this lane has no
    // refund concept, so refunded is authoritatively zero.
    payment: {
      amountDueCents: entry.totalCents,
      amountCapturedCents: entry.state === "payment_captured" ? entry.totalCents : 0,
      amountRefundedCents: 0,
      currency: "USD",
    },
    // Cart fulfilment events live behind their own reads; this source is
    // UNCONNECTED to shipment facts (P1-B) — an empty list asserts nothing.
    shipmentsSource: "unavailable",
    shipments: [],
  };
}

/** One cart checkout as a member order detail. */
export function cartOrderDetail(entry: EarlyAccessCartHistoryEntry): OrderDetailDto {
  return {
    ...cartOrderSummary(entry),
    lines: entry.lines.map((line) => ({ ...line })),
    shippingCents: entry.shippingCents,
    // The cart applies no store credit. Zero is the true value, not a filler.
    storeCreditAppliedCents: 0,
    reviewReason: null,
  };
}
