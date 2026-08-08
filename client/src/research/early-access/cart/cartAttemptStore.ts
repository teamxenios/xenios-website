/**
 * The cart's two recovery pointers, and nothing else.
 *
 * These used to be private constants and inline sessionStorage calls inside
 * `EarlyAccessMultiCartJourney`. That had one real consequence: sign-out could
 * not reach them. `EarlyAccessRoute.signOut` cleared the browser cart, the
 * single-product pending attempt and the last order number, but the cart's own
 * attempt key and last checkout number stayed behind, so the next person to
 * unlock on a shared machine inherited the previous purchaser's checkout
 * pointer. Recovery memory that outlives the session it belongs to is not
 * recovery, it is leakage.
 *
 * WHAT IS STORED, EXACTLY:
 *
 *  - `xenios.research.earlyAccess.cartAttempt.v2`: one cryptographically
 *    random idempotency key for the checkout attempt in flight. It is not
 *    authentication and not ownership: the server re-derives the customer from
 *    the session cookie on every call and refuses a changed intent under the
 *    same key regardless of who presents it.
 *  - `xenios.research.earlyAccess.lastCartCheckout.v1`: the server-issued cart
 *    checkout number of the most recent successful placement, so a refresh
 *    after confirmation finds the checkout again. The number alone authorizes
 *    nothing; every read is re-authorized server-side and answers an
 *    indistinguishable 404 for anyone else's.
 *
 * WHAT IS NEVER STORED HERE: contact details, shipping, money, payment
 * reference, proof, supplier identity, customer reference, or session id.
 *
 * sessionStorage only. Never localStorage: the pilot identity is itself
 * session-scoped, so its recovery memory dies with the session.
 */

export const CART_ATTEMPT_STORAGE_KEY = "xenios.research.earlyAccess.cartAttempt.v2";
export const LAST_CART_CHECKOUT_STORAGE_KEY = "xenios.research.earlyAccess.lastCartCheckout.v1";

const ATTEMPT_SHAPE = /^xeac_[A-Za-z0-9_-]{16,120}$/;
const CHECKOUT_NUMBER_SHAPE = /^XEC-[A-Z0-9]{16,40}$/;

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    // Storage can throw under strict privacy settings. Checkout still works;
    // it just loses refresh recovery, and server idempotency stays
    // authoritative either way.
    return null;
  }
}

function readShaped(key: string, shape: RegExp): string | null {
  const raw = storage()?.getItem(key);
  if (typeof raw !== "string" || !shape.test(raw)) {
    // A malformed value cannot be retried or looked up safely, so forget it
    // rather than submitting under a request identity nothing can vouch for.
    if (raw !== null && raw !== undefined) storage()?.removeItem(key);
    return null;
  }
  return raw;
}

/**
 * A cryptographically random attempt key. No fallback to a guessable source:
 * a guessable idempotency key is a cross-customer replay surface, and refusing
 * to start a checkout is the correct outcome when secure randomness is absent.
 */
export function newCartAttemptKey(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error(
      "Secure randomness is unavailable in this browser, so a cart checkout cannot be started safely.",
    );
  }
  const bytes = new Uint8Array(18);
  cryptoApi.getRandomValues(bytes);
  return `xeac_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function readCartAttemptKey(): string | null {
  return readShaped(CART_ATTEMPT_STORAGE_KEY, ATTEMPT_SHAPE);
}

export function rememberCartAttemptKey(key: string): void {
  if (!ATTEMPT_SHAPE.test(key)) return;
  try {
    storage()?.setItem(CART_ATTEMPT_STORAGE_KEY, key);
  } catch {
    // Recovery hint only.
  }
}

export function clearCartAttemptKey(): void {
  try {
    storage()?.removeItem(CART_ATTEMPT_STORAGE_KEY);
  } catch {
    // Best effort only.
  }
}

export function readLastCartCheckoutNumber(): string | null {
  return readShaped(LAST_CART_CHECKOUT_STORAGE_KEY, CHECKOUT_NUMBER_SHAPE);
}

export function rememberLastCartCheckoutNumber(checkoutNumber: string): void {
  if (!CHECKOUT_NUMBER_SHAPE.test(checkoutNumber)) return;
  try {
    storage()?.setItem(LAST_CART_CHECKOUT_STORAGE_KEY, checkoutNumber);
  } catch {
    // Recovery hint only.
  }
}

export function clearLastCartCheckoutNumber(): void {
  try {
    storage()?.removeItem(LAST_CART_CHECKOUT_STORAGE_KEY);
  } catch {
    // Best effort only.
  }
}

/** Everything a sign-out must forget about an in-flight or finished cart. */
export function clearCartRecovery(): void {
  clearCartAttemptKey();
  clearLastCartCheckoutNumber();
}

/** The complete set of Early Access cart recovery keys, for the storage audit. */
export const EARLY_ACCESS_CART_RECOVERY_KEYS = Object.freeze([
  CART_ATTEMPT_STORAGE_KEY,
  LAST_CART_CHECKOUT_STORAGE_KEY,
]);
