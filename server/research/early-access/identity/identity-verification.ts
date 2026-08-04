/**
 * Email verification and session binding for Early Access.
 *
 * The rule this module exists to enforce: a session becomes a customer through
 * exactly one of four doors, and never through the shared password.
 *
 *   1. a verified email link,
 *   2. an already authenticated account,
 *   3. an authorized admin selecting the customer,
 *   4. an approved invite token.
 *
 * There is no default owner, no "first active member", no "whoever is signed
 * in", and no anonymous fallback. When none of the four applies, resolution
 * returns null and the caller sells nothing.
 *
 * A verification token is single use, expiring, bound to one email AND to the
 * one session that requested it. That last binding is what stops a token
 * leaked from an inbox, a forwarded email, or a shared screenshot from
 * attaching someone else's identity to the attacker's session.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { CommerceResult } from "../commerce/input-guards";
import type {
  EarlyAccessCustomer,
  EarlyAccessIdentityDirectory,
} from "../routes/ports";
import {
  customerRefFor,
  mayOwnOrders,
  normalizeEmail,
  type EarlyAccessCustomerRecord,
  type EarlyAccessCustomerRepository,
} from "./early-access-customer";

export const VERIFICATION_TOKEN_VERSION = "xeav1" as const;
export const VERIFICATION_TOKEN_PURPOSE =
  "xenios.early-access.identity-verification" as const;
export const VERIFICATION_TOKEN_TTL_SECONDS = 30 * 60;

export type VerificationFailureCode =
  | "TOKEN_MALFORMED"
  | "TOKEN_SIGNATURE_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_ALREADY_USED"
  | "TOKEN_SESSION_MISMATCH"
  | "TOKEN_EMAIL_MISMATCH"
  | "SESSION_ALREADY_BOUND"
  | "CUSTOMER_NOT_FOUND"
  | "CUSTOMER_NOT_APPROVED"
  | "INPUT_INVALID";

type Payload = Readonly<{
  v: typeof VERIFICATION_TOKEN_VERSION;
  p: typeof VERIFICATION_TOKEN_PURPOSE;
  /** Token id. The single-use key. */
  jti: string;
  cid: string;
  /** Normalized, so a token minted for A@x cannot be replayed as a@x. */
  em: string;
  /** The session that asked. A different session may not redeem this. */
  sid: string;
  iat: number;
  exp: number;
}>;

function fail<T>(code: VerificationFailureCode): CommerceResult<T, VerificationFailureCode> {
  return Object.freeze({ ok: false, code }) as CommerceResult<T, VerificationFailureCode>;
}

function encode(payload: Payload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function mac(secret: string, encoded: string): Buffer {
  return createHmac("sha256", secret)
    .update(`${VERIFICATION_TOKEN_PURPOSE}\0${VERIFICATION_TOKEN_VERSION}\0${encoded}`, "utf8")
    .digest();
}

function isSafe(value: unknown, max = 200): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

// ---------------------------------------------------------------------------
// Mint
// ---------------------------------------------------------------------------

export type MintVerificationTokenInput = Readonly<{
  tokenId: string;
  customerId: string;
  email: string;
  sessionId: string;
  nowMs: number;
  secret: string;
  ttlSeconds?: number;
}>;

/**
 * The token is opaque and signed. It is never a sequential id, and it carries no
 * readable customer detail beyond what the holder already supplied, so a status
 * link cannot be walked to another customer's record by incrementing a number.
 */
export function mintVerificationToken(
  input: MintVerificationTokenInput,
): CommerceResult<string, VerificationFailureCode> {
  if (
    !isSafe(input.tokenId) ||
    !isSafe(input.customerId) ||
    !isSafe(input.email, 254) ||
    !isSafe(input.sessionId) ||
    !isSafe(input.secret, 512) ||
    !Number.isSafeInteger(input.nowMs) ||
    input.nowMs <= 0
  ) {
    return fail("INPUT_INVALID");
  }
  const ttl = input.ttlSeconds ?? VERIFICATION_TOKEN_TTL_SECONDS;
  if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > 24 * 60 * 60) {
    return fail("INPUT_INVALID");
  }
  const issuedAt = Math.floor(input.nowMs / 1000);
  const payload: Payload = Object.freeze({
    v: VERIFICATION_TOKEN_VERSION,
    p: VERIFICATION_TOKEN_PURPOSE,
    jti: input.tokenId,
    cid: input.customerId,
    em: normalizeEmail(input.email),
    sid: input.sessionId,
    iat: issuedAt,
    exp: issuedAt + ttl,
  });
  const encoded = encode(payload);
  return Object.freeze({
    ok: true,
    value: `${encoded}.${mac(input.secret, encoded).toString("base64url")}`,
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function parse(
  token: unknown,
  secret: string,
): CommerceResult<Payload, VerificationFailureCode> {
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) {
    return fail("TOKEN_MALFORMED");
  }
  const parts = token.split(".");
  if (parts.length !== 2) return fail("TOKEN_MALFORMED");
  const [encoded, signature] = parts;

  const expected = mac(secret, encoded);
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return fail("TOKEN_SIGNATURE_INVALID");
  }
  // Length is checked first: timingSafeEqual throws on a length mismatch.
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return fail("TOKEN_SIGNATURE_INVALID");
  }

  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return fail("TOKEN_MALFORMED");
  }
  if (
    payload?.v !== VERIFICATION_TOKEN_VERSION ||
    payload?.p !== VERIFICATION_TOKEN_PURPOSE ||
    !isSafe(payload.jti) ||
    !isSafe(payload.cid) ||
    !isSafe(payload.em, 254) ||
    !isSafe(payload.sid) ||
    !Number.isSafeInteger(payload.iat) ||
    !Number.isSafeInteger(payload.exp)
  ) {
    return fail("TOKEN_MALFORMED");
  }
  return Object.freeze({ ok: true, value: payload });
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

