import { useCallback, useRef, useState } from "react";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import TouchCheckbox from "@/components/TouchCheckbox";
import Turnstile from "@/components/Turnstile";
import {
  CATALOG_INTEREST_PATH,
  CatalogInterestReceipt,
  type CatalogInterestError,
} from "@shared/catalog-interest";

export const QUICK_ORDER_URL = "https://xeniostechnology.com/research/early-access/order-request";

type Attempt = { id: string };

const PENDING_REQUEST_ID_KEY = "xenios.catalogInterest.pendingRequestId";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CATALOG_INTEREST_REQUEST_TIMEOUT_MS = 15_000;
const UNKNOWN_OUTCOME_MESSAGE =
  "We could not confirm whether your request was saved. Complete verification again, then retry. We will reuse the same request reference to avoid a duplicate.";

class UnknownCatalogInterestOutcome extends Error {
  constructor() {
    super(UNKNOWN_OUTCOME_MESSAGE);
    this.name = "UnknownCatalogInterestOutcome";
  }
}

function readPendingAttempt(): Attempt | null {
  if (typeof window === "undefined") return null;
  try {
    const id = window.sessionStorage.getItem(PENDING_REQUEST_ID_KEY);
    return id && UUID_PATTERN.test(id) ? { id } : null;
  } catch {
    return null;
  }
}

function writePendingAttempt(attempt: Attempt | null): void {
  if (typeof window === "undefined") return;
  try {
    if (attempt) window.sessionStorage.setItem(PENDING_REQUEST_ID_KEY, attempt.id);
    else window.sessionStorage.removeItem(PENDING_REQUEST_ID_KEY);
  } catch {
    // A blocked session store must not replace the server's idempotency contract.
  }
}

