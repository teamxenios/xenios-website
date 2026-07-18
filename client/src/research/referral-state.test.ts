import { describe, expect, it } from "vitest";
import {
  REFERRAL_FEATURES_OFF,
  parseInvitationCode,
  resolveAggregateDashboardPresentation,
  resolveInvitationRouteState,
  type AggregateReferralDashboardInput,
  type ReferralFeatureAvailability,
} from "./referral-state";

const ALL_FEATURES: ReferralFeatureAvailability = {
  referralsEnabled: true,
  applicantInvitesEnabled: true,
  memberCreditsEnabled: true,
  socialCardsEnabled: true,
  validationEndpointEnabled: true,
};

const ENABLED_DASHBOARD: AggregateReferralDashboardInput = {
  enabled: true,
  code: "MEMBER-XR82",
  counts: { visits: 8, applications: 3, qualified: 1 },
  creditAvailableCents: 1500,
  creditPendingCents: 1500,
};

describe("referral presentation gating", () => {
  it("rejects malformed invitation codes", () => {
    expect(parseInvitationCode("<script>alert(1)</script>")).toBeNull();
    expect(resolveInvitationRouteState({ rawCode: "bad", features: ALL_FEATURES }).status).toBe("invalid");
  });

  it("does not treat a normalized URL code as authentic", () => {
    expect(resolveInvitationRouteState({ rawCode: "member-xr82", features: ALL_FEATURES })).toEqual({
      status: "unavailable",
      code: null,
      applicationHref: "/research/apply",
      canAttachReferral: false,
    });
  });

  it("fails closed while invitation features or validation are disabled", () => {
    const state = resolveInvitationRouteState({
      rawCode: "MEMBER-XR82",
      features: REFERRAL_FEATURES_OFF,
      serverValidatedCode: "MEMBER-XR82",
    });
    expect(state.status).toBe("unavailable");
    expect(state.applicationHref).toBe("/research/apply");
    expect(state.canAttachReferral).toBe(false);
  });

  it("attaches a referral only after enabled server validation", () => {
    expect(resolveInvitationRouteState({
      rawCode: "member-xr82",
      features: ALL_FEATURES,
      serverValidatedCode: "MEMBER-XR82",
    })).toEqual({
      status: "verified",
      code: "MEMBER-XR82",
      applicationHref: "/research/apply?ref=MEMBER-XR82",
      canAttachReferral: true,
    });
  });

  it("zeros and disables production dashboard state while flags are off", () => {
    expect(resolveAggregateDashboardPresentation({
      features: REFERRAL_FEATURES_OFF,
      state: ENABLED_DASHBOARD,
      isDevelopment: false,
      previewRequested: true,
    })).toEqual({
      mode: "disabled",
      counts: { visits: 0, applications: 0, qualified: 0 },
      creditAvailableCents: 0,
      creditPendingCents: 0,
      creditsEnabled: false,
      code: null,
      canShare: false,
    });
  });

  it("allows aggregate-only development preview without QR, sharing, or credits", () => {
    const state = resolveAggregateDashboardPresentation({
      features: REFERRAL_FEATURES_OFF,
      state: null,
      isDevelopment: true,
      previewRequested: true,
      previewState: ENABLED_DASHBOARD,
    });
    expect(state.mode).toBe("development-preview");
    expect(state.counts).toEqual({ visits: 8, applications: 3, qualified: 1 });
    expect(state.creditAvailableCents).toBe(0);
    expect(state.code).toBeNull();
    expect(state.canShare).toBe(false);
    expect(state).not.toHaveProperty("activity");
  });
});
