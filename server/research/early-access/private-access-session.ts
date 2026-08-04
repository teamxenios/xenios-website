import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Pure cryptographic core for the future Private Early Access boundary.
//
// This module deliberately knows nothing about Express, cookies, environment
// variables, accounts, providers, or persistence. The eventual route must inject
// every secret, clock value, and nonce. Keeping those seams explicit prevents a
// missing deployment setting from silently falling back to a legacy Research
// password or session token.

export const PRIVATE_ACCESS_SESSION_VERSION = "xpa1" as const;
export const PRIVATE_ACCESS_SESSION_PURPOSE = "xenios.private-early-access.session" as const;
export const PRIVATE_ACCESS_SESSION_TTL_SECONDS = 15 * 60;
export const PRIVATE_ACCESS_SESSION_CLOCK_SKEW_SECONDS = 30;

const TOKEN_MAC_DOMAIN = "xenios:research:private-early-access:session-token";
const MAX_PASSWORD_BYTES = 1_024;
const MIN_SECRET_BYTES = 32;
const MAX_SECRET_BYTES = 4_096;
const NONCE_BYTES = 32;
const NONCE_ENCODED_LENGTH = 43;
const MAX_TOKEN_LENGTH = 1_024;
const MAX_PAYLOAD_BYTES = 512;
const MAX_CONSUMED_NONCES = 128;
const MAX_NOW_MS = Number.MAX_SAFE_INTEGER - PRIVATE_ACCESS_SESSION_TTL_SECONDS * 1_000;

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const NONCE = new RegExp(`^[A-Za-z0-9_-]{${NONCE_ENCODED_LENGTH}}$`);

export type PrivateAccessSessionFailureCode =
  | "CONFIGURATION_INVALID"
  | "INPUT_INVALID"
  | "PASSWORD_INVALID"
  | "TOKEN_INVALID"
  | "TOKEN_NOT_YET_VALID"
  | "TOKEN_EXPIRED"
  | "NONCE_MISMATCH"
  | "TOKEN_REPLAYED";

export type PrivateAccessSessionMetadata = Readonly<{
  version: typeof PRIVATE_ACCESS_SESSION_VERSION;
  purpose: typeof PRIVATE_ACCESS_SESSION_PURPOSE;
  nonce: string;
  issuedAtEpochSeconds: number;
  expiresAtEpochSeconds: number;
}>;

export type PrivateAccessSessionIssueResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        token: string;
        session: PrivateAccessSessionMetadata;
      }>;
    }>
  | Readonly<{ ok: false; code: PrivateAccessSessionFailureCode }>;

export type PrivateAccessSessionVerificationResult =
  | Readonly<{ ok: true; value: PrivateAccessSessionMetadata }>
  | Readonly<{ ok: false; code: PrivateAccessSessionFailureCode }>;

type SessionPayload = Readonly<{
  v: 1;
  purpose: typeof PRIVATE_ACCESS_SESSION_PURPOSE;
  iat: number;
  exp: number;
  nonce: string;
}>;

type PlainRecord = Record<string, unknown>;

const PAYLOAD_KEYS = ["exp", "iat", "nonce", "purpose", "v"] as const;
const ISSUE_KEYS = ["accessPassword", "nonce", "now", "presentedPassword", "sessionSecret"] as const;
const PASSWORD_KEYS = ["accessPassword", "presentedPassword"] as const;
const VERIFY_KEYS = ["consumedNonces", "expectedNonce", "now", "sessionSecret", "token"] as const;

function failure(code: PrivateAccessSessionFailureCode): Readonly<{ ok: false; code: PrivateAccessSessionFailureCode }> {
  return Object.freeze({ ok: false as const, code });
}

/**
 * Read a plain object without invoking accessors. Proxy traps are contained and
 * become a closed boundary rather than an exception or an opportunity to read a
 * secret from an attacker-controlled getter.
 */
function readExactPlainRecord(input: unknown, expectedKeys: readonly string[]): PlainRecord | null {
  try {
    if (typeof input !== "object" || input === null) return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const ownKeys = Reflect.ownKeys(input);
    if (
      ownKeys.length !== expectedKeys.length ||
      ownKeys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
    ) {
      return null;
    }

    const descriptors = Object.getOwnPropertyDescriptors(input);
    const detached: PlainRecord = Object.create(null) as PlainRecord;
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor)) return null;
      detached[key] = descriptor.value;
    }
    return detached;
  } catch {
    return null;
  }
}