/** Single-use enforcement. IN MEMORY until a durable table exists. */
export interface ConsumedTokenStore {
  consume(tokenId: string): Promise<boolean>;
}

export class InMemoryConsumedTokenStore implements ConsumedTokenStore {
  private readonly used = new Set<string>();
  /** True only the first time. Every later call for the same id is false. */
  async consume(tokenId: string): Promise<boolean> {
    if (this.used.has(tokenId)) return false;
    this.used.add(tokenId);
    return true;
  }
}

/** A session may point at exactly one customer, for its whole life. */
export interface SessionBindingStore {
  get(sessionId: string): Promise<string | null>;
  bind(sessionId: string, customerId: string): Promise<boolean>;
}

export class InMemorySessionBindingStore implements SessionBindingStore {
  private readonly bindings = new Map<string, string>();
  async get(sessionId: string): Promise<string | null> {
    return this.bindings.get(sessionId) ?? null;
  }
  /** False when the session is already bound, even to the same customer. */
  async bind(sessionId: string, customerId: string): Promise<boolean> {
    if (this.bindings.has(sessionId)) return false;
    this.bindings.set(sessionId, customerId);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Redeem
// ---------------------------------------------------------------------------

export type RedeemInput = Readonly<{
  token: unknown;
  /** The session presenting the token, read from the request, never the body. */
  sessionId: string;
  secret: string;
  nowMs: number;
  customers: EarlyAccessCustomerRepository;
  consumed: ConsumedTokenStore;
  bindings: SessionBindingStore;
}>;

/**
 * Redemption order matters. Signature, expiry, and the session match are all
 * checked BEFORE the token is consumed, so a token presented by the wrong
 * session is rejected without being burned: the rightful owner can still use it.
 */
export async function redeemVerificationToken(
  input: RedeemInput,
): Promise<CommerceResult<EarlyAccessCustomerRecord, VerificationFailureCode>> {
  if (!isSafe(input.sessionId) || !isSafe(input.secret, 512)) {
    return fail("INPUT_INVALID");
  }
  const parsed = parse(input.token, input.secret);
  if (!parsed.ok) return parsed;
  const payload = parsed.value;

  if (Math.floor(input.nowMs / 1000) >= payload.exp) return fail("TOKEN_EXPIRED");

  // THE binding rule: this token was minted for one session. Another session
  // presenting it, however it was obtained, is refused.
  if (payload.sid !== input.sessionId) return fail("TOKEN_SESSION_MISMATCH");

  const existing = await input.bindings.get(input.sessionId);
  if (existing !== null && existing !== payload.cid) {
    return fail("SESSION_ALREADY_BOUND");
  }

  const customer = await input.customers.findById(payload.cid);
  if (customer === null) return fail("CUSTOMER_NOT_FOUND");
  // The email in the token must still be this customer's email, so changing an
  // address invalidates links already in flight.
  if (customer.normalizedEmail !== payload.em) return fail("TOKEN_EMAIL_MISMATCH");
  if (!mayOwnOrders(customer)) return fail("CUSTOMER_NOT_APPROVED");

  if (!(await input.consumed.consume(payload.jti))) {
    return fail("TOKEN_ALREADY_USED");
  }
  if (existing === null && !(await input.bindings.bind(input.sessionId, customer.id))) {
    return fail("SESSION_ALREADY_BOUND");
  }

  return Object.freeze({ ok: true, value: customer });
}

// ---------------------------------------------------------------------------
// The directory
// ---------------------------------------------------------------------------

export type EarlyAccessCustomerDirectoryDeps = Readonly<{
  /** Reads the session id from the request cookies. Injected, so this module
   *  does not reach into the private-access session lane it does not own. */
  readSessionId(cookieHeader: unknown): string | null;
  bindings: SessionBindingStore;
  customers: EarlyAccessCustomerRepository;
}>;

/**
 * The real identity directory. It resolves ONLY a session that has already been
 * bound through one of the four doors. An unbound session, an unknown customer,
 * or a customer who is not APPROVED all resolve to null, which the order routes
 * treat as "no buyer", so the shared password alone can never place or read an
 * order.
 */
export class EarlyAccessCustomerDirectory implements EarlyAccessIdentityDirectory {
  constructor(private readonly deps: EarlyAccessCustomerDirectoryDeps) {}

  async resolve(
    input: Readonly<{ cookieHeader: unknown }>,
  ): Promise<EarlyAccessCustomer | null> {
    const sessionId = this.deps.readSessionId(input.cookieHeader);
    if (sessionId === null || sessionId.length === 0) return null;

    const customerId = await this.deps.bindings.get(sessionId);
    if (customerId === null) return null;

    const customer = await this.deps.customers.findById(customerId);
    if (customer === null || !mayOwnOrders(customer)) return null;

    return Object.freeze({
      customerRef: customerRefFor(customer),
      displayName: customer.legalName,
    });
  }
}
