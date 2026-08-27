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
  OrderSummaryDto as PortalOrderSummaryDto,
} from "@shared/research/customer-account/contract";
import type {
  OrderDetailDto as CommerceOrderDetailDto,
  OrderSummaryDto as CommerceOrderSummaryDto,
} from "@shared/research/commerce-api";
import type { OrderState } from "@shared/research/commerce";
import type { CustomerOrdersPort } from "./ports";

export type CommerceOrdersSource = Readonly<{
  listForMember(memberId: string): Promise<CommerceOrderSummaryDto[]>;
  getForMember(memberId: string, orderId: string): Promise<CommerceOrderDetailDto | null>;
}>;

// Money has moved (or moved and come back). "approved" is pre-capture and
// stays awaiting_payment: code cannot mark itself paid.
const PAID_STATES: ReadonlySet<OrderState> = new Set<OrderState>([
  "payment_captured",
  "processing",
  "partially_fulfilled",
  "fulfilled",
  "delivered",
  "refunded",
  "replaced",
]);

function fulfillmentOf(state: OrderState): OrderFulfillmentDisplayState {
  switch (state) {
    case "processing":
    case "partially_fulfilled":
      return "processing";
    case "fulfilled":
      return "shipped";
    case "delivered":
      return "delivered";
    case "cancelled":
    case "refunded":
      return "cancelled";
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

function trackingUrlOf(shipments: CommerceOrderSummaryDto["shipments"]): string | null {
  for (const shipment of shipments ?? []) {
    const carrier = (shipment.carrier ?? "").trim().toLowerCase();
    const trackingNumber = (shipment.trackingNumber ?? "").trim();
    const build = CARRIER_TRACKING[carrier];
    if (trackingNumber !== "" && build) return build(trackingNumber);
  }
  return null;
}

function labelsFrom(detail: CommerceOrderDetailDto): {
  itemLabel: string;
  variantLabel: string | null;
  quantity: number;
} {
  const lines = detail.lines ?? [];
  if (lines.length === 1) {
    return { itemLabel: lines[0].displayName, variantLabel: null, quantity: lines[0].quantity };
  }
  if (lines.length > 1) {
    return {
      itemLabel: `${lines.length} items`,
      variantLabel: null,
      quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    };
  }
  return { itemLabel: "Research order", variantLabel: null, quantity: 0 };
}

export function createCommerceOrdersPort(source: CommerceOrdersSource): CustomerOrdersPort {
  return {
    async ordersFor(memberKey) {
      const summaries = await source.listForMember(memberKey);
      const research: PortalOrderSummaryDto[] = await Promise.all(
        summaries.map(async (summary) => {
          const detail = await source.getForMember(memberKey, summary.orderId);
          if (detail === null) {
            // Listed but unreadable: fail the whole read closed rather than
            // render an order row with invented contents.
            throw new Error("order_detail_unavailable");
          }
          const labels = labelsFrom(detail);
          return {
            reference: summary.orderId,
            placedAt: summary.placedAt,
            itemLabel: labels.itemLabel,
            variantLabel: labels.variantLabel,
            quantity: labels.quantity,
            paymentState: PAID_STATES.has(summary.state) ? "paid" : "awaiting_payment",
            fulfillmentState: fulfillmentOf(summary.state),
            trackingUrl: trackingUrlOf(summary.shipments),
            lotCoaAvailable: false,
          };
        }),
      );
      return { research, carePharmacy: [] };
    },
  };
}
