// xenios research: the signed affiliate attribution cookie.
//
// The cookie is the customer-side half of a captured referral touch: the
// durable touch row records that the visit happened, and this token lets the
// SERVER later recognize the same browser at conversion time without trusting
// anything the browser says. Three invariants:
//
//   1. Only a verified signature is believed. The token is HMAC-signed with the
//      SAME link secret that signs partner codes (RESEARCH_PARTNER_LINK_SECRET
//      at the composition root), so an absent secret mints nothing and verifies
//      nothing — the same fail-closed rule attribution.ts enforces.
//   2. The browser never names a partner. The partner id rides INSIDE the
//      signed payload; a client that edits it invalidates the signature, and a
//      client that invents a token fails verification. Consumers read the
//      partner only from a verified token, never from a body or query.
//   3. Nothing personal is carried. The payload is partner id, the code that
//      was clicked, the opaque subject key, and two timestamps. No email, no
//      name, no member id — the same privacy rule as the touch ledger.

import { createHmac, timingSafeEqual } from "node:crypto";
import { LinkSecretMissingError } from "./attribution";

export const ATTRIBUTION_COOKIE_NAME = "xr_aff";

/** Versioned so a future scheme can rotate without honoring old tokens by accident. */
const TOKEN_VERSION = "xa1";

export interface AttributionCookieClaims {
  /** The partner the touch attributed. The ONLY source of an affiliate ref. */
  readonly partnerId: string;
  /** The link code that was clicked, for audit continuity with the touch row. */
  readonly code: string;
  /** The opaque subject key the durable touch was written under. Not reversible. */
  readonly subjectKey: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

function b64url(value: string | Buffer): string {
  const buf = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buf.toString("base64url");
}

function sign(secret: string, input: string): string {
  return b64url(createHmac("sha256", secret).update(input, "utf8").digest());
}

/** Constant-time compare that tolerates a length mismatch without leaking it by timing. */
function signaturesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validIsoDate(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}

/**
 * Mint a signed attribution token. Throws LinkSecretMissingError (the same
 * error attribution.ts raises) when the secret is absent: an unsigned
 * attribution token would be a token any visitor could forge to redirect
 * another partner's commission, so there is no unsigned fallback.
 */
export function mintAttributionToken(
  secret: string | null,
  claims: AttributionCookieClaims,
): string {
  if (!secret || secret.length === 0) throw new LinkSecretMissingError();
  const payload = b64url(
    JSON.stringify({
      partnerId: claims.partnerId,
      code: claims.code,
      subjectKey: claims.subjectKey,
      issuedAt: claims.issuedAt,
      expiresAt: claims.expiresAt,
    }),
  );
  const input = `${TOKEN_VERSION}.${payload}`;
  return `${input}.${sign(secret, input)}`;
}

/**
 * Verify a token. Returns the claims only when the signature checks out under
 * THIS secret, the shape is exactly what mint produces, and the token has not
 * expired as of `asOf`. Every other case — missing secret, malformed token,
 * wrong version, forged or truncated signature, expired, non-string or empty
 * fields, unparseable dates — returns null. Null, never a throw: an inbound
 * cookie is untrusted input, and a bad one is a plain miss, not an error.
 */
export function verifyAttributionToken(
  secret: string | null,
  token: string,
  asOf: Date,
): AttributionCookieClaims | null {
  if (!secret || secret.length === 0) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [version, payload, providedSignature] = parts;
  if (version !== TOKEN_VERSION) return null;
  if (!payload || !providedSignature) return null;

  const input = `${version}.${payload}`;
  if (!signaturesMatch(sign(secret, input), providedSignature)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof decoded !== "object" || decoded === null) return null;
  const record = decoded as Record<string, unknown>;
  const { partnerId, code, subjectKey, issuedAt, expiresAt } = record;
  if (
    !nonEmptyString(partnerId) ||
    !nonEmptyString(code) ||
    !nonEmptyString(subjectKey) ||
    !nonEmptyString(issuedAt) ||
    !nonEmptyString(expiresAt)
  ) {
    return null;
  }
  if (!validIsoDate(issuedAt) || !validIsoDate(expiresAt)) return null;
  if (new Date(expiresAt).getTime() <= asOf.getTime()) return null;

  return { partnerId, code, subjectKey, issuedAt, expiresAt };
}

/**
 * Build the Set-Cookie header value for a minted token.
 *
 * HttpOnly (scripts never read it), Secure (never over plain HTTP),
 * SameSite=Lax (survives the top-level navigation from a shared link, but is
 * not sent on cross-site subrequests), Path=/ (the conversion doors live
 * under several prefixes). Max-Age and Expires both, clamped non-negative.
 */
export function attributionSetCookieValue(
  token: string,
  expiresAt: Date,
  asOf: Date,
): string {
  const maxAgeSeconds = Math.max(
    0,
    Math.floor((expiresAt.getTime() - asOf.getTime()) / 1000),
  );
  return [
    `${ATTRIBUTION_COOKIE_NAME}=${token}`,
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${expiresAt.toUTCString()}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

/**
 * Extract the raw attribution token from a Cookie request header, or null.
 * Pure string parsing; no verification happens here.
 */
export function attributionTokenFromCookieHeader(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== ATTRIBUTION_COOKIE_NAME) continue;
    const value = part.slice(eq + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

/**
 * The full verified claims carried by a request's cookie header, or null.
 * This is the seam the Early Access customer-bind adapter consumes.
 */
export function verifiedAttributionFromCookieHeader(
  secret: string | null,
  cookieHeader: string | undefined,
  asOf: Date,
): AttributionCookieClaims | null {
  const token = attributionTokenFromCookieHeader(cookieHeader);
  if (!token) return null;
  return verifyAttributionToken(secret, token, asOf);
}

/**
 * The server-derived affiliate attribution ref for a request: the attributed
 * partner id from a VERIFIED cookie, or null. This — and only this — feeds
 * assisted-order affiliateAttributionRef; a value in a request body never does.
 */
export function verifiedAttributionRefFromCookieHeader(
  secret: string | null,
  cookieHeader: string | undefined,
  asOf: Date,
): string | null {
  return verifiedAttributionFromCookieHeader(secret, cookieHeader, asOf)?.partnerId ?? null;
}
