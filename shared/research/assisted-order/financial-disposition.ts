/** Browser intent is not a financial fact or permission. */
export type AssistedOrderNoFundsCancellationInput = Readonly<{
  evidenceHandle: string;
  intent: "cancel";
}>;

/** Voids, refunds, provider outcomes and historical-paid resolution stay held. */
export type AssistedOrderHeldDispositionKind = "void" | "refund" | "provider" | "historical_paid";

/** Narrow admin response: no bank evidence, source receipt, graph or actor label. */
export type AssistedOrderDispositionReceipt = Readonly<{
  dispositionId: string;
  requestId: string;
  kind: "no_funds";
  state: "cancelled";
  resolvedAt: string;
  replayed: boolean;
}>;

export const ASSISTED_ORDER_NO_FUNDS_CUSTOMER_MESSAGE =
  "Request cancelled. No funds were received for this request.";
