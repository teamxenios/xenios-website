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
  /** "always", or the condition that makes it required. */
  scope: "always" | "research_use_only";
  copy: string;
  copyHash: string;
}>;

export type AssistedOrderFormAcknowledgmentScope = "always" | "research_use_only";

export const ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS: readonly AssistedOrderFormAcknowledgment[] =
  Object.freeze([
    Object.freeze({
      id: "accuracy",
      scope: "always" as const,
      copy: "I confirm that the information I provided is accurate to the best of my knowledge.",
      copyHash: "aeb2ba5a069dd3f4",
    }),
    Object.freeze({
      id: "contact_consent",
      scope: "always" as const,
      copy: "I agree that Xenios may contact me regarding this request and the next steps.",
      copyHash: "6da1cc70338029ed",
    }),
    Object.freeze({
      id: "request_notice",
      scope: "always" as const,
      copy: "I understand that this submission is an order request, not an accepted order or completed purchase. Xenios will confirm availability, pricing, documentation requirements, and the next steps before fulfillment.",
      copyHash: "22788ae1ac7cab44",
    }),
    // Conditional: required only when the request carries a Research Use Only
    // line, so a customer requesting nothing RUO is never asked to confirm a
    // limitation that does not apply to them.
    Object.freeze({
      id: "research_use_only",
      scope: "research_use_only" as const,
      copy: "For items identified as Research Use Only, I understand that they are offered solely for legitimate nonclinical research purposes and are not for human or veterinary use.",
      copyHash: "d5150651ebd86b89",
    }),
  ]);

/** The acknowledgments a request must carry, given what it actually contains. */
export function requiredAssistedOrderFormAcknowledgments(input: {
  readonly includesResearchUseOnly: boolean;
}): readonly AssistedOrderFormAcknowledgment[] {
  return ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.filter(
    (acknowledgment) =>
      acknowledgment.scope === "always" ||
      (acknowledgment.scope === "research_use_only" && input.includesResearchUseOnly),
  );
}

/** The exact (kind, version) pair a form acknowledgment persists as. */
export function assistedOrderFormPair(
  acknowledgment: Pick<AssistedOrderFormAcknowledgment, "id" | "copyHash">,
): Readonly<{ kind: string; version: string }> {
  return Object.freeze({
    kind: `${ASSISTED_ORDER_FORM_ID}:${acknowledgment.id}`,
    version: acknowledgment.copyHash,
  });
}
