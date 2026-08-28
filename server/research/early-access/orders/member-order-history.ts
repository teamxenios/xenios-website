/**
 * Private Early Access: a signed-in member's own Early Access orders, on the
 * member order-history page that already exists.
 *
 * WHY THIS FILE EXISTS
 *
 * Early Access orders are keyed on an opaque `customerRef`. Accounts are keyed
 * on `memberId`. Until now nothing joined those two in the direction a
 * customer needs: you could read ONE Early Access order if you still held its
 * number, and you held its number only because the browser that placed it
 * remembered it, in `sessionStorage` under `xenios.earlyAccess.lastOrder.v1`.
 * Sign in from another device, clear the session, or simply come back next
 * week, and a customer who could prove exactly who they were was shown nothing
 * they had bought. The member "Order history" page listed member-commerce
 * orders only, and no Early Access order had ever appeared on it.
 *
 * The join was never missing. M62 stores a durable binding between a
 * `customerRef` and a legally identified member, indexed member-id-first, and
 * it is already trusted for legal ownership decisions. Only the inverse
 * direction was never exposed. This module is that direction and nothing more:
 * no second order store, no rewritten history, no new page, no new route, and
 * no dependency on anything a browser remembered.
 *
 * THE CHAIN, AND WHERE EACH LINK IS DECIDED
 *
 *   authenticated member  ->  memberId       (the route's member guard)
 *   memberId              ->  customerRefs   (the legal binding directory)
 *   customerRefs          ->  placements     (the existing commerce store)
 *   placement             ->  OrderSummaryDto (here)
 *
 * Each link is owned by the component that already owned it. This file adds no
 * new authority; it composes existing ones and then re-checks their work.
 *
 * WHY IT DECORATES THE ORDERS SERVICE INSTEAD OF ADDING A ROUTE
 *
 * The browser already asks `GET /api/research/orders` from
 * `client/src/research/pages/member/Orders.tsx`, behind the member guard that
 * derives the subject from a verified token, and renders `OrderSummaryDto`
 * rows. A second endpoint would mean a second page or a second fetch, a second
 * DTO, and eventually two answers to "what did I buy". So the Early Access
 * orders are projected into the SAME DTO and merged into the SAME service, and
 * the client changes not at all.
 *
 * WHY IT RE-CHECKS OWNERSHIP THE DATABASE ALREADY FILTERED
 *
 * The store is asked only for this member's handles, so in principle every row
 * it returns is already theirs. It is filtered again here anyway. This is the
 * read that answers "what did I buy", and the cost of a wrong answer is showing
 * one person another person's order, address and payment state. A check that
 * cheap should not be skipped because a layer beneath it is believed correct.
 *
 * WHY A WEAKLY BOUND ORDER IS EXCLUDED
 *
 * `bindingProvenance` records how the session that PLACED an order was bound to
 * its customer. Under a shared password, typing an email is an unauthenticated
 * claim to be someone: enough to place a new order, where the purchaser only
 * ever sees what they themselves just entered, and never enough to appear later
 * in somebody's durable history looking legitimate. That is precisely what the
 * field was added for, before any history surface existed. So `email_entry` is
 * excluded, and an ABSENT provenance is treated as the weak one, because a
 * missing answer must never read as a verified one. This matches the rule the
 * single-order read already applies, so the two surfaces cannot disagree.
 *
 * WHY A FAILED READ DOES NOT BECOME AN EMPTY LIST
 *
 * For a customer who has just paid, an order history that renders empty is the
 * worst failure available: it is indistinguishable from "you have no orders",
 * it looks like a real answer, and it invites a second purchase. So a failed
 * durable read propagates as a thrown error, which the route surfaces as an
 * honest failure, rather than being swallowed into `[]`.
 */

