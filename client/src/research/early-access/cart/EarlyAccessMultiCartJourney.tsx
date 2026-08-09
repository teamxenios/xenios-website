import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EarlyAccessCartCheckout,
  EarlyAccessCartContact,
  EarlyAccessCartLineRefusal,
  EarlyAccessCartQuote,
  EarlyAccessCartQuoteRequest,
  EarlyAccessCartShipping,
  EarlyAccessCartStatus,
} from "@shared/research/early-access-cart";
import type { EarlyAccessCardProduct } from "../EarlyAccessProductCard";
import { EarlyAccessAgreementSection } from "../EarlyAccessAgreementSection";
import {
  confirmEarlyAccessCart,
  loadEarlyAccessCartCheckout,
  loadEarlyAccessCartStatus,
  quoteEarlyAccessCartRequest,
} from "../../adapters/earlyAccessCart";
import {
  browserCartUnitCount,
  clearBrowserCart,
  putBrowserCartItem,
  readBrowserCart,
  removeBrowserCartItem,
  type BrowserCart,
  type BrowserCartItem,
} from "./cartStore";
import { EarlyAccessCartCatalogue } from "./EarlyAccessCartCatalogue";
import { EarlyAccessCartDetails, cartContactProblems, cartShippingProblems } from "./EarlyAccessCartDetails";
import { EarlyAccessCartLineIssues } from "./EarlyAccessCartLineIssues";
import { EarlyAccessCartPanel } from "./EarlyAccessCartPanel";
import { EarlyAccessCartPayment, EarlyAccessCartStatusView } from "./EarlyAccessCartPayment";
import {
  loadEarlyAccessPaymentInstructions,
} from "@/research/adapters/earlyAccessPaymentInstructions";
import {
  unresolvedEarlyAccessPaymentInstructions,
  type EarlyAccessPaymentInstructionsPresentation,
} from "@shared/research/early-access-payment-instructions";
import { EarlyAccessCartReview } from "./EarlyAccessCartReview";
import { EarlyAccessCartAgreements } from "./EarlyAccessCartAgreements";
import { EarlyAccessCartSubmit } from "./EarlyAccessCartSubmit";
import { EarlyAccessProgress } from "./EarlyAccessProgress";
import {
  earlyAccessAgreementGate,
  standingFromAgreementState,
  type EarlyAccessAgreementStanding,
} from "./agreementGate";
import type { EarlyAccessProofSubmitter } from "./proofSubmissionPort";
import { loadEarlyAccessAgreementState } from "../../adapters/earlyAccessAgreement";
// The two recovery pointers live in their own module so SIGN-OUT can reach
// them. While they were private constants here, logout cleared the cart but
// left the previous purchaser's attempt key and checkout number behind.
import {
  clearCartAttemptKey,
  newCartAttemptKey,
  readCartAttemptKey,
  readLastCartCheckoutNumber,
  rememberCartAttemptKey,
  rememberLastCartCheckoutNumber,
} from "./cartAttemptStore";
import {
  EARLY_ACCESS_CHECKOUT_STEPS,
  listenEarlyAccessHistory,
  pushEarlyAccessStep,
  readEarlyAccessHistoryState,
  replaceEarlyAccessStep,
  type EarlyAccessCheckoutStep,
} from "./history";

function titleFor(step: EarlyAccessCheckoutStep): string {
  switch (step) {
    case "catalog": return "Research Catalogue";
    case "cart": return "Your cart";
    case "details": return "Contact & Shipping";
    case "agreements": return "Required Agreements";
    case "review": return "Review Cart";
    case "payment": return "Payment";
    case "submit": return "Submit Order";
    case "status": return "Status";
  }
}

export type EarlyAccessMultiCartJourneyProps = Readonly<{
  products: readonly EarlyAccessCardProduct[];
  onExitEarlyAccess(): void;
  /**
   * The proof and internal-email lane's submission door, when this deployment
   * has one mounted. Absent is the honest default and is NOT a stub: the submit
   * step then explains the concierge route rather than rendering an uploader
   * that would silently discard the file. See `proofSubmissionPort.ts`.
   */
  submitProof?: EarlyAccessProofSubmitter;
}>;

