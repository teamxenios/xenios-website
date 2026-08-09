import { useRef, useState } from "react";
import type {
  EarlyAccessAdminApprovalInput,
  EarlyAccessAdminPaymentReviewDto,
} from "../../adapters/earlyAccessAdminPayment";

export function EarlyAccessPaymentApproval({
  review,
  approve,
}: Readonly<{
  review: EarlyAccessAdminPaymentReviewDto;
  approve(input: EarlyAccessAdminApprovalInput): Promise<
    | Readonly<{ ok: true; replayed: boolean }>
    | Readonly<{ ok: false; code: string }>
  >;
}>) {
  const [fundsReceived, setFundsReceived] = useState(false);
  const [amountAndReference, setAmountAndReference] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [outcome, setOutcome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const ready =
    review.canApprove &&
    fundsReceived &&
    amountAndReference &&
    transactionId.trim().length >= 3 &&
    !busy;

  async function submit() {
    if (!ready || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setOutcome(null);
    try {
      const result = await approve({
        confirmedFundsReceived: true,
        confirmedAmountAndReference: true,
        externalTransactionId: transactionId.trim(),
      });
      setOutcome(
        result.ok
          ? result.replayed
            ? "This payment was already approved. No second release was created."
            : "Payment approved. The order is now processing."
          : `Approval refused: ${result.code.replace(/_/g, " ")}.`,
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-5" aria-labelledby="ea-payment-approval-heading">
      <div>
        <p className="mono-cap text-pulse">Early Access payment review</p>
        <h2 id="ea-payment-approval-heading" className="display-xs mt-2">
          Review order {review.cartCheckoutNumber}
        </h2>
      </div>

      <section className="card p-5" aria-label="Order and payment facts">
        <dl className="grid gap-3 body-s sm:grid-cols-[1fr_auto]">
          <dt>Invoice</dt><dd className="font-700">{review.invoiceNumber}</dd>
          <dt>Customer</dt><dd>{review.customer.email}</dd>
          <dt>Amount due</dt>
          <dd className="font-700">{(review.amountDueCents / 100).toFixed(2)} {review.currency}</dd>
          <dt>Payment reference</dt><dd className="font-700 break-all">{review.paymentReference}</dd>
          <dt>Submission</dt>
          <dd>{review.submission ? `${review.submission.methodName} · ${review.submission.filename}` : "Missing"}</dd>
          <dt>Agreement package</dt>
          <dd>{review.agreementCurrent ? "Current" : "Not current"}</dd>
        </dl>
        <ul className="mt-4 grid gap-2" aria-label="Order lines">
          {review.lines.map((line) => (
            <li key={line.orderNumber} className="body-s">
              {line.sku} · Qty {line.quantity}
            </li>
          ))}
        </ul>
      </section>

      {review.blockers.length > 0 ? (
        <section className="card p-4" role="alert">
          <p className="body-m font-700">This order cannot be approved yet.</p>
          <p className="body-s mt-2">{review.blockers.map((value) => value.replace(/_/g, " ")).join("; ")}</p>
        </section>
      ) : null}

      <section className="card p-5 grid gap-4" aria-label="Required payment confirmations">
        <label className="flex items-start gap-3 body-s">
          <input
            type="checkbox"
            checked={fundsReceived}
            onChange={(event) => setFundsReceived(event.currentTarget.checked)}
          />
          <span>Payment actually received</span>
        </label>
        <label className="flex items-start gap-3 body-s">
          <input
            type="checkbox"
            checked={amountAndReference}
            onChange={(event) => setAmountAndReference(event.currentTarget.checked)}
          />
          <span>Amount and payment reference match this invoice</span>
        </label>
        <label className="grid gap-2 body-s" htmlFor="ea-provider-transaction-id">
          Actual payment-provider transaction ID
          <input
            id="ea-provider-transaction-id"
            className="input"
            value={transactionId}
            onChange={(event) => setTransactionId(event.currentTarget.value)}
            autoComplete="off"
          />
        </label>
      </section>

      <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => void submit()}>
        {busy ? "APPROVING…" : "APPROVE PAYMENT & RELEASE ORDER"}
      </button>
      {outcome ? <p className="body-s" role="status">{outcome}</p> : null}
    </section>
  );
}
