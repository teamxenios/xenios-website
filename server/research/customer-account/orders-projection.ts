// Research-order projection for the customer account portal, over the ONE
// composed member orders service (commerce orders decorated with the Early
// Access XEA- member history at the composition root). This module rewrites
// no order system: it reads the same listForMember/getForMember pair the
// member orders API serves and reshapes it into the portal vocabulary.
//
// Truthfulness rules:
//   - Item labels and quantities come from the order DETAIL lines, never
//     invented. A complete history requires the matching detail or fails the
//     whole read. A source-declared partial history preserves its validated
//     summaries but leaves detail unavailable, because an omitted competing
//     row can make an opaque reference ambiguous.
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
  OrderHistorySourceKey,
  OrderSourceStateDto,
  OrderPaymentDisplayState,
  OrderSummaryDto as PortalOrderSummaryDto,
} from "@shared/research/customer-account/contract";
import { orderHistoryAvailability } from "@shared/research/customer-account/contract";
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
  /**
   * Optional per-read envelope. Readers whose completeness depends on bounded
   * or malformed upstream data return the rows and the exact source states
   * from the same read, avoiding a static declaration that can overclaim.
   */
  listForMemberWithHistory?(memberId: string): Promise<Readonly<{
    rows: unknown[];
    historySources: Readonly<Record<OrderHistorySourceKey, OrderSourceStateDto>>;
  }>>;
  getForMember(memberId: string, orderId: string): Promise<unknown>;
  /**
   * Capabilities carried by this exact constructed reader. Composition-time
   * environment guesses are deliberately ignored: absent metadata fails
   * closed to an unavailable history.
   */
  historySources?: Readonly<Record<OrderHistorySourceKey, OrderSourceStateDto>>;
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
  currency: "USD";
}>;
type SummaryShape = Readonly<{
  orderId: string;
  recordKind: "order" | "request" | "unknown";
  state: OrderState;
  placedAt: string;
  totalCents: number;
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
  const totalCents = record.totalCents;
  if (
    typeof orderId !== "string" ||
    orderId === "" ||
    typeof placedAt !== "string" ||
    !Number.isSafeInteger(totalCents) ||
    (totalCents as number) < 0 ||
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
      v === null ? null : typeof v === "number" && Number.isSafeInteger(v) ? v : "malformed";
    const due = field(p.amountDueCents);
    const captured = field(p.amountCapturedCents);
    const refunded = field(p.amountRefundedCents);
    if (
      due !== "malformed" &&
      due !== null &&
      captured !== "malformed" &&
      refunded !== "malformed" &&
      p.currency === "USD"
    ) {
      payment = {
        amountDueCents: due,
        amountCapturedCents: captured,
        amountRefundedCents: refunded,
        currency: "USD",
      };
    }
  }
  const shipmentsSource = record.shipmentsSource === "connected" ? "connected" : "unavailable";
  const recordKind =
    record.recordKind === "order" || record.recordKind === "request"
      ? record.recordKind
      : "unknown";
  return {
    orderId,
    recordKind,
    state: state as OrderState,
    placedAt,
    totalCents: totalCents as number,
    shipments,
    payment,
    shipmentsSource,
  };
}

function asLines(value: unknown): readonly LineShape[] {
  const record = (value ?? {}) as Record<string, unknown>;
  if (!Array.isArray(record.lines)) return [];
  return record.lines.map((raw) => {
    const line = (raw ?? {}) as Record<string, unknown>;
    if (
      typeof line.displayName !== "string" ||
      line.displayName.trim() === "" ||
      !Number.isSafeInteger(line.quantity) ||
      (line.quantity as number) <= 0
    ) {
      throw new Error("order_shape_unrecognized");
    }
    return { displayName: line.displayName.trim(), quantity: line.quantity as number };
  });
}

function paymentFactsAgree(left: PaymentFactsShape | null, right: PaymentFactsShape | null): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.amountDueCents === right.amountDueCents &&
    left.amountCapturedCents === right.amountCapturedCents &&
    left.amountRefundedCents === right.amountRefundedCents &&
    left.currency === right.currency
  );
}

function shipmentFactsAgree(
  left: readonly ShipmentShape[],
  right: readonly ShipmentShape[],
): boolean {
  return (
    left.length === right.length &&
    left.every((shipment, index) => {
      const candidate = right[index];
      return (
        candidate !== undefined &&
        shipment.trackingNumber === candidate.trackingNumber &&
        shipment.carrier === candidate.carrier &&
        shipment.status === candidate.status
      );
    })
  );
}

/** Summary and detail are two reads of one durable record, not competing truth sources. */
function summaryFactsAgree(left: SummaryShape, right: SummaryShape): boolean {
  return (
    left.state === right.state &&
    left.placedAt === right.placedAt &&
    left.totalCents === right.totalCents &&
    left.shipmentsSource === right.shipmentsSource &&
    paymentFactsAgree(left.payment, right.payment) &&
    shipmentFactsAgree(left.shipments, right.shipments)
  );
}

