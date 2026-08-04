import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure Cookie-header and Set-Cookie serialization for the future Private Early
 * Access boundary. This module is intentionally unmounted and has no knowledge
 * of Express, environment variables, passwords, accounts, providers, or a
 * persistence adapter. Every bounded key ring, opaque handle, and clock value
 * is injected.
 */

export const PRIVATE_ACCESS_COOKIE_NAME = "__Host-XeniosPrivateEarlyAccess" as const;
export const PRIVATE_ACCESS_COOKIE_VERSION = "xpa-cookie-v1" as const;
export const PRIVATE_ACCESS_COOKIE_TTL_SECONDS = 15 * 60;
export const PRIVATE_ACCESS_COOKIE_CLOCK_SKEW_SECONDS = 30;
export const PRIVATE_ACCESS_COOKIE_MAX_KEY_COUNT = 4;
export const PRIVATE_ACCESS_COOKIE_MAX_HEADER_BYTES = 4_096;

const COOKIE_MAC_DOMAIN = "xenios:research:private-early-access:cookie-session";
const MIN_SECRET_BYTES = 32;
const MAX_SECRET_BYTES = 4_096;
const SESSION_HANDLE_BYTES = 32;
const SESSION_HANDLE_LENGTH = 43;
const SIGNATURE_BYTES = 32;
const SIGNATURE_LENGTH = 43;
const MAX_COOKIE_VALUE_LENGTH = 512;
const JAVASCRIPT_DATE_MAX_MS = 8_640_000_000_000_000;
const MAX_NOW_MS = Math.min(
  Number.MAX_SAFE_INTEGER,
  JAVASCRIPT_DATE_MAX_MS - PRIVATE_ACCESS_COOKIE_TTL_SECONDS * 1_000,
);
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const CANONICAL_SECONDS = /^(?:[1-9][0-9]*)$/;
const KEY_ID = /^[a-z0-9](?:[a-z0-9_-]{0,31})$/;
const COOKIE_NAME_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

const ISSUE_KEYS = ["keyRing", "now", "sessionHandle"] as const;
const VERIFY_KEYS = ["cookieHeader", "keyRing", "now"] as const;
const KEY_RING_KEYS = ["activeKeyId", "keys"] as const;

type PlainRecord = Record<string, unknown>;
type PrivateAccessCookieKeyRing = Readonly<{
  activeKeyId: string;
  keys: Readonly<Record<string, string>>;
}>;

export type PrivateAccessCookieFailureCode =
  | "CONFIGURATION_INVALID"
  | "INPUT_INVALID"
  | "COOKIE_HEADER_INVALID"
  | "COOKIE_MISSING"
  | "COOKIE_DUPLICATE"
  | "COOKIE_INVALID"
  | "COOKIE_NOT_YET_VALID"
  | "COOKIE_EXPIRED";

export type PrivateAccessCookieMetadata = Readonly<{
  version: typeof PRIVATE_ACCESS_COOKIE_VERSION;
  keyId: string;
  sessionHandle: string;
  issuedAtEpochSeconds: number;
  expiresAtEpochSeconds: number;
}>;

export type PrivateAccessCookieIssueResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        cookieValue: string;
        setCookie: string;
        session: PrivateAccessCookieMetadata;
      }>;
    }>
  | Readonly<{ ok: false; code: PrivateAccessCookieFailureCode }>;

export type PrivateAccessCookieVerificationResult =
  | Readonly<{ ok: true; value: PrivateAccessCookieMetadata }>
  | Readonly<{ ok: false; code: PrivateAccessCookieFailureCode }>;

function failure(code: PrivateAccessCookieFailureCode): Readonly<{
  ok: false;
  code: PrivateAccessCookieFailureCode;
}> {
  return Object.freeze({ ok: false as const, code });
}

/** Detach exact data properties without invoking attacker-controlled accessors. */
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

function validSecret(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const bytes = Buffer.byteLength(value, "utf8");
  return bytes >= MIN_SECRET_BYTES && bytes <= MAX_SECRET_BYTES;
}

