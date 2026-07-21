import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { getCart, removeCartLine, updateCartLine } from "../../adapters/commerce";
import { denialPresentation } from "../../lib/denials";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
} from "../../ui/kit";
import { PRICE_NOT_CONFIRMED } from "./commerce-presentation";
import type { CartDto, CartLineDto } from "@shared/research/commerce-api";

// ---------------------------------------------------------------------------
// Member Cart (/research/member/cart). The full cart from GET
// /api/research/cart: lines with quantity controls, purchase mode, honest
// pricing (a null price renders "Pricing not yet confirmed", never $0.00),
// per-line blocked reasons, split-fulfillment info with ONE shipping figure,
// and server-computed totals. checkoutReady is the only field that gates the
// checkout link; when it is false the button is disabled with an honest hint
// listing the blocking reasons. Nothing here computes a price client-side.
// ---------------------------------------------------------------------------

// Sourced from the one canonical declaration so the wording cannot drift
// between the cart, the catalog, and the order history.
export const PRICE_PENDING_COPY = PRICE_NOT_CONFIRMED;

function money(cents: number | null | undefined): string {
  if (typeof cents === "number" && Number.isFinite(cents)) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }
  return PRICE_PENDING_COPY;
}

function purchaseModeLabel(line: CartLineDto): string {
  if (line.purchaseMode === "subscription") {
    return line.subscriptionFrequencyDays
      ? `Subscription, every ${line.subscriptionFrequencyDays} days`
      : "Subscription";
  }
  return "One-time purchase";
}

type BoundaryState = "loading" | "ok" | "error" | "unavailable" | "unauthorized";

