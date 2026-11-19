import { describe, expect, it, vi } from "vitest";
import type { AssistedOrderViewer } from "../ports";
import { ATTRIBUTION_COOKIE_NAME, REFERRAL_VISITOR_COOKIE, referralSubject,
  sealReferralCapture, sealReferralVisitor } from "../../partners/referral-v1-tokens";
import { createRequestReferralSource, normalizeRequestReferralSource } from "./referral-source";

const actor = "10000000-0000-4000-8000-000000000001", touch = "20000000-0000-4000-8000-000000000001";
const now = 1_795_100_000_000, secret = "synthetic-referral-secret-not-a-runtime-key-0123456789";
const member: AssistedOrderViewer = { actorType: "member", memberId: "synthetic-member", authUserId: actor,
  earlyAccessSessionHash: null, normalizedEmail: "synthetic@example.invalid", capabilities: new Set(["assisted_orders:submit"]) };
const guest: AssistedOrderViewer = { actorType: "early_access_session", memberId: null, authUserId: null,
  earlyAccessCustomerRef: "opaque-customer", earlyAccessSessionHash: "opaque-session", normalizedEmail: null,
  capabilities: new Set(["assisted_orders:submit"]) };
function cookies(expiresAt = now + 45_000, cookieSecret = secret) {
  const visitor = { nonce: "a".repeat(43), expiresAt: now + 60_000 };
  const subjectKeyHash = referralSubject(cookieSecret, visitor);
  const claim = { touchId: touch, subjectKeyHash, expiresAt };
  return { claim, header: `${REFERRAL_VISITOR_COOKIE}=${sealReferralVisitor(cookieSecret, visitor)}; ${ATTRIBUTION_COOKIE_NAME}=${sealReferralCapture(cookieSecret, claim)}` };
}
function factory(enabled = true, suppliedSecret: string | null = secret) {
  const getSecret = vi.fn(() => suppliedSecret), clock = vi.fn(() => now);
  return { read: createRequestReferralSource({ enabled, getSecret, now: clock }), getSecret, clock };
}
describe("private locator factory reusing canonical V1 signed source", () => {
  it("does no secret/cookie/clock work at construction or when disabled", () => {
    const f = factory(false); expect(f.getSecret).not.toHaveBeenCalled(); expect(f.clock).not.toHaveBeenCalled();
    expect(f.read(member, "malformed")).toEqual({ kind: "unavailable", reason: "disabled" });
    expect(f.getSecret).not.toHaveBeenCalled(); expect(f.clock).not.toHaveBeenCalled();
  });
  it("uses only the verified member actor, ignoring conflicting cookies and reported identity", () => {
    const f = factory(); const source = f.read(member, cookies().header);
    expect(source).toEqual({ kind: "account", actorAuthUserId: actor }); expect(Object.isFrozen(source)).toBe(true);
    expect(f.getSecret).not.toHaveBeenCalled(); expect(f.clock).not.toHaveBeenCalled();
    expect(f.read({ ...member, authUserId: null }, cookies().header)).toEqual({ kind: "unavailable", reason: "invalid_source" });
    expect(f.getSecret).not.toHaveBeenCalled();
  });
  it("preserves the exact signed epoch-MILLISECOND expiry and returns no partner decision or raw cookie", () => {
    const f = factory(), value = cookies(), source = f.read(guest, value.header);
    expect(source).toEqual({ kind: "guest_touch", touchId: touch, subjectKeyHash: value.claim.subjectKeyHash, claimExpiresAt: value.claim.expiresAt });
    expect(Object.isFrozen(source)).toBe(true);
    expect(JSON.stringify(source)).not.toMatch(/partnerId|email|nonce|xrv1|eligible|commission/);
    expect(f.getSecret).toHaveBeenCalledTimes(1); expect(f.clock).toHaveBeenCalledTimes(1);
  });
  it("keeps unavailable configuration separate from absent supported touch", () => {
    expect(factory(true, null).read(guest, cookies().header)).toEqual({ kind: "unavailable", reason: "unconfigured" });
    expect(factory().read(guest, "unrelated=value")).toEqual({ kind: "no_supported_touch" });
    expect(factory().read(guest, undefined)).toEqual({ kind: "no_supported_touch" });
    expect(createRequestReferralSource({ enabled: true, getSecret: () => { throw Error("private configuration"); }, now: () => now })(guest, undefined))
      .toEqual({ kind: "unavailable", reason: "unconfigured" });
  });
  it("returns no supported touch for a valid signed visitor without capture, just as for no cookies", () => {
    const value = cookies(), visitorOnly = value.header.split("; ")[0];
    for (const header of [undefined, "unrelated=value", visitorOnly, visitorOnly + "; unrelated=value"]) {
      const source = factory().read(guest, header);
      expect(source).toEqual({ kind: "no_supported_touch" }); expect(Object.isFrozen(source)).toBe(true);
      expect(source).not.toHaveProperty("partnerId"); expect(source).not.toHaveProperty("subjectKeyHash");
    }
    expect(factory().read(guest, value.header)).toMatchObject({ kind: "guest_touch", touchId: touch });
    expect(factory(true, null).read(guest, visitorOnly)).toEqual({ kind: "unavailable", reason: "unconfigured" });
  });
  it.each(["malformed-visitor", "bare-visitor", "expired-visitor", "forged-visitor", "duplicate-visitor", "empty-capture", "malformed-capture", "bare-capture", "duplicate-capture", "capture-without-visitor"])("does not mistake %s for an absent capture", kind => {
    const value = cookies(), [visitorOnly, captureOnly] = value.header.split("; ");
    let header = visitorOnly;
    if (kind === "malformed-visitor") header = `${REFERRAL_VISITOR_COOKIE}=malformed`;
    if (kind === "bare-visitor") header = REFERRAL_VISITOR_COOKIE;
    if (kind === "expired-visitor") header = `${REFERRAL_VISITOR_COOKIE}=${sealReferralVisitor(secret, { nonce: "a".repeat(43), expiresAt: now })}`;
    if (kind === "forged-visitor") header = visitorOnly.slice(0, -1) + (visitorOnly.endsWith("A") ? "B" : "A");
    if (kind === "duplicate-visitor") header = visitorOnly + "; " + visitorOnly;
    if (kind === "empty-capture") header = visitorOnly + `; ${ATTRIBUTION_COOKIE_NAME}=`;
    if (kind === "malformed-capture") header = visitorOnly + `; ${ATTRIBUTION_COOKIE_NAME}=malformed`;
    if (kind === "bare-capture") header = visitorOnly + `; ${ATTRIBUTION_COOKIE_NAME}`;
    if (kind === "duplicate-capture") header = value.header + "; " + captureOnly;
    if (kind === "capture-without-visitor") header = captureOnly;
    expect(factory().read(guest, header)).toEqual({ kind: "unavailable", reason: "invalid_source" });
  });
  it.each(["forged", "expired", "duplicate", "other-subject", "oversized"])("refuses %s guest source without minting a replacement", kind => {
    const value = cookies(); let header = value.header;
    if (kind === "forged") header = header.slice(0, -1) + (header.endsWith("A") ? "B" : "A");
    if (kind === "expired") header = cookies(now).header;
    if (kind === "duplicate") header += "; " + header;
    if (kind === "other-subject") header = `${REFERRAL_VISITOR_COOKIE}=${sealReferralVisitor(secret, { nonce: "b".repeat(43), expiresAt: now + 60_000 })}; ` + header.split("; ")[1];
    if (kind === "oversized") header = "x".repeat(16385);
    expect(factory().read(guest, header)).toEqual({ kind: "unavailable", reason: "invalid_source" });
  });
});
describe("closed immutable locator, never an authoritative decision", () => {
  it.each([null, [], {}, { kind: "account", actorAuthUserId: actor, partnerId: touch },
    { kind: "account", actorAuthUserId: "another-account" }, { kind: "no_supported_touch", eligible: true },
    { kind: "unavailable", reason: "private diagnostic" },
    { kind: "guest_touch", touchId: touch, subjectKeyHash: "a".repeat(64), claimExpiresAt: String(now) },
    { kind: "guest_touch", touchId: touch, subjectKeyHash: "a".repeat(64), claimExpiresAt: now + 0.5 },
    { kind: "guest_touch", touchId: touch, subjectKeyHash: "A".repeat(64), claimExpiresAt: now },
  ].map(raw => ({ raw })))("refuses unknown decisions, malformed IDs/hashes/units and extra fields %#", ({ raw }) => {
    expect(normalizeRequestReferralSource(raw)).toEqual({ kind: "unavailable", reason: "invalid_source" });
  });
  it("does not invoke accessors or inherit fields; copies the source against mutation", () => {
    let reads = 0;
    expect(normalizeRequestReferralSource(Object.defineProperty({ kind: "account" }, "actorAuthUserId", { get() { reads++; return actor; } })))
      .toEqual({ kind: "unavailable", reason: "invalid_source" });
    expect(reads).toBe(0);
    expect(normalizeRequestReferralSource(Object.create({ kind: "account", actorAuthUserId: actor })))
      .toEqual({ kind: "unavailable", reason: "invalid_source" });
    const raw = { kind: "account", actorAuthUserId: actor }, source = normalizeRequestReferralSource(raw);
    raw.actorAuthUserId = touch; expect(source).toEqual({ kind: "account", actorAuthUserId: actor });
    expect(Object.isFrozen(source)).toBe(true);
  });
});
