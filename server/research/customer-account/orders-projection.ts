// Research-order projection for the customer account portal, over the ONE
// composed member orders service (commerce orders decorated with the Early
// Access XEA- member history at the composition root). This module rewrites
// no order system: it reads the same listForMember/getForMember pair the
// member orders API serves and reshapes it into the portal vocabulary.
//
// Truthfulness rules:
//   - Item labels and quantities come from the order DETAIL lines, never
//     invented. A listed order whose detail cannot be read fails the WHOLE
//     read (ports contract: throw, don't compose a partially-true page).
//   - trackingUrl is emitted only for carriers with a known public tracking
//     URL shape (USPS/UPS/FedEx); an unknown carrier yields null rather than
//     a guessed link.
//   - lotCoaAvailable is false until an approved COA is actually retrievable
//     through a composed certificate source (the production provider is
//     Disabled today).
//   - carePharmacy stays [] — Care fulfillment has no durable authorized
//     source while the Care capability is disabled.

import type {
  OrderFulfillmentDisplayState,
  OrderHistoryAvailabilityDto,
  OrderPaymentDisplayState,
  OrderSummaryDto as PortalOrderSummaryDto,
} from "@shared/research/customer-account/contract";
import { ORDER_STATES, type OrderState } from "@shared/research/commerce";
import type { CustomerOrdersPort } from "./ports";

/**
 * The commerce lane types its wire dependencies as unknown on purpose, so
 * this source mirrors that shape and the projection NARROWS at runtime: a row
 * that does not carry the fields we present fails the read closed instead of
 * rendering a guessed order.
 */
export type CommerceOrdersSource = Readonly<{
  listForMember(memberId: string): Promise<unknown[]>;
  getForMember(memberId: string, orderId: string): Promise<unknown>;
}>;

type ShipmentShape = Readonly<{
  trackingNumber: string | null;
  carrier: string | null;
  status: string | null;
}>;
type PaymentFactsShape = Readonly<{
  amountDueCents: number;
  amountCapturedCents: number | null;
  amountRefundedCents: number | null;
}>;
type SummaryShape = Readonly<{
  orderId: string;
  state: OrderState;
  placedAt: string;
  shipments: readonly ShipmentShape[];
  /** Monetary FACTS from the wire, null when the source carries none (P1-A). */
  payment: PaymentFactsShape | null;
  /** Whether the producing source is connected to durable shipment facts (P1-B). */
  shipmentsSource: "connected" | "unavailable";
}>;
type LineShape = Readonly<{ displayName: string; quantity: number }>;

function asSummary(value: unknown): SummaryShape {
  const record = (value ?? {}) as Record<string, unknown>;
  const orderId = record.orderId;
  const state = record.state;
  const placedAt = record.placedAt;
  if (
    typeof orderId !== "string" ||
    orderId === "" ||
    typeof placedAt !== "string" ||
    typeof state !== "string" ||
    !(ORDER_STATES as readonly string[]).includes(state)
  ) {
    throw new Error("order_shape_unrecognized");
  }
  const shipments: ShipmentShape[] = Array.isArray(record.shipments)
    ? record.shipments.map((raw) => {
        const shipment = (raw ?? {}) as Record<string, unknown>;
        return {
          trackingNumber:
            typeof shipment.trackingNumber === "string" ? shipment.trackingNumber : null,
          carrier: typeof shipment.carrier === "string" ? shipment.carrier : null,
          status: typeof shipment.status === "string" ? shipment.status : null,
        };
      })
    : [];
  // Payment facts narrow strictly. Distinctions that matter:
  //   * absent/null payment object     → the source carries no facts (null).
  //   * a field explicitly null        → that ONE fact is unavailable.
  //   * a field carrying garbage       → the WHOLE object is discarded to
  //     null: malformed evidence must resolve to "unknown", and must never be
  //     reinterpreted as "fact unavailable" (which context could read as 0).
  // Negative integers survive narrowing on purpose — the canonical mapping
  // declares them unknown, rather than this layer quietly erasing them.
  let payment: PaymentFactsShape | null = null;
  const rawPayment = record.payment;
  if (typeof rawPayment === "object" && rawPayment !== null) {
    const p = rawPayment as Record<string, unknown>;
    const field = (v: unknown): number | null | "malformed" =>
      v === null ? null : typeof v === "number" && Number.isInteger(v) ? v : "malformed";
    const due = field(p.amountDueCents);
    const captured = field(p.amountCapturedCents);
    const refunded = field(p.amountRefundedCents);
    if (due !== "malformed" && due !== null && captured !== "malformed" && refunded !== "malformed") {
      payment = {
        amountDueCents: due,
        amountCapturedCents: captured,
        amountRefundedCents: refunded,
      };
    }
  }
  const shipmentsSource = record.shipmentsSource === "connected" ? "connected" : "unavailable";
  return { orderId, state: state as OrderState, placedAt, shipments, payment, shipmentsSource };
}

