import type { EarlyAccessPaymentOptionCode } from "@shared/research/early-access-payment-options";

/**
 * THE CLIENT LANE'S PORT FOR SUBMITTING PAYMENT PROOF.
 *
 * This is a local port, not a shared contract. The proof and internal-email
 * lane owns the real submission service and the route behind it; this file
 * says only what the journey needs from it, so the journey can be built,
 * tested and reviewed before that route exists, and so the day it lands the
 * only change here is which function is passed in.
 *
 * THE PORT IS ABSENT BY DEFAULT AND THAT IS NOT A STUB. When no submitter is
 * supplied the screen says the customer submits through the concierge
 * instructions on their invoice, which is exactly what this deployment does
 * today. It does not render an uploader that throws away the file, and it does
 * not report a submission that never happened.
 *
 * TWO RULES ARE ENFORCED BY THE SHAPE OF THE TYPES, NOT BY REVIEW:
 *
 *  1. `EarlyAccessProofSubmitOutcome` has NO free-text field. There is nowhere
 *     to put a provider message id, a submission key, an internal recipient, a
 *     stack, or a raw server error, so none of them can reach a customer's
 *     screen by accident. Every outcome is a closed vocabulary the journey
 *     already has safe words for.
 *
 *  2. `recorded` means the server accepted the bytes. It does NOT mean the
 *     order is submitted, and it certainly does not mean the payment arrived.
 *     The journey answers both of those by re-reading the server's status
 *     projection, never by remembering that this call returned.
 */

export type EarlyAccessProofSubmitInput = Readonly<{
  cartCheckoutNumber: string;
  /** The method the customer says they paid with. Chosen, never defaulted. */
  methodCode: EarlyAccessPaymentOptionCode;
  file: File;
}>;

export type EarlyAccessProofSubmitOutcome =
  /** The server took the bytes. Truth about the order still comes from status. */
  | Readonly<{ kind: "recorded" }>
  /** The server refused the file itself. The customer can fix this and retry. */
  | Readonly<{ kind: "rejected"; reason: "type" | "size" | "empty" | "method" }>
  /** No submission door is open in this deployment. Not the customer's fault. */
  | Readonly<{ kind: "unavailable" }>
  /** The private session ended before the bytes were taken. */
  | Readonly<{ kind: "locked" }>
  /** Anything else at all. Deliberately carries no detail. */
  | Readonly<{ kind: "failed" }>;

export type EarlyAccessProofSubmitter = (
  input: EarlyAccessProofSubmitInput,
) => Promise<EarlyAccessProofSubmitOutcome>;
