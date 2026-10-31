import { useEffect, useMemo, useRef, useState } from "react";
import { useResearch } from "../core";
import { isResearchCartScope } from "../cart-session";
import type { StorefrontIntent } from "../storefront/entry-intent";
import type { RequestIntentReceipt } from "../../../../shared/research/assisted-order/request-intent";
import { orderEntryIntentFromSearch } from "../early-access/orderEntryIntent";
import { createRequestIntentApi } from "./request-intent-api";
import { RequestIntentForm } from "./RequestIntentForm";
import { loadEarlyAccessAgreementState } from "../adapters/earlyAccessAgreement";

type Step = "products" | "contact" | "review";
const configurationApi = createRequestIntentApi();

export function useRequestIntentBridgeState() {
  const [state, setState] = useState<{ kind: "checking" | "enabled" | "disabled" }>({ kind: "checking" });
  useEffect(() => {
    let current = true;
    void configurationApi.config().then(() => { if (current) setState({ kind: "enabled" }); })
      .catch(() => { if (current) setState({ kind: "disabled" }); });
    return () => { current = false; };
  }, []);
  return state;
}
export function RequestIntentCta() {
  const state = useRequestIntentBridgeState();
  if (state.kind === "checking") return null;
  return <section className="card mt-6">
    <h2>Request products for review</h2>
    <p>Choose clinical and nonclinical items in one private request. Submission does not approve treatment, place an order or collect payment.</p>
    {state.kind === "enabled" ? <a className="btn btn-primary mt-4" href="/research/early-access/order-request">Open request form</a>
      : <p role="status">Request intake is currently unavailable. No request has been submitted.</p>}
  </section>;
}
export function RequestIntentEntry({ embedded = false, continuationEnabled = true, onStepChange, entryIntent, onConfirmedReceipt }: Readonly<{
  embedded?: boolean; continuationEnabled?: boolean; onStepChange?: (step: Step) => void;
  entryIntent?: StorefrontIntent | null;
  onConfirmedReceipt?: (receipt: RequestIntentReceipt) => void;
}>) {
  const { member, memberToken, memberChecking, recovery, memberSessionStatus } = useResearch();
  const owner = member ? (isResearchCartScope(member.cartScope) ? member.cartScope : null)
    : memberSessionStatus === "signed_out" ? "early-access-session" : null;
  const [standing, setStanding] = useState(false);
  useEffect(() => {
    if (embedded) return;
    let current = true;
    setStanding(false);
    void loadEarlyAccessAgreementState().then((value) => {
      if (current) setStanding(value.kind === "accepted");
    }).catch(() => { if (current) setStanding(false); });
    return () => { current = false; };
  }, [embedded, owner, memberSessionStatus]);
  const tokenRef = useRef(memberToken);
  tokenRef.current = memberToken;
  const api = useMemo(() => createRequestIntentApi(() => tokenRef.current), []);
  const hint = useMemo(() => entryIntent ?? orderEntryIntentFromSearch(
    typeof window === "undefined" ? "" : window.location.search), [entryIntent]);
  if (memberChecking || memberSessionStatus === "checking") return <p role="status">Checking your existing session...</p>;
  if (recovery !== "none" || memberSessionStatus === "verification_failed") {
    return <section role="alert"><p>Complete secure account recovery or contact support before submitting a request.</p>
      <a href="/research/support">Contact support</a></section>;
  }
  if (owner === null) return <section role="alert">
    <p>Your account could not be confirmed for this request. Contact support before continuing.</p><a href="/research/support">Contact support</a></section>;
  // Key by the confirmed opaque owner, never token. Token-only rerenders keep
  // the form; account switches remount it. Checking/recovery renders no form.
  return <RequestIntentForm key={owner} api={api}
    embedded={embedded} continuationEnabled={embedded ? continuationEnabled : standing}
    onStepChange={onStepChange} entryIntent={hint} onConfirmedReceipt={onConfirmedReceipt} />;
}