export default function Cart() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<BoundaryState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [denial, setDenial] = useState<{ code: string; message?: string } | null>(null);
  const [cart, setCart] = useState<CartDto | null>(null);
  const [busySku, setBusySku] = useState<string | null>(null);
  const [actionDenial, setActionDenial] = useState<{ code: string; message?: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setErrorMessage(undefined);
    setDenial(null);
    const result = await getCart(memberToken);
    if (result.kind === "ok") {
      setCart(result.data.cart);
      setState("ok");
      return;
    }
    if (result.kind === "unauthorized") {
      setState("unauthorized");
      return;
    }
    if (result.kind === "denied") {
      setDenial({ code: result.code, message: result.message });
      setState("ok");
      return;
    }
    if (result.kind === "unavailable" || result.kind === "forbidden") {
      setState("unavailable");
      return;
    }
    setErrorMessage(result.message);
    setState("error");
  }, [memberToken]);

  useEffect(() => {
    void load();
  }, [load]);

  // One mutation path: every cart change routes through here so the denied,
  // error, and unauthorized branches behave identically for update and remove.
  const mutate = useCallback(
    async (sku: string, run: () => ReturnType<typeof getCart>) => {
      setBusySku(sku);
      setActionDenial(null);
      setActionError(null);
      const result = await run();
      setBusySku(null);
      if (result.kind === "ok") {
        setCart(result.data.cart);
        return;
      }
      if (result.kind === "unauthorized") {
        setState("unauthorized");
        return;
      }
      if (result.kind === "denied") {
        setActionDenial({ code: result.code, message: result.message });
        return;
      }
      if (result.kind === "unavailable") {
        setActionError("That change could not be saved right now. Please try again shortly.");
        return;
      }
      setActionError(result.kind === "error" ? result.message : "That change could not be saved. Please try again.");
    },
    [memberToken],
  );

  const setQuantity = (line: CartLineDto, quantity: number) => {
    if (quantity < 1) return;
    void mutate(line.sku, () => updateCartLine(memberToken, line.sku, { quantity }));
  };

  const remove = (line: CartLineDto) => {
    void mutate(line.sku, () => removeCartLine(memberToken, line.sku));
  };

  const blockingTitles = (c: CartDto): string[] => {
    const seen = new Set<string>();
    const titles: string[] = [];
    for (const code of c.blockingReasons) {
      const title = denialPresentation(code).title;
      if (!seen.has(title)) {
        seen.add(title);
        titles.push(title);
      }
    }
    return titles;
  };

  return (
    <ResearchMemberShell
      title="Cart"
      lead="Everything you have set aside, priced by the server from the live catalog. Totals here are estimates until checkout confirms them."
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={() => void load()}
        unavailableTitle="The cart is not open yet."
        unavailableBody="It is being prepared. Nothing is wrong with your account, and nothing you added is lost."
      >
        {denial ? (
          <ResearchDenialNotice code={denial.code} message={denial.message} />
        ) : !cart || cart.lines.length === 0 ? (
          <ResearchEmptyState
            title="Your cart is empty."
            body="Browse the catalog and add a product; it will wait for you here."
            action={
              <Link href={MEMBER_ROUTES.products} className="btn btn-primary">
                Browse products
              </Link>
            }
          />
        ) : (
          <div className="grid gap-6">
            {actionDenial && <ResearchDenialNotice code={actionDenial.code} message={actionDenial.message} />}
            {actionError && (
              <p role="alert" className="body-s text-ink-2">
                {actionError}
              </p>
            )}

            {/* Lines */}
            <section aria-label="Cart lines" className="grid gap-4">
              {cart.lines.map((line) => {
                const busy = busySku === line.sku;
                return (
                  <div key={line.sku} className="card" data-testid="cart-line">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div style={{ minWidth: 0 }}>
                        <p className="body-m font-700">{line.displayName}</p>
                        <p className="mono-label text-ink-mute mt-1">{line.sku}</p>
                        <p className="body-s text-ink-2 mt-1">{purchaseModeLabel(line)}</p>
                      </div>
                      <div className="text-right">
                        <p className="body-s text-ink-2">Unit price: <span className="tabular">{money(line.unitPriceCents)}</span></p>
                        <p className="body-m font-700 tabular mt-1" data-testid="line-total">
                          {money(line.lineTotalCents)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2" role="group" aria-label={`Quantity for ${line.displayName}`}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          aria-label={`Decrease quantity of ${line.displayName}`}
                          disabled={busy || line.quantity <= 1}
                          onClick={() => setQuantity(line, line.quantity - 1)}
                        >
                          -
                        </button>
                        <span className="body-m tabular" aria-live="polite" data-testid="line-quantity">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          aria-label={`Increase quantity of ${line.displayName}`}
                          disabled={busy}
                          onClick={() => setQuantity(line, line.quantity + 1)}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => remove(line)}
                        aria-label={`Remove ${line.displayName} from the cart`}
                      >
                        {busy ? "Working..." : "Remove"}
                      </button>
                    </div>
                    {line.blockedReason && (
                      <div className="mt-4">
                        <ResearchDenialNotice code={line.blockedReason} />
                      </div>
                    )}
                  </div>
                );
              })}
            </section>

            {/* Split fulfillment info: one order, possibly several shipments,
                shipping charged once. */}
            {cart.shipmentGroups.length > 1 && (
              <section className="card" aria-label="Shipment information">
                <p className="mono-label text-ink-mute">Shipments</p>
                <p className="body-s text-ink-2 mt-2">
                  This order ships as {cart.shipmentGroups.length} separate shipments, but shipping is charged once
                  for the whole order.
                </p>
                <ul className="body-s text-ink-2 mt-2">
                  {cart.shipmentGroups.map((group, i) => (
                    <li key={`${group.owner}-${i}`}>
                      Shipment {i + 1}: {group.skus.length === 1 ? "1 item" : `${group.skus.length} items`}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Server-computed totals. One shipping figure per order. */}
            <section className="card" aria-label="Order summary">
              <p className="mono-label text-ink-mute">Estimated totals</p>
              <dl className="mt-3 grid gap-2">
                <div className="flex items-center justify-between gap-4">
                  <dt className="body-s text-ink-2">Subtotal</dt>
                  <dd className="body-s tabular">{money(cart.subtotalCents)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="body-s text-ink-2">Shipping (once per order)</dt>
                  <dd className="body-s tabular" data-testid="cart-shipping">{money(cart.shippingCents)}</dd>
                </div>
                {cart.storeCreditAppliedCents > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <dt className="body-s text-ink-2">Store credit applied</dt>
                    <dd className="body-s tabular">-{money(cart.storeCreditAppliedCents)}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4">
                  <dt className="body-m font-700">Estimated total</dt>
                  <dd className="body-m font-700 tabular" data-testid="cart-total">{money(cart.estimatedTotalCents)}</dd>
                </div>
              </dl>
            </section>

            {/* Heads-up: what checkout will ask for. */}
            {cart.requiredAgreements.length > 0 && (
              <section className="card" aria-label="Agreements checkout will ask for">
                <p className="mono-label text-ink-mute">Before you order</p>
                <p className="body-s text-ink-2 mt-2">Checkout will ask you to accept:</p>
                <ul className="body-s text-ink-2 mt-1">
                  {cart.requiredAgreements.map((key) => (
                    <li key={key}>{key.replace(/_/g, " ")}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* checkoutReady is the ONLY gate on this control. */}
            <div>
              {cart.checkoutReady ? (
                <Link href={MEMBER_ROUTES.checkout} className="btn btn-primary" data-testid="continue-to-checkout">
                  Continue to checkout
                </Link>
              ) : (
                <>
                  <button type="button" className="btn btn-primary" disabled data-testid="continue-to-checkout">
                    Continue to checkout
                  </button>
                  {cart.blockingReasons.length > 0 && (
                    <div className="body-s text-ink-2 mt-3" role="status" data-testid="checkout-blockers">
                      <p>Checkout is not available yet:</p>
                      <ul className="mt-1">
                        {blockingTitles(cart).map((title) => (
                          <li key={title}>{title}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            <ResearchSecureNotice>
              Prices and totals are computed by the server from the live catalog. The cart is checked again at
              checkout, so a change since you added an item is caught before any order is placed.
            </ResearchSecureNotice>
          </div>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