import type { OrderDetailDto, OrderSummaryDto } from "../../../../shared/research/commerce-api";
import type { OrderState } from "../../../../shared/research/commerce";
import type {
  OrderHistorySourceKey,
  OrderSourceStateDto,
} from "../../../../shared/research/customer-account/contract";
import type { EarlyAccessLegalBindingDirectory } from "../hardening-contract";
import type { EarlyAccessCommerceStore, EarlyAccessPlacement } from "../routes/store";
import { readEarlyAccessRefundHistory } from "../commerce/refund";
import {
  earlyAccessPromotionDiscountCents,
  earlyAccessPromotionVersion,
} from "../commerce/promotion";
import {
  cartHistoryPaymentEvidence,
  cartOrderDetail,
  cartOrderSummary,
  readCartHistoryEntry,
  type EarlyAccessCartHistoryEntry,
  type EarlyAccessCartOrderHistoryPort,
} from "./cart-order-history";

/**
 * How the session that placed an order was bound to its customer, restricted to
 * the values strong enough to appear in a durable history. The same pair the
 * single-order read admits, kept identical on purpose.
 */
const HISTORY_GRADE_PROVENANCE: ReadonlySet<string> = new Set([
  "verified_link",
  "session_code",
]);

/**
 * A work bound, not a policy.
 *
 * A binding carries one primary handle plus at most thirty-two aliases, so a
 * legitimate member sits far below this. It exists so a malformed or hostile
 * directory answer cannot turn one history read into an unbounded query.
 */
export const MAX_HISTORY_CUSTOMER_REFS = 64;

/**
 * Early Access payment state, expressed in the member order vocabulary.
 *
 * These are the only four states an Early Access placement can hold, and each
 * maps to the member state that means the same thing rather than the one that
 * looks tidiest. `payment_rejected` becomes `exception`, not `cancelled`: the
 * order still exists and still needs a human, and telling a customer their
 * order was cancelled when it was not is the kind of small lie that costs a
 * support call and some trust.
 */
const PAYMENT_STATE_TO_ORDER_STATE: Readonly<Record<string, OrderState>> = Object.freeze({
  awaiting_payment: "checkout_pending",
  under_review: "manual_review",
  payment_verified: "payment_captured",
  payment_rejected: "exception",
});

export type EarlyAccessOrderHistoryDependencies = Readonly<{
  // Both directions of the ONE M62 directory instance: order history reads
  // member -> handles; the buyer-scoped pricing composition reads the forward
  // handle -> binding through the same object, so the two can never answer
  // from different records.
  bindings: Pick<EarlyAccessLegalBindingDirectory, "customerRefsFor" | "forCustomer"> &
    Partial<Readonly<{
      /**
       * Lossless per-read evidence from the durable directory. A legacy
       * directory that exposes only the filtered string list cannot prove a
       * complete history and is therefore treated as partial.
       */
      customerRefsForHistory(memberId: string): Promise<Readonly<{
        refs: readonly string[];
        complete: boolean;
      }>>;
    }>>;
  store: Pick<EarlyAccessCommerceStore, "placementsForCustomers"> &
    Partial<Pick<EarlyAccessCommerceStore, "settlement" | "refunds">>;
  /**
   * Cart checkouts, the canonical launch order. OPTIONAL, and the absence is
   * the fail-closed state: until the founder applies the candidate read RPC
   * and production wires this port, the cart section is structurally absent
   * and the history behaves exactly as before — it does not render a fake
   * empty cart answer, because there is no dependency to ask. Once wired, a
   * failed cart read propagates like a failed placements read: the whole
   * history fails honestly rather than rendering half of itself.
   */
  cartOrders?: EarlyAccessCartOrderHistoryPort;
}>;

/** The member-facing orders service this decorates. Structural on purpose. */
export interface MemberOrdersService {
  listForMember(memberId: string): Promise<OrderSummaryDto[]>;
  /** Rows plus completeness observed during this exact read. */
  listForMemberWithHistory?(memberId: string): Promise<Readonly<{
    rows: OrderSummaryDto[];
    historySources: Readonly<Record<OrderHistorySourceKey, OrderSourceStateDto>>;
  }>>;
  getForMember(memberId: string, orderId: string): Promise<OrderDetailDto | null>;
  /** Completeness metadata carried by this exact constructed reader. */
  readonly historySources?: Readonly<Record<OrderHistorySourceKey, OrderSourceStateDto>>;
}

/**
 * The handles this member owns, bounded and de-duplicated.
 *
 * Returns an empty set for a member who is nobody or is bound to nothing. A
 * directory failure is NOT caught here: it propagates, so the caller can fail
 * honestly instead of rendering an empty history.
 */
