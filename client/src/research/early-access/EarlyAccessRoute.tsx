import { useCallback, useEffect, useRef, useState } from "react";
import SeoHead from "@/components/SeoHead";

import { EarlyAccessUnlockForm } from "./EarlyAccessUnlockForm";
import { EarlyAccessStepper } from "./EarlyAccessStepper";
import { EarlyAccessCatalogSection, type EarlyAccessCatalogSelection } from "./EarlyAccessCatalogSection";
import {
  EarlyAccessCheckoutJourney,
  EarlyAccessOrderRecoveryCard,
} from "./EarlyAccessCheckoutJourney";
import { EarlyAccessAgreementSection } from "./EarlyAccessAgreementSection";
import {
  clearLastOrderNumber,
  clearPendingAttempt,
  readLastOrderNumber,
} from "./pendingOrderStore";
import { clearBrowserCart } from "./cart/cartStore";
import { clearCartRecovery } from "./cart/cartAttemptStore";
import { EarlyAccessCartMount } from "./cart/EarlyAccessCartMount";
import { EARLY_ACCESS_FULFILLMENT_TARGET_COPY } from "./fulfillment-copy";
import {
  clearKrisLegacyOrder,
  consumeKrisLegacyOrder,
} from "../kris-launch-a/legacyOrderHandoff";

// The mounted Private Early Access route.
//
// This is the only Early Access component that talks to the network. Everything
// it renders below is a controlled presentation component, so the gate state
// lives in exactly one place.
//
// Nothing private is written to browser storage: the session is an HttpOnly
// cookie the script cannot read, and the authenticated view holds its data in
// memory for the life of the page.

const SESSION_PATH = "/api/research/early-access/session";
const UNLOCK_PATH = "/api/research/early-access/unlock";
const LOGOUT_PATH = "/api/research/early-access/logout";

export const EARLY_ACCESS_STEPS = [
  "Welcome",
  "Identity and Agreements",
  "Research Catalog",
  "Contact and Shipping",
  "Review Order",
  "Payment",
  "Payment Confirmation",
  "Status",
] as const;

/** "Identity and Agreements", where a customer sits until they have agreed. */
export const EARLY_ACCESS_AGREEMENT_STEP = 1;
/** "Research Catalog", reached only once the SERVER confirms the acceptance. */
export const EARLY_ACCESS_CATALOG_STEP = 2;

