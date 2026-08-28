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
import type { EarlyAccessLegalBindingDirectory } from "../hardening-contract";
import type { EarlyAccessCommerceStore, EarlyAccessPlacement } from "../routes/store";
import {
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
  bindings: Pick<EarlyAccessLegalBindingDirectory, "customerRefsFor" | "forCustomer">;
  store: Pick<EarlyAccessCommerceStore, "placementsForCustomers">;
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
  getForMember(memberId: string, orderId: string): Promise<OrderDetailDto | null>;
}

/**
 * The handles this member owns, bounded and de-duplicated.
 *
 * Returns an empty set for a member who is nobody or is bound to nothing. A
 * directory failure is NOT caught here: it propagates, so the caller can fail
 * honestly instead of rendering an empty history.
 */
async function ownedHandles(
  deps: EarlyAccessOrderHistoryDependencies,
  memberId: unknown,
): Promise<ReadonlySet<string>> {
  if (typeof memberId !== "string" || memberId.trim() === "") return new Set();

  const refs = await deps.bindings.customerRefsFor(memberId);
  if (!Array.isArray(refs) || refs.length === 0) return new Set();

  const owned = new Set<string>();
  for (const ref of refs) {
    if (typeof ref !== "string" || ref === "") continue;
    owned.add(ref);
    if (owned.size >= MAX_HISTORY_CUSTOMER_REFS) break;
  }
  return owned;
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
): Promise<readonly EarlyAccessPlacement[]> {
  const owned = await ownedHandles(deps, memberId);
  if (owned.size === 0) return [];

  const placements = await deps.store.placementsForCustomers(Array.from(owned));
  if (!Array.isArray(placements)) return [];

  const seen = new Set<string>();
  const kept: EarlyAccessPlacement[] = [];
  for (const placement of placements) {
    if (placement === null || typeof placement !== "object") continue;
    // THE RE-CHECK. The store filtered on these handles; it is checked again
    // here, because this is the read where being wrong means showing one
    // person another person's order.
    if (!owned.has(placement.customerRef)) continue;
    if (!HISTORY_GRADE_PROVENANCE.has(placement.bindingProvenance ?? "")) continue;
    if (seen.has(placement.orderNumber)) continue;
    seen.add(placement.orderNumber);
    kept.push(placement);
  }
  return kept;
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
): Promise<readonly EarlyAccessCartHistoryEntry[]> {
  if (!deps.cartOrders) return [];
  const owned = await ownedHandles(deps, memberId);
  if (owned.size === 0) return [];

  const rows = await deps.cartOrders.checkoutsForCustomers(Array.from(owned));
  if (!Array.isArray(rows)) return [];

  const seen = new Set<string>();
  const kept: EarlyAccessCartHistoryEntry[] = [];
  for (const row of rows) {
    const entry = readCartHistoryEntry(row);
    if (entry === null) continue;
    // THE RE-CHECK, same reason as the placements above.
    if (!owned.has(entry.customerRef)) continue;
    if (seen.has(entry.cartCheckoutNumber)) continue;
    seen.add(entry.cartCheckoutNumber);
    kept.push(entry);
  }
  return kept;
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
export function earlyAccessOrderSummary(placement: EarlyAccessPlacement): OrderSummaryDto {
  return {
    // The Early Access order number, unchanged. It is the identifier the
    // customer already has on their invoice, so the two agree.
    orderId: placement.orderNumber,
    state: PAYMENT_STATE_TO_ORDER_STATE[placement.paymentState] ?? "exception",
    placedAt: placement.placedAt,
    totalCents: placement.order.money.payableTotalCents,
    // P1-A monetary FACTS: this lane's own invariant is that money counts as
    // received ONLY at verification, so verified-captured is authoritatively
    // the payable total on a verified placement and authoritatively zero on
    // everything else (awaiting / under review / rejected — a customer's
    // unverified claim of payment is not capture evidence). The lane has no
    // refund concept, so refunded is authoritatively zero, never null.
    payment: {
      amountDueCents: placement.order.money.payableTotalCents,
      amountCapturedCents:
        placement.paymentState === "payment_verified"
          ? placement.order.money.payableTotalCents
          : 0,
      amountRefundedCents: 0,
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
export function earlyAccessOrderDetail(placement: EarlyAccessPlacement): OrderDetailDto {
  const line = placement.order.order.line;
  return {
    ...earlyAccessOrderSummary(placement),
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
  return {
    async listForMember(memberId: string): Promise<OrderSummaryDto[]> {
      const [own, placements, cartEntries] = await Promise.all([
        base.listForMember(memberId),
        ownedPlacements(deps, memberId),
        ownedCartEntries(deps, memberId),
      ]);
      const merged = [
        ...own,
        ...placements.map(earlyAccessOrderSummary),
        ...cartEntries.map(cartOrderSummary),
      ];
      return merged.sort((a, b) =>
        a.placedAt === b.placedAt
          ? a.orderId.localeCompare(b.orderId)
          : b.placedAt.localeCompare(a.placedAt),
      );
    },

    async getForMember(memberId: string, orderId: string): Promise<OrderDetailDto | null> {
      // The base service owns its own id space and its own ownership rule, so
      // it is asked first and its answer wins.
      const own = await base.getForMember(memberId, orderId);
      if (own !== null) return own;
      if (typeof orderId !== "string" || orderId === "") return null;

      // Resolved through the SAME ownership path as the list, not by looking the
      // order up and then asking whether it belongs to this member. A foreign
      // order is therefore never read at all, so a probe cannot distinguish
      // another member's order from one that does not exist.
      const placements = await ownedPlacements(deps, memberId);
      const match = placements.find((placement) => placement.orderNumber === orderId);
      if (match !== undefined) return earlyAccessOrderDetail(match);

      // Cart checkouts occupy their own id space (XEC- against XEA-), and take
      // the same ownership-first resolution for the same probe-resistance
      // reason.
      const cartEntries = await ownedCartEntries(deps, memberId);
      const cartMatch = cartEntries.find((entry) => entry.cartCheckoutNumber === orderId);
      return cartMatch === undefined ? null : cartOrderDetail(cartMatch);
    },
  };
}
