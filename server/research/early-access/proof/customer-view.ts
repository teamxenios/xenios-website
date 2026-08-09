/**
 * THE CUSTOMER PROJECTION.
 *
 * THE LEAK THIS CLOSES. The accelerator returned the submission record to the
 * customer, which meant the browser received the provider message id, the
 * internal recipient address, the submission key and the last internal error.
 * Each of those is an operational fact about how Xenios runs, and the provider
 * id and internal mailbox in particular are exactly what someone attacking a
 * manual payment rail would want.
 *
 * BUILT, NOT FILTERED. The view is a NEW object assembled from named fields of
 * the frozen `EarlyAccessSubmissionCustomerView`. A deny list would have to be
 * updated every time the row grows a field, and the update that gets forgotten
 * is the leak. Here a new field on the row is invisible to the customer until
 * somebody deliberately puts it here.
 *
 * WHY AN UNKNOWN ACCEPTANCE ASKS FOR A RETRY. The contract makes this call and
 * it is the right one. When the provider accepted but our confirming write
 * failed, the honest customer-facing answer is `needs_retry`: it is true (we
 * cannot confirm the submission completed) and it is actionable (uploading
 * again resolves it). It does not claim no email exists, and the ambiguity is
 * carried on the ADMIN projection as a reconciliation item for a named human.
 * A retry is safe because the submission identity and the provider idempotency
 * key are both derived from the file, so an already accepted message is
 * dropped by the provider rather than sent twice.
 */

import {
  type EarlyAccessSubmissionCustomerState,
  type EarlyAccessSubmissionCustomerView,
} from "@shared/research/early-access-hardening";
import { earlyAccessPaymentOptionLabel } from "@shared/research/early-access-payment-options";
import type { ProofSubmissionRow } from "./submission-record";

/** The empty view, for a checkout with no submission yet. */
export function noSubmissionYet(): EarlyAccessSubmissionCustomerView {
  return Object.freeze({
    state: "not_started" as const,
    method: null,
    methodLabel: null,
    filename: null,
    acceptedAt: null,
    retryAllowed: true,
  });
}

function customerState(row: ProofSubmissionRow): EarlyAccessSubmissionCustomerState {
  switch (row.internalEmailAcceptance) {
    case "accepted":
      return "accepted_for_review";
    case "not_attempted":
      return "in_progress";
    case "unknown":
    case "failed":
      return "needs_retry";
  }
}

/**
 * Project one durable row for the browser.
 *
 * `acceptedAt` is populated only in the state that genuinely means accepted, so
 * a customer is never shown a timestamp that implies a completion we cannot
 * confirm.
 */
export function customerSubmissionView(
  row: ProofSubmissionRow,
): EarlyAccessSubmissionCustomerView {
  const state = customerState(row);
  return Object.freeze({
    state,
    method: row.method.code,
    methodLabel: earlyAccessPaymentOptionLabel(row.method.code),
    filename: row.filename,
    acceptedAt: state === "accepted_for_review" ? row.updatedAt : null,
    // A retry is allowed in every state except the one where the proof is
    // already in hand. It never creates a second checkout and never creates a
    // second successful submission identity.
    retryAllowed: state !== "accepted_for_review",
  });
}

/**
 * The exact keys a customer response may carry.
 *
 * Exported so a test asserts the shape rather than restating it, which keeps
 * the test honest: a widened view fails instead of silently passing a test
 * written against the old shape.
 */
export const CUSTOMER_SUBMISSION_VIEW_KEYS = Object.freeze([
  "state",
  "method",
  "methodLabel",
  "filename",
  "acceptedAt",
  "retryAllowed",
] as const);
