import type {
  StatusRecoveryStatusView,
  StatusRecoveryTimelineItem,
} from "../../../shared/research/status-recovery/contract";

const STATUS_COPY: Readonly<Record<string, Readonly<{
  label: string;
  happened: string;
  nextStep: string;
  owner: "customer" | "xenios";
}>>> = Object.freeze({
  submitted: Object.freeze({ label: "Received", happened: "Xenios received your request.", nextStep: "Xenios will review the request and contact you.", owner: "xenios" }),
  reviewing: Object.freeze({ label: "In review", happened: "Xenios is reviewing your request.", nextStep: "Wait for the review update from Xenios.", owner: "xenios" }),
  waiting_on_customer: Object.freeze({ label: "Waiting for you", happened: "Xenios needs information from you before the request can continue.", nextStep: "Check your email and reply to the latest Xenios request.", owner: "customer" }),
  identity_requested: Object.freeze({ label: "Identity information requested", happened: "Xenios requested identity information for this order.", nextStep: "Use the secure instructions Xenios provided, or contact support.", owner: "customer" }),
  identity_received: Object.freeze({ label: "Identity information received", happened: "Xenios received the requested identity information.", nextStep: "Xenios will continue the review.", owner: "xenios" }),
  agreements_pending: Object.freeze({ label: "Agreement needed", happened: "An agreement step is still required.", nextStep: "Follow the secure agreement instructions Xenios provided.", owner: "customer" }),
  agreements_complete: Object.freeze({ label: "Agreements complete", happened: "The required agreement step is complete.", nextStep: "Xenios will confirm the next order step.", owner: "xenios" }),
  payment_pending: Object.freeze({ label: "Payment pending", happened: "The order is waiting for the approved payment step.", nextStep: "Use only payment instructions sent through the approved Xenios process.", owner: "customer" }),
  payment_review: Object.freeze({ label: "Payment under review", happened: "Xenios is reviewing the submitted payment information.", nextStep: "Wait for Xenios to confirm the review result.", owner: "xenios" }),
  paid: Object.freeze({ label: "Payment verified", happened: "Xenios recorded payment as verified.", nextStep: "Xenios will coordinate fulfillment.", owner: "xenios" }),
  supplier_processing: Object.freeze({ label: "Processing", happened: "The order is being prepared for fulfillment.", nextStep: "Wait for a shipping update from Xenios.", owner: "xenios" }),
  shipped: Object.freeze({ label: "Shipped", happened: "The order has shipped.", nextStep: "Use the tracking update Xenios sent through the authorized order channel.", owner: "customer" }),
  delivered: Object.freeze({ label: "Delivered", happened: "The order is recorded as delivered.", nextStep: "Contact support if the delivery record does not match what happened.", owner: "customer" }),
  closed: Object.freeze({ label: "Closed", happened: "This request is closed.", nextStep: "Contact support if you still need help with this reference.", owner: "customer" }),
  cancelled: Object.freeze({ label: "Cancelled", happened: "This request is cancelled.", nextStep: "Contact support if you have a question about the cancellation.", owner: "customer" }),
});

export function buildStatusRecoveryView(input: Readonly<{
  reference: string;
  status: string;
  updatedAt: string;
  timeline: readonly StatusRecoveryTimelineItem[];
}>): StatusRecoveryStatusView {
  const copy = STATUS_COPY[input.status] ?? Object.freeze({
    label: "Update available",
    happened: "Xenios recorded an update for this request.",
    nextStep: "Contact support if you need help with this reference.",
    owner: "xenios" as const,
  });
  return Object.freeze({
    subjectType: "assisted_order" as const,
    reference: input.reference,
    status: input.status,
    statusLabel: copy.label,
    whatHappened: copy.happened,
    nextStep: copy.nextStep,
    nextStepOwner: copy.owner,
    returnPath: "/status" as const,
    supportPath: "/support" as const,
    updatedAt: input.updatedAt,
    timeline: Object.freeze(input.timeline.map((item) => Object.freeze({ ...item }))),
  });
}