type GateState =
  | { kind: "checking" }
  | { kind: "unavailable" }
  | { kind: "locked"; error: string | null; busy: boolean }
  | { kind: "authenticated"; expiresAt: string | null };

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export default function EarlyAccessRoute() {
  const [state, setState] = useState<GateState>({ kind: "checking" });
  // Whether the SERVER says this customer has agreed. It starts false on every
  // load and is only ever set from a server answer, so a refresh re-asks rather
  // than trusting anything the browser kept.
  const [agreed, setAgreed] = useState(false);
  // Why ordering is closed, when it is not simply "has not agreed yet". The
  // journey must describe the SAME situation the agreement step is describing.
  const [blocked, setBlocked] = useState<"unverified" | "locked" | null>(null);
  const [selection, setSelection] = useState<EarlyAccessCatalogSelection | null>(null);
  const [orderRequest, setOrderRequest] = useState<EarlyAccessCatalogSelection | null>(null);
  const [checkoutPhase, setCheckoutPhase] = useState<
    "details" | "review" | "submitting" | "payment" | "status"
  >("details");
  // The server said the confirmed price is gone. The catalogue below has been
  // remounted (a fresh server read), and the customer is told why they are
  // back on it. Cleared the moment they carry a new selection forward.
  const [priceChanged, setPriceChanged] = useState(false);
  // The order number this browser session remembers, read once on mount, so a
  // refresh or render failure after a successful placement does not strand
  // the customer. Reading it grants nothing: the status endpoint re-authorizes
  // against the session's derived identity on every call.
  const [rememberedOrder] = useState<string | null>(() => readLastOrderNumber());
  const catalogRef = useRef<HTMLDivElement | null>(null);
  const nextStepsRef = useRef<HTMLDivElement | null>(null);

  const readSession = useCallback(async () => {
    try {
      const response = await fetch(SESSION_PATH, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      // The gate answers 503 when the deployment has it switched off or
      // incompletely configured. That is a truthful unavailable state, not an
      // error the customer can act on.
      if (response.status === 503 || response.status === 404) {
        setState({ kind: "unavailable" });
        return;
      }
      const body = await readJson(response);
      if (body?.authenticated === true) {
        const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : null;
        setState({ kind: "authenticated", expiresAt });
        return;
      }
      setState({ kind: "locked", error: null, busy: false });
    } catch {
      setState({ kind: "locked", error: null, busy: false });
    }
  }, []);

  useEffect(() => {
    void readSession();
  }, [readSession]);

  // A catalog BUY NOW crosses only after the existing Early Access session and
  // agreement gates are satisfied. Until then it remains memory-only and the
  // ordinary unlock/acceptance UI is authoritative.
  useEffect(() => {
    if (
      state.kind !== "authenticated" ||
      !agreed ||
      blocked !== null ||
      selection !== null
    ) {
      return;
    }
    const next = consumeKrisLegacyOrder();
    if (next !== null) {
      setPriceChanged(false);
      setOrderRequest(null);
      setSelection(next);
      setCheckoutPhase("details");
    }
  }, [agreed, blocked, selection, state.kind]);

  const submitPassword = useCallback(
    (password: string) => {
      setState({ kind: "locked", error: null, busy: true });
      void (async () => {
        try {
          const response = await fetch(UNLOCK_PATH, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ password }),
          });
          if (response.ok) {
            // Re-read the session rather than trusting the unlock body, so the
            // rendered state always reflects what the server will honor.
            await readSession();
            return;
          }
          // One generic message for every refusal. The server deliberately does
          // not distinguish a wrong password from a disabled gate or a lockout,
          // and neither does this copy.
          setState({
            kind: "locked",
            busy: false,
            error: "That password was not accepted. Check the password you were given and try again.",
          });
        } catch {
          setState({
            kind: "locked",
            busy: false,
            error: "We could not reach the access service. Please try again.",
          });
        }
      })();
    },
    [readSession],
  );

  const signOut = useCallback(() => {
    void (async () => {
      try {
        await fetch(LOGOUT_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
      } catch {
        // Logout is idempotent and the cookie is cleared server-side; a network
        // failure still returns the customer to the password screen.
      }
      // The next customer to unlock on this browser starts from the server's
      // answer about themselves, never from the last person's. That includes
      // the browser's own recovery hints: a signed-out machine remembers no
      // order number and no unfinished attempt, so nothing of the previous
      // purchaser is shown to whoever unlocks next. (The server clears the
      // continuity credential on logout for the same reason.)
      clearLastOrderNumber();
      clearPendingAttempt();
      // The cart is intent the PREVIOUS customer expressed. On a shared
      // machine the next person to unlock must start with an empty one, not
      // inherit somebody else's basket.
      clearBrowserCart();
      // And the cart's OWN two recovery pointers: the in-flight attempt key
      // and the last cart checkout number. Clearing the basket while leaving
      // these behind would hand the next person a pointer at the previous
      // purchaser's checkout. The server would still refuse to show it, but a
      // signed-out browser should not be holding the pointer at all.
      clearCartRecovery();
      clearKrisLegacyOrder();
      setAgreed(false);
      setBlocked(null);
      setSelection(null);
      setOrderRequest(null);
      setCheckoutPhase("details");
      setState({ kind: "locked", error: null, busy: false });
    })();
  }, []);

  return (
    <>
      <SeoHead
        title="Private Early Access, xenios research"
        description="A private ordering experience for approved Xenios Research members."
        path="/research/early-access"
        robots="noindex, nofollow"
      />
      {state.kind === "checking" && (
        <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <p className="body-s text-ink-mute" role="status" data-testid="early-access-checking">
            Checking your access.
          </p>
        </section>
      )}

      {state.kind === "unavailable" && (
        <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <p className="mono-cap text-pulse mb-5">Private Early Access</p>
          <h1 className="display-s max-w-[22ch]">This area is not open yet.</h1>
          <p className="mt-6 body-m text-ink-2 max-w-[58ch]" data-testid="early-access-unavailable">
            Private Early Access is being prepared. Nothing is wrong with your invitation, and no
            action is needed from you right now.
          </p>
        </section>
      )}

      {state.kind === "locked" && (
        <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <div className="max-w-[520px]">
            <p className="mono-cap text-pulse mb-5">Invitation only</p>
            <h1 className="display-s max-w-[22ch]">Private Early Access</h1>
            <p className="mt-6 body-m text-ink-2 max-w-[58ch]">
              Enter the access password you were given. This area is limited to members approved
              through the Xenios network.
            </p>
            <div className="mt-8">
              <EarlyAccessUnlockForm
                onSubmit={submitPassword}
                busy={state.busy}
                error={state.error}
              />
            </div>
          </div>
        </section>
      )}

      {state.kind === "authenticated" && (
        <EarlyAccessCartMount
          onExitEarlyAccess={signOut}
          fallback={
        <section className="container-x" style={{ paddingTop: 32, paddingBottom: 48 }}>
          <div className="max-w-[1280px] min-w-0">
            {/*
              A compact masthead. The three-paragraph welcome that used to sit
              here explained the programme to someone who had already unlocked,
              read it once, and was now trying to buy. It pushed the catalogue
              below the fold on every visit, so it is gone rather than
              shortened: the place to explain the programme is before the
              password, not after it.
            */}
            <p className="mono-cap text-pulse mb-2">Private Early Access</p>
            <h1 className="display-s max-w-[26ch]">{selection === null ? "Research Catalogue" : "Complete your order"}</h1>

            <div className="mt-4">
              <EarlyAccessStepper
                steps={EARLY_ACCESS_STEPS}
                activeIndex={
                  !agreed || blocked !== null
                    ? EARLY_ACCESS_AGREEMENT_STEP
                    : selection === null
                      ? EARLY_ACCESS_CATALOG_STEP
                      : checkoutPhase === "details"
                        ? 1
                        : checkoutPhase === "payment"
                          ? 5
                          : checkoutPhase === "status"
                            ? 7
                            : 4
                }
              />
            </div>

            {/*
              The required agreement, above the catalogue. Browsing is not
              gated: a customer may read the whole shelf before agreeing to
              anything, and the catalogue is unchanged by what follows. What IS
              gated is the continuation into ordering, because the order route
              refuses with AGREEMENT_REQUIRED until this is on file.
            */}
            <div className="mt-5" data-testid="early-access-agreement-mount">
              <EarlyAccessAgreementSection onAccepted={setAgreed} onBlocked={setBlocked} />
            </div>

            {!agreed ? (
              <div className="mt-5 body-s text-ink-2 max-w-[62ch]" data-testid="early-access-first-time-guide">
                The access code opens this private catalogue. Review the Research Use Policy before checkout; then choose one released product, enter a US shipping address, and create a server-confirmed invoice. Creating an order does not charge you.
              </div>
            ) : null}

            {selection === null ? (
              <div className="mt-5" data-testid="early-access-catalog-mount" tabIndex={-1}>
                {priceChanged && (
                  <p
                    role="alert"
                    className="body-s text-pulse mb-4 max-w-[62ch]"
                    data-testid="early-access-price-changed"
                  >
                    The price of the product you were ordering changed before the order was
                    created, so nothing was ordered or charged. The catalogue below shows the
                    current server prices; please review and confirm again.
                  </p>
                )}
                {orderRequest !== null && (
                  <p
                    role="status"
                    className="body-s text-ink-2 mb-4 max-w-[62ch]"
                    data-testid="early-access-order-request-route"
                  >
                    Your request for {orderRequest.quantity} units of {orderRequest.product.name}
                    is not yet released for direct checkout. Your order request is saved in this session;
                    nothing was added to the cart, ordered, or charged.
                  </p>
                )}
                {rememberedOrder !== null && (
                  <div className="mb-4">
                    <EarlyAccessOrderRecoveryCard orderNumber={rememberedOrder} />
                  </div>
                )}
                <EarlyAccessCatalogSection
                  fulfillmentTargetCopy={EARLY_ACCESS_FULFILLMENT_TARGET_COPY}
                  reviewEnabled={agreed && blocked === null}
                  onReview={(nextSelection) => {
                    if (!agreed || blocked !== null) return;
                    setPriceChanged(false);
                    setOrderRequest(null);
                    setSelection(nextSelection);
                    setCheckoutPhase("details");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  onOrderRequest={(nextRequest) => {
                    if (!agreed || blocked !== null) return;
                    setPriceChanged(false);
                    setSelection(null);
                    setOrderRequest(nextRequest);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              </div>
            ) : (
              <div className="mt-5" data-testid="early-access-checkout-mount">
                <EarlyAccessCheckoutJourney
                  selection={selection}
                  onBack={() => {
                    setSelection(null);
                    setCheckoutPhase("details");
                  }}
                  onPriceChanged={() => {
                    // The catalogue remounts below, which is a FRESH server
                    // read; the notice above it says why the customer is back.
                    setSelection(null);
                    setCheckoutPhase("details");
                    setPriceChanged(true);
                  }}
                  onPhaseChange={setCheckoutPhase}
                />
              </div>
            )}

            <div className="mt-8">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={signOut}
                data-testid="early-access-signout"
              >
                Sign out of Early Access
              </button>
            </div>
          </div>
        </section>
          }
        />
      )}
    </>
  );
}