function readNonceArray(input: unknown): readonly string[] | null {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input) as Record<string, PropertyDescriptor | undefined>;
    const lengthDescriptor = descriptors["length"];
    if (!lengthDescriptor || !("value" in lengthDescriptor)) return null;
    const length = lengthDescriptor.value;
    if (
      typeof length !== "number" ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > MAX_CONSUMED_NONCES
    ) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(input);
    if (ownKeys.length !== length + 1 || !ownKeys.includes("length")) return null;
    const detached: string[] = [];
    const unique = new Set<string>();
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !validNonce(descriptor.value)) return null;
      if (unique.has(descriptor.value)) return null;
      unique.add(descriptor.value);
      detached.push(descriptor.value);
    }
    if (ownKeys.some((key) => key !== "length" && (typeof key !== "string" || !/^\d+$/.test(key)))) {
      return null;
    }
    return detached;
  } catch {
    return null;
  }
}

function validBoundedString(value: unknown, maxBytes: number): value is string {
  return typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= maxBytes;
}

function validSessionSecret(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const bytes = Buffer.byteLength(value, "utf8");
  return bytes >= MIN_SECRET_BYTES && bytes <= MAX_SECRET_BYTES;
}

function validNonce(value: unknown): value is string {
  if (typeof value !== "string" || !NONCE.test(value)) return false;
  const decoded = decodeCanonicalBase64Url(value, NONCE_BYTES);
  return decoded?.length === NONCE_BYTES;
}

