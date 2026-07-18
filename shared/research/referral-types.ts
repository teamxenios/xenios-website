// xenios research referrals: the shared state contract (V3 sections 68-70, 84).
// This file is the interface between CLAUDE_PRIMARY (backend) and CODEX_UI
// (public referral surfaces). Changing shapes here requires a coordination
// decision or handoff (docs/agent-coordination/).

export type ReferralProgramType = "member" | "ambassador" | "professional" | "internal";
export type ReferralIdentityStatus = "active" | "paused" | "revoked";
export type ReferralAttributionStatus =
  | "visited"
  | "application-started"
  | "application-submitted"
  | "approved"
  | "activated"
  | "qualified"
  | "disqualified"
  | "expired";
export type ReferralRewardStatus =
  | "pending"
  | "held"
  | "available"
  | "redeemed"
  | "expired"
  | "reversed"
  | "cancelled";

// Feature flags (V3 section 84). All default FALSE. When disabled: explanatory
// pages may render, no reward may be issued, no credit promise may show as
// active, and capture endpoints no-op.
export const REFERRAL_FLAGS = [
  "RESEARCH_REFERRALS_ENABLED",
  "RESEARCH_APPLICANT_INVITES_ENABLED",
  "RESEARCH_MEMBER_CREDITS_ENABLED",
  "RESEARCH_AMBASSADORS_ENABLED",
  "RESEARCH_REFERRAL_SOCIAL_CARDS_ENABLED",
] as const;

// What a public surface may ever see about a referrer. Never expose the owner's
// email, database ids, or any application/member data (V3 sections 62, 75).
export type PublicReferrerView = {
  displayMode: "anonymous" | "first-name" | "initials" | "custom";
  displayValue: string | null; // null renders as "A xenios member"
};

// The state a signed-in member's own referral dashboard consumes. Counts only;
// never the referred people's identities or statuses beyond aggregate stages.
export type ReferralDashboardState = {
  enabled: boolean;
  code: string | null;
  counts: {
    visits: number;
    applications: number;
    qualified: number;
  };
  creditAvailableCents: number;
  creditPendingCents: number;
};
