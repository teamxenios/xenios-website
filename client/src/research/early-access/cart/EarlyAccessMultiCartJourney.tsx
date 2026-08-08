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
import { EarlyAccessCartReview } from "./EarlyAccessCartReview";
import { EarlyAccessProgress } from "./EarlyAccessProgress";
import {
  listenEarlyAccessHistory,
  pushEarlyAccessStep,
  readEarlyAccessHistoryState,
  replaceEarlyAccessStep,
  type EarlyAccessCheckoutStep,
} from "./history";

const ATTEMPT_KEY = "xenios.research.earlyAccess.cartAttempt.v2";
const LAST_CHECKOUT_KEY = "xenios.research.earlyAccess.lastCartCheckout.v1";

function newAttemptKey(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `xeac_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function sessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function sessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Recovery hint only. Server idempotency remains authoritative.
  }
}
function sessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Best effort only.
  }
}

function readAttempt(): string | null {
  const value = sessionGet(ATTEMPT_KEY);
  return value && /^xeac_[A-Za-z0-9_-]{16,120}$/.test(value) ? value : null;
}

function readLastCheckout(): string | null {
  const value = sessionGet(LAST_CHECKOUT_KEY);
  return value && /^XEC-[A-Z0-9]{16,40}$/.test(value) ? value : null;
}

function titleFor(step: EarlyAccessCheckoutStep): string {
  switch (step) {
    case "catalog": return "Research Catalogue";
    case "cart": return "Your cart";
    case "details": return "Contact & Shipping";
    case "review": return "Review Cart";
    case "payment": return "Payment";
    case "status": return "Status";
  }
}

export type EarlyAccessMultiCartJourneyProps = Readonly<{
  products: readonly EarlyAccessCardProduct[];
  onExitEarlyAccess(): void;
}>;

export function EarlyAccessMultiCartJourney({
  products,
  onExitEarlyAccess,
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
  // Whether the SERVER says this customer has accepted the Research Use Policy.
  // The cart quote refuses with AGREEMENT_REQUIRED until it has, so the
  // agreement has to be reachable from inside this journey; otherwise a
  // customer who has not agreed is told the policy is required and given
  // nothing anywhere to accept it.
  const [agreed, setAgreed] = useState(false);
  const [blocked, setBlocked] = useState<"unverified" | "locked" | null>(null);
  const [lineIssues, setLineIssues] = useState<readonly EarlyAccessCartLineRefusal[]>([]);
  const [problems, setProblems] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef<string | null>(readAttempt());
  const submitInFlight = useRef(false);
  const lastCheckoutRef = useRef<string | null>(readLastCheckout());
  const quoteRef = useRef<EarlyAccessCartQuote | null>(null);
  const checkoutRef = useRef<EarlyAccessCartCheckout | null>(null);

  useEffect(() => { quoteRef.current = quote; }, [quote]);
  useEffect(() => { checkoutRef.current = checkout; }, [checkout]);

  const safeStep = useCallback((requested: EarlyAccessCheckoutStep): EarlyAccessCheckoutStep => {
    if (requested === "review" && quoteRef.current === null) return "details";
    if ((requested === "payment" || requested === "status") && checkoutRef.current === null) {
      return quoteRef.current === null ? "cart" : "review";
    }
    if ((requested === "cart" || requested === "details") && readBrowserCart().items.length === 0) {
      return "catalog";
    }
    return requested;
  }, []);

  useEffect(() => {
    if (readEarlyAccessHistoryState(window.history.state) === null) {
      replaceEarlyAccessStep("catalog");
      setStep("catalog");
    }
    return listenEarlyAccessHistory((requested) => {
      setError(null);
      setStep(safeStep(requested));
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [safeStep]);

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

  /** Ordering continues only once the server has the acceptance on file. */
  const canOrder = agreed && blocked === null;

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

  const quoteCart = async () => {
    const found = [...cartContactProblems(contact), ...cartShippingProblems(shipTo)];
    setProblems(found);
    if (found.length > 0) return;
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
        setError("The Research Use Policy must be accepted before the cart can be quoted.");
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
    if (activeQuote === null || submitInFlight.current) return;
    submitInFlight.current = true;
    setBusy(true);
    setError(null);
    if (attemptRef.current === null) {
      attemptRef.current = newAttemptKey();
      sessionSet(ATTEMPT_KEY, attemptRef.current);
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
        sessionRemove(ATTEMPT_KEY);
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

    sessionRemove(ATTEMPT_KEY);
    attemptRef.current = null;
    clearBrowserCart();
    setCart(readBrowserCart());
    setCheckout(result.checkout);
    checkoutRef.current = result.checkout;
    lastCheckoutRef.current = result.checkout.cartCheckoutNumber;
    sessionSet(LAST_CHECKOUT_KEY, result.checkout.cartCheckoutNumber);
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
        <div data-testid="early-access-cart-agreement-mount">
          <EarlyAccessAgreementSection onAccepted={setAgreed} onBlocked={setBlocked} />
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
          onContinue={() => void quoteCart()}
        />
      ) : null}

      {step === "review" && quote ? (
        <EarlyAccessCartReview
          quote={quote}
          contact={contact}
          shipTo={shipTo}
          busy={busy}
          onBack={() => navigate("details")}
          onConfirm={() => void confirm()}
        />
      ) : null}

      {step === "payment" && checkout ? (
        <EarlyAccessCartPayment
          checkout={checkout}
          copied={copied}
          onCopy={() => {
            void navigator.clipboard?.writeText(checkout.invoice.paymentReference);
            setCopied(true);
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
          onContinueShopping={() => navigate("catalog")}
        />
      ) : null}

      <p className="body-xs text-ink-mute">
        Cart: {cart.items.length} products · {browserCartUnitCount(cart)} units. Contact and shipping remain in memory only until the server stores the confirmed checkout.
      </p>
    </section>
  );
}