function validNow(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= MAX_NOW_MS;
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Both inputs become fixed-length SHA-256 digests before comparison. */
function fixedDigestEqual(left: string, right: string): boolean {
  return timingSafeEqual(sha256(left), sha256(right));
}

function encodePayload(payload: SessionPayload): string {
  // Explicit construction fixes both the key set and JSON key order.
  const json = JSON.stringify({
    v: payload.v,
    purpose: payload.purpose,
    iat: payload.iat,
    exp: payload.exp,
    nonce: payload.nonce,
  });
  return Buffer.from(json, "utf8").toString("base64url");
}

function macInput(encodedPayload: string): string {
  // NUL separators and a unique purpose domain prevent this signature from
  // being valid for any other Xenios token family.
  return `${TOKEN_MAC_DOMAIN}\0${PRIVATE_ACCESS_SESSION_VERSION}\0${encodedPayload}`;
}

function signature(sessionSecret: string, encodedPayload: string): Buffer {
  return createHmac("sha256", sessionSecret).update(macInput(encodedPayload), "utf8").digest();
}

function decodeCanonicalBase64Url(segment: string, maxBytes: number): Buffer | null {
  try {
    if (!BASE64URL.test(segment)) return null;
    const decoded = Buffer.from(segment, "base64url");
    if (decoded.length === 0 || decoded.length > maxBytes) return null;
    return decoded.toString("base64url") === segment ? decoded : null;
  } catch {
    return null;
  }
}

function metadata(payload: SessionPayload): PrivateAccessSessionMetadata {
  return Object.freeze({
    version: PRIVATE_ACCESS_SESSION_VERSION,
    purpose: PRIVATE_ACCESS_SESSION_PURPOSE,
    nonce: payload.nonce,
    issuedAtEpochSeconds: payload.iat,
    expiresAtEpochSeconds: payload.exp,
  });
}

function parsePayload(encodedPayload: string): SessionPayload | null {
  const decoded = decodeCanonicalBase64Url(encodedPayload, MAX_PAYLOAD_BYTES);
  if (!decoded) return null;

  try {
    const record = readExactPlainRecord(JSON.parse(decoded.toString("utf8")) as unknown, PAYLOAD_KEYS);
    if (!record) return null;
    if (record.v !== 1 || record.purpose !== PRIVATE_ACCESS_SESSION_PURPOSE) return null;
    if (!Number.isSafeInteger(record.iat) || Number(record.iat) <= 0) return null;
    if (!Number.isSafeInteger(record.exp) || Number(record.exp) <= 0) return null;
    if (!validNonce(record.nonce)) return null;

    const payload: SessionPayload = {
      v: 1,
      purpose: PRIVATE_ACCESS_SESSION_PURPOSE,
      iat: Number(record.iat),
      exp: Number(record.exp),
      nonce: record.nonce,
    };
    if (payload.exp - payload.iat !== PRIVATE_ACCESS_SESSION_TTL_SECONDS) return null;
    // A semantically equivalent but non-canonical JSON serialization is not a
    // second valid representation of the same session.
    if (encodePayload(payload) !== encodedPayload) return null;
    return Object.freeze(payload);
  } catch {
    return null;
  }
}

/**
 * Constant-time password check over fixed-length digests. Invalid configuration,
 * hostile inputs, and an incorrect presented password all return false.
 */
export function verifyPrivateAccessPassword(input: unknown): boolean {
  const record = readExactPlainRecord(input, PASSWORD_KEYS);
  if (!record) return false;
  if (!validBoundedString(record.accessPassword, MAX_PASSWORD_BYTES)) return false;
  if (!validBoundedString(record.presentedPassword, MAX_PASSWORD_BYTES)) return false;
  return fixedDigestEqual(record.accessPassword, record.presentedPassword);
}

/** Verify the access password and issue one deterministic, short-lived token. */
export function issuePrivateAccessSession(input: unknown): PrivateAccessSessionIssueResult {
  const record = readExactPlainRecord(input, ISSUE_KEYS);
  if (!record) return failure("INPUT_INVALID");
  if (
    !validBoundedString(record.accessPassword, MAX_PASSWORD_BYTES) ||
    !validSessionSecret(record.sessionSecret)
  ) {
    return failure("CONFIGURATION_INVALID");
  }
  if (!validBoundedString(record.presentedPassword, MAX_PASSWORD_BYTES)) {
    return failure("PASSWORD_INVALID");
  }
  if (!validNow(record.now) || !validNonce(record.nonce)) return failure("INPUT_INVALID");
  if (!fixedDigestEqual(record.accessPassword, record.presentedPassword)) {
    return failure("PASSWORD_INVALID");
  }

  const issuedAt = Math.floor(record.now / 1_000);
  const payload: SessionPayload = Object.freeze({
    v: 1,
    purpose: PRIVATE_ACCESS_SESSION_PURPOSE,
    iat: issuedAt,
    exp: issuedAt + PRIVATE_ACCESS_SESSION_TTL_SECONDS,
    nonce: record.nonce,
  });
  const encodedPayload = encodePayload(payload);
  const token = `${PRIVATE_ACCESS_SESSION_VERSION}.${encodedPayload}.${signature(
    record.sessionSecret,
    encodedPayload,
  ).toString("base64url")}`;
  // This should be unreachable while the canonical payload and nonce bounds hold,
  // but keep the public output bound explicit and fail closed if either evolves.
  if (token.length > MAX_TOKEN_LENGTH) return failure("INPUT_INVALID");
  const value = Object.freeze({ token, session: metadata(payload) });
  return Object.freeze({ ok: true as const, value });
}

/**
 * Verify one token against the caller's expected nonce and replay snapshot.
 * The returned nonce is what a caller records as consumed when it wants
 * one-time semantics; no replay state is hidden inside this pure module.
 */
export function verifyPrivateAccessSession(input: unknown): PrivateAccessSessionVerificationResult {
  const record = readExactPlainRecord(input, VERIFY_KEYS);
  if (!record) return failure("INPUT_INVALID");
  if (!validSessionSecret(record.sessionSecret)) {
    return failure("CONFIGURATION_INVALID");
  }
  if (
    !validBoundedString(record.token, MAX_TOKEN_LENGTH) ||
    !validNonce(record.expectedNonce) ||
    !validNow(record.now)
  ) {
    return failure("INPUT_INVALID");
  }
  const consumedNonces = readNonceArray(record.consumedNonces);
  if (!consumedNonces) return failure("INPUT_INVALID");

  const parts = record.token.split(".");
  if (parts.length !== 3 || parts[0] !== PRIVATE_ACCESS_SESSION_VERSION) {
    return failure("TOKEN_INVALID");
  }
  const [, encodedPayload, encodedSignature] = parts;
  if (!encodedPayload || !encodedSignature) return failure("TOKEN_INVALID");
  const providedSignature = decodeCanonicalBase64Url(encodedSignature, 32);
  if (!providedSignature || providedSignature.length !== 32) return failure("TOKEN_INVALID");

  const expectedSignature = signature(record.sessionSecret, encodedPayload);
  if (!timingSafeEqual(expectedSignature, providedSignature)) return failure("TOKEN_INVALID");

  const payload = parsePayload(encodedPayload);
  if (!payload) return failure("TOKEN_INVALID");
  const nowSeconds = Math.floor(record.now / 1_000);
  if (payload.iat > nowSeconds + PRIVATE_ACCESS_SESSION_CLOCK_SKEW_SECONDS) {
    return failure("TOKEN_NOT_YET_VALID");
  }
  if (nowSeconds >= payload.exp) return failure("TOKEN_EXPIRED");
  if (!fixedDigestEqual(payload.nonce, record.expectedNonce)) return failure("NONCE_MISMATCH");

  let replayed = false;
  for (const consumedNonce of consumedNonces) {
    replayed = fixedDigestEqual(payload.nonce, consumedNonce) || replayed;
  }
  if (replayed) return failure("TOKEN_REPLAYED");

  return Object.freeze({ ok: true as const, value: metadata(payload) });
}
