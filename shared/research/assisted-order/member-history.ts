import type { AssistedOrderStatus } from "./contract";

/** A request is not a paid order. Estimates and operational status prove no money movement. */
export type AssistedOrderHistoryRequest = Readonly<{
  kind: "assisted_request";
  requestId: string;
  publicReference: string;
  status: AssistedOrderStatus;
  createdAt: string;
  updatedAt: string;
  estimatedTotalCents: number | null;
  currency: "USD";
  lines: readonly Readonly<{
    productName: string;
    specification: string | null;
    quantity: number;
    lineEstimateCents: number | null;
  }>[];
  /** Opaque operator-recorded reference, not a carrier number or a URL. */
  trackingReference: string | null;
}>;