type OwnedHandlesRead = Readonly<{
  values: ReadonlySet<string>;
  complete: boolean;
}>;

async function ownedHandles(
  deps: EarlyAccessOrderHistoryDependencies,
  memberId: unknown,
): Promise<OwnedHandlesRead> {
  if (typeof memberId !== "string" || memberId.trim() === "") {
    return { values: new Set(), complete: false };
  }

  const read = deps.bindings.customerRefsForHistory
    ? await deps.bindings.customerRefsForHistory(memberId)
    : {
        refs: await deps.bindings.customerRefsFor(memberId),
        complete: false,
      };
  const refs = read.refs;
  if (!Array.isArray(refs)) return { values: new Set(), complete: false };
  if (refs.length === 0) {
    return { values: new Set(), complete: read.complete === true };
  }

  const owned = new Set<string>();
  let complete = read.complete === true;
  for (const ref of refs) {
    if (typeof ref !== "string" || ref.trim() === "") {
      complete = false;
      continue;
    }
    if (owned.has(ref)) {
      complete = false;
      continue;
    }
    if (owned.size >= MAX_HISTORY_CUSTOMER_REFS) {
      complete = false;
      continue;
    }

    // The inverse member->refs query is discovery, never authorization. Re-read
    // each candidate through the distinct forward ref->binding authority before
    // it may reach either history store. An overbroad inverse RPC can therefore
    // downgrade the source, but cannot disclose another member's order.
    let forward;
    try {
      forward = await deps.bindings.forCustomer(ref);
    } catch {
      complete = false;
      continue;
    }
    if (
      !forward.ok ||
      forward.binding.memberId !== memberId ||
      !HISTORY_GRADE_PROVENANCE.has(forward.binding.establishedBy) ||
      (
        forward.binding.customerRef !== ref &&
        !forward.binding.aliasRefs.includes(ref)
      )
    ) {
      complete = false;
      continue;
    }
    owned.add(ref);
  }
  return { values: owned, complete };
}

type OwnedRowsRead<T> = Readonly<{
  rows: readonly T[];
  complete: boolean;
  /** Exact opaque references observed more than once inside this source. */
  ambiguousReferences: ReadonlySet<string>;
}>;

function historyRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function historyPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function historyNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function historyInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

type HistoryMoney = Readonly<{
  currency: "USD";
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  payableTotalCents: number;
}>;

function readHistoryMoney(value: unknown): HistoryMoney | null {
  const money = historyRecord(value);
  if (money === null || money.currency !== "USD") return null;
  if (!historyPositiveInt(money.subtotalCents)) return null;
  if (!historyNonNegativeInt(money.discountCents)) return null;
  if (!historyNonNegativeInt(money.shippingCents)) return null;
  if (!historyNonNegativeInt(money.taxCents)) return null;
  if (!historyPositiveInt(money.payableTotalCents)) return null;
  if (money.discountCents > money.subtotalCents) return null;
  const expected =
    money.subtotalCents - money.discountCents + money.shippingCents + money.taxCents;
  if (!Number.isSafeInteger(expected) || money.payableTotalCents !== expected) return null;
  return {
    currency: "USD",
    subtotalCents: money.subtotalCents,
    discountCents: money.discountCents,
    shippingCents: money.shippingCents,
    taxCents: money.taxCents,
    payableTotalCents: money.payableTotalCents,
  };
}

function historyMoneyMatches(left: HistoryMoney, right: HistoryMoney): boolean {
  return (
    left.currency === right.currency &&
    left.subtotalCents === right.subtotalCents &&
    left.discountCents === right.discountCents &&
    left.shippingCents === right.shippingCents &&
    left.taxCents === right.taxCents &&
    left.payableTotalCents === right.payableTotalCents
  );
}

/**
 * Re-prove every durable placement field the member projection consumes.
 *
 * The persistence adapter transports JSON and therefore cannot make its TypeScript
 * cast authoritative. A malformed row is not "not an order": it is evidence that
 * this exact history read was incomplete, so the caller drops it and downgrades the
 * source. Both the legacy wrapper money and any newer nested money must agree with
 * the exact line, while invoice identity and money must agree with the order.
 */
