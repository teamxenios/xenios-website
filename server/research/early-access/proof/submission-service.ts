/**
 * THE CUSTOMER PROOF SUBMISSION SERVICE.
 *
 * ORDER OF OPERATIONS, AND WHY IT IS THIS ORDER.
 *
 *   1. Rate limit, before any work is done on behalf of a repeating caller.
 *   2. Resolve the checkout and prove ownership, before anything is validated,
 *      so a caller cannot use validation errors to probe for other people's
 *      orders.
 *   3. Resolve the legal binding, because a submission is recorded against a
 *      member identity and the contract's record has nowhere to put a missing
 *      one.
 *   4. Re-check the agreement package. `proof_submission` is one of the four
 *      checkpoints the contract names, and the point of naming them is that a
 *      lane cannot quietly check three.
 *   5. Resolve the chosen payment method against the LIVE server presentation.
 *      Before the bytes, because a method that is not enabled makes the upload
 *      pointless and there is no reason to spend 8 MB of validation on it.
 *   6. Validate the bytes structurally.
 *   7. Persist the row, with acceptance `not_attempted`. BEFORE the send.
 *   8. Send, inside a concurrency slot and a timeout.
 *   9. Record the acceptance, distinguishing accepted from unknown from failed.
 *
 * STEP 7 IS THE ONE THAT MATTERS. If the row were written after the send, a
 * crash between provider acceptance and the write would leave an email in the
 * internal inbox with nothing in our system referring to it, and a retry would
 * send a second copy. Writing first means the durable record always exists
 * before the side effect, so the worst case is a row whose acceptance is
 * unknown, which is a reconciliation task rather than a lost or duplicated
 * email.
 *
 * WHAT THIS SERVICE CANNOT DO. It has no settlement port, no supplier port and
 * no receipt port, so a customer uploading a screenshot cannot verify a payment
 * or release a supplier, and that is enforced by the absence of the capability
 * rather than by a check that could be removed. It also has no checkout
 * creation port, so no retry, no double click and no replay can produce a
 * second order.
 */

import type { EarlyAccessCartCheckoutRecord } from "@shared/research/early-access-cart";
import type {
  EarlyAccessAgreementAuthority,
  EarlyAccessInternalEmailAcceptance,
  EarlyAccessLegalBindingDirectory,
} from "../hardening-contract";
import {
  buildInternalOrderPacket,
  assertPacketCarriesNoBytes,
  renderInternalOrderEmail,
  type InternalOrderEmailSender,
  type ProductDisplayPort,
} from "./internal-order-email";
import type { EarlyAccessProofPaymentPresentationPort } from "./payment-presentation";
import {
  alreadySent,
  pendingSubmission,
  proofProviderIdempotencyKey,
  sendLeaseHeld,
  type ProofSubmissionRow,
  type ProofSubmissionStore,
} from "./submission-record";
import {
  createSendSemaphore,
  createSubmissionRateLimiter,
  SendCapacityExhausted,
  withSendTimeout,
  type SendSemaphore,
  type SubmissionRateLimiter,
} from "./concurrency";
import { validateTransientProof, type TransientProofRefusalCode } from "./transient-proof";
import type { PdfStructuralParser } from "./containers";

/**
 * A proof is accepted only while payment is genuinely open.
 *
 * `under_review` is included because a customer whose first screenshot was
 * unclear must be able to send a better one. `payment_verified` and
 * `payment_rejected` are both closed: the first because there is nothing left
 * to prove, the second because a rejected payment needs a human rather than
 * another upload.
 */
const PROOF_ACCEPTING_PAYMENT_STATES = Object.freeze(["awaiting_payment", "under_review"]);

export type ProofSubmissionRefusal =
  | "session_required"
  | "not_found"
  | "payment_closed"
  | "checkout_superseded"
  | "binding_absent"
  | "binding_unverified"
  | "binding_owner_mismatch"
  | "agreements_not_current"
  | "method_required"
  | "method_not_enabled"
  | "presentation_unavailable"
  | "rate_limited"
  | "capacity_exhausted"
  | "store_unavailable"
  | "send_failed"
  | TransientProofRefusalCode;

export type ProofSubmissionOutcome =
  /** Provider accepted and our record agrees. */
  | Readonly<{ ok: true; state: "submitted"; row: ProofSubmissionRow }>
  /**
   * The email may exist and our record could not be confirmed. The customer
   * projection turns this into `needs_retry`, which is true and actionable,
   * and the admin projection carries the reconciliation item.
   */
  | Readonly<{ ok: true; state: "unconfirmed"; row: ProofSubmissionRow }>
  /** This exact claim was already accepted. No second email was sent. */
  | Readonly<{ ok: true; state: "already_submitted"; row: ProofSubmissionRow }>
  | Readonly<{ ok: false; code: ProofSubmissionRefusal }>;

