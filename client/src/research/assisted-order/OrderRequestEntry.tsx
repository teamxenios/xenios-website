import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useResearch } from "../core";
import { isResearchCartScope } from "../cart-session";
import type { StorefrontIntent } from "../storefront/entry-intent";
import { OrderEntryIntentNotice } from "../early-access/OrderEntryIntentNotice";
import { orderEntryIntentFromSearch, type OrderEntryIntentResolution } from "../early-access/orderEntryIntent";
import { AssistedOrderCta } from "./AssistedOrderCta";
import { readOrderRequestContinuity, selectOrderRequestDoor, useOrderRequestMode, type OrderRequestMode } from "./order-request-mode";

const LegacyEntry = lazy(() => import("./AssistedOrderPage").then((m) => ({ default: m.AssistedOrderPage })));
const MixedEntry = lazy(() => import("./RequestIntentEntry").then((m) => ({ default: m.RequestIntentEntry })));
type Props = Readonly<{ embedded?: boolean; continuationEnabled?: boolean;
  onStepChange?: (step: "products" | "contact" | "review") => void;
  entryIntent?: StorefrontIntent | null; mode?: OrderRequestMode }>;

export function OrderRequestCta({ mode }: { mode: OrderRequestMode }) {
  if (mode.kind === "legacy") return <AssistedOrderCta />;
  if (mode.kind !== "mixed") return null;
  return <section className="card mt-6"><h2>Request products for review</h2>
    <p>Choose clinical and nonclinical items in one private request. Submission does not approve treatment, place an order or collect payment.</p>
    <a className="btn btn-primary mt-4" href="/research/early-access/order-request">Open request and recovery</a></section>;
}
function OwnedOrderRequestEntry(props: Props & { mode: OrderRequestMode }) {
  const [prior] = useState(() => {
    try { return readOrderRequestContinuity(window.sessionStorage); } catch { return "blocked" as const; }
  });
  // Once a real door mounts, keep its volatile work through any readiness prop
  // change. A remount consults preserved markers before selecting another door.
  const chosen = useRef<"legacy" | "mixed" | "blocked" | null>(null);
  const proposed = selectOrderRequestDoor(props.mode, prior);
  if (chosen.current === null && ["legacy", "mixed", "blocked"].includes(proposed)) {
    chosen.current = proposed as "legacy" | "mixed" | "blocked";
  }
  const kind = chosen.current ?? proposed;
  const [resolution, setResolution] = useState<OrderEntryIntentResolution | null>(null);
  const hint = useMemo(() => props.entryIntent ?? orderEntryIntentFromSearch(
    typeof window === "undefined" ? "" : window.location.search), [props.entryIntent]);
  if (kind === "checking") return <p role="status">Checking the current request path...</p>;
  if (kind === "unavailable" || kind === "blocked") return <section role="alert" data-testid="request-door-held">
    <p>{kind === "blocked"
      ? "An earlier request needs support review. Do not create a replacement until staff check for duplicates."
      : "The current request path could not be confirmed. No new request was sent by this page. Contact support before a replacement."}</p>
    <a href="/research/support">Contact support</a></section>;
  return <div data-testid={"request-door-" + kind}>
    {prior === "legacy" ? <p role="status">Continue your existing order-request attempt. Its key and recovery rules are unchanged; do not submit a replacement.</p> : null}
    {prior === "mixed" && props.mode.kind !== "mixed" ? <p role="status">An earlier private request may exist. Keep this attempt and contact support if its result cannot be confirmed. This page will not start a different request.</p> : null}
    <Suspense fallback={<p role="status">Loading the request form...</p>}>
      {kind === "mixed" ? <MixedEntry embedded={props.embedded} continuationEnabled={props.continuationEnabled}
        onStepChange={props.onStepChange} entryIntent={hint} />
        : <>{props.embedded && hint ? <OrderEntryIntentNotice intent={hint} enabled
            onResolved={setResolution} showAssistedAction /> : null}
          <LegacyEntry embedded={props.embedded} continuationEnabled={props.continuationEnabled}
            onStepChange={props.onStepChange} entryIntent={hint} entryResolution={resolution} /></>}
    </Suspense>
  </div>;
}
export function OrderRequestEntry(props: Props) {
  const { member, memberChecking, memberSessionStatus, recovery } = useResearch();
  // The verified member projection exposes an opaque scope, not an id. This
  // React key isolates volatile UI; it does not authorize any server operation.
  const owner = member ? (isResearchCartScope(member.cartScope) ? member.cartScope : null)
    : memberSessionStatus === "signed_out" ? "early-access-session" : null;
  const standaloneMode = useOrderRequestMode(props.mode === undefined && !memberChecking
    && memberSessionStatus !== "checking" && recovery === "none" && memberSessionStatus !== "verification_failed"
    && owner !== null, owner ?? "unconfirmed-member");
  if (memberChecking || memberSessionStatus === "checking") return <p role="status">Checking your existing session...</p>;
  if (recovery !== "none" || memberSessionStatus === "verification_failed") return <section role="alert">
    <p>Complete secure account recovery or contact support before continuing this request.</p><a href="/research/support">Contact support</a></section>;
  if (owner === null) return <section role="alert">
    <p>Your account could not be confirmed for this request. Contact support before continuing.</p><a href="/research/support">Contact support</a></section>;
  return <OwnedOrderRequestEntry key={owner} {...props} mode={props.mode ?? standaloneMode} />;
}
