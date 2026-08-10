import { useCallback, useState, type FormEvent } from "react";
import {
  approveEarlyAccessAdminPayment,
  getEarlyAccessAdminPaymentReview,
  type EarlyAccessAdminApprovalInput,
  type EarlyAccessAdminPaymentReviewDto,
} from "../../adapters/earlyAccessAdminPayment";
import { EarlyAccessPaymentApproval } from "./EarlyAccessPaymentApproval";
import { AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/early-access/payments: the named-admin payment review.
//
// This screen is the missing non-test caller of BOTH halves of the review: the
// GET projection the server computes, and the approval form that posts the one
// settlement action to the SAME path.
//
// It renders the form only after a real review has been fetched, and the form
// itself refuses to enable its button while `canApprove` is false, so an order
// with a blocker (no submission, an unreconciled one, agreements not current,
// already settled, superseded) has no approval action on the screen at all.
// That is the same rule the server enforces and the database enforces again;
// it is repeated here because a button an operator cannot see is a button
// nobody presses by accident.
//
// The screen deliberately holds NO catalogue of orders. An admin arrives with
// a checkout number, because approving a payment is a decision about one named
// order that a human already has in front of them, not something to browse.
// ---------------------------------------------------------------------------

const CHECKOUT = /^XEC-[A-Z0-9]{16,40}$/;

export function EarlyAccessPaymentReviewBody({ token }: { token: string }) {
  const [checkoutNumber, setCheckoutNumber] = useState("");
  const [review, setReview] = useState<EarlyAccessAdminPaymentReviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (number: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await getEarlyAccessAdminPaymentReview(token, number);
        if (result.kind === "ok") {
          setReview(result.data.review);
        } else {
          // The server answers 404 for a checkout that does not exist AND for
          // one this admin may not see, deliberately, so this message must not
          // imply the second. It says what is true for both.
          setReview(null);
          setError(
            result.kind === "unavailable"
              ? "The review could not be loaded right now."
              : "No Early Access order is readable at that checkout number.",
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const number = checkoutNumber.trim().toUpperCase();
    if (!CHECKOUT.test(number)) {
      setReview(null);
      setError("That is not an Early Access checkout number.");
      return;
    }
    void load(number);
  }

  // After an approval the projection has changed (it is now settled), so the
  // screen re-reads rather than assuming. An operator should see the state the
  // server reports, not the state the browser hoped for.
  const approve = useCallback(
    async (input: EarlyAccessAdminApprovalInput) => {
      const number = review?.cartCheckoutNumber ?? "";
      const result = await approveEarlyAccessAdminPayment(token, number, input);
      await load(number);
      if (result.kind === "ok") {
        return { ok: true as const, replayed: result.data.replayed };
      }
      // The refusal CODE is what the operator needs (submission_missing,
      // submission_unreconciled, agreements_not_current, ...), so it is passed
      // through rather than flattened into a sentence here.
      const code =
        result.kind === "denied"
          ? result.code
          : result.kind === "error"
            ? (result.code ?? "error")
            : result.kind;
      return { ok: false as const, code };
    },
    [token, review?.cartCheckoutNumber, load],
  );

  return (
    <div className="grid gap-6">
      <form className="card p-5 grid gap-3" onSubmit={submit} aria-label="Find an order to review">
        <label className="grid gap-2 body-s" htmlFor="ea-review-checkout-number">
          Early Access checkout number
          <input
            id="ea-review-checkout-number"
            className="input"
            value={checkoutNumber}
            onChange={(event) => setCheckoutNumber(event.currentTarget.value)}
            placeholder="XEC-…"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "LOADING…" : "LOAD REVIEW"}
        </button>
        {error ? (
          <p className="body-s" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {review ? <EarlyAccessPaymentApproval review={review} approve={approve} /> : null}
    </div>
  );
}

export default function EarlyAccessPaymentReview() {
  return (
    <AdminScreen
      title="Early Access payment review"
      lead="The read-only state of one order before a named human approves its payment: the customer's submitted proof, whether it reconciled, whether the legal package is current, and every blocker that stands in the way. Approval is a separate, deliberate action and is unavailable while any blocker remains."
    >
      {(token) => <EarlyAccessPaymentReviewBody token={token} />}
    </AdminScreen>
  );
}
