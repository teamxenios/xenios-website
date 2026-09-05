import { useCallback, useEffect, useRef, useState } from "react";
import SeoHead from "@/components/SeoHead";
import { scrollToTopRespectingMotion } from "@/lib/motion";
import {
  AssistedOrderCta,
  useAssistedOrderBridgeState,
} from "../assisted-order/AssistedOrderCta";
import { Suspense, lazy } from "react";

/** The full canonical catalog, loaded on demand so the storefront shell stays small. */
const FullCanonicalCatalog = lazy(() =>
  import("../assisted-order/AssistedOrderPage").then((m) => ({
    default: m.AssistedOrderPage,
  })),
);

import { EarlyAccessUnlockForm } from "./EarlyAccessUnlockForm";
import { OrderEntryIntentNotice } from "./OrderEntryIntentNotice";
import { orderEntryIntentFromSearch, type OrderEntryIntentResolution } from "./orderEntryIntent";
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
import { clearAssistedOrderStorage } from "../assisted-order/storage";
import { clearBrowserCart } from "./cart/cartStore";
import { clearCartRecovery } from "./cart/cartAttemptStore";
import { EarlyAccessCartMount } from "./cart/EarlyAccessCartMount";
import { EARLY_ACCESS_FULFILLMENT_TARGET_COPY } from "./fulfillment-copy";
import {
  EARLY_ACCESS_CUSTOMER_STEP_LABELS,
  earlyAccessCustomerStepIndex,
} from "./customerSteps";

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

/** The four customer-visible stages projected over the internal journey. */
export const EARLY_ACCESS_STEPS = EARLY_ACCESS_CUSTOMER_STEP_LABELS;

type GateState =
  | { kind: "checking" }
  | { kind: "unavailable" }
  | { kind: "locked"; error: string | null; busy: boolean }
  | { kind: "authenticated"; expiresAt: string | null };

type EmbeddedOrderStep = "products" | "contact" | "review";

const MAX_BROWSER_TIMER_DELAY_MS = 2_147_483_647;

