import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ATTRIBUTION_COOKIE_NAME } from "./attribution-cookie";

export const REFERRAL_VISITOR_COOKIE = "xr_ref_visitor";
export { ATTRIBUTION_COOKIE_NAME };
export const REFERRAL_TOKEN_PATTERN = /^r1_[A-Za-z0-9_-]{43}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const REFERRAL_COOKIE_LIFETIME_MS = 30 * 86400000;

export function referralSecretReady(secret: string | null): secret is string { return typeof secret === "string" && Buffer.byteLength(secret) >= 32; }
export function referralDigest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function mac(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", secret).update(`xenios:gen2:referral-v1:${purpose}\0${value}`).digest("base64url");
}
function equal(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function referralPublicToken(secret: string, linkId: string, version: number): string | null {
  return referralSecretReady(secret) && version === 1 && UUID.test(linkId) ? `r1_${mac(secret, "public-link", linkId.toLowerCase())}` : null;
}
export interface ReferralVisitor { nonce: string; expiresAt: number }
export interface ReferralCaptureClaim { touchId: string; subjectKeyHash: string; expiresAt: number }

function seal(secret: string, purpose: string, value: object): string {
  const data = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `xrv1.${data}.${mac(secret, purpose, data)}`;
}
function unseal(secret: string, purpose: string, token: string | null, now: number): Record<string, unknown> | null {
  if (!referralSecretReady(secret) || !token || token.length > 1024) return null;
  const [version, data, signature, extra] = token.split(".");
  if (version !== "xrv1" || extra !== undefined || !data || !signature || !/^[A-Za-z0-9_-]+$/.test(data) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  if (!equal(mac(secret, purpose, data), signature)) return null;
  try {
    const value = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value) || !Number.isSafeInteger(value.expiresAt)
      || value.expiresAt <= now || value.expiresAt > now + REFERRAL_COOKIE_LIFETIME_MS) return null;
    return value;
  } catch { return null; }
}
export function readUniqueCookie(header: string | undefined, name: string): string | null {
  if (!header || header.length > 16384) return null;
  const found = header.split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  return found.length === 1 ? found[0].slice(name.length + 1) : null;
}
export function createReferralVisitor(now: number): ReferralVisitor {
  return { nonce: randomBytes(32).toString("base64url"), expiresAt: now + REFERRAL_COOKIE_LIFETIME_MS };
}
export function sealReferralVisitor(secret: string, visitor: ReferralVisitor): string { return seal(secret, "visitor", visitor); }
export function readReferralVisitor(secret: string, cookie: string | undefined, now: number): ReferralVisitor | null {
  const value = unseal(secret, "visitor", readUniqueCookie(cookie, REFERRAL_VISITOR_COOKIE), now);
  return value && Object.keys(value).length === 2 && typeof value.nonce === "string" && /^[A-Za-z0-9_-]{43}$/.test(value.nonce)
    ? { nonce: value.nonce, expiresAt: value.expiresAt as number } : null;
}
export function referralSubject(secret: string, visitor: ReferralVisitor): string { return referralDigest(mac(secret, "subject", visitor.nonce)); }
export function referralCsrf(secret: string, visitor: ReferralVisitor): string { return mac(secret, "csrf", visitor.nonce); }
export function validReferralCsrf(secret: string, visitor: ReferralVisitor, value: unknown): boolean {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value) && equal(referralCsrf(secret, visitor), value);
}
export function sealReferralCapture(secret: string, claim: ReferralCaptureClaim): string { return seal(secret, "capture", claim); }
export function readReferralCapture(secret: string, cookie: string | undefined, visitor: ReferralVisitor, now: number): ReferralCaptureClaim | null {
  const value = unseal(secret, "capture", readUniqueCookie(cookie, ATTRIBUTION_COOKIE_NAME), now);
  return value && Object.keys(value).length === 3 && typeof value.touchId === "string" && UUID.test(value.touchId)
    && value.subjectKeyHash === referralSubject(secret, visitor)
    ? { touchId: value.touchId, subjectKeyHash: value.subjectKeyHash as string, expiresAt: value.expiresAt as number } : null;
}
export function referralCookie(name: typeof REFERRAL_VISITOR_COOKIE | typeof ATTRIBUTION_COOKIE_NAME, token: string, expiresAt: number, now: number, secure: boolean): string {
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; ${secure ? "Secure; " : ""}Max-Age=${Math.max(0, Math.floor((expiresAt - now) / 1000))}; Expires=${new Date(expiresAt).toUTCString()}`;
}
