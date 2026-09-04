import { describe, expect, it } from "vitest";
import { researchAuthPath, safeResearchReturnTo } from "./auth-return-to";
import { REFERRAL_DESTINATIONS, isRecommendationPath, safeReferralDestination } from "./referral-v1";

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
