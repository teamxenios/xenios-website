/**
 * The pending-order memory for the supervised Early Access pilot.
 *
 * WHAT IS STORED, EXACTLY, AND NOTHING ELSE:
 *
 *  - `xenios.earlyAccess.pendingOrder.v1`: the client-generated idempotency
 *    key plus the exact non-money identity of the attempt it belongs to
 *    (productId, variantId, quantity). Kept ONLY while an order attempt is in
 *    flight or was interrupted, so a refresh mid-attempt can retry with the
 *    SAME key instead of silently creating a second order. Cleared on success
 *    and on deliberate abandonment.
 *  - `xenios.earlyAccess.lastOrder.v1`: the server-issued order number of the
 *    most recent successful placement, so the same browser session can find
 *    its order again after a render failure. The order number alone grants
 *    nothing: every read is re-authorized server-side against the session's
 *    derived customer identity.
 *
 * WHAT IS NEVER STORED HERE: passwords, session cookies (HttpOnly anyway),
 * contact details, shipping addresses, payment references, proofs, or any
 * money figure. An idempotency key and an order number are the two smallest
 * values that make refresh-safety and same-session recovery possible.
 *
 * sessionStorage, not localStorage, on purpose: the pilot identity itself is
 * session-scoped, so the memory of an attempt should die with the browser
 * session the same way the identity does.
 */

import { isEarlyAccessQuantity } from "@shared/research/early-access-quantity";

export const PENDING_ORDER_STORAGE_KEY = "xenios.earlyAccess.pendingOrder.v1";
export const LAST_ORDER_STORAGE_KEY = "xenios.earlyAccess.lastOrder.v1";

export type PendingOrderAttempt = Readonly<{
  idempotencyKey: string;
  productId: string;
  variantId: string;
  quantity: number;
  /**
   * A digest of the COMPLETE intended attempt (product, variant, quantity,
   * contact, every shipping field), so an interrupted attempt can be told
   * apart from an EDITED one without keeping any contact or address text in
   * browser storage. NOT a secret and NOT authorization: the server compares
   * the real fields on every replay and refuses a changed intent regardless.
   * This exists so the UI never SILENTLY resubmits an old attempt as though
   * the customer's edits were part of it.
   */
  fingerprint: string;
}>;

/** The fields whose change makes an attempt a DIFFERENT intended order. */
export type OrderIntent = Readonly<{
  productId: string;
  variantId: string;
  quantity: number;
  email: string;
  phone: string;
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}>;

/**
 * Deterministic, dependency-free digest of an intent (two FNV-1a streams over
 * a canonical field string). Normalized exactly like the server's replay
 * comparison: email case-folded, phone reduced to digits, absent line2 equal
 * to empty, everything trimmed. Collisions are harmless: the server still
 * compares the real fields and conflicts on any true difference.
 */
export function intentFingerprint(intent: OrderIntent): string {
  const canonical = [
    intent.productId,
    intent.variantId,
    String(intent.quantity),
    intent.email.trim().toLowerCase(),
    intent.phone.replace(/[^\d]/g, ""),
    intent.recipientName.trim(),
    intent.line1.trim(),
    (intent.line2 ?? "").trim(),
    intent.city.trim(),
    intent.region.trim(),
    intent.postalCode.trim(),
    intent.country.trim(),
    // Joined on a control character no validated field can contain, so two
    // different field splits can never produce one canonical string.
  ].join("\u001f");
  let first = 0x811c9dc5;
  let second = 0xcbf29ce4;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x01000197) >>> 0;
  }
  return (
    first.toString(16).padStart(8, "0") + second.toString(16).padStart(8, "0")
  );
}

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    // Storage access can throw under strict privacy settings. The checkout
    // still works; it just loses refresh recovery.
    return null;
  }
}

const KEY_SHAPE = /^xea_[a-f0-9]{32}$/;
const FINGERPRINT_SHAPE = /^[a-f0-9]{16}$/;

export function isPendingOrderAttempt(value: unknown): value is PendingOrderAttempt {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.idempotencyKey === "string" &&
    KEY_SHAPE.test(record.idempotencyKey) &&
    typeof record.productId === "string" &&
    record.productId.length > 0 &&
    typeof record.variantId === "string" &&
    record.variantId.length > 0 &&
    // The round's band, read from the one policy rather than restated. This
    // used to be a literal 1 and 3, which is exactly the kind of copy that
    // silently keeps refusing a quantity the server has started accepting.
    isEarlyAccessQuantity(record.quantity) &&
    typeof record.fingerprint === "string" &&
    FINGERPRINT_SHAPE.test(record.fingerprint)
  );
}

export function rememberPendingAttempt(attempt: PendingOrderAttempt): void {
  storage()?.setItem(PENDING_ORDER_STORAGE_KEY, JSON.stringify(attempt));
}

export function readPendingAttempt(): PendingOrderAttempt | null {
  const raw = storage()?.getItem(PENDING_ORDER_STORAGE_KEY);
  if (raw === null || raw === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isPendingOrderAttempt(parsed)) return parsed;
  } catch {
    // Malformed is treated as absent, below.
  }
  // A malformed record cannot be retried safely; forget it rather than
  // resubmitting under a key whose request identity is unknown.
  clearPendingAttempt();
  return null;
}

export function clearPendingAttempt(): void {
  storage()?.removeItem(PENDING_ORDER_STORAGE_KEY);
}

const ORDER_NUMBER_SHAPE = /^XEA-[A-Za-z0-9-]{1,64}$/;

export function rememberLastOrderNumber(orderNumber: string): void {
  if (!ORDER_NUMBER_SHAPE.test(orderNumber)) return;
  storage()?.setItem(LAST_ORDER_STORAGE_KEY, orderNumber);
}

export function readLastOrderNumber(): string | null {
  const raw = storage()?.getItem(LAST_ORDER_STORAGE_KEY);
  if (typeof raw !== "string" || !ORDER_NUMBER_SHAPE.test(raw)) return null;
  return raw;
}

export function clearLastOrderNumber(): void {
  storage()?.removeItem(LAST_ORDER_STORAGE_KEY);
}

/**
 * The idempotency key for one order attempt.
 *
 * Cryptographic randomness ONLY, with deliberately no fallback to any
 * guessable source: a guessable key is a cross-customer replay surface, and
 * every environment this pilot supports has Web Crypto. If crypto is somehow
 * absent, refusing to order is the correct behavior.
 */
export function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return `xea_${cryptoApi.randomUUID().replaceAll("-", "")}`;
  }
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return `xea_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  throw new Error(
    "Secure randomness is unavailable in this browser, so an order cannot be started safely.",
  );
}