// States reachable only before capture. A positive capture in one of these is
// a contradiction, but a null monetary fact is still unknown — lifecycle is
// not a substitute for ledger evidence.
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
//   captured = due, refunded = captured → refunded
//   inconsistent/malformed/negative    → unknown
// Lifecycle may flag a contradiction but never fills a missing money fact.
function paymentFromFacts(
  facts: PaymentFactsShape | null,
  state: OrderState,
): OrderPaymentDisplayState {
  if (facts === null) return "unknown";

  const captured = facts.amountCapturedCents;
  const refunded = facts.amountRefundedCents;
  if (captured === null || refunded === null) return "unknown";

  // Malformed or contradictory money is never presented as a state:
  if (captured < 0 || refunded < 0 || facts.amountDueCents < 0) return "unknown";
  if (captured > 0 && PRE_CAPTURE_STATES.has(state)) return "unknown"; // money moved in a pre-capture lifecycle
  if (state === "refunded" && refunded === 0) return "unknown"; // lifecycle says refunded, money says nothing came back
  if (captured > facts.amountDueCents) return "unknown"; // over-capture is an exception, never "paid"
  if (captured > 0 && captured < facts.amountDueCents) return "unknown"; // no partial-payment display state
  if (refunded > captured) return "unknown"; // more returned than captured is contradictory
  if (
    captured === 0 &&
    !PRE_CAPTURE_STATES.has(state) &&
    state !== "cancelled" &&
    state !== "exception"
  ) {
    return "unknown";
  }

  if (captured === 0 && refunded === 0) return "unpaid";
  if (captured > 0 && refunded === 0) return "paid";
  if (captured > 0 && refunded > 0 && refunded < captured) return "partially_refunded";
  if (captured > 0 && refunded === captured) return "refunded";
  // captured === 0 with refunded > 0: money came back that never went out.
  return "unknown";
}

/** Carrier-reported movement evidence. A label/tracking number alone is not handoff. */
function hasShippedEvidence(shipments: readonly ShipmentShape[]): boolean {
  return shipments.some((shipment) => {
    const status = (shipment.status ?? "").trim().toLowerCase();
    return status === "shipped" || status === "in_transit" || status === "delivered";
  });
}

/** Delivered is strictly stronger than shipped; only an arrived status proves it. */
function hasDeliveredEvidence(shipments: readonly ShipmentShape[]): boolean {
  return (
    shipments.length > 0 &&
    shipments.every(
      (shipment) => (shipment.status ?? "").trim().toLowerCase() === "delivered",
    )
  );
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
      return hasShippedEvidence(shipments) ? "shipped" : "unknown";
    case "delivered":
      return hasDeliveredEvidence(shipments) ? "delivered" : "unknown";
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

function trackingUrlOf(
  shipments: readonly ShipmentShape[],
  shipmentsSource: "connected" | "unavailable",
): string | null {
  if (shipmentsSource !== "connected") return null;
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
    const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    if (!Number.isSafeInteger(quantity)) throw new Error("order_shape_unrecognized");
    return {
      detailAvailability: "available",
      itemLabel: `${lines.length} items`,
      variantLabel: null,
      quantity,
    };
  }
  return { detailAvailability: "unavailable", itemLabel: null, variantLabel: null, quantity: null };
}

/**
 * A reader without self-described capabilities is unavailable. Specific
 * production branches attach their own `historySources`; the composition root
 * cannot upgrade this default with environment flags.
 */
const DISCONNECTED_HISTORY_SOURCES: Readonly<
  Record<OrderHistorySourceKey, OrderSourceStateDto>
> = Object.freeze({
  commerce: Object.freeze({ connected: false, complete: false }),
  xea: Object.freeze({ connected: false, complete: false }),
  xec: Object.freeze({ connected: false, complete: false }),
  xrr: Object.freeze({ connected: false, complete: false }),
});

export const DEFAULT_ORDER_HISTORY_AVAILABILITY: OrderHistoryAvailabilityDto = Object.freeze({
  availability: "unavailable",
  authoritativeRecordCount: null,
  sources: DISCONNECTED_HISTORY_SOURCES,
});

function normalizedHistorySources(
  declared: Readonly<Record<OrderHistorySourceKey, OrderSourceStateDto>> | undefined,
): Readonly<Record<OrderHistorySourceKey, OrderSourceStateDto>> {
  if (declared === undefined) return DISCONNECTED_HISTORY_SOURCES;
  const normalized = {} as Record<OrderHistorySourceKey, OrderSourceStateDto>;
  for (const key of ["commerce", "xea", "xec", "xrr"] as const) {
    const state = declared[key];
    if (
      state === undefined ||
      typeof state.connected !== "boolean" ||
      typeof state.complete !== "boolean" ||
      (state.complete && !state.connected)
    ) {
      return DISCONNECTED_HISTORY_SOURCES;
    }
    normalized[key] = Object.freeze({ connected: state.connected, complete: state.complete });
  }
  return Object.freeze(normalized);
}

