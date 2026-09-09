// Provider-hosted payment-method collection for checkout.
//
// The card is entered inside the provider's own element (an iframe Stripe
// serves); the app never sees a number, an expiry or a CVC. What it receives
// on demand is an opaque pm_ reference, which the checkout request carries to
// the server. Nothing here is logged, stored, or placed in a URL.
//
// The provider client is injected (`client`), defaulting to Stripe Elements
// over the shared loader. Tests inject a double. The test provider (never in
// production) has no browser library: it takes an opaque reference in a plain
// field so the connected journey can run locally without provider keys.
import { useEffect, useRef, useState } from "react";
import type { PaymentClientConfig } from "../adapters/durableCheckout";
import { stripeClient } from "./stripe-client";

export type CollectPaymentMethod = () => Promise<{ ok: true; reference: string } | { ok: false; message: string }>;

export interface MountedCollector {
  collect: CollectPaymentMethod;
  unmount(): void;
}

/** Mounts the provider's element into `container`; reports completeness; tokenizes on demand. */
export interface PaymentMethodCollectorClient {
  mount(container: HTMLElement, onChange: (state: { complete: boolean; error: string | null }) => void): Promise<MountedCollector>;
}

const CARD_STYLE = { base: { fontSize: "16px", fontFamily: "inherit" } };

export function stripeCardCollector(publishableKey: string): PaymentMethodCollectorClient {
  return {
    async mount(container, onChange) {
      const stripe = await stripeClient(publishableKey);
      const card = stripe.elements().create("card", { style: CARD_STYLE, hidePostalCode: true });
      card.on("change", (event) => onChange({ complete: event.complete === true, error: event.error?.message ?? null }));
      card.mount(container);
      return {
        async collect() {
          const result = await stripe.createPaymentMethod({ type: "card", card });
          const id = result.paymentMethod?.id;
          if (typeof id === "string" && /^pm_[A-Za-z0-9_]+$/.test(id)) return { ok: true, reference: id };
          return { ok: false, message: result.error?.message ?? "The card could not be used. Check the details and try again." };
        },
        unmount() {
          try {
            card.destroy();
          } catch {
            // Already gone.
          }
        },
      };
    },
  };
}

const TEST_REFERENCE = /^pm_[A-Za-z0-9_]{4,}$/;

export interface PaymentMethodCollectorProps {
  config: PaymentClientConfig;
  /** Injected provider client; defaults to Stripe Elements for the stripe provider. */
  client?: PaymentMethodCollectorClient;
  disabled?: boolean;
  /** Receives the collect function once the provider element is usable; null when it is not. */
  onCollector: (collect: CollectPaymentMethod | null) => void;
}

export function PaymentMethodCollector({ config, client, disabled = false, onCollector }: PaymentMethodCollectorProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<{ kind: "loading" } | { kind: "ready"; complete: boolean; error: string | null } | { kind: "unavailable" }>({ kind: "loading" });
  const [testReference, setTestReference] = useState("");
  const latest = useRef(onCollector);
  latest.current = onCollector;

  // The test provider: a plain opaque-reference field, no provider library.
  useEffect(() => {
    if (config.provider !== "test") return;
    const value = testReference.trim();
    latest.current(TEST_REFERENCE.test(value) ? async () => ({ ok: true, reference: value }) : null);
  }, [config.provider, testReference]);

  useEffect(() => {
    if (config.provider !== "stripe" || !config.publishableKey) {
      if (config.provider === "stripe") setStatus({ kind: "unavailable" });
      return;
    }
    const target = container.current;
    if (!target) return;
    let mounted: MountedCollector | null = null;
    let complete = false;
    let cancelled = false;
    const provider = client ?? stripeCardCollector(config.publishableKey);
    setStatus({ kind: "loading" });
    void provider
      .mount(target, (state) => {
        if (cancelled) return;
        complete = state.complete;
        setStatus({ kind: "ready", complete: state.complete, error: state.error });
        latest.current(complete && mounted ? mounted.collect : null);
      })
      .then((result) => {
        if (cancelled) {
          result.unmount();
          return;
        }
        mounted = result;
        setStatus((current) => (current.kind === "ready" ? current : { kind: "ready", complete: false, error: null }));
        latest.current(complete ? result.collect : null);
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: "unavailable" });
      });
    return () => {
      cancelled = true;
      mounted?.unmount();
      mounted = null;
      latest.current(null);
    };
  }, [config.provider, config.publishableKey, client]);

  if (config.provider === "test") {
    return (
      <div className="grid gap-2" data-testid="pm-collector-test">
        <label htmlFor="co-test-payment-method" className="mono-label text-ink-mute">
          Test payment method reference
        </label>
        <input
          id="co-test-payment-method"
          className="input-field"
          value={testReference}
          disabled={disabled}
          onChange={(event) => setTestReference(event.target.value)}
          placeholder="pm_test_…"
          autoComplete="off"
          data-testid="co-test-payment-method"
        />
        <p className="body-s text-ink-mute">Test provider: no card and no real charge. Enter the opaque test reference.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2" data-testid="pm-collector">
      <div ref={container} className="input-field" style={{ minHeight: 44, padding: "12px" }} aria-busy={status.kind === "loading"} data-testid="pm-card-element" />
      {status.kind === "loading" && <p className="body-s text-ink-mute">Loading the secure card field…</p>}
      {status.kind === "unavailable" && (
        <p role="alert" className="body-s text-ink-2" data-testid="pm-unavailable">
          The secure card field could not be loaded. Nothing was charged. Reload the page to try again.
        </p>
      )}
      {status.kind === "ready" && status.error && (
        <p role="alert" className="body-s text-ink-2" data-testid="pm-card-error">
          {status.error}
        </p>
      )}
      {config.mode === "test" && (
        <p className="body-s text-ink-mute" data-testid="pm-test-mode">
          Test mode: no real card is charged.
        </p>
      )}
      <p className="body-s text-ink-mute">Card details are entered directly with the payment provider and never reach Xenios.</p>
    </div>
  );
}
