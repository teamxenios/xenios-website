import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptAssistedOrderQuote,
  AssistedOrderApiError,
  loadAssistedOrderQuote,
  type AssistedOrderCustomerQuote,
} from "./api";

type Props = Readonly<{
  requestId: string;
  publicReference: string;
  statusToken?: string;
  memberToken?: string | null;
}>;

const total = (cents: number, currency: "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code" }).format(cents / 100);

/** Mount only after the request's status read has confirmed ownership. */
export function CustomerQuotePanel(props: Props) {
  // A new owner/reference must never paint the old owner's quote, including
  // during the render before an effect cleanup or a late response completes.
  return <OwnerQuotePanel key={JSON.stringify([props.requestId, props.publicReference,
    props.memberToken ?? null, props.memberToken ? null : props.statusToken ?? null])} {...props} />;
}

function OwnerQuotePanel({ requestId, publicReference, statusToken, memberToken }: Props) {
  const [quote, setQuote] = useState<AssistedOrderCustomerQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now);
  const inFlight = useRef(false);
  const active = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const current = ++generation.current;
    setLoading(true);
    setQuote(null);
    setMessage(null);
    loadAssistedOrderQuote(publicReference, statusToken, memberToken, abort.signal)
      .then((result) => {
        if (!active.current || current !== generation.current) return;
        if (result.requestId !== requestId || result.publicReference !== publicReference) {
          throw new Error("quote_reference_mismatch");
        }
        setClock(Date.now());
        setQuote(result);
      })
      .catch((error: unknown) => {
        if (!active.current || current !== generation.current) return;
        setMessage(error instanceof AssistedOrderApiError && error.status === 404
          ? "No quote is available to review right now."
          : "Quote review is unavailable right now. Please try again later or contact Support.");
      })
      .finally(() => { if (active.current && current === generation.current) setLoading(false); });
  }, [publicReference, requestId, statusToken, memberToken]);

  useEffect(() => {
    active.current = true;
    refresh();
    return () => { active.current = false; ++generation.current; controller.current?.abort(); };
  }, [refresh]);

  useEffect(() => {
    if (quote?.state !== "issued") return;
    const remaining = Date.parse(quote.validUntil) - Date.now();
    if (remaining <= 0) return;
    const timeout = setTimeout(() => setClock(Date.now()), Math.min(remaining + 1, 2_147_483_647));
    return () => clearTimeout(timeout);
  }, [quote, clock]);

  const accept = async () => {
    if (!quote || quote.state !== "issued" || inFlight.current) return;
    if (Date.parse(quote.validUntil) <= Date.now()) { setClock(Date.now()); return; }
    inFlight.current = true;
    setAccepting(true);
    setMessage(null);
    const current = generation.current;
    try {
      const receipt = await acceptAssistedOrderQuote(publicReference, quote, statusToken, memberToken, controller.current?.signal);
      if (!active.current || current !== generation.current) return;
      setQuote({ ...quote, state: "accepted", acceptanceId: receipt.acceptanceId, acceptedAt: receipt.acceptedAt });
    } catch (error: unknown) {
      if (!active.current || current !== generation.current) return;
      setQuote(null);
      setMessage(error instanceof AssistedOrderApiError && error.status === 409
        ? "This quote is no longer available to accept. Refresh the quote and review its current terms."
        : "We could not confirm quote acceptance. Refresh the quote before trying again.");
    } finally {
      if (active.current && current === generation.current) { inFlight.current = false; setAccepting(false); }
    }
  };

  const expired = quote?.state === "expired" || (quote?.state === "issued" && Date.parse(quote.validUntil) <= clock);
  return <section className="xenios-order-panel" style={{ marginTop: 24, minWidth: 0, overflowWrap: "anywhere" }} aria-labelledby="customer-quote-heading" aria-busy={loading || accepting}>
    <h2 id="customer-quote-heading">Your quote</h2>
    {loading ? <p role="status">Checking for a quote…</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {quote ? <>
      <p>Quote version {quote.version}</p>
      <div className="xenios-order-review-lines">
        {quote.lines.map((line) => <article key={line.lineId} style={{ flexWrap: "wrap", minWidth: 0 }}>
          <div style={{ minWidth: 0, overflowWrap: "anywhere" }}><strong>{line.productName}</strong><span>{line.specification}</span></div>
          <div><span>Qty {line.quantity} at {total(line.unitPriceCents, line.currency)} each</span><strong>{total(line.lineTotalCents, line.currency)}</strong></div>
        </article>)}
      </div>
      <p><strong>Quote total: {total(quote.totalCents, quote.currency)}</strong></p>
      {quote.customerNote ? <p style={{ overflowWrap: "anywhere" }}>{quote.customerNote}</p> : null}
      {quote.state === "accepted" ? <p role="status">Quote accepted on <time dateTime={quote.acceptedAt!}>{new Date(quote.acceptedAt!).toLocaleString()}</time>. This records your agreement to these terms, not a payment or fulfillment confirmation.</p> :
        expired ? <p>This quote has expired. Contact Support for an updated quote.</p> :
        quote.state !== "issued" ? <p>This quote is no longer available to accept. Refresh for the latest quote or contact Support.</p> : <>
          <p>Available to accept until <time dateTime={quote.validUntil}>{new Date(quote.validUntil).toLocaleString()}</time>.</p>
          <p>Accepting records your agreement to this version and total. It does not charge you or confirm payment, availability, or fulfillment.</p>
          <button type="button" className="xenios-order-button" disabled={accepting} onClick={accept}>{accepting ? "Recording acceptance…" : `Accept quote version ${quote.version}`}</button>
        </>}
    </> : null}
    {!loading ? <p><button type="button" className="xenios-order-retry" disabled={accepting} onClick={refresh}>Refresh quote</button></p> : null}
    <h3>Payment</h3>
    <p>Card payments are not available here yet. Do not send funds based on this quote. Contact Support for current payment options.</p>
    <button type="button" className="xenios-order-retry" disabled>Card payment unavailable</button>
    <p><a href="/research/support">Contact Support</a></p>
  </section>;
}
