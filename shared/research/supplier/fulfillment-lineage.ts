import type { FulfillmentActor } from "../fulfillment/contracts";

export type InternalFulfillmentActor = Extract<FulfillmentActor, { kind: "internal" }>;

/** A projection of the canonical fulfillment-order foreign key, not a new order record. */
export interface CanonicalFulfillmentOrderLineage {
  fulfillmentOrderId: string;
  orderId: string;
  orderReference: string;
}

export interface AuthorizedFulfillmentOrderLineage {
  /** The verified storage actor for whose authorized records this read was made. */
  actorId: string;
  rows: readonly CanonicalFulfillmentOrderLineage[];
}

/**
 * Root supplies an existing, read-only canonical order/fulfillment authority.
 * It must recheck current actor scope in storage and resolve the actual FK;
 * neither a matching reference nor a fulfillment UUID establishes orderId.
 * Missing, duplicate or out-of-scope facts are not a complete answer.
 */
export interface FulfillmentOrderLineagePort {
  read(
    actor: InternalFulfillmentActor,
    fulfillmentOrderIds: readonly string[],
  ): Promise<AuthorizedFulfillmentOrderLineage>;
}