export function EarlyAccessMultiCartJourney({
  products,
  onExitEarlyAccess,
  submitProof,
}: EarlyAccessMultiCartJourneyProps) {
  const initialState = readEarlyAccessHistoryState(window.history.state);
  const [step, setStep] = useState<EarlyAccessCheckoutStep>(initialState?.step ?? "catalog");
  const [cart, setCart] = useState<BrowserCart>(() => readBrowserCart());
  const [contact, setContact] = useState<EarlyAccessCartContact>({ email: "", phone: "" });
  const [shipTo, setShipTo] = useState<EarlyAccessCartShipping>({
    recipientName: "",
    line1: "",
    line2: null,
    city: "",
    region: "",
    postalCode: "",
    country: "US",
  });
  const [quote, setQuote] = useState<EarlyAccessCartQuote | null>(null);
  const [checkout, setCheckout] = useState<EarlyAccessCartCheckout | null>(null);
  const [status, setStatus] = useState<EarlyAccessCartStatus | null>(null);
  // WHAT THE SERVER SAYS ABOUT THIS CUSTOMER'S REQUIRED AGREEMENTS.
  //
  // The cart quote refuses with AGREEMENT_REQUIRED until they are on file, so
  // the agreements have to be reachable from inside this journey; otherwise a
  // customer who has not agreed is told they are required and given nothing
  // anywhere to accept.
  //
  // `unknown` is the starting value and it is NOT "not agreed": it is "nobody
  // has asked yet". It fails closed exactly like a refusal, but the screen can
  // tell a customer we are still checking rather than accusing them of skipping
  // something. This used to be a plain boolean that started false and, once a
  // server read set it true, simply stayed true for the rest of the session.
  const [standing, setStanding] = useState<EarlyAccessAgreementStanding>("unknown");
  const [lineIssues, setLineIssues] = useState<readonly EarlyAccessCartLineRefusal[]>([]);
  const [problems, setProblems] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paymentInstructions, setPaymentInstructions] =
    useState<EarlyAccessPaymentInstructionsPresentation>(
      unresolvedEarlyAccessPaymentInstructions(),
    );
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef<string | null>(readCartAttemptKey());
  const submitInFlight = useRef(false);
  const lastCheckoutRef = useRef<string | null>(readLastCartCheckoutNumber());
  const quoteRef = useRef<EarlyAccessCartQuote | null>(null);
  const checkoutRef = useRef<EarlyAccessCartCheckout | null>(null);
  // Read by the step guard, which is a stable callback and so cannot close over
  // the current render's values. Contact and shipping live in memory only, so
  // after a refresh this is false and the guard walks a restored later step
  // back to the form, rather than parking the customer on a step whose data is
  // gone.
  const detailsCompleteRef = useRef(false);

  useEffect(() => { quoteRef.current = quote; }, [quote]);
  useEffect(() => { checkoutRef.current = checkout; }, [checkout]);
  useEffect(() => {
    detailsCompleteRef.current =
      cartContactProblems(contact).length === 0 && cartShippingProblems(shipTo).length === 0;
  }, [contact, shipTo]);

  /**
   * Ask the server for this customer's agreement standing.
   *
   * Every value of `standing` in this component comes from here. Nothing else
   * writes it, so there is no path by which a component's belief that a write
   * succeeded becomes the journey's belief that the customer is agreed.
   */
  const recheckAgreements = useCallback(() => {
    void loadEarlyAccessAgreementState().then((state) => {
      setStanding(standingFromAgreementState(state));
    });
  }, []);

  const safeStep = useCallback((requested: EarlyAccessCheckoutStep): EarlyAccessCheckoutStep => {
    // Resolved to a FIXPOINT, not in one hop. Each rule sends an impossible
    // step to the nearest step that could hold it, and that step can itself be
    // impossible: asking for `status` with no checkout used to land on `cart`
    // and stop there, even with an empty basket, so the customer arrived at a
    // cart that had nothing in it and no way forward. Re-running until the
    // answer stops changing walks all the way back to a step that is actually
    // reachable. The rules only ever move backwards, so this terminates.
    let current = requested;
    for (let pass = 0; pass < EARLY_ACCESS_CHECKOUT_STEPS.length; pass += 1) {
      let next = current;
      // Once a checkout exists, `review` is behind the customer, not ahead of
      // them. Back and Forward used to walk right back onto the confirm button
      // for a placement that had already succeeded. Sending them forward to the
      // order they actually placed is both safer and truer than the fallback
      // below, which would have marched them back to an empty catalog.
      if (current === "review" && checkoutRef.current !== null) next = "payment";
      // A review with no quote goes back to the step that PRODUCES one. The
      // quote is taken at the end of the agreements step, because the server
      // refuses to price a cart for a customer whose agreements are not on
      // file, so that is the earliest step from which review is reachable.
      else if (current === "review" && quoteRef.current === null) next = "agreements";
      else if (
        (current === "payment" || current === "submit" || current === "status") &&
        checkoutRef.current === null
      ) {
        next = quoteRef.current === null ? "cart" : "review";
      }
      // Contact and shipping are held in memory only, so a restored or
      // navigated `agreements` after a refresh has no destination to price
      // against. Sending the customer back to the form is the only honest
      // answer; the alternative is an agreements step whose Continue quotes a
      // cart with nowhere to ship it.
      else if (current === "agreements" && !detailsCompleteRef.current) next = "details";
      else if (
        (current === "cart" || current === "details" || current === "agreements") &&
        readBrowserCart().items.length === 0
      ) {
        next = "catalog";
      }
      if (next === current) return current;
      current = next;
    }
    return "catalog";
  }, []);

  useEffect(() => {
    const restored = readEarlyAccessHistoryState(window.history.state);
    if (restored === null) {
      replaceEarlyAccessStep("catalog");
      setStep("catalog");
    } else {
      // THE RESTORED STEP GOES THROUGH THE SAME GUARD AS A NAVIGATED ONE.
      //
      // The initial state read the history entry directly, so a reload or a
      // re-entry carrying a stale entry landed on that step whatever the data
      // said. Observed in a browser: signing out and unlocking again restored
      // `status` with no checkout to show, because the guard that refuses
      // exactly that only ran on popstate and on navigate, never on mount.
      //
      // Replace rather than push, so correcting an impossible entry does not
      // add a history step the customer then has to go back through.
      const safe = safeStep(restored.step);
      if (safe !== restored.step) {
        replaceEarlyAccessStep(safe);
        setStep(safe);
      }
    }
    return listenEarlyAccessHistory((requested) => {
      setError(null);
      setStep(safeStep(requested));
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [safeStep]);

  // WHERE TO SEND THE MONEY, FETCHED ONLY ONCE THERE IS AN ORDER TO PAY.
  //
  // Read-only and strictly downstream of a completed placement. It never
  // confirms, never touches the attempt key, never clears the checkout, and
  // cannot create a second order: the only thing it does with a failure is
  // leave the presentation unresolved, which the panel renders as "payment
  // details are being confirmed". The adapter already turns a network error, a
  // 401, a 404, a 503 and a malformed body into exactly that state, so there is
  // no error branch here to get wrong.
  //
  // Keyed by the checkout number rather than by `checkout`, so a status refresh
  // that returns an equal-but-new object does not refetch.
  const paymentCheckoutNumber = checkout?.cartCheckoutNumber ?? null;
  useEffect(() => {
    // The submit step needs the same projection: it is where the customer says
    // which of the server's CONFIGURED methods they paid with, and that list
    // has exactly one source.
    if ((step !== "payment" && step !== "submit") || paymentCheckoutNumber === null) return;
    let live = true;
    void (async () => {
      const presentation = await loadEarlyAccessPaymentInstructions(paymentCheckoutNumber);
      if (live) setPaymentInstructions(presentation);
    })();
    return () => {
      live = false;
    };
  }, [step, paymentCheckoutNumber]);

  useEffect(() => {
    const checkoutNumber = lastCheckoutRef.current;
    if (checkoutNumber === null || checkout !== null) return;
    void (async () => {
      const result = await loadEarlyAccessCartCheckout(checkoutNumber);
      if (result.kind !== "ok") return;
      setCheckout(result.checkout);
      checkoutRef.current = result.checkout;
      // Recovery is read-only. It never confirms or resubmits.
      if (step === "payment" || step === "status") setStep(step);
    })();
  }, [checkout, step]);

  const navigate = useCallback((next: EarlyAccessCheckoutStep, mode: "push" | "replace" = "push") => {
    const safe = safeStep(next);
    setError(null);
    setStep(safe);
    if (mode === "replace") replaceEarlyAccessStep(safe);
    else pushEarlyAccessStep(safe);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [safeStep]);

  const cartProducts = useMemo(
    () => products.filter((product) => cart.items.some(
      (item) => item.productId === product.productId && item.variantId === product.variantId,
    )),
    [products, cart],
  );

  /** Ordering continues only once the SERVER has the acceptance on file. */
  const agreementGate = earlyAccessAgreementGate(standing);
  const canOrder = agreementGate.satisfied;

  const put = (item: BrowserCartItem) => setCart(putBrowserCartItem(item));
  const remove = (productId: string, variantId: string) =>
    setCart(removeBrowserCartItem(productId, variantId));

  const toQuoteRequest = (): EarlyAccessCartQuoteRequest | null => {
    const items = cart.items.flatMap((item) => {
      const product = products.find(
        (candidate) =>
          candidate.productId === item.productId && candidate.variantId === item.variantId,
      );
      if (product?.unitPriceCents === null || product?.unitPriceCents === undefined) return [];
      return [{
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        expectedUnitPriceCents: product.unitPriceCents,
        expectedCurrency: "USD" as const,
      }];
    });
    return items.length === cart.items.length ? { items, contact, shipTo } : null;
  };

  /**
   * Leave the contact form for the agreements step.
   *
   * Nothing durable happens here. The cart is not priced yet, because the
   * server refuses to price it until the agreements are on file, so asking for
   * a quote before this customer has passed that step would answer
   * AGREEMENT_REQUIRED every time and teach the journey to treat a refusal as
   * routine.
   */
  const continueFromDetails = () => {
    const found = [...cartContactProblems(contact), ...cartShippingProblems(shipTo)];
    setProblems(found);
    if (found.length > 0) return;
    recheckAgreements();
    navigate("agreements");
  };

  const quoteCart = async () => {
    const found = [...cartContactProblems(contact), ...cartShippingProblems(shipTo)];
    setProblems(found);
    if (found.length > 0) {
      navigate("details");
      return;
    }
    const request = toQuoteRequest();
    if (request === null || request.items.length === 0) {
      setError("One or more cart items must be reviewed again in the catalogue.");
      navigate("catalog");
      return;
    }
    setBusy(true);
    setError(null);
    setLineIssues([]);
    const result = await quoteEarlyAccessCartRequest(request);
    setBusy(false);
    if (!result.ok) {
      if (result.code === "LINE_REFUSED" && result.lines) {
        setLineIssues(result.lines);
        navigate("catalog");
      } else if (result.code === "AGREEMENT_REQUIRED") {
        // The server and this journey disagreed about the standing, and the
        // server wins. Re-read it rather than keeping the value that just
        // proved wrong, and put the customer on the step that can fix it.
        recheckAgreements();
        setError("Your required agreements must be on file before this cart can be priced.");
        navigate("agreements");
      } else {
        setError("The cart could not be quoted. Nothing was ordered or charged.");
      }
      return;
    }
    setQuote(result.quote);
    quoteRef.current = result.quote;
    navigate("review");
  };

  const confirm = async () => {
    const activeQuote = quoteRef.current;
    // A PLACED CHECKOUT ENDS THIS JOURNEY'S ABILITY TO PLACE. This guard, not a
    // disabled button, is what stops the duplicate. The real incident placed two
    // orders sixty seconds apart from one quote: the success path cleared the
    // attempt key and left the quote live, so the next confirm fell into the
    // "no key yet" branch below, minted a fresh one, and the server correctly
    // treated a new key as a new order. A disabled button is a render-time hint
    // that none of the paths that caused this consult.
    if (checkoutRef.current !== null) return;
    if (activeQuote === null || submitInFlight.current) return;
    submitInFlight.current = true;
    setBusy(true);
    setError(null);
    if (attemptRef.current === null) {
      attemptRef.current = newCartAttemptKey();
      rememberCartAttemptKey(attemptRef.current);
    }
    const result = await confirmEarlyAccessCart({
      quoteId: activeQuote.quoteId,
      idempotencyKey: attemptRef.current,
      expectedIntentHash: activeQuote.intentHash,
    });
    setBusy(false);
    submitInFlight.current = false;

    if (!result.ok) {
      if (result.code === "CONNECTION_FAILED") {
        setError("The server answer did not arrive. Retry uses the same cart attempt and cannot create a duplicate.");
        return;
      }
      if (result.code === "QUOTE_EXPIRED" || result.code === "QUOTE_CHANGED") {
        clearCartAttemptKey();
        attemptRef.current = null;
        setQuote(null);
        quoteRef.current = null;
        setError("The server quote changed. Review the cart and quote it again.");
        navigate("details");
        return;
      }
      if (result.code === "IDEMPOTENCY_CONFLICT") {
        setError("This cart attempt already belongs to a different intent. Contact Xenios support before trying a new checkout.");
        return;
      }
      setError(`The cart order was not created (${result.code}). Nothing was charged.`);
      return;
    }

    clearCartAttemptKey();
    attemptRef.current = null;
    // THE QUOTE IS SPENT. Clearing the attempt key without clearing the quote is
    // exactly the state that produced two orders: a live quote plus no key is
    // an invitation to mint a new one. They are cleared together because they
    // mean one thing together, "this placement is finished".
    setQuote(null);
    quoteRef.current = null;
    clearBrowserCart();
    setCart(readBrowserCart());
    setCheckout(result.checkout);
    checkoutRef.current = result.checkout;
    lastCheckoutRef.current = result.checkout.cartCheckoutNumber;
    rememberLastCartCheckoutNumber(result.checkout.cartCheckoutNumber);
    navigate("payment");
  };

  const refreshStatus = async () => {
    const number = checkoutRef.current?.cartCheckoutNumber ?? lastCheckoutRef.current;
    if (number === null) return;
    setStatusLoading(true);
    const result = await loadEarlyAccessCartStatus(number);
    setStatusLoading(false);
    if (result.kind === "ok") {
      setStatus(result.status);
      return;
    }
    setError(result.kind === "locked" ? "Your Early Access session ended. Unlock again to read this cart." : "The cart status could not be loaded.");
  };

  // RE-ASK AT EVERY GATE. The two steps that decide whether ordering may
  // continue re-read the standing on arrival, so a standing that changed since
  // the session began (a revoked acceptance, a new package version, a session
  // that ended) is caught at the gate rather than at the quote. A GET only;
  // nothing here writes, orders or charges.
  useEffect(() => {
    if (step === "catalog" || step === "agreements") recheckAgreements();
  }, [step, recheckAgreements]);

  const back = () => window.history.back();

  return (
    <section className="container-x grid gap-6" style={{ paddingTop: 28, paddingBottom: 48 }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mono-cap text-pulse">Private Early Access</p>
          <h1 className="display-s mt-2">{titleFor(step)}</h1>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onExitEarlyAccess}>
          Exit Early Access
        </button>
      </div>

      <EarlyAccessProgress step={step} onBack={step === "catalog" ? undefined : back} />
      {error ? <p role="alert" className="body-s text-pulse">{error}</p> : null}
      {lineIssues.length > 0 && step === "catalog" ? (
        <EarlyAccessCartLineIssues
          issues={lineIssues}
          products={products}
          onReturn={() => setLineIssues([])}
        />
      ) : null}

      {step === "catalog" ? (
        /*
          The catalogue keeps its agreement card. It is where an unverified
          customer finds the verification panel, and removing it in favour of
          the dedicated step would leave someone who cannot yet see prices with
          no route to fix that. The card and the step are the same component
          reading the same server answer; only one is ever mounted at a time.
        */
        <div data-testid="early-access-cart-agreement-mount">
          <EarlyAccessAgreementSection onAccepted={recheckAgreements} onBlocked={recheckAgreements} />
        </div>
      ) : null}

      {step === "catalog" ? (
        <EarlyAccessCartCatalogue
          products={products}
          cart={cart}
          onPut={put}
          onRemove={remove}
          onOpenCart={() => navigate("cart")}
        />
      ) : null}

      {step === "cart" ? (
        <EarlyAccessCartPanel
          cart={cart}
          products={cartProducts}
          onUpdate={put}
          onRemove={(item) => remove(item.productId, item.variantId)}
          onContinueShopping={() => navigate("catalog")}
          onContinue={() => {
            // The quote route refuses without the acceptance, so refuse here
            // too and send the customer to the step that carries it, rather
            // than letting them fill in shipping for a cart that cannot quote.
            if (!canOrder) {
              navigate("catalog");
              setError("The Research Use Policy must be accepted before this cart can continue. It is at the top of the catalogue.");
              return;
            }
            navigate("details");
          }}
        />
      ) : null}

      {step === "details" ? (
        <EarlyAccessCartDetails
          contact={contact}
          shipTo={shipTo}
          problems={problems}
          busy={busy}
          onContact={setContact}
          onShipTo={setShipTo}
          onBack={() => navigate("cart")}
          onContinue={continueFromDetails}
        />
      ) : null}

      {step === "agreements" ? (
        <EarlyAccessCartAgreements
          standing={standing}
          busy={busy}
          onRecheck={recheckAgreements}
          onBack={() => navigate("details")}
          // The quote is taken HERE, at the end of the agreements step, and it
          // is the server's own re-check: it prices the cart only for a
          // customer whose agreements it can see. A refusal sends the customer
          // straight back to this step rather than to a review with no quote.
          onContinue={() => void quoteCart()}
        />
      ) : null}

      {step === "review" && quote ? (
        <EarlyAccessCartReview
          quote={quote}
          contact={contact}
          shipTo={shipTo}
          busy={busy}
          onBack={() => navigate("agreements")}
          onConfirm={() => void confirm()}
        />
      ) : null}

      {step === "payment" && checkout ? (
        <EarlyAccessCartPayment
          checkout={checkout}
          paymentInstructions={paymentInstructions}
          copied={copied}
          onCopy={() => {
            void navigator.clipboard?.writeText(checkout.invoice.paymentReference);
            setCopied(true);
          }}
          onSubmitOrder={() => navigate("submit")}
          onStatus={() => {
            navigate("status");
            void refreshStatus();
          }}
        />
      ) : null}

      {step === "submit" && checkout ? (
        <EarlyAccessCartSubmit
          cartCheckoutNumber={checkout.cartCheckoutNumber}
          paymentInstructions={paymentInstructions}
          submitProof={submitProof}
          onBack={() => navigate("payment")}
          // THE SERVER DECIDES WHETHER THIS ORDER IS SUBMITTED. Accepting the
          // bytes is not the same fact, so the only thing a successful upload
          // does here is send the customer to the status screen and re-read the
          // projection. If the server does not yet call it submitted, the
          // status says reserved, which is the truth.
          onRecorded={() => {
            navigate("status");
            void refreshStatus();
          }}
          onStatus={() => {
            navigate("status");
            void refreshStatus();
          }}
        />
      ) : null}

      {step === "status" ? (
        <EarlyAccessCartStatusView
          status={status}
          loading={statusLoading}
          onRefresh={() => void refreshStatus()}
          onSubmitOrder={() => navigate("submit")}
          onContinueShopping={() => navigate("catalog")}
        />
      ) : null}

      <p className="body-xs text-ink-mute">
        Cart: {cart.items.length} products · {browserCartUnitCount(cart)} units. Contact and shipping remain in memory only until the server stores the confirmed checkout.
      </p>
    </section>
  );
}