function sessionExpiration(value: unknown): Readonly<{
  expiresAt: string | null;
  timestamp: number | null;
}> {
  if (typeof value !== "string") {
    return { expiresAt: null, timestamp: null };
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? { expiresAt: value, timestamp }
    : { expiresAt: null, timestamp: null };
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function bestEffort(action: () => void): void {
  try {
    action();
  } catch {
    // Browser storage can fail per operation under privacy settings. Continue
    // so a less-sensitive recovery hint never prevents a later credential
    // from being removed.
  }
}

/** Clears only customer-scoped browser artifacts owned by Early Access. */
export function clearEarlyAccessCustomerStorage(): void {
  bestEffort(clearLastOrderNumber);
  bestEffort(clearPendingAttempt);
  bestEffort(clearBrowserCart);
  bestEffort(clearCartRecovery);
  bestEffort(clearAssistedOrderStorage);
}

export default function EarlyAccessRoute() {
  const entryIntent = orderEntryIntentFromSearch(typeof window === "undefined" ? "" : window.location.search);
  const [entryResolution, setEntryResolution] = useState<OrderEntryIntentResolution | null>(null);
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
  const [rememberedOrder, setRememberedOrder] = useState<string | null>(
    () => readLastOrderNumber(),
  );
  // The full catalog owns its own three-step request journey. Once that
  // journey advances, the surrounding storefront must stop presenting the
  // separate Featured shelf and direct-checkout progress as if both flows
  // were active at once.
  const [embeddedOrderStep, setEmbeddedOrderStep] =
    useState<EmbeddedOrderStep>("products");
  // Asked once, shared with the CTA below, so the storefront and the door
  // cannot disagree about whether ordering is open.
  const bridgeState = useAssistedOrderBridgeState();
  const catalogRef = useRef<HTMLDivElement | null>(null);
  const nextStepsRef = useRef<HTMLDivElement | null>(null);
  const lastExpiredSessionRef = useRef<string | null>(null);
  const sessionRecheckInFlightRef = useRef(false);

  const resetCustomerContext = useCallback(() => {
    clearEarlyAccessCustomerStorage();
    setRememberedOrder(null);
    setAgreed(false);
    setBlocked(null);
    setSelection(null);
    setOrderRequest(null);
    setPriceChanged(false);
    setCheckoutPhase("details");
    setEmbeddedOrderStep("products");
  }, []);

  const readSession = useCallback(async () => {
    let retriedExpiredSession = false;
    let attemptedOpenAccess = false;
    try {
      // At most one expired-session retry and one open-access unlock are
      // allowed in a single check. This lets a genuinely expired cookie become
      // a fresh anonymous session without looping if a broken endpoint keeps
      // returning the same stale answer.
      for (;;) {
        const response = await fetch(SESSION_PATH, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        // The gate answers 503 when the deployment has it switched off or
        // incompletely configured. That is a truthful unavailable state, not
        // an error the customer can act on.
        if (response.status === 503 || response.status === 404) {
          setState({ kind: "unavailable" });
          return;
        }
        const body = await readJson(response);
        if (response.ok && body?.authenticated === true) {
          const expiration = sessionExpiration(body.expiresAt);
          if (
            expiration.timestamp !== null &&
            expiration.timestamp <= Date.now()
          ) {
            const newlyExpired =
              lastExpiredSessionRef.current !== expiration.expiresAt;
            if (newlyExpired) {
              lastExpiredSessionRef.current = expiration.expiresAt;
              resetCustomerContext();
            }
            if (newlyExpired && !retriedExpiredSession) {
              retriedExpiredSession = true;
              setState({ kind: "checking" });
              continue;
            }
            // The retry repeated an already-expired authenticated answer.
            // Fail closed rather than rendering a stale shared-machine view.
            setState({ kind: "locked", error: null, busy: false });
            return;
          }
          lastExpiredSessionRef.current = null;
          setState({ kind: "authenticated", expiresAt: expiration.expiresAt });
          return;
        }
        // These are the only answers that definitively say the browser is no
        // longer the customer whose recovery artifacts it may still hold.
        // Clear that context before either issuing a fresh anonymous session
        // or showing the locked gate. A malformed/5xx/network answer is not
        // proof of sign-out and therefore must not destroy recoverable work.
        const definitivelyUnauthenticated =
          (response.ok && body?.authenticated === false) ||
          response.status === 401 ||
          response.status === 403;
        if (definitivelyUnauthenticated) {
          resetCustomerContext();
        }
        // OPEN ACCESS (founder decision 2026-08-20): there is no
        // customer-facing password. Obtain a fresh anonymous identity, then
        // loop through the authoritative session endpoint once more instead
        // of trusting the unlock response body.
        if (response.ok && body?.openAccess === true) {
          if (attemptedOpenAccess) {
            setState({ kind: "unavailable" });
            return;
          }
          attemptedOpenAccess = true;
          const opened = await fetch(UNLOCK_PATH, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({}),
          });
          // Drain the response before the authoritative session re-read. A
          // fetch promise resolves when headers arrive; leaving its body
          // unread keeps the HTTP request active in Chromium and can strand
          // both browser automation and resource accounting even though the
          // cookie was accepted. The payload is deliberately not trusted.
          await readJson(opened);
          if (opened.ok) {
            continue;
          }
          // Could not obtain one. That is an unavailable deployment, not
          // something a customer can fix by typing, so do not ask them to.
          setState({ kind: "unavailable" });
          return;
        }
        setState({ kind: "locked", error: null, busy: false });
        return;
      }
    } catch {
      setState({ kind: "locked", error: null, busy: false });
    }
  }, [resetCustomerContext]);

  useEffect(() => {
    void readSession();
  }, [readSession]);

  const recheckSession = useCallback(
    (knownExpiresAt: string | null) => {
      if (sessionRecheckInFlightRef.current) {
        return;
      }
      sessionRecheckInFlightRef.current = true;
      const expiration = sessionExpiration(knownExpiresAt);
      if (
        expiration.timestamp !== null &&
        expiration.timestamp <= Date.now() &&
        lastExpiredSessionRef.current !== expiration.expiresAt
      ) {
        lastExpiredSessionRef.current = expiration.expiresAt;
        resetCustomerContext();
      }
      // Hide the authenticated surface while the server decides whether the
      // resumed tab still owns a valid session.
      setState({ kind: "checking" });
      void readSession().finally(() => {
        sessionRecheckInFlightRef.current = false;
      });
    },
    [readSession, resetCustomerContext],
  );

  useEffect(() => {
    if (state.kind !== "authenticated" || state.expiresAt === null) {
      return;
    }
    const expiration = sessionExpiration(state.expiresAt);
    if (expiration.timestamp === null) {
      return;
    }
    let timer: number | null = null;
    const scheduleExpiry = () => {
      const remaining = expiration.timestamp! - Date.now();
      if (remaining <= 0) {
        recheckSession(state.expiresAt);
        return;
      }
      // Browser timers cap at roughly 24.8 days. Re-arm without touching the
      // mounted wizard until the real expiry is reached.
      timer = window.setTimeout(
        scheduleExpiry,
        Math.min(remaining, MAX_BROWSER_TIMER_DELAY_MS),
      );
    };
    scheduleExpiry();
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [recheckSession, state]);

  useEffect(() => {
    if (state.kind !== "authenticated") {
      return;
    }
    const recheckVisibleSession = () => {
      const expiration = sessionExpiration(state.expiresAt);
      // Focus before the known expiry must not unmount the wizard: its contact
      // fields intentionally live only in memory. The expiry timer covers an
      // active tab; focus/visibility are the catch-up path for suspended tabs.
      if (
        expiration.timestamp === null ||
        expiration.timestamp > Date.now()
      ) {
        return;
      }
      recheckSession(state.expiresAt);
    };
    const recheckWhenVisible = () => {
      if (document.visibilityState === "visible") {
        recheckVisibleSession();
      }
    };
    window.addEventListener("focus", recheckVisibleSession);
    document.addEventListener("visibilitychange", recheckWhenVisible);
    return () => {
      window.removeEventListener("focus", recheckVisibleSession);
      document.removeEventListener("visibilitychange", recheckWhenVisible);
    };
  }, [recheckSession, state]);

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
          // As in the open-access bootstrap, finish the HTTP exchange before
          // the authoritative session read. The unlock payload is untrusted;
          // draining it prevents a completed response from remaining active.
          await readJson(response);
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
    // Clear customer-scoped browser state BEFORE waiting on the network. A
    // slow or hung logout request must not leave bearer tokens, receipts, or a
    // previous customer's basket behind after the person clicked Sign out.
    resetCustomerContext();
    setState({ kind: "locked", error: null, busy: false });

    void (async () => {
      try {
        await fetch(LOGOUT_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
      } catch {
        // Logout is idempotent. Even if the request fails (including a
        // synchronous fetch failure), the browser has already discarded the
        // previous customer's local state and returned to the password screen.
      }
    })();
  }, [resetCustomerContext]);

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
        <>
        {entryIntent ? <div className="container-x pt-6"><OrderEntryIntentNotice
          intent={entryIntent}
          enabled={bridgeState.kind === "enabled"}
          onResolved={setEntryResolution}
          showAssistedAction
        /></div> : null}
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
            <h1 className="display-s max-w-[26ch]">
              {selection !== null
                ? "Complete your order"
                : embeddedOrderStep === "products"
                  ? "Research Catalogue"
                  : "Complete your order request"}
            </h1>

            <div className="mt-4">
              <EarlyAccessStepper
                steps={EARLY_ACCESS_STEPS}
                activeIndex={
                  selection === null
                    ? earlyAccessCustomerStepIndex(embeddedOrderStep)
                    : earlyAccessCustomerStepIndex(checkoutPhase)
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
                {/*
                  ONE STOREFRONT (founder decision 2026-08-21).
                  
                  The full canonical catalog is now the primary Early Access
                  experience: the current 420 canonical variants, each routed by the
                  same server authority and routed by the same canonical action
                  resolver. The curated opening set below is a FEATURED
                  projection over that same catalog — same product identity,
                  same price authority, same action router — and is no longer a
                  second canonical storefront competing with it.
                  
                  Before this, /research/early-access showed only the 22-product
                  opening set while the real 420-row catalog lived behind a
                  separate order-request link, so a customer looking at the
                  storefront could not see most of what Xenios sells.
                */}
                {embeddedOrderStep === "products" ? (
                  <div className="mb-4">
                    <AssistedOrderCta />
                  </div>
                ) : null}
                {/*
                  ALL PRODUCTS — the full canonical catalog, on the storefront
                  itself rather than behind a separate link. Same product
                  identity, same server price authority and same canonical
                  action router as the featured set above, so a row's button
                  says the same thing wherever the customer meets it.
                */}
                {bridgeState.kind === "enabled" ? (
                  <section className="mt-8" data-testid="early-access-full-catalog">
                    <h2 className="xenios-early-access-section-heading">
                      {embeddedOrderStep === "products"
                        ? "All products"
                        : embeddedOrderStep === "contact"
                          ? "Contact and shipping"
                          : "Review and submit"}
                    </h2>
                    <Suspense
                      fallback={<p className="xenios-order-notice">Loading the full research catalogue.</p>}
                    >
                      <FullCanonicalCatalog
                        embedded
                        entryIntent={entryIntent}
                        entryResolution={entryResolution}
                        continuationEnabled={agreed && blocked === null}
                        onStepChange={setEmbeddedOrderStep}
                      />
                    </Suspense>
                  </section>
                ) : null}
                {/*
                  Featured is intentionally secondary. Its richer projection
                  is the historically slower request, while All products is
                  the declared primary storefront and can usually show a
                  useful server-authorized card sooner. Both still start from
                  their existing authorities; DOM order alone keeps the slow
                  shelf from blocking the first useful catalog experience.
                */}
                {embeddedOrderStep === "products" ? (
                  <section className="mt-8" data-testid="early-access-featured-catalog">
                    <h2 className="xenios-early-access-section-heading">Featured products</h2>
                    <EarlyAccessCatalogSection
                      fulfillmentTargetCopy={EARLY_ACCESS_FULFILLMENT_TARGET_COPY}
                      reviewEnabled={agreed && blocked === null}
                      onReview={(nextSelection) => {
                        if (!agreed || blocked !== null) return;
                        setPriceChanged(false);
                        setOrderRequest(null);
                        setSelection(nextSelection);
                        setCheckoutPhase("details");
                        scrollToTopRespectingMotion();
                      }}
                      onOrderRequest={(nextRequest) => {
                        if (!agreed || blocked !== null) return;
                        setPriceChanged(false);
                        setSelection(null);
                        setOrderRequest(nextRequest);
                        scrollToTopRespectingMotion();
                      }}
                    />
                  </section>
                ) : null}
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
        </>
      )}
    </>
  );
}