function newRequestId(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  if (!webCrypto?.getRandomValues) throw new Error("secure request identity unavailable");
  const bytes = new Uint8Array(16);
  webCrypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function responseMessage(status: number, body: Partial<CatalogInterestError>): string {
  if (status === 409 || body.code === "request_conflict") {
    return "Those details do not match the saved request reference. Submit again to start a new request.";
  }
  if (status === 429 || body.code === "too_many_requests") {
    return "Too many requests. Please wait a few minutes and try again.";
  }
  if (body.code === "verification_failed") {
    return "Verification could not be completed. Please try again.";
  }
  return body.message || "We could not save the request. Please try again.";
}

function hasUnknownHttpOutcome(status: number): boolean {
  return status === 408 || (status >= 500 && status <= 599);
}

async function postCatalogInterest(payload: Record<string, unknown>): Promise<{
  response: Response;
  body: unknown;
}> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(CATALOG_INTEREST_PATH, {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const body: unknown = await response.json().catch(() => ({}));
        return { response, body };
      })(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new UnknownCatalogInterestOutcome());
        }, CATALOG_INTEREST_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (error instanceof UnknownCatalogInterestOutcome) throw error;
    throw new UnknownCatalogInterestOutcome();
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export default function CatalogInterestPage() {
  const [email, setEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileAttempt, setTurnstileAttempt] = useState(0);
  const [emailError, setEmailError] = useState("");
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<ReturnType<typeof CatalogInterestReceipt.parse> | null>(null);
  const attemptRef = useRef<Attempt | null>(readPendingAttempt());
  const handleTurnstileToken = useCallback((token: string) => setTurnstileToken(token), []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalizedEmail)) {
      setEmailError("Enter a valid email address.");
      document.getElementById("catalog-interest-email")?.focus();
      return;
    }
    setEmailError("");

    if (!attemptRef.current) {
      try {
        attemptRef.current = { id: newRequestId() };
        writePendingAttempt(attemptRef.current);
      } catch {
        setServerError("We could not create a secure request reference. Please try again.");
        return;
      }
    }
    const requestId = attemptRef.current.id;

    setSubmitting(true);
    try {
      const { response, body } = await postCatalogInterest({
        requestId,
        email: normalizedEmail,
        marketingConsent,
        confirmEmpty,
        ...(turnstileToken ? { turnstileToken } : {}),
      });
      const parsedReceipt = CatalogInterestReceipt.safeParse(body);
      if (!response.ok) {
        if (hasUnknownHttpOutcome(response.status)) throw new UnknownCatalogInterestOutcome();
        const error = body !== null && typeof body === "object"
          ? body as Partial<CatalogInterestError>
          : {};
        if (response.status === 409 || error.code === "request_conflict") {
          attemptRef.current = null;
          writePendingAttempt(null);
        }
        throw new Error(responseMessage(response.status, error));
      }
      if (!parsedReceipt.success) throw new UnknownCatalogInterestOutcome();
      attemptRef.current = null;
      writePendingAttempt(null);
      setReceipt(parsedReceipt.data);
    } catch (error) {
      setTurnstileToken("");
      setTurnstileAttempt((attempt) => attempt + 1);
      setServerError(error instanceof Error
        ? error.message
        : "We could not save the request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell>
      <SeoHead
        title="Request the catalog and pricing"
        description="Request the current xenios catalog without creating an account or placing an order."
        path="/health/catalog"
      />
      <section className="section-pad border-b border-line">
        <div className="container-x max-w-[980px]">
          <p className="mono-label text-pulse mb-4">XENIOS HEALTH</p>
          <h1 className="display-xl max-w-[14ch]">Request the catalog and pricing.</h1>
          <p className="body-l text-ink-2 mt-6 max-w-[66ch]">
            Enter your email and we will save a request for the current approved catalog.
            No login, subscription, or account is required.
          </p>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-x max-w-[980px] grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-10">
          {receipt ? (
            <div className="card" role="status" data-testid="catalog-interest-success">
              <p className="mono-label text-pulse mb-3">REQUEST SAVED</p>
              <h2 className="h2">Keep this reference.</h2>
              <p className="body-l text-ink-2 mt-5">
                Reference <strong>{receipt.receipt}</strong>.
              </p>
              <p className="body-m text-ink-2 mt-4">
                {receipt.status === "queued"
                  ? "Catalog delivery is queued. If email is delayed, this reference confirms the saved request."
                  : "The catalog authority needs manual review. Your request is saved, but delivery has not been sent or confirmed."}
              </p>
            </div>
          ) : (
            <form className="card" onSubmit={submit} noValidate data-testid="catalog-interest-form">
              {emailError && (
                <div role="alert" className="mb-6" data-testid="catalog-interest-validation-summary">
                  <p className="body-m text-pulse">Check your email address and try again.</p>
                </div>
              )}
              {serverError && (
                <div role="alert" className="mb-6" data-testid="catalog-interest-server-error">
                  <p className="body-m text-pulse">{serverError}</p>
                </div>
              )}

              <label className="mono-label block mb-2" htmlFor="catalog-interest-email">
                Email address
              </label>
              <input
                id="catalog-interest-email"
                className="input min-h-11 w-full"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                aria-invalid={emailError ? true : false}
                aria-describedby={emailError ? "catalog-interest-email-error" : undefined}
                onChange={(event) => setEmail(event.target.value)}
              />
              {emailError && (
                <p id="catalog-interest-email-error" className="body-s text-pulse mt-2">
                  {emailError}
                </p>
              )}

              <div className="mt-6">
                <TouchCheckbox
                  id="catalog-interest-marketing"
                  checked={marketingConsent}
                  onChange={(event) => setMarketingConsent(event.target.checked)}
                >
                  <span className="body-m">
                    Optional: send me occasional xenios updates. This is separate from my catalog
                    request and is not required to receive the catalog.
                  </span>
                </TouchCheckbox>
              </div>

              <div className="hidden" aria-hidden="true">
                <label htmlFor="catalog-interest-confirm-empty">Leave this field empty</label>
                <input
                  id="catalog-interest-confirm-empty"
                  name="catalog-interest-confirm-empty"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
                  value={confirmEmpty}
                  onChange={(event) => setConfirmEmpty(event.target.value)}
                />
              </div>

              <div className="mt-6">
                <Turnstile key={turnstileAttempt} onToken={handleTurnstileToken} />
              </div>

              <button
                type="submit"
                className="btn btn-primary min-h-11 mt-8"
                disabled={submitting}
                data-testid="catalog-interest-submit"
              >
                {submitting ? "Saving request." : "Send me the catalog"}
              </button>
              <p className="body-s text-ink-mute mt-4 max-w-[68ch]">
                This public form is for catalog delivery only. Do not enter medical information.
                It does not place an order, reserve inventory, confirm availability, create an
                account or subscription, approve a purchase, create an invoice, take payment, or
                trigger fulfillment.
              </p>
            </form>
          )}

          <aside className="card h-fit" aria-labelledby="quick-order-heading">
            <p className="mono-label text-pulse mb-3">READY TO REQUEST ITEMS?</p>
            <h2 id="quick-order-heading" className="h3">Quick Order stays separate.</h2>
            <p className="body-m text-ink-2 mt-4">
              Use the existing login-free Quick Order form when you are ready to submit an item request.
            </p>
            <a className="btn btn-secondary min-h-11 mt-6" href={QUICK_ORDER_URL}>
              Open Quick Order
            </a>
            <p className="body-s text-ink-mute mt-4">
              Quick Order is a request workflow. It does not confirm stock, pricing, approval, payment, or fulfillment.
            </p>
          </aside>
        </div>
      </section>
    </PageShell>
  );
}