export interface ProofSubmissionDeps {
  readonly checkouts: {
    byCheckoutNumber(checkoutNumber: string): Promise<EarlyAccessCartCheckoutRecord | null>;
  };
  readonly submissions: ProofSubmissionStore;
  /** Session 4's seam. Read only: this lane never creates a binding. */
  readonly bindings: EarlyAccessLegalBindingDirectory;
  /** Recomputed here, at the `proof_submission` checkpoint. */
  readonly agreements: EarlyAccessAgreementAuthority;
  readonly presentation: EarlyAccessProofPaymentPresentationPort;
  readonly products: ProductDisplayPort;
  readonly sender: InternalOrderEmailSender;
  readonly pdfParser: PdfStructuralParser;
  readonly now: () => number;
  readonly semaphore?: SendSemaphore;
  readonly rateLimiter?: SubmissionRateLimiter;
  readonly maxBytes?: number;
}

export interface ProofSubmissionRequest {
  /** Server resolved from the session. Never read from the body. */
  readonly customer: Readonly<{ customerRef: string; aliases?: readonly string[] }>;
  readonly cartCheckoutNumber: string;
  readonly bytes: Uint8Array;
  readonly declaredContentType: unknown;
  readonly declaredFilename: unknown;
  /** The customer's explicit choice. There is no default. */
  readonly method: unknown;
}

function refuse(code: ProofSubmissionRefusal): ProofSubmissionOutcome {
  return Object.freeze({ ok: false as const, code });
}

/**
 * Record the acceptance, and never let a recording failure be mistaken for a
 * send failure.
 *
 * Resolves to the row when the write landed and null when it did not. A null
 * leaves the durable row as it was, which is `not_attempted`, and a
 * `not_attempted` row older than the lease is precisely the "a send was
 * attempted and we do not know what happened" signal an operator needs.
 * Nothing is invented to fill the gap.
 */
async function recordAcceptance(
  store: ProofSubmissionStore,
  input: {
    readonly submissionId: string;
    readonly acceptance: EarlyAccessInternalEmailAcceptance;
    readonly providerMessageId: string | null;
    readonly lastError: string | null;
    readonly at: string;
  },
): Promise<ProofSubmissionRow | null> {
  try {
    return await store.recordAcceptance(input);
  } catch {
    return null;
  }
}

