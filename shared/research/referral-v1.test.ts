import { describe, expect, it } from "vitest";
import { researchAuthPath, safeResearchReturnTo } from "./auth-return-to";
import { REFERRAL_DESTINATIONS, isRecommendationPath, safeReferralDestination, normalizeReadableReferralCode, parseReferralSelector } from "./referral-v1";

describe("recommendation destination is a strict subset of canonical auth continuity", () => {
  it.each([...REFERRAL_DESTINATIONS.map((entry) => entry.path), "/research/member/products/fixture-product"])("preserves %s through reset and sign-in", (path) => {
    expect(safeReferralDestination(path)).toBe(path);
    const reset = new URL(researchAuthPath("/research/reset-password", path), "https://xenios.invalid");
    expect(safeResearchReturnTo(reset.searchParams.get("returnTo"))).toBe(path);
    expect(researchAuthPath("/research/sign-in", reset.searchParams.get("returnTo"))).toContain(encodeURIComponent(path));
  });
  it.each(["https://outside.invalid", "//outside.invalid", "/\\outside.invalid", "/care?clinical=hidden", "/research/member/products/..", "/research/member/products/%2e%2e", "/research/member/products/a#token", "/research/member/products/a?ref=forged", "/admin/research", "/research/member/orders", "/research/account", "/care/appointments", "/research/partners/links", null])("refuses unsafe or unrelated %s", (path) => {
    expect(safeReferralDestination(path)).toBeNull();
  });
  it.each(["/r/r1_opaque", "/R/r1_opaque/", "/%72/r1_opaque", "/r/bad%zz", "/r?ref=bad"])("privacy-covers %s", (path) => expect(isRecommendationPath(path)).toBe(true));
  it.each(["/", "/research", "/resource", "/risky"])("does not capture unrelated %s", (path) => expect(isRecommendationPath(path)).toBe(false));
});

describe("readable referral selector boundary", () => {
  const token = "r1_" + "aB_-".repeat(10) + "aB_", origin = "https://xeniostechnology.com";
  it("normalizes only ASCII aliases and leaves opaque credentials exact", () => {
    expect(normalizeReadableReferralCode(" sam-2026 ")).toBe("SAM-2026");
    expect(parseReferralSelector(token)).toEqual({ kind: "opaque", value: token });
    expect(parseReferralSelector(" sam-2026 ")).toEqual({ kind: "alias", value: "SAM-2026" });
    expect(parseReferralSelector(`${origin}/r/${token}`, origin)).toEqual({ kind: "opaque", value: token });
    expect(parseReferralSelector(`${origin}/r/sam-2026`, origin)).toEqual({ kind: "alias", value: "SAM-2026" });
    expect(parseReferralSelector(" " + token)).toBeNull();
  });
  it.each(["ab", "a".repeat(25), "ＳＡＭ", "ſam", "sam_name", "sam name", "sam@example.invalid", "SAM\u0000", null])("refuses ambiguous/nonbounded alias %j", code => {
    expect(normalizeReadableReferralCode(code)).toBeNull();
  });
  it.each(["https://outside.invalid/r/SAM", "https://user@xeniostechnology.com/r/SAM", "https://xeniostechnology.com/r/SAM?x=1",
    "https://xeniostechnology.com/r/SAM#part", "https://xeniostechnology.com/r/%53AM", "https://xeniostechnology.com/r/a/../SAM",
    "https://xeniostechnology.com/research/SAM", "//outside.invalid/r/SAM"])("rejects foreign/noncanonical pasted link %s", url => {
    expect(parseReferralSelector(url, origin)).toBeNull();
  });
});
