import { useEffect, useRef, type Ref } from "react";
import { REQUEST_INTENT_NOTICE, type RequestIntentReceipt as SavedReceipt } from "../../../../shared/research/assisted-order/request-intent";

/** Previously confirmed display state only; no recovery or submission occurs here. */
export function RequestIntentReceipt({ receipt, headingRef, focusOnMount = false }: Readonly<{
  receipt: SavedReceipt; headingRef?: Ref<HTMLHeadingElement>; focusOnMount?: boolean;
}>) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (focusOnMount) heading.current?.focus(); }, [focusOnMount]);
  return <section className="xenios-order-page"><h1 ref={headingRef ?? heading} tabIndex={-1}>Request saved for review</h1>
    <p role="status">Your saved request reference is <strong>{receipt.publicReference}</strong>.</p>
    <p>{REQUEST_INTENT_NOTICE}</p><p>Each item is pending review. Final availability, quantities, pricing and delivery must be confirmed separately.</p>
    <a href="/research/support">Contact support</a></section>;
}