function readPlacementHistoryEntry(value: unknown): EarlyAccessPlacement | null {
  const placement = historyRecord(value);
  if (placement === null) return null;
  if (typeof placement.orderNumber !== "string" || placement.orderNumber.trim() === "") {
    return null;
  }
  if (typeof placement.customerRef !== "string" || placement.customerRef.trim() === "") {
    return null;
  }
  if (!historyInstant(placement.placedAt)) return null;
  if (PAYMENT_STATE_TO_ORDER_STATE[String(placement.paymentState)] === undefined) return null;

  const release = historyRecord(placement.order);
  const order = historyRecord(release?.order);
  const line = historyRecord(order?.line);
  if (release === null || order === null || line === null) return null;
  if (order.orderId !== placement.orderNumber || order.customerRef !== placement.customerRef) {
    return null;
  }
  if (order.currency !== "USD" || line.currency !== "USD") return null;
  if (typeof line.sku !== "string" || line.sku.trim() === "") return null;
  if (!historyPositiveInt(line.quantity) || !historyPositiveInt(line.unitPriceCents)) return null;
  if (!historyPositiveInt(line.lineTotalCents)) return null;
  const expectedLineTotal = line.quantity * line.unitPriceCents;
  if (!Number.isSafeInteger(expectedLineTotal) || line.lineTotalCents !== expectedLineTotal) {
    return null;
  }
  if (order.orderTotalCents !== line.lineTotalCents) return null;
  const orderInstant = order.createdAt ?? order.placedAt;
  if (!historyInstant(orderInstant) || orderInstant !== placement.placedAt) return null;

  const releaseMoney = readHistoryMoney(release.money);
  if (releaseMoney === null || releaseMoney.subtotalCents !== line.lineTotalCents) return null;
  if (order.money !== undefined) {
    const nestedMoney = readHistoryMoney(order.money);
    if (nestedMoney === null || !historyMoneyMatches(releaseMoney, nestedMoney)) return null;
  }

  const releasePromotion = historyRecord(release.promotion);
  if (releasePromotion === null) return null;
  if (
    typeof releasePromotion.promotionId !== "string" ||
    releasePromotion.promotionId.trim() === "" ||
    releasePromotion.rule !== "bundle_quantity_percentage" ||
    releasePromotion.eligibleQuantity !== line.quantity ||
    !historyNonNegativeInt(releasePromotion.discountBasisPoints) ||
    releasePromotion.discountBasisPoints > 10_000 ||
    typeof releasePromotion.label !== "string" ||
    releasePromotion.label.trim() === "" ||
    typeof releasePromotion.promotionVersion !== "string" ||
    releasePromotion.promotionVersion !== earlyAccessPromotionVersion({
      promotionId: releasePromotion.promotionId,
      rule: "bundle_quantity_percentage",
      eligibleQuantity: releasePromotion.eligibleQuantity,
      discountBasisPoints: releasePromotion.discountBasisPoints,
      label: releasePromotion.label,
    }) ||
    releaseMoney.discountCents !==
      earlyAccessPromotionDiscountCents(
        releaseMoney.subtotalCents,
        releasePromotion.discountBasisPoints,
      )
  ) {
    return null;
  }
  const nestedPromotion = order.promotion;
  if (releaseMoney.discountCents === 0) {
    if (nestedPromotion !== null) return null;
  } else {
    const promotion = historyRecord(nestedPromotion);
    if (
      promotion === null ||
      promotion.promotionId !== releasePromotion.promotionId ||
      promotion.promotionVersion !== releasePromotion.promotionVersion ||
      promotion.rule !== releasePromotion.rule ||
      promotion.eligibleQuantity !== releasePromotion.eligibleQuantity ||
      promotion.discountBasisPoints !== releasePromotion.discountBasisPoints ||
      promotion.subtotalCents !== releaseMoney.subtotalCents ||
      promotion.discountCents !== releaseMoney.discountCents ||
      promotion.payableTotalCents !== releaseMoney.payableTotalCents
    ) {
      return null;
    }
  }

  const invoice = historyRecord(placement.invoice);
  if (invoice === null) return null;
  if (invoice.orderId !== placement.orderNumber || invoice.customerRef !== placement.customerRef) {
    return null;
  }
  if (invoice.currency !== "USD") return null;
  if (
    invoice.subtotalCents !== releaseMoney.subtotalCents ||
    invoice.discountCents !== releaseMoney.discountCents ||
    invoice.payableTotalCents !== releaseMoney.payableTotalCents
  ) {
    return null;
  }
  if (!historyInstant(invoice.issuedAt)) return null;
  if (!Array.isArray(invoice.lines) || invoice.lines.length !== 1) return null;
  const invoiceLine = historyRecord(invoice.lines[0]);
  if (
    invoiceLine === null ||
    invoiceLine.sku !== line.sku ||
    invoiceLine.quantity !== line.quantity ||
    invoiceLine.unitPriceCents !== line.unitPriceCents ||
    invoiceLine.lineTotalCents !== line.lineTotalCents
  ) {
    return null;
  }

  return placement as unknown as EarlyAccessPlacement;
}

