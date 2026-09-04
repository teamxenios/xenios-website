import { describe, expect, it } from "vitest";
import { verifyAttributionToken } from "./attribution-cookie";
import { ATTRIBUTION_COOKIE_NAME, REFERRAL_VISITOR_COOKIE, createReferralVisitor, readReferralCapture, readReferralVisitor, readUniqueCookie, referralCookie, referralCsrf, referralDigest, referralPublicToken, referralSecretReady, referralSubject, sealReferralCapture, sealReferralVisitor, validReferralCsrf } from "./referral-v1-tokens";

const secret = "synthetic-referral-test-key-not-for-production-1";
const now = Date.parse("2026-09-04T12:00:00Z");
const linkId = "10000000-0000-4000-8000-000000000001";
describe("Gen2 opaque link and versioned cookie boundaries", () => {
  it("reconstructs only version1 opaque non-identifying public tokens", () => {
    const token = referralPublicToken(secret, linkId, 1)!;
    expect(token).toMatch(/^r1_[A-Za-z0-9_-]{43}$/);
    expect(token).not.toContain(linkId);
    expect(referralPublicToken(secret, linkId, 1)).toBe(token);
    expect(referralPublicToken(secret + "rotate", linkId, 1)).not.toBe(token);
    expect(referralDigest(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(referralPublicToken(secret, linkId, 2)).toBeNull();
    expect(referralPublicToken("weak", linkId, 1)).toBeNull();
    expect(referralPublicToken(secret, "forged", 1)).toBeNull();
    expect(referralSecretReady(null)).toBe(false);
  });
  it("keeps one signed visitor with purpose-bound CSRF and fail-closed tampering/expiry", () => {
    const visitor = createReferralVisitor(now);
    const token = sealReferralVisitor(secret, visitor);
    const cookie = `${REFERRAL_VISITOR_COOKIE}=${token}`;
    expect(readReferralVisitor(secret, cookie, now)).toEqual(visitor);
    expect(validReferralCsrf(secret, visitor, referralCsrf(secret, visitor))).toBe(true);
    expect(validReferralCsrf(secret, createReferralVisitor(now), referralCsrf(secret, visitor))).toBe(false);
    expect(readReferralVisitor(secret, cookie + "x", now)).toBeNull();
    expect(readReferralVisitor(secret + "rotate", cookie, now)).toBeNull();
    expect(readReferralVisitor(secret, cookie, visitor.expiresAt)).toBeNull();
    expect(readReferralVisitor(secret, `${cookie}; ${cookie}`, now)).toBeNull();
    expect(readUniqueCookie(cookie, "unrelated")).toBeNull();
  });
  it("capture cookie locates one durable touch and cannot be an old commission cookie", () => {
    const visitor = createReferralVisitor(now);
    const claim = { touchId: linkId, subjectKeyHash: referralSubject(secret, visitor), expiresAt: now + 86400000 };
    const token = sealReferralCapture(secret, claim);
    const cookie = `${ATTRIBUTION_COOKIE_NAME}=${token}`;
    expect(readReferralCapture(secret, cookie, visitor, now)).toEqual(claim);
    expect(readReferralCapture(secret, cookie, createReferralVisitor(now), now)).toBeNull();
    expect(readReferralVisitor(secret, `${REFERRAL_VISITOR_COOKIE}=${token}`, now)).toBeNull();
    expect(verifyAttributionToken(secret, token, new Date(now))).toBeNull();
    const header = referralCookie(ATTRIBUTION_COOKIE_NAME, token, claim.expiresAt, now, true);
    expect(header).toContain("HttpOnly; SameSite=Lax; Secure;");
    expect(header).not.toContain("Domain=");
  });
});
