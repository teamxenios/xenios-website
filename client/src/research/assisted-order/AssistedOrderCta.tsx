import { useEffect, useState } from "react";
import { Link } from "wouter";
import { requestAssistedOrderConfigBody } from "./api";

// The authenticated Early Access entry point to the assisted-order wizard.
//
// The CTA asks the server whether the feature is actually open before it
// offers anything: when /config reports enabled false (the D-005
// legal-requirements-unavailable state, or the bridge simply not enabled),
// the customer is told up front instead of filling a form that would be
// refused at submission. A failed or pending probe renders nothing rather
// than a hopeful button.

type ConfigState =
  | { kind: "checking" }
  | { kind: "enabled" }
  | { kind: "disabled" }
  | { kind: "absent" };

export const ASSISTED_ORDER_CTA_PATH = "/research/early-access/order-request";

/**
 * Whether the assisted-order bridge is actually open, asked of the server.
 *
 * Shared with the storefront so the full canonical catalog and this CTA agree:
 * a dark deployment shows neither a dead button nor a catalog the submit door
 * would refuse. Exported as a hook rather than duplicated, because two probes
 * would eventually disagree about the same fact.
 */
export function useAssistedOrderBridgeState(): ConfigState {
  const [state, setState] = useState<ConfigState>({ kind: "checking" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        // The SHARED request, not a private fetch. Three components ask this
        // same question on the storefront; a private fetch here made one of
        // three sequential round trips that delayed the catalog behind them.
        const body = await requestAssistedOrderConfigBody();
        if (!alive) return;
        const enabled =
          typeof body === "object" &&
          body !== null &&
          (body as { enabled?: unknown }).enabled === true;
        setState({ kind: enabled ? "enabled" : "disabled" });
      } catch {
        // Unreachable/refused probe. Unchanged: render nothing rather than a
        // hopeful button.
        if (alive) setState({ kind: "absent" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

export function AssistedOrderCta() {
  const state = useAssistedOrderBridgeState();

  if (state.kind === "checking" || state.kind === "absent") {
    return null;
  }

  return (
    <section
      className="card mt-6"
      aria-labelledby="assisted-order-cta"
      data-testid="assisted-order-cta"
    >
      <p className="mono-label text-ink-mute">Order request</p>
      <h2 id="assisted-order-cta" className="body-l font-700 mt-2">
        Place an Early Access order
      </h2>
      <p className="body-s text-ink-2 mt-3 max-w-[64ch]">
        Submit the products you would like to purchase. Xenios will review your
        request, confirm availability and any required documentation, and
        contact you with the next steps.
      </p>
      {state.kind === "enabled" ? (
        <div className="mt-5">
          <Link
            href={ASSISTED_ORDER_CTA_PATH}
            className="btn btn-primary"
            data-testid="link-assisted-order-start"
          >
            Place an Early Access order
          </Link>
        </div>
      ) : (
        <p
          className="body-s text-ink-mute mt-5"
          role="status"
          data-testid="assisted-order-cta-unavailable"
        >
          Order requests are temporarily unavailable. Everything else in Early
          Access still works, and no action is needed from you.
        </p>
      )}
    </section>
  );
}