function historyOf(
  sources: Readonly<Record<OrderHistorySourceKey, OrderSourceStateDto>>,
  recordCount: number,
): OrderHistoryAvailabilityDto {
  const availability = orderHistoryAvailability(sources);
  return availability === "complete"
    ? Object.freeze({ availability, authoritativeRecordCount: recordCount, sources })
    : Object.freeze({ availability, authoritativeRecordCount: null, sources });
}

type LegacyHistoryDeclaration = Readonly<{
  availability: "complete" | "partial" | "unavailable";
  sources: Readonly<{
    readonly commerce: OrderSourceStateDto;
    readonly xea: OrderSourceStateDto;
    readonly xec: OrderSourceStateDto;
    readonly xrr: OrderSourceStateDto;
  }>;
}>;

export function createCommerceOrdersPort(
  source: CommerceOrdersSource,
  // Kept temporarily so the protected composition root compiles while Lead
  // removes its environment-derived declaration. It is intentionally ignored:
  // only metadata on the exact constructed source is authoritative.
  _legacyHistory?: LegacyHistoryDeclaration,
): CustomerOrdersPort {
  return {
    async ordersFor(memberKey) {
      const read = source.listForMemberWithHistory
        ? await source.listForMemberWithHistory(memberKey)
        : {
            rows: await source.listForMember(memberKey),
            historySources: normalizedHistorySources(source.historySources),
          };
      if (!Array.isArray(read.rows)) throw new Error("order_history_rows_unavailable");
      const rows = read.rows;
      const prepared = rows.map((row) => ({ row, summary: asSummary(row) }));
      const declaredSources = normalizedHistorySources(read.historySources);
      const referenceCounts = new Map<string, number>();
      for (const { summary } of prepared) {
        referenceCounts.set(summary.orderId, (referenceCounts.get(summary.orderId) ?? 0) + 1);
      }
      const hasReferenceCollision = Array.from(referenceCounts.values()).some((count) => count > 1);
      const detailReferencesAreDefinitive =
        !hasReferenceCollision && orderHistoryAvailability(declaredSources) === "complete";
      const research: PortalOrderSummaryDto[] = await Promise.all(
        prepared.map(async ({ summary }) => {
          const referenceIsAmbiguous = (referenceCounts.get(summary.orderId) ?? 0) > 1;
          // A partial source or ambiguous reference prevents the independent
          // detail read that would reconcile producer kind evidence. Keep the
          // row, but do not turn the unreconciled summary into a definitive
          // order/request claim.
          let recordKind: PortalOrderSummaryDto["recordKind"] =
            detailReferencesAreDefinitive ? summary.recordKind : "unknown";
          let labels = labelsFrom([]);
          if (!referenceIsAmbiguous && detailReferencesAreDefinitive) {
            const detail = await source.getForMember(memberKey, summary.orderId);
            if (detail === null || detail === undefined) {
              // Listed but unreadable: fail the whole read closed rather than
              // render an order row with invented contents.
              throw new Error("order_detail_unavailable");
            }
            const detailSummary = asSummary(detail);
            if (detailSummary.orderId !== summary.orderId) {
              throw new Error("order_detail_identity_mismatch");
            }
            if (!summaryFactsAgree(summary, detailSummary)) {
              throw new Error("order_detail_truth_mismatch");
            }
            // An identifier prefix is never evidence. For a unique reference,
            // retain a specific kind only when the two exact producer views
            // agree; unknown or conflicting evidence stays neutral.
            recordKind = detailSummary.recordKind === summary.recordKind
              ? summary.recordKind
              : "unknown";
            labels = labelsFrom(asLines(detail));
          }
          return {
            reference: summary.orderId,
            recordKind,
            placedAt: summary.placedAt,
            detailAvailability: labels.detailAvailability,
            itemLabel: labels.itemLabel,
            variantLabel: labels.variantLabel,
            quantity: labels.quantity,
            paymentState: paymentFromFacts(summary.payment, summary.state),
            fulfillmentState: fulfillmentOf(summary.state, summary.shipments, summary.shipmentsSource),
            trackingUrl: trackingUrlOf(summary.shipments, summary.shipmentsSource),
            lotCoaAvailable: false,
          };
        }),
      );
      // References are opaque. A repeated value may be two real records from
      // different stores, so prefixes cannot justify discarding either one or
      // binding both to one ambiguous detail lookup. Preserve every summary and
      // downgrade every connected source: the combined result is not complete.
      const historySources = hasReferenceCollision
        ? Object.freeze(Object.fromEntries(
            (Object.keys(declaredSources) as OrderHistorySourceKey[]).map((key) => [
              key,
              declaredSources[key].connected
                ? Object.freeze({ connected: true, complete: false })
                : declaredSources[key],
            ]),
          )) as Readonly<Record<OrderHistorySourceKey, OrderSourceStateDto>>
        : declaredSources;
      const history = historyOf(
        historySources,
        research.length,
      );
      return {
        research,
        carePharmacy: [],
        carePharmacyHistory: {
          availability: "unavailable",
          authoritativeRecordCount: null,
        },
        history,
      };
    },
  };
}
