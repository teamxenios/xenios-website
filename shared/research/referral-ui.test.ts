import { describe, expect, it } from "vitest";
import { REFERRAL_SAFE_STATUSES, normalizeReferralCode, referralApplyHref } from "./referral-ui";

describe("referral UI contract", () => {
  it("normalizes codes to a privacy-safe URL alphabet", () => {
    expect(normalizeReferralCode(" samuel-xr82 ")).toBe("SAMUEL-XR82");
    expect(normalizeReferralCode("<script>alert(1)</script>")).toBe("SCRIPTALERT1SCRIPT");
  });

  it("limits codes to 32 characters", () => {
    expect(normalizeReferralCode("A".repeat(64))).toHaveLength(32);
  });

  it("builds an application URL only for a normalized code", () => {
    expect(referralApplyHref("samuel-xr82")).toBe("/research/apply?ref=SAMUEL-XR82");
    expect(referralApplyHref(" ")).toBe("/research/apply");
  });

  it("exposes only privacy-safe referral statuses", () => {
    expect(REFERRAL_SAFE_STATUSES).toEqual(["Invited", "Pending", "Qualified", "Reward earned", "Expired"]);
  });
});