/**
 * The placements this member may be shown, in a stable order.
 *
 * Ownership is re-checked against the handle set, weak provenance is dropped,
 * and a repeated order number is dropped, because rendering one order twice
 * reads to a customer as having been charged twice.
 */
async function ownedPlacements(
  deps: EarlyAccessOrderHistoryDependencies,
  memberId: unknown,
  handles?: OwnedHandlesRead,
): Promise<OwnedRowsRead<EarlyAccessPlacement>> {
  const bounded = handles ?? await ownedHandles(deps, memberId);
  const owned = bounded.values;
  if (owned.size === 0) {
    return { rows: [], complete: bounded.complete, ambiguousReferences: new Set() };
  }

  const placements = await deps.store.placementsForCustomers(Array.from(owned));
  if (!Array.isArray(placements)) {
    return { rows: [], complete: false, ambiguousReferences: new Set() };
  }

  const seen = new Set<string>();
  const ambiguousReferences = new Set<string>();
  const kept: EarlyAccessPlacement[] = [];
  let complete = bounded.complete;
  for (const candidate of placements) {
    const placement = readPlacementHistoryEntry(candidate);
    if (placement === null) {
      complete = false;
      continue;
    }
    // THE RE-CHECK. The store filtered on these handles; it is checked again
    // here, because this is the read where being wrong means showing one
    // person another person's order.
    if (!owned.has(placement.customerRef)) {
      complete = false;
      continue;
    }
    if (!HISTORY_GRADE_PROVENANCE.has(placement.bindingProvenance ?? "")) {
      complete = false;
      continue;
    }
    if (seen.has(placement.orderNumber)) {
      ambiguousReferences.add(placement.orderNumber);
      complete = false;
      continue;
    }
    seen.add(placement.orderNumber);
    kept.push(placement);
  }
  return { rows: kept, complete, ambiguousReferences };
}

/**
 * The cart checkouts this member may be shown, under the SAME discipline the
 * placements take: ownership re-checked against the handle set even though the
 * RPC filtered on it, weak or absent provenance dropped, repeated checkout
 * numbers dropped, and every field re-proven by `readCartHistoryEntry` before
 * anything renders. An unwired port answers an empty list without asking
 * anything; a WIRED port's failure propagates, exactly like the placements
 * read, because half a history is indistinguishable from a complete one.
 */
async function ownedCartEntries(
  deps: EarlyAccessOrderHistoryDependencies,
  memberId: unknown,
  handles?: OwnedHandlesRead,
): Promise<OwnedRowsRead<EarlyAccessCartHistoryEntry>> {
  if (!deps.cartOrders) {
    return { rows: [], complete: false, ambiguousReferences: new Set() };
  }
  const bounded = handles ?? await ownedHandles(deps, memberId);
  const owned = bounded.values;
  if (owned.size === 0) {
    return { rows: [], complete: bounded.complete, ambiguousReferences: new Set() };
  }

  const rows = await deps.cartOrders.checkoutsForCustomers(Array.from(owned));
  if (!Array.isArray(rows)) {
    return { rows: [], complete: false, ambiguousReferences: new Set() };
  }

  const seen = new Set<string>();
  const ambiguousReferences = new Set<string>();
  const kept: EarlyAccessCartHistoryEntry[] = [];
  let complete = bounded.complete;
  for (const row of rows) {
    const entry = readCartHistoryEntry(row);
    if (entry === null) {
      complete = false;
      continue;
    }
    // THE RE-CHECK, same reason as the placements above.
    if (!owned.has(entry.customerRef)) {
      complete = false;
      continue;
    }
    if (seen.has(entry.cartCheckoutNumber)) {
      ambiguousReferences.add(entry.cartCheckoutNumber);
      complete = false;
      continue;
    }
    seen.add(entry.cartCheckoutNumber);
    kept.push(entry);
  }
  return { rows: kept, complete, ambiguousReferences };
}

