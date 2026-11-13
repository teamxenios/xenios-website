import { useEffect, useRef, useState, type Ref } from "react";
import { REQUEST_INTENT_SCOPE_NOTICE, type RequestIntentReceipt as SavedReceipt } from "../../../../shared/research/assisted-order/request-intent";
import { requestIntentConfirmationHref, requestIntentSupportMailto } from "./request-intent-continuation";
import { EarlyAccessRequestNextSteps } from "../early-access/EarlyAccessRequestGuide";
import { requestReceiptHeading } from "../early-access/request-experience-copy";

/** Previously confirmed display state only; no recovery or submission occurs here. */
export function RequestIntentReceipt({ receipt, headingRef, headingLevel = 1, focusOnMount = false, reopened = false, recovered = false, onStartAnother }: Readonly<{
  receipt: SavedReceipt; headingRef?: Ref<HTMLHeadingElement>; focusOnMount?: boolean;
  /** 2 inside a page that already has its own h1. */
  headingLevel?: 1 | 2;
  /** The reference was confirmed earlier in this browser tab and is shown again; nothing was sent. */
  reopened?: boolean;
  /** An explicit check found the saved result of an earlier attempt. */
  recovered?: boolean;
  /** Offered only where a fresh form can replace this confirmed one. */
  onStartAnother?: () => void;
}>) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "unavailable">("idle");
  useEffect(() => {
    const node = heading.current;
    if (!focusOnMount || !node) return;
    const doc = node.ownerDocument;
    const active = doc.activeElement;
    if (active !== null && active !== doc.body && !active.contains(node)) return;
    node.focus();
  }, [focusOnMount]);
  async function copyReference() {
    try { await navigator.clipboard.writeText(receipt.publicReference); setCopied("copied"); }
    catch { setCopied("unavailable"); }
  }
  const Heading = headingLevel === 2 ? "h2" : "h1";
  const earlierReceipt = reopened || recovered;
  return <section className="xenios-order-page"><Heading ref={headingRef ?? heading} tabIndex={-1}>{requestReceiptHeading(earlierReceipt)}</Heading>
    <p role="status">Your request reference is <strong>{receipt.publicReference}</strong>.</p>
    {reopened && <p>This reference was confirmed earlier in this browser tab. Nothing was sent again.</p>}
    {recovered && !reopened && <p>We found the saved request from your earlier attempt. Nothing was sent again.</p>}
    <p>{REQUEST_INTENT_SCOPE_NOTICE}</p><p>Final availability, quantities, pricing and delivery are confirmed separately.</p>
    <p>Keep this reference and quote it if you contact support about this request. Online status is not available for review requests.</p>
    {!earlierReceipt && <EarlyAccessRequestNextSteps headingLevel={headingLevel === 2 ? 3 : 2} />}
    {/* A plain list: the shared action row reverses its order on narrow screens. */}
    <ul className="xenios-order-receipt-continuations">
      <li><button type="button" className="xenios-order-link" onClick={() => void copyReference()}>Copy reference</button></li>
      <li><a href={requestIntentConfirmationHref(receipt.publicReference)}>Open your confirmation page</a></li>
      <li><a href={requestIntentSupportMailto(receipt.publicReference)}>Email support about this request</a></li>
      <li><a href="/research/support">Contact support</a></li>
    </ul>
    {/* Always mounted, so assistive technology hears the copy result as a change. */}
    <p role="status">{copied === "copied" ? "Reference copied."
      : copied === "unavailable" ? "Copying is unavailable here. Select the reference text to copy it." : ""}</p>
    {onStartAnother && <button type="button" className="xenios-order-button" onClick={onStartAnother}>Start another request</button>}
  </section>;
}
