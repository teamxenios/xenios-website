// The assisted-order operational form identity (founder decision D-005).
//
// These are REQUEST FACTS, not legal documents: what the customer confirmed
// while submitting this request. They are persisted with the request through
// the same agreements array the certified migration already stores, but in
// their own namespace (`assisted_order_form_v1:<id>`), so they can never be
// mistaken for, or satisfy, a canonical legal requirement. The version slot
// carries the deterministic copy hash, so any drift in the displayed copy is
// visible in the stored fact. The canonical legal set stays exclusively with
// the legal port; nothing here touches the legal registry.
//
// The hashes are precomputed literals so this module stays importable from
// the client bundle. A server-side test recomputes each from the copy and
// fails the build on any mismatch, which is what makes the literals safe.

export const ASSISTED_ORDER_FORM_ID = "assisted_order_form_v1";

export type AssistedOrderFormAcknowledgment = Readonly<{
  id: string;
  copy: string;
  copyHash: string;
}>;

export const ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS: readonly AssistedOrderFormAcknowledgment[] =
  Object.freeze([
    Object.freeze({
      id: "accuracy",
      copy: "I confirm that the information I submitted is accurate.",
      copyHash: "f545766759175b6f",
    }),
    Object.freeze({
      id: "request_notice",
      copy: "I understand this is an order request. Xenios will confirm availability, pricing, documentation requirements, and next steps before fulfillment.",
      copyHash: "1df2384635b77cf5",
    }),
    Object.freeze({
      id: "contact_consent",
      copy: "I agree to be contacted by Xenios about this request.",
      copyHash: "e0faf435d0201e81",
    }),
  ]);

/** The exact (kind, version) pair a form acknowledgment persists as. */
export function assistedOrderFormPair(
  acknowledgment: Pick<AssistedOrderFormAcknowledgment, "id" | "copyHash">,
): Readonly<{ kind: string; version: string }> {
  return Object.freeze({
    kind: `${ASSISTED_ORDER_FORM_ID}:${acknowledgment.id}`,
    version: acknowledgment.copyHash,
  });
}
