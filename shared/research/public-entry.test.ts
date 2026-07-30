import { describe, expect, it } from "vitest";
import { isResearchPublicEntryPath, isResearchResetPasswordPath } from "./paths";

/**
 * Founder decision 2026-07-30 ("option 1"): open the discover-and-apply entry
 * to Research, keep everything else behind the shared review password.
 *
 * Before this, the shared password gated the gateway itself, so the gateway's
 * own "Apply for Membership" button could not be reached and /research/apply
 * hit the wall directly. A prospective member had no public path into Xenios.
 *
 * The negative half of this file is the important half. The whole risk of the
 * change is that it opens more than intended, and the catalog is the thing the
 * review gate exists to protect while COAs and legal review are outstanding.
 */

const OPEN = [
  "/research",
  "/research/apply",
  "/research/apply/review",
  "/research/apply/success",
  "/research/apply/status",
  "/research/application/status",
  "/research/application-status",
  "/research/policies/privacy",
  "/research/policies/terms",
];

// Every one of these must STAY behind the wall. If a change to the allowlist
// ever lets one through, this file fails before it reaches production.
const STILL_GATED = [
  "/research/member",
  "/research/member/products",
  "/research/member/products/bpc-157",
  "/research/member/supplements",
  "/research/member/cart",
  "/research/member/checkout",
  "/research/member/orders",
  "/research/member/orders/abc123",
  "/research/member/documents",
  "/research/member/blueprint",
  "/research/partners",
  "/research/partners/dashboard",
  "/research/partners/commissions",
  "/research/support",
  "/research/adminx",
  "/research/policies/research-use", // only the two the gateway links are open
  // Near-misses: a prefix match rather than an exact match would wrongly open
  // each of these, which is precisely why the allowlist is exact.
  "/research/applyx",
  "/research/apply-admin",
  "/research/apply/admin",
  "/research/applications",
  "/research/privacy",
  "/research/terms",
  "/research/privacy-internal",
  "/research/terms-internal",
];

describe("public research entry allowlist", () => {
  it.each(OPEN)("opens %s", (path) => {
    expect(isResearchPublicEntryPath(path)).toBe(true);
  });

  it.each(STILL_GATED)("keeps %s behind the password wall", (path) => {
    expect(isResearchPublicEntryPath(path)).toBe(false);
  });

  it("keeps the member area gated for every registered member route shape", () => {
    // Belt and braces: any path under /research/member/ is a member surface and
    // must never be publicly reachable, whatever it is named later.
    for (const suffix of ["", "/", "/anything", "/deeply/nested/thing"]) {
      expect(isResearchPublicEntryPath(`/research/member${suffix}`)).toBe(false);
    }
  });

  it("tolerates a trailing slash, matching the wouter route patterns", () => {
    for (const path of OPEN) {
      expect(isResearchPublicEntryPath(`${path}/`)).toBe(true);
    }
  });

  it("ignores query and hash, so the token-bearing status link resolves", () => {
    // The approved-applicant email links to /research/apply/status?token=...
    // A raw comparison would miss it and drop the applicant on the wall.
    expect(isResearchPublicEntryPath("/research/apply/status?token=abc.def")).toBe(true);
    expect(isResearchPublicEntryPath("/research/apply#section")).toBe(true);
    expect(isResearchPublicEntryPath("/research/apply/status?token=x#y")).toBe(true);
  });

  it("matches the case-insensitive, percent-decoded forms wouter actually renders", () => {
    // wouter compiles every pattern with the i flag and matches the DECODED
    // pathname, so /Research/Apply and /%72esearch/apply both render the apply
    // page. A case-sensitive check here would render the page while the guard
    // thought it was gated.
    expect(isResearchPublicEntryPath("/Research/Apply")).toBe(true);
    expect(isResearchPublicEntryPath("/RESEARCH")).toBe(true);
    expect(isResearchPublicEntryPath("/%72esearch/apply")).toBe(true);
    // The same normalization must not open a gated path.
    expect(isResearchPublicEntryPath("/Research/Member/Products")).toBe(false);
    expect(isResearchPublicEntryPath("/%72esearch/member")).toBe(false);
  });

  it("does not throw on a malformed percent sequence", () => {
    // decodeURI throws on "%zz"; the shared normalizer falls back to the raw
    // string exactly as wouter does. Throwing here would take down the layout.
    expect(() => isResearchPublicEntryPath("/research/%zz")).not.toThrow();
    expect(isResearchPublicEntryPath("/research/%zz")).toBe(false);
  });

  it("never matches the root homepage", () => {
    // The trailing-slash strip turns "/" into "", so this asserts the empty
    // string cannot collide with an allowlist entry.
    expect(isResearchPublicEntryPath("/")).toBe(false);
    expect(isResearchPublicEntryPath("")).toBe(false);
  });

  it("leaves the recovery exemption untouched", () => {
    // Recovery already had its own exemption (2026-07-19). The two must stay
    // independent: reset-password is NOT a public entry path, it renders in
    // isolated recovery chrome, and that routing must not change.
    expect(isResearchPublicEntryPath("/research/reset-password")).toBe(false);
    expect(isResearchResetPasswordPath("/research/reset-password")).toBe(true);
    expect(isResearchPublicEntryPath("/research/sign-in")).toBe(false);
  });
});