/**
 * One placement as a member order summary.
 *
 * WHAT IS DELIBERATELY NOT HERE. `placement.supplier` and
 * `placement.attribution` are never read. No supplier name, buy cost,
 * alternative cost, margin, saving, selection rationale, supplier note, source
 * file, source location or internal procurement field is reachable from this
 * function, because the fields carrying them are not touched at all rather than
 * touched and then filtered.
 *
 * `totalCents` is the money snapshot's `payableTotalCents`, the amount actually
 * owed. It is NOT `order.orderTotalCents`, which is the pre-discount
 * merchandise subtotal and is deprecated for exactly this reason: a customer
 * shown the subtotal as their total believes they were overcharged.
 */
export type EarlyAccessHistoryPaymentEvidence = Readonly<{
  amountCapturedCents: number | null;
  amountRefundedCents: number | null;
}>;

const UNKNOWN_EARLY_ACCESS_PAYMENT_EVIDENCE: EarlyAccessHistoryPaymentEvidence = Object.freeze({
  amountCapturedCents: null,
  amountRefundedCents: null,
});

/**
 * Read payment facts from the settlement/refund ledgers. Missing or malformed
 * readers remain unknown; the placement lifecycle never manufactures zero.
 */
export async function earlyAccessHistoryPaymentEvidence(
  deps: EarlyAccessOrderHistoryDependencies,
  placement: EarlyAccessPlacement,
): Promise<EarlyAccessHistoryPaymentEvidence> {
  if (deps.store.settlement === undefined) return UNKNOWN_EARLY_ACCESS_PAYMENT_EVIDENCE;
  const settlement = await deps.store.settlement(placement.orderNumber);
  const captured =
    settlement !== null &&
    settlement.orderNumber === placement.orderNumber &&
    settlement.ledgerEntry.currency === "USD" &&
    Number.isSafeInteger(settlement.ledgerEntry.amountCents) &&
    settlement.ledgerEntry.amountCents > 0
      ? settlement.ledgerEntry.amountCents
      : null;

  if (deps.store.refunds === undefined) {
    return Object.freeze({ amountCapturedCents: captured, amountRefundedCents: null });
  }
  const refunds = readEarlyAccessRefundHistory(await deps.store.refunds(placement.orderNumber));
  if (refunds === null) {
    return Object.freeze({ amountCapturedCents: captured, amountRefundedCents: null });
  }

  // The generic parser proves each row's shape, not the authoritative history
  // chain this projection needs. Re-prove the entire chain here so history
  // truth does not depend on stronger semantics in the excluded refund module.
  let refunded = 0;
  for (let index = 0; index < refunds.length; index += 1) {
    const refund = refunds[index];
    if (
      refund === undefined ||
      refund.sequence !== index + 1 ||
      refund.orderId !== placement.orderNumber ||
      captured === null ||
      refund.verifiedPaidCents !== captured ||
      !Number.isSafeInteger(refund.amountCents) ||
      refund.amountCents <= 0 ||
      !Number.isSafeInteger(refund.priorRefundedCents) ||
      refund.priorRefundedCents !== refunded
    ) {
      return Object.freeze({ amountCapturedCents: captured, amountRefundedCents: null });
    }
    const nextRefunded = refunded + refund.amountCents;
    if (!Number.isSafeInteger(nextRefunded) || nextRefunded > captured) {
      return Object.freeze({ amountCapturedCents: captured, amountRefundedCents: null });
    }
    refunded = nextRefunded;
  }
  return Object.freeze({ amountCapturedCents: captured, amountRefundedCents: refunded });
}