function readKeyRing(input: unknown): PrivateAccessCookieKeyRing | null {
  try {
    const ring = readExactPlainRecord(input, KEY_RING_KEYS);
    if (!ring || typeof ring.activeKeyId !== "string" || !KEY_ID.test(ring.activeKeyId)) return null;
    if (typeof ring.keys !== "object" || ring.keys === null) return null;
    const prototype = Object.getPrototypeOf(ring.keys);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(ring.keys);
    if (
      ownKeys.length < 1 ||
      ownKeys.length > PRIVATE_ACCESS_COOKIE_MAX_KEY_COUNT ||
      ownKeys.some((key) => typeof key !== "string" || !KEY_ID.test(key))
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(ring.keys);
    const detached: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const key of ownKeys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !validSecret(descriptor.value)) return null;
      detached[key] = descriptor.value;
    }
    if (!(ring.activeKeyId in detached)) return null;
    return Object.freeze({ activeKeyId: ring.activeKeyId, keys: Object.freeze(detached) });
  } catch {
    return null;
  }
}

function canonicalBase64Url(value: unknown, expectedBytes: number, expectedLength: number): value is string {
  if (typeof value !== "string" || value.length !== expectedLength || !BASE64URL.test(value)) return false;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === expectedBytes && decoded.toString("base64url") === value;
  } catch {
    return false;
  }
}

function validNow(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= MAX_NOW_MS;
}

