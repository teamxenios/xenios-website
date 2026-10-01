export type AssistedOrderPaymentStatusCopy = Readonly<{
  label: string;
  line: string;
  happened: string;
  nextStep: string;
  owner: "customer" | "xenios";
}>;

const pending: AssistedOrderPaymentStatusCopy = Object.freeze({
  label: "Payment step paused",
  line: "Do not send funds based on this status. Contact Support for next steps.",
  happened: "The payment step is paused.",
  nextStep: "Do not send funds based on this status. Contact Support for next steps.",
  owner: "customer",
});
const review: AssistedOrderPaymentStatusCopy = Object.freeze({
  label: "Payment review",
  line: "Contact Support for the current payment status.",
  happened: "The payment status needs review.",
  nextStep: "Contact Support for the current payment status.",
  owner: "xenios",
});
const unverified: AssistedOrderPaymentStatusCopy = Object.freeze({
  label: "Payment record under review",
  line: "Contact Support before relying on this payment record.",
  happened: "This payment record needs verification before you can rely on it.",
  nextStep: "Contact Support for the current payment status.",
  owner: "xenios",
});
const verified: AssistedOrderPaymentStatusCopy = Object.freeze({
  label: "Payment verified",
  line: "Payment was verified against the accepted quote. Fulfillment eligibility is checked separately.",
  happened: "Payment was verified against the accepted quote.",
  nextStep: "Xenios will check fulfillment eligibility separately.",
  owner: "xenios",
});

/** The flag must come from the authorized server financial-state projection. */
export function assistedOrderPaymentStatusCopy(
  status: string,
  paymentVerified = false,
): AssistedOrderPaymentStatusCopy | null {
  if (status === "payment_pending") return pending;
  if (status === "payment_review") return review;
  if (status === "paid") return paymentVerified === true ? verified : unverified;
  return null;
}
