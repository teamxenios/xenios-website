import { useState } from "react";
import type { RequestIntentDetail } from "../../../../shared/research/assisted-order/request-intent";
import { displayUsd, makeQuoteCover, QUOTE_MAILBOX, usableQuoteContact, worksheet, type ApprovalCopy } from "./private-quote-draft";

const blank: ApprovalCopy = { requestReference:"", recipient:"", quoteNumber:"", validThrough:"", finalUsd:"", checked:false };
/** Staff read access does not grant approval or mail send authority. This view writes nothing. */
export function PrivateQuoteDesk({detail}: Readonly<{ detail: RequestIntentDetail }>) {
  const [units, setUnits] = useState<Record<number,string>>({});
  const [form,setForm] = useState<ApprovalCopy>(blank);
  const [requested,setRequested] = useState(false);
  const result = worksheet(detail.lines.map((line,i) => ({quantity:line.quantity, unitUsd:units[i] || ""})));
  const cover = requested ? makeQuoteCover({ publicReference:detail.publicReference,email:detail.contact.email },form) : null;
  function change<K extends keyof ApprovalCopy>(key: K, value: ApprovalCopy[K]) {
    setForm(old => ({...old, checked:false, [key]:value}));
    setRequested(false);
  }
  if (!usableQuoteContact({publicReference:detail.publicReference, email:detail.contact?.email})) {
    return <p role="status">A verified request reference and one contact email are needed to prepare a quote. No draft is available.</p>;
  }
  return <section aria-label="Private quote desk">
    <h3>Prepare the private quote</h3>
    <p>This worksheet is local to this view. It does not update the request, approve an item, issue a quote, collect payment or send email.</p>
    <details><summary>Estimate line amounts (staff only)</summary>
      <p>Use current internal unit prices. Leave unresolved lines blank. Blank lines are excluded, even if only one item is unresolved.</p>
      <ul>{detail.lines.map((line,i) => <li key={JSON.stringify([line.productId,line.variantId])}>
        <label>{line.productName} — {line.specification || line.variantId} × {line.quantity}: unit price (USD)
          <input type="text" inputMode="decimal" autoComplete="off" maxLength={10} value={units[i] || ""}
            onChange={e=>{const raw=e.target.value; setUnits(old=>({...old,[i]:raw}));}} /></label>
        {result?.amounts[i] != null && <span> Line estimate: {displayUsd(result.amounts[i]!)}</span>}
      </li>)}</ul>
      {result ? <p>Working subtotal: {displayUsd(result.totalCents)}. Priced lines: {result.priced}; unpriced: {result.unpriced}. Taxes, delivery and fees are not added.</p>
        : <p role="alert">A quantity or unit price is invalid. Use a positive USD amount and up to two decimal places.</p>}
    </details>
    <details><summary>Prepare email for a separately issued quote</summary>
      <p>Use a quote already issued through the authorized review process. Attach it manually in the approved mailbox. The worksheet above is never copied into the email.</p>
      <form onSubmit={e=>{e.preventDefault();setRequested(true);}} autoComplete="off">
        <label>Request reference on issued quote<input required maxLength={36} value={form.requestReference} onChange={e=>change("requestReference",e.target.value)} /></label>
        <label>Recipient email on issued quote<input required type="email" maxLength={254} value={form.recipient} onChange={e=>change("recipient",e.target.value)} /></label>
        <label>Issued quote number<input required maxLength={64} value={form.quoteNumber} onChange={e=>change("quoteNumber",e.target.value)} /></label>
        <label>Final total on issued quote (USD)<input required inputMode="decimal" type="text" maxLength={10} value={form.finalUsd} onChange={e=>change("finalUsd",e.target.value)} /></label>
        <label>Valid through (as printed on quote)<input required type="date" value={form.validThrough} onChange={e=>change("validThrough",e.target.value)} /></label>
        <label><input type="checkbox" checked={form.checked} onChange={e=>change("checked",e.target.checked)} /> I matched the approved quote, covered items, total and recipient.</label>
        <button type="submit">Prepare email text</button>
      </form>
      {cover && !cover.ok && <p role="alert">{cover.reason}</p>}
      {cover?.ok && <section aria-label="Unsent email cover">
        <h4>Email text ready — not sent</h4>
        <p>Open the authorized Team Xenios mailbox. Confirm From and Reply-To are both {QUOTE_MAILBOX}, copy the fields below and attach the issued quote. Check delivery and record the message ID in the authorized staff record.</p>
        <label>To<input readOnly value={cover.to}/></label><label>Subject<input readOnly value={cover.subject}/></label>
        <label>Message<textarea rows={9} readOnly value={cover.body}/></label>
      </section>}
    </details>
    <button type="button" onClick={()=>{setUnits({});setForm(blank);setRequested(false);}}>Clear local worksheet and draft</button>
  </section>;
}