function asLines(value: unknown): readonly LineShape[] {
  const record = (value ?? {}) as Record<string, unknown>;
  if (!Array.isArray(record.lines)) return [];
  return record.lines.map((raw) => {
    const line = (raw ?? {}) as Record<string, unknown>;
    if (typeof line.displayName !== "string" || typeof line.quantity !== "number") {
      throw new Error("order_shape_unrecognized");
    }
    return { displayName: line.displayName, quantity: line.quantity };
  });
}

// States reachable only BEFORE any capture, per the shared transition table.
// In these states an absent capture amount is the authoritative fact that no
// money has been taken — the one place lifecycle may CONTEXTUALIZE a null.
const PRE_CAPTURE_STATES: ReadonlySet<OrderState> = new Set<OrderState>([
  "draft",
  "checkout_pending",
  "payment_authorized",
  "manual_review",
  "approved",
]);

// P1-A (2026-08-27, round 3): PAYMENT TRUTH COMES FROM MONETARY FACTS.
// The canonical mapping, verbatim from the review:
//   no authoritative source            → unknown
//   captured 0,  refunded 0            → unpaid
//   captured >0, refunded 0            → paid
//   captured >0, 0 < refunded < capt.  → partially_refunded
//   captured >0, refunded ≥ captured   → refunded
//   inconsistent/malformed/negative    → unknown
// Lifecycle state provides CONTEXT only: it may interpret a null capture as
// zero in provably pre-capture states, and it may flag a money/lifecycle
// contradiction as unknown. It may never independently produce financial
// truth — a "payment_captured" lifecycle with no capture evidence is unknown,
// and a "refunded" lifecycle with no refund evidence is unknown.
function paymentFromFacts(
  facts: PaymentFactsShape | null,
  state: OrderState,
): OrderPaymentDisplayState {
  if (facts === null) return "unknown";

  let captured = facts.amountCapturedCents;
  let refunded = facts.amountRefundedCents;

  // Contextual interpretation of ABSENT facts, never of present ones:
  if (captured === null) {
    if (PRE_CAPTURE_STATES.has(state)) captured = 0; // nothing was ever taken
    else return "unknown"; // post-capture lifecycle without capture evidence
  }
  if (refunded === null) {
    if (state === "refunded") return "unknown"; // refund lifecycle without refund evidence
    refunded = 0;
  }

  // Malformed or contradictory money is never presented as a state:
  if (captured < 0 || refunded < 0) return "unknown";
  if (facts.amountDueCents < 0) return "unknown";
  if (captured > 0 && PRE_CAPTURE_STATES.has(state)) return "unknown"; // money moved in a pre-capture lifecycle
  if (state === "refunded" && refunded === 0) return "unknown"; // lifecycle says refunded, money says nothing came back

  if (captured === 0 && refunded === 0) return "unpaid";
  if (captured > 0 && refunded === 0) return "paid";
  if (captured > 0 && refunded > 0 && refunded < captured) return "partially_refunded";
  if (captured > 0 && refunded >= captured) return "refunded";
  // captured === 0 with refunded > 0: money came back that never went out.
  return "unknown";
}

/** A shipment fact that actually evidences movement: a tracking number, or a carrier-reported moving/arrived status. */
function hasShipmentEvidence(shipments: readonly ShipmentShape[]): boolean {
  return shipments.some((shipment) => {
    const tracking = (shipment.trackingNumber ?? "").trim();
    const status = (shipment.status ?? "").trim().toLowerCase();
    return tracking !== "" || status === "shipped" || status === "in_transit" || status === "delivered";
  });
}

// Fulfillment truth (P1-B): a source that is NOT connected to durable
// shipment facts asserts nothing about the physical world — its rows are
// "unknown", never "unfulfilled" (an empty list from an unconnected source is
// absence of data, not absence of shipment). For connected sources,
// shipped/delivered still require actual shipment evidence; pre-shipment
// operational states remain lifecycle facts; refunded says nothing about
// where the goods are.
function fulfillmentOf(
  state: OrderState,
  shipments: readonly ShipmentShape[],
  shipmentsSource: "connected" | "unavailable",
): OrderFulfillmentDisplayState {
  if (shipmentsSource !== "connected") return "unknown";
  switch (state) {
    case "processing":
    case "partially_fulfilled":
      return "processing";
    case "fulfilled":
      return hasShipmentEvidence(shipments) ? "shipped" : "unknown";
    case "delivered":
      return hasShipmentEvidence(shipments) ? "delivered" : "unknown";
    case "cancelled":
      return "cancelled";
    case "refunded":
      return "unknown";
    case "exception":
    case "replaced":
      return "exception";
    default:
      return "unfulfilled";
  }
}