export function earlyAccessOrderSummary(
  placement: EarlyAccessPlacement,
  evidence: EarlyAccessHistoryPaymentEvidence = UNKNOWN_EARLY_ACCESS_PAYMENT_EVIDENCE,
): OrderSummaryDto {
  return {
    // The Early Access order number, unchanged. It is the identifier the
    // customer already has on their invoice, so the two agree.
    orderId: placement.orderNumber,
    recordKind: "order",
    state: PAYMENT_STATE_TO_ORDER_STATE[placement.paymentState] ?? "exception",
    placedAt: placement.placedAt,
    totalCents: placement.order.money.payableTotalCents,
    // P1-A monetary FACTS come only from durable readers. A lifecycle label is
    // context, not capture/refund evidence, and missing readers remain null.
    payment: {
      amountDueCents: placement.order.money.payableTotalCents,
      amountCapturedCents: evidence.amountCapturedCents,
      amountRefundedCents: evidence.amountRefundedCents,
      currency: "USD",
    },
    // Early Access fulfilment events live behind their own reads, one call per
    // order, and a list of N orders must not become N further round trips.
    // The source declares itself UNCONNECTED to shipment facts here (P1-B), so
    // an empty list asserts nothing — downstream renders fulfillment unknown
    // rather than "unfulfilled"; tracking lives on the Early Access order
    // surface that already reads it.
    shipmentsSource: "unavailable",
    shipments: [],
  };
}

/**
 * One placement as a member order detail.
 *
 * `displayName` carries the SKU rather than a product name, because an Early
 * Access placement stores no display name and inventing one would put a product
 * label on a customer's order that no catalogue ever approved.
 */
export function earlyAccessOrderDetail(
  placement: EarlyAccessPlacement,
  evidence: EarlyAccessHistoryPaymentEvidence = UNKNOWN_EARLY_ACCESS_PAYMENT_EVIDENCE,
): OrderDetailDto {
  const line = placement.order.order.line;
  return {
    ...earlyAccessOrderSummary(placement, evidence),
    lines: [
      {
        sku: line.sku,
        displayName: line.sku,
        quantity: line.quantity,
        lineTotalCents: line.lineTotalCents,
      },
    ],
    // Early Access quotes a single payable total; it carries no separate
    // shipping component and no store credit. Zero is the true value here, not
    // a placeholder.
    shippingCents: 0,
    storeCreditAppliedCents: 0,
    reviewReason: null,
  };
}

/**
 * Wraps a member orders service so a member also sees their Early Access
 * orders.
 *
 * The base service is always consulted, and its answer is never discarded: if
 * the Early Access side is unavailable the whole read fails rather than
 * silently returning half a history, because half a history is
 * indistinguishable from a complete one.
 *
 * Ordering is newest first across both sources, matching what a history page
 * should show. Ties break on the order id so the list is stable between reads.
 */