function canonicalEpochSeconds(value: string): number | null {
  if (!CANONICAL_SECONDS.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function macInput(keyId: string, sessionHandle: string, issuedAt: number, expiresAt: number): string {
  return [
    COOKIE_MAC_DOMAIN,
    PRIVATE_ACCESS_COOKIE_VERSION,
    keyId,
    sessionHandle,
    String(issuedAt),
    String(expiresAt),
  ].join("\0");
}

function signature(
  secret: string,
  keyId: string,
  sessionHandle: string,
  issuedAt: number,
  expiresAt: number,
): Buffer {
  return createHmac("sha256", secret)
    .update(macInput(keyId, sessionHandle, issuedAt, expiresAt), "utf8")
    .digest();
}

function metadata(
  keyId: string,
  sessionHandle: string,
  issuedAt: number,
  expiresAt: number,
): PrivateAccessCookieMetadata {
  return Object.freeze({
    version: PRIVATE_ACCESS_COOKIE_VERSION,
    keyId,
    sessionHandle,
    issuedAtEpochSeconds: issuedAt,
    expiresAtEpochSeconds: expiresAt,
  });
}

function serializeSetCookie(cookieValue: string, expiresAt: number): string | null {
  const expires = new Date(expiresAt * 1_000);
  if (!Number.isFinite(expires.getTime())) return null;
  return `${PRIVATE_ACCESS_COOKIE_NAME}=${cookieValue}; Path=/; Expires=${expires.toUTCString()}; Max-Age=${PRIVATE_ACCESS_COOKIE_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function exactPrivateCookieValue(cookieHeader: unknown):
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false; code: PrivateAccessCookieFailureCode }> {
  if (
    typeof cookieHeader !== "string" ||
    cookieHeader.length === 0 ||
    Buffer.byteLength(cookieHeader, "utf8") > PRIVATE_ACCESS_COOKIE_MAX_HEADER_BYTES ||
    CONTROL_CHARACTER.test(cookieHeader)
  ) {
    return failure("COOKIE_HEADER_INVALID");
  }

  let found: string | null = null;
  for (const rawSegment of cookieHeader.split(";")) {
    const segment = rawSegment.trim();
    const separator = segment.indexOf("=");
    if (separator <= 0) return failure("COOKIE_HEADER_INVALID");
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (!COOKIE_NAME_TOKEN.test(name) || value.length === 0 || value.startsWith('"') || value.endsWith('"')) {
      return failure("COOKIE_HEADER_INVALID");
    }
    if (name.toLowerCase() === PRIVATE_ACCESS_COOKIE_NAME.toLowerCase()) {
      if (name !== PRIVATE_ACCESS_COOKIE_NAME) return failure("COOKIE_HEADER_INVALID");
      if (found !== null) return failure("COOKIE_DUPLICATE");
      found = value;
    }
  }
  return found === null
    ? failure("COOKIE_MISSING")
    : Object.freeze({ ok: true as const, value: found });
}

/**
 * Encode a caller-generated 256-bit opaque handle with the one issue-active
 * key-ring entry. Verify-only prior keys cannot be selected for issuance.
 */
export function encodePrivateAccessCookie(input: unknown): PrivateAccessCookieIssueResult {
  const record = readExactPlainRecord(input, ISSUE_KEYS);
  if (!record) return failure("INPUT_INVALID");
  const keyRing = readKeyRing(record.keyRing);
  if (!keyRing) return failure("CONFIGURATION_INVALID");
  if (
    !validNow(record.now) ||
    !canonicalBase64Url(record.sessionHandle, SESSION_HANDLE_BYTES, SESSION_HANDLE_LENGTH)
  ) {
    return failure("INPUT_INVALID");
  }

  const issuedAt = Math.floor(record.now / 1_000);
  const expiresAt = issuedAt + PRIVATE_ACCESS_COOKIE_TTL_SECONDS;
  const keyId = keyRing.activeKeyId;
  const encodedSignature = signature(
    keyRing.keys[keyId],
    keyId,
    record.sessionHandle,
    issuedAt,
    expiresAt,
  ).toString("base64url");
  const cookieValue = [
    PRIVATE_ACCESS_COOKIE_VERSION,
    keyId,
    record.sessionHandle,
    String(issuedAt),
    String(expiresAt),
    encodedSignature,
  ].join(".");
  if (cookieValue.length > MAX_COOKIE_VALUE_LENGTH) return failure("INPUT_INVALID");
  const setCookie = serializeSetCookie(cookieValue, expiresAt);
  if (!setCookie) return failure("INPUT_INVALID");

  const value = Object.freeze({
    cookieValue,
    setCookie,
    session: metadata(keyId, record.sessionHandle, issuedAt, expiresAt),
  });
  return Object.freeze({ ok: true as const, value });
}

/**
 * Parse exactly one canonical cookie from a raw Cookie header, then verify its
 * key id, integrity, canonical encoding, bounded lifetime, and absolute expiry.
 */
export function decodePrivateAccessCookie(input: unknown): PrivateAccessCookieVerificationResult {
  const record = readExactPlainRecord(input, VERIFY_KEYS);
  if (!record) return failure("INPUT_INVALID");
  const keyRing = readKeyRing(record.keyRing);
  if (!keyRing) return failure("CONFIGURATION_INVALID");
  if (!validNow(record.now)) return failure("INPUT_INVALID");
  const extracted = exactPrivateCookieValue(record.cookieHeader);
  if (!extracted.ok) return extracted;
  if (extracted.value.length > MAX_COOKIE_VALUE_LENGTH) return failure("COOKIE_INVALID");

  const parts = extracted.value.split(".");
  if (parts.length !== 6 || parts[0] !== PRIVATE_ACCESS_COOKIE_VERSION) {
    return failure("COOKIE_INVALID");
  }
  const [, keyId, sessionHandle, issuedAtText, expiresAtText, encodedSignature] = parts;
  if (
    !KEY_ID.test(keyId) ||
    !(keyId in keyRing.keys) ||
    !canonicalBase64Url(sessionHandle, SESSION_HANDLE_BYTES, SESSION_HANDLE_LENGTH) ||
    !canonicalBase64Url(encodedSignature, SIGNATURE_BYTES, SIGNATURE_LENGTH)
  ) {
    return failure("COOKIE_INVALID");
  }
  const issuedAt = canonicalEpochSeconds(issuedAtText);
  const expiresAt = canonicalEpochSeconds(expiresAtText);
  if (issuedAt === null || expiresAt === null) return failure("COOKIE_INVALID");
  if (expiresAt - issuedAt !== PRIVATE_ACCESS_COOKIE_TTL_SECONDS) return failure("COOKIE_INVALID");
  if (expiresAt * 1_000 > JAVASCRIPT_DATE_MAX_MS) return failure("COOKIE_INVALID");

  const provided = Buffer.from(encodedSignature, "base64url");
  const expected = signature(keyRing.keys[keyId], keyId, sessionHandle, issuedAt, expiresAt);
  if (!timingSafeEqual(provided, expected)) return failure("COOKIE_INVALID");

  const nowSeconds = Math.floor(record.now / 1_000);
  if (issuedAt > nowSeconds + PRIVATE_ACCESS_COOKIE_CLOCK_SKEW_SECONDS) {
    return failure("COOKIE_NOT_YET_VALID");
  }
  if (nowSeconds >= expiresAt) return failure("COOKIE_EXPIRED");
  return Object.freeze({ ok: true as const, value: metadata(keyId, sessionHandle, issuedAt, expiresAt) });
}

/** Expire the exact host-only cookie without accepting caller-controlled data. */
export function clearPrivateAccessCookie(): string {
  return `${PRIVATE_ACCESS_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
