import { useEffect, useState, type ReactNode } from "react";
import { loadEarlyAccessCatalog } from "../../adapters/earlyAccessCatalog";
import { loadEarlyAccessCartCapability } from "../../adapters/earlyAccessCart";
import type { EarlyAccessCardProduct } from "../EarlyAccessProductCard";
import { EarlyAccessMultiCartJourney } from "./EarlyAccessMultiCartJourney";

export function EarlyAccessCartMount({
  fallback,
  onExitEarlyAccess,
  assistedOrderAvailable = false,
}: Readonly<{
  fallback: ReactNode;
  onExitEarlyAccess(): void;
  /** Independently confirmed by the existing assisted-order configuration. */
  assistedOrderAvailable?: boolean;
}>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "disabled" }
    | { kind: "locked" }
    | { kind: "error" }
    | { kind: "enabled"; products: readonly EarlyAccessCardProduct[] }
  >({ kind: "loading" });

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    void (async () => {
      try {
        const capability = await loadEarlyAccessCartCapability();
        if (!live) return;
        if (capability.kind === "disabled") {
          setState({ kind: "disabled" });
          return;
        }
        if (capability.kind === "locked") {
          setState({ kind: "locked" });
          return;
        }
        if (capability.kind !== "enabled") {
          setState({ kind: "error" });
          return;
        }
        const catalog = await loadEarlyAccessCatalog();
        if (!live) return;
        if (catalog.kind === "locked") {
          setState({ kind: "locked" });
        } else if (catalog.kind !== "ok") {
          setState({ kind: "error" });
        } else {
          setState({ kind: "enabled", products: catalog.products });
        }
      } catch {
        if (live) setState({ kind: "error" });
      }
    })();
    return () => { live = false; };
  }, [attempt]);

  const retry = () => {
    setState({ kind: "loading" });
    setAttempt((previous) => previous + 1);
  };

  const helpLinks = <nav className="mt-4 flex flex-wrap gap-4" aria-label="Research ordering help">
    <a className="btn btn-secondary" href="/support">Contact Support</a>
    <a className="btn btn-secondary" href="/status">Check Status</a>
    <a className="btn btn-secondary" href="/products">Back to Products</a>
  </nav>;

  if (state.kind === "disabled") return <>{fallback}</>;
  if (state.kind === "loading") {
    return (
      <section className="container-x" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <p className="body-s text-ink-mute" role="status" data-testid="early-access-cart-loading">Preparing your cart.</p>
      </section>
    );
  }
  if (state.kind === "locked") {
    return (
      <section className="container-x" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <p className="body-s text-pulse" role="alert" data-testid="early-access-cart-locked">Your research-ordering session ended. Start a new session to continue.</p>
        <a className="btn btn-primary mt-4" href="/research/early-access">Return to research ordering</a>
        {helpLinks}
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <section className="container-x" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <div className="card p-5 max-w-[62ch]" role="alert" data-testid="early-access-cart-error">
          <h2 className="body-m font-700">The multi-product cart is unavailable.</h2>
          <p className="body-s mt-2">We could not load the cart right now. Try again or contact support. Retrying this check does not place an order or confirm payment.</p>
          <button className="btn btn-primary mt-4" type="button" onClick={retry} data-testid="early-access-cart-retry">Try again</button>
          {assistedOrderAvailable && <div className="mt-4">
            <p className="body-s">The separate order-request service is available. You can browse all products there and request an order for review.</p>
            <a className="btn btn-secondary mt-3" href="/research/early-access/order-request" data-testid="early-access-cart-assisted-alternative">Browse products and request an order</a>
          </div>}
          {helpLinks}
        </div>
      </section>
    );
  }
  return <EarlyAccessMultiCartJourney products={state.products} onExitEarlyAccess={onExitEarlyAccess} />;
}
