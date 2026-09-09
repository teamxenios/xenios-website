// The checkout-in-progress pointer that survives a refresh.
//
// A durable checkout that stopped for bank authentication, or whose answer
// was lost, must be RESUMED after a refresh rather than started again: a new
// request key would be a second order. What is kept is only the lookup
// reference (the request key and the order id it produced), never a client
// secret, a card token or any checkout detail. The reference authorizes
// nothing: the page presents it to the owner-checked continuation door, and
// the server answers not_found for any account that is not the buyer.
//
// The record is bound to the server-derived cart scope of the account that
// created it, so another account signing in on the same browser never sees
// it, and it lives in sessionStorage (this tab only). It is cleared when the
// execution reaches a terminal state, when the server disowns it, or when the
// scope changes.

const KEY = "xenios.research.checkoutResume.v1";
const SCOPE = /^[a-f0-9]{64}$/;
const REQUEST_KEY = /^[A-Za-z0-9_-]{8,120}$/;

export interface CheckoutResumeRecord {
  scope: string;
  requestKey: string;
  orderId: string;
  startedAt: string;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function readCheckoutResume(scope: string | null | undefined): CheckoutResumeRecord | null {
  if (!scope || !SCOPE.test(scope)) return null;
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.scope !== scope) return null;
    if (typeof record.requestKey !== "string" || !REQUEST_KEY.test(record.requestKey)) return null;
    if (typeof record.orderId !== "string" || record.orderId.length === 0 || record.orderId.length > 120) return null;
    if (typeof record.startedAt !== "string") return null;
    return { scope, requestKey: record.requestKey, orderId: record.orderId, startedAt: record.startedAt };
  } catch {
    return null;
  }
}

export function writeCheckoutResume(record: CheckoutResumeRecord): void {
  if (!SCOPE.test(record.scope) || !REQUEST_KEY.test(record.requestKey)) return;
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(record));
  } catch {
    // A blocked store is equivalent to no persistence; the server still owns the truth.
  }
}

export function clearCheckoutResume(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