export function createProofSubmissionService(deps: ProofSubmissionDeps) {
  const semaphore = deps.semaphore ?? createSendSemaphore();
  const rateLimiter = deps.rateLimiter ?? createSubmissionRateLimiter();

  return async function submitProof(
    request: ProofSubmissionRequest,
  ): Promise<ProofSubmissionOutcome> {
    const nowMs = deps.now();
    const at = new Date(nowMs).toISOString();

    if (!rateLimiter.admit(request.customer.customerRef, nowMs)) {
      return refuse("rate_limited");
    }

    // ---- the checkout, and that it is this customer's ----------------------
    let checkout: EarlyAccessCartCheckoutRecord | null;
    try {
      checkout = await deps.checkouts.byCheckoutNumber(request.cartCheckoutNumber);
    } catch {
      return refuse("store_unavailable");
    }
    const owners = [request.customer.customerRef, ...(request.customer.aliases ?? [])];
    if (checkout === null || !owners.includes(checkout.customerRef)) {
      // The same answer an unknown checkout gets, so this route cannot be used
      // to discover that an order exists.
      return refuse("not_found");
    }
    if (checkout.disposition === "duplicate_superseded") return refuse("checkout_superseded");
    if (!PROOF_ACCEPTING_PAYMENT_STATES.includes(checkout.paymentState)) {
      return refuse("payment_closed");
    }

    // ---- the legal identity this submission is recorded against ------------
    let binding: Awaited<ReturnType<EarlyAccessLegalBindingDirectory["forCustomer"]>>;
    try {
      binding = await deps.bindings.forCustomer(checkout.customerRef);
    } catch {
      return refuse("store_unavailable");
    }
    if (!binding.ok) return refuse(binding.code);

    let owns: boolean;
    try {
      owns = await deps.bindings.ownsCheckout(
        binding.binding.memberId,
        checkout.cartCheckoutNumber,
      );
    } catch {
      return refuse("store_unavailable");
    }
    // A binding that points at a member who does not own this checkout is the
    // contract's `binding_owner_mismatch`, and it answers the same way an
    // unowned checkout does rather than confirming the order exists.
    if (!owns) return refuse("binding_owner_mismatch");

    // ---- the agreement package, recomputed at this checkpoint ---------------
    let standing: Awaited<ReturnType<EarlyAccessAgreementAuthority["standingFor"]>>;
    try {
      standing = await deps.agreements.standingFor(binding.binding.memberId);
    } catch {
      return refuse("store_unavailable");
    }
    if (!standing.satisfied) return refuse("agreements_not_current");

    // ---- the method, from the live presentation ----------------------------
    if (request.method === undefined || request.method === null || request.method === "") {
      return refuse("method_required");
    }
    let payment: Awaited<ReturnType<EarlyAccessProofPaymentPresentationPort["resolveChosenMethod"]>>;
    try {
      payment = await deps.presentation.resolveChosenMethod(request.method);
    } catch {
      return refuse("presentation_unavailable");
    }
    if (payment.state === "unavailable") return refuse("presentation_unavailable");
    if (payment.state === "not_enabled") return refuse("method_not_enabled");

    // ---- the bytes ---------------------------------------------------------
    const validated = await validateTransientProof({
      bytes: request.bytes,
      declaredContentType: request.declaredContentType,
      declaredFilename: request.declaredFilename,
      pdfParser: deps.pdfParser,
      maxBytes: deps.maxBytes,
    });
    if (!validated.ok) return refuse(validated.code);
    const descriptor = validated.descriptor;

    // ---- the durable row, BEFORE the send ----------------------------------
    const draft = pendingSubmission({
      cartCheckoutNumber: checkout.cartCheckoutNumber,
      customerRef: checkout.customerRef,
      memberId: binding.binding.memberId,
      proofSha256: descriptor.sha256,
      filename: descriptor.filename,
      contentType: descriptor.contentType,
      byteSize: descriptor.byteSize,
      method: payment.snapshot,
      packageVersion: standing.packageVersion,
      at,
    });

    let claim: Awaited<ReturnType<ProofSubmissionStore["claimPending"]>>;
    try {
      claim = await deps.submissions.claimPending(draft);
    } catch {
      // Without a durable row there is no safe send: a provider acceptance
      // would be invisible to every later reconciliation.
      return refuse("store_unavailable");
    }

    // A resend of a claim the provider already took. The idempotency key would
    // also stop a duplicate, but answering here means the attachment is never
    // even encoded a second time.
    if (!claim.claimed && alreadySent(claim.row.internalEmailAcceptance)) {
      return Object.freeze({
        ok: true as const,
        state: "already_submitted" as const,
        row: claim.row,
      });
    }

    // A concurrent double click. The other request created the row moments ago
    // and is sending right now, so this one must not send a second copy.
    if (!claim.claimed && sendLeaseHeld(claim.row, nowMs)) {
      return Object.freeze({ ok: true as const, state: "unconfirmed" as const, row: claim.row });
    }

    const row = claim.row;
    const idempotencyKey = proofProviderIdempotencyKey(row.submissionId);

    // ---- the packet and the send ------------------------------------------
    const packet = await buildInternalOrderPacket({
      checkout,
      submission: row,
      filenameRewritten: descriptor.filenameRewritten,
      products: deps.products,
    });
    assertPacketCarriesNoBytes(packet);
    const rendered = renderInternalOrderEmail(packet);

    let sendResult: Awaited<ReturnType<InternalOrderEmailSender["send"]>>;
    try {
      sendResult = await semaphore.run(() =>
        withSendTimeout(() =>
          deps.sender.send({
            subject: rendered.subject,
            text: rendered.text,
            filename: descriptor.filename,
            contentType: descriptor.contentType,
            bytes: request.bytes,
            idempotencyKey,
          }),
        ),
      );
    } catch (error) {
      if (error instanceof SendCapacityExhausted) {
        // Nothing was sent and the row stays not_attempted, so a retry is
        // clean and the customer is told to try again.
        return refuse("capacity_exhausted");
      }
      // A timeout, or anything else escaping the send. The request may have
      // reached the provider, so this is ambiguous rather than failed.
      sendResult = Object.freeze({ outcome: "ambiguous" as const });
    }

    const completedAt = new Date(deps.now()).toISOString();

    if (sendResult.outcome === "refused") {
      await recordAcceptance(deps.submissions, {
        submissionId: row.submissionId,
        acceptance: "failed",
        providerMessageId: null,
        // A coded reason, never the provider's error object: that object holds
        // a reference to the request, and the request holds the attachment.
        lastError: "provider_refused",
        at: completedAt,
      });
      return refuse("send_failed");
    }

    if (sendResult.outcome === "ambiguous") {
      const stored = await recordAcceptance(deps.submissions, {
        submissionId: row.submissionId,
        acceptance: "unknown",
        providerMessageId: null,
        lastError: "provider_response_ambiguous",
        at: completedAt,
      });
      return Object.freeze({
        ok: true as const,
        state: "unconfirmed" as const,
        row: stored ?? { ...row, internalEmailAcceptance: "unknown" as const },
      });
    }

    // Accepted. The provider has custody. Whether our own write lands decides
    // which of the two truthful answers the customer gets, and neither of them
    // claims the submission simply failed.
    const stored = await recordAcceptance(deps.submissions, {
      submissionId: row.submissionId,
      acceptance: "accepted",
      providerMessageId: sendResult.providerMessageId,
      lastError: null,
      at: completedAt,
    });

    if (stored === null) {
      const fallback = await recordAcceptance(deps.submissions, {
        submissionId: row.submissionId,
        acceptance: "unknown",
        providerMessageId: null,
        lastError: "acceptance_write_failed",
        at: completedAt,
      });
      return Object.freeze({
        ok: true as const,
        state: "unconfirmed" as const,
        row: fallback ?? { ...row, internalEmailAcceptance: "unknown" as const },
      });
    }

    return Object.freeze({ ok: true as const, state: "submitted" as const, row: stored });
  };
}