export function withEarlyAccessOrderHistory(
  base: MemberOrdersService,
  deps: EarlyAccessOrderHistoryDependencies,
): MemberOrdersService {
  const unavailable = Object.freeze({ connected: false, complete: false });
  const baseSources = base.historySources ?? Object.freeze({
    commerce: unavailable,
    xea: unavailable,
    xec: unavailable,
    xrr: unavailable,
  });

  async function readForMember(memberId: string): Promise<Readonly<{
    rows: OrderSummaryDto[];
    historySources: Readonly<Record<OrderHistorySourceKey, OrderSourceStateDto>>;
  }>> {
    const [baseRead, handles] = await Promise.all([
      base.listForMemberWithHistory
        ? base.listForMemberWithHistory(memberId)
        : base.listForMember(memberId).then((rows) => ({ rows, historySources: baseSources })),
      ownedHandles(deps, memberId),
    ]);
    if (!Array.isArray(baseRead.rows)) throw new Error("base_order_history_unavailable");

    const [placementsRead, cartRead] = await Promise.all([
      ownedPlacements(deps, memberId, handles),
      deps.cartOrders === undefined
        ? Promise.resolve({
            rows: [] as readonly EarlyAccessCartHistoryEntry[],
            complete: false,
            ambiguousReferences: new Set<string>(),
          })
        : ownedCartEntries(deps, memberId, handles),
    ]);
    const [placementOrders, cartOrders] = await Promise.all([
      Promise.all(
        placementsRead.rows.map(async (placement) =>
          earlyAccessOrderSummary(
            placement,
            await earlyAccessHistoryPaymentEvidence(deps, placement),
          ),
        ),
      ),
      Promise.all(
        cartRead.rows.map(async (entry) =>
          cartOrderSummary(entry, await cartHistoryPaymentEvidence(deps.cartOrders, entry)),
        ),
      ),
    ]);
    const rows = [
      ...baseRead.rows,
      ...placementOrders,
      ...cartOrders,
    ].sort((a, b) =>
      a.placedAt === b.placedAt
        ? a.orderId.localeCompare(b.orderId)
        : b.placedAt.localeCompare(a.placedAt),
    );
    return {
      rows,
      historySources: Object.freeze({
        ...baseRead.historySources,
        xea: Object.freeze({ connected: true, complete: placementsRead.complete }),
        xec:
          deps.cartOrders === undefined
            ? unavailable
            : Object.freeze({ connected: true, complete: cartRead.complete }),
      }),
    };
  }

  return {
    // These legacy/static fields describe connection only. Completeness is a
    // fact of an individual bounded read (bindings may exceed the cap or carry
    // malformed rows), so callers that cannot consume listForMemberWithHistory
    // must see partial rather than a timeless complete assertion.
    historySources: Object.freeze({
      ...baseSources,
      xea: Object.freeze({ connected: true, complete: false }),
      xec:
        deps.cartOrders === undefined
          ? unavailable
          : Object.freeze({ connected: true, complete: false }),
    }),
    async listForMember(memberId: string): Promise<OrderSummaryDto[]> {
      return (await readForMember(memberId)).rows;
    },

    async listForMemberWithHistory(memberId: string) {
      return readForMember(memberId);
    },

    async getForMember(memberId: string, orderId: string): Promise<OrderDetailDto | null> {
      if (typeof orderId !== "string" || orderId === "") return null;

      // Every source is independently member-scoped. Resolve them all before
      // choosing a detail: references are opaque, so a base, placement, and cart
      // row can carry the same exact value. Returning the first hit would turn a
      // known cross-source collision into a definitive (and potentially wrong)
      // record.
      const [own, handles] = await Promise.all([
        base.getForMember(memberId, orderId),
        ownedHandles(deps, memberId),
      ]);
      const [placements, cartEntries] = await Promise.all([
        ownedPlacements(deps, memberId, handles),
        deps.cartOrders === undefined
          ? Promise.resolve({
              rows: [] as readonly EarlyAccessCartHistoryEntry[],
              complete: false,
              ambiguousReferences: new Set<string>(),
            })
          : ownedCartEntries(deps, memberId, handles),
      ]);
      const placementMatch = placements.rows.find((placement) => placement.orderNumber === orderId);
      const cartMatch = cartEntries.rows.find((entry) => entry.cartCheckoutNumber === orderId);
      const exactMatchCount =
        (own === null ? 0 : 1) +
        (placementMatch === undefined ? 0 : 1) +
        (cartMatch === undefined ? 0 : 1);
      if (
        exactMatchCount > 1 ||
        placements.ambiguousReferences.has(orderId) ||
        cartEntries.ambiguousReferences.has(orderId)
      ) {
        throw new Error("order_history_ambiguous");
      }

      // References are opaque. An incomplete competing source may have omitted
      // another row with this exact reference, so even a known hit cannot be
      // selected definitively until every competing member-scoped read completed.
      if (!placements.complete || !cartEntries.complete) {
        throw new Error("order_history_incomplete");
      }

      if (own !== null) return own;
      if (placementMatch !== undefined) {
        return earlyAccessOrderDetail(
          placementMatch,
          await earlyAccessHistoryPaymentEvidence(deps, placementMatch),
        );
      }

      return cartMatch === undefined
        ? null
        : cartOrderDetail(
            cartMatch,
            await cartHistoryPaymentEvidence(deps.cartOrders, cartMatch),
          );
    },
  };
}