const CARRIER_TRACKING: Readonly<Record<string, (trackingNumber: string) => string>> =
  Object.freeze({
    usps: (n: string) =>
      `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
    ups: (n: string) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
    fedex: (n: string) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  });

function trackingUrlOf(shipments: readonly ShipmentShape[]): string | null {
  for (const shipment of shipments) {
    const carrier = (shipment.carrier ?? "").trim().toLowerCase();
    const trackingNumber = (shipment.trackingNumber ?? "").trim();
    const build = CARRIER_TRACKING[carrier];
    if (trackingNumber !== "" && build) return build(trackingNumber);
  }
  return null;
}

// P1-B: line detail is projected, never fabricated. An empty or absent lines
// array is an unavailable detail — no "Research order" placeholder, no fake
// quantity 0.
function labelsFrom(lines: readonly LineShape[]): {
  detailAvailability: "available" | "unavailable";
  itemLabel: string | null;
  variantLabel: string | null;
  quantity: number | null;
} {
  if (lines.length === 1) {
    return {
      detailAvailability: "available",
      itemLabel: lines[0].displayName,
      variantLabel: null,
      quantity: lines[0].quantity,
    };
  }
  if (lines.length > 1) {
    return {
      detailAvailability: "available",
      itemLabel: `${lines.length} items`,
      variantLabel: null,
      quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    };
  }
  return { detailAvailability: "unavailable", itemLabel: null, variantLabel: null, quantity: null };
}

/**
 * The DEFAULT availability declaration is the honest static truth of this
 * codebase today (P1-B): the assisted-order lane (XRR-) has no list-by-member
 * read at all, and the Early Access cart lane (XEC-) exists only behind an
 * unapplied candidate RPC. A composition that wires more must SAY so
 * explicitly; nothing defaults to "complete".
 */
export const DEFAULT_ORDER_HISTORY_AVAILABILITY: OrderHistoryAvailabilityDto = Object.freeze({
  availability: "partial",
  sources: Object.freeze({
    commerce: Object.freeze({ connected: true, complete: true }),
    xea: Object.freeze({ connected: false, complete: false }),
    xec: Object.freeze({ connected: false, complete: false }),
    xrr: Object.freeze({ connected: false, complete: false }),
  }),
});

export function createCommerceOrdersPort(
  source: CommerceOrdersSource,
  history: OrderHistoryAvailabilityDto = DEFAULT_ORDER_HISTORY_AVAILABILITY,
): CustomerOrdersPort {
  return {
    async ordersFor(memberKey) {
      const rows = await source.listForMember(memberKey);
      const research: PortalOrderSummaryDto[] = await Promise.all(
        rows.map(async (row) => {
          const summary = asSummary(row);
          const detail = await source.getForMember(memberKey, summary.orderId);
          if (detail === null || detail === undefined) {
            // Listed but unreadable: fail the whole read closed rather than
            // render an order row with invented contents.
            throw new Error("order_detail_unavailable");
          }
          const labels = labelsFrom(asLines(detail));
          return {
            reference: summary.orderId,
            placedAt: summary.placedAt,
            detailAvailability: labels.detailAvailability,
            itemLabel: labels.itemLabel,
            variantLabel: labels.variantLabel,
            quantity: labels.quantity,
            paymentState: paymentFromFacts(summary.payment, summary.state),
            fulfillmentState: fulfillmentOf(summary.state, summary.shipments, summary.shipmentsSource),
            trackingUrl: trackingUrlOf(summary.shipments),
            lotCoaAvailable: false,
          };
        }),
      );
      // P1-B dedupe: id spaces are disjoint by design, so a repeated
      // reference can only come from a source double-listing a row. First
      // occurrence wins deterministically (list order is the service's
      // newest-first sort with an id tiebreak).
      const seen = new Set<string>();
      const deduped = research.filter((order) => {
        if (seen.has(order.reference)) return false;
        seen.add(order.reference);
        return true;
      });
      return { research: deduped, carePharmacy: [], history };
    },
  };
}
