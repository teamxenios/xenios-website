import { useEffect, useState, type ReactNode } from "react";
import { loadEarlyAccessCatalog } from "../../adapters/earlyAccessCatalog";
import { loadEarlyAccessCartCapability } from "../../adapters/earlyAccessCart";
import type { EarlyAccessCardProduct } from "../EarlyAccessProductCard";
import { EarlyAccessMultiCartJourney } from "./EarlyAccessMultiCartJourney";

export function EarlyAccessCartMount({
  fallback,
  onExitEarlyAccess,
}: Readonly<{
  fallback: ReactNode;
  onExitEarlyAccess(): void;
}>) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "disabled" }
    | { kind: "locked" }
    | { kind: "error" }
    | { kind: "enabled"; products: readonly EarlyAccessCardProduct[] }
  >({ kind: "loading" });

  useEffect(() => {
    let live = true;
    void (async () => {
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
    })();
    return () => { live = false; };
  }, []);

  if (state.kind === "disabled") return <>{fallback}</>;
  if (state.kind === "loading") {
    return <p className="body-s text-ink-mute" role="status">Preparing your cart.</p>;
  }
  if (state.kind === "locked") {
    return <p className="body-s text-pulse" role="alert">Your private session ended. Unlock Early Access again.</p>;
  }
  if (state.kind === "error") {
    return (
      <section className="card p-5" role="alert">
        <h2 className="body-m font-700">The multi-product cart is unavailable.</h2>
        <p className="body-s mt-2">No cart order was created. The existing Early Access ordering flow remains available only when the server explicitly reports the cart disabled, not when the cart is misconfigured.</p>
      </section>
    );
  }
  return <EarlyAccessMultiCartJourney products={state.products} onExitEarlyAccess={onExitEarlyAccess} />;
}
