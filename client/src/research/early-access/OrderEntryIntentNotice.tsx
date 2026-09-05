import { useEffect, useState } from "react";
import type { StorefrontIntent } from "../storefront/entry-intent";
import { loadOrderEntryIntent, orderEntryIntentHref, type OrderEntryIntentResolution } from "./orderEntryIntent";

export function OrderEntryIntentNotice({ intent, enabled, onResolved, showAssistedAction = false }: Readonly<{
  intent: StorefrontIntent | null;
  enabled: boolean;
  onResolved?: (resolution: OrderEntryIntentResolution) => void;
  showAssistedAction?: boolean;
}>) {
  const [observed, setObserved] = useState<{ key: string; result: OrderEntryIntentResolution } | null>(null);
  // A primitive identity avoids repeated reads when the parent reparses its URL.
  const key = intent ? JSON.stringify(intent) : "";
  const result = observed?.key === key && enabled ? observed.result : null;
  useEffect(() => {
    setObserved(null);
    if (!intent || !enabled) return;
    const abort = new AbortController();
    let live = true;
    void loadOrderEntryIntent(intent, abort.signal).catch(() => ({ kind: "unavailable" } as const)).then((next) => {
      if (!live) return;
      setObserved({ key, result: next });
      onResolved?.(next);
    });
    return () => { live = false; abort.abort(); };
  }, [key, enabled, onResolved]);
  if (!intent) return null;
  const care = intent.action === "CARE" || result?.kind === "care";
  return (
    <section className="card min-w-0 mb-5" aria-label="Your requested selection" data-testid="order-entry-intent-notice">
      <h2 className="body-l font-700">Your requested selection</h2>
      {care ? <p className="body-s mt-2">This selection belongs in Xenios Care. It cannot be added to a Research request.</p> : (
        <>
          <p className="body-s mt-2 break-words">
            {result?.kind === "matched" ? <><strong>{result.item.productName}</strong>{result.item.specification ? ` — ${result.item.specification}` : ""}. </> : null}
            Requested quantity: {intent.quantity}.
          </p>
          <p className="body-s mt-2" role="status">
            {!enabled ? "Your selection is kept in this link. Complete access before reviewing it."
              : !result ? "Checking this exact selection against the current catalog."
                : result.kind === "matched" ? "Your product and quantity are ready to review. Choose Add to include them in your request."
                  : "We could not match this selection and quantity to one currently available Research option. Your request is kept in this link; choose an available product and quantity below."}
          </p>
          <p className="body-s mt-2">Opening this link does not add products, place an order, or charge you.</p>
        </>
      )}
      {care ? <a href="/care/schedule" className="btn btn-secondary mt-3" style={{ minHeight: 44, whiteSpace: "normal" }}>Continue through Xenios Care</a>
        : enabled && showAssistedAction ? <a href={orderEntryIntentHref("/research/early-access/order-request", intent)} className="btn btn-secondary mt-3" style={{ minHeight: 44, whiteSpace: "normal" }}>Review selection in the assisted catalog</a> : null}
    </section>
  );
}
