// xenios research membership: shared types and the application state machine.
// The transition map is the single source of truth; the server enforces it.

export const APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "more_information_requested",
  "resubmitted",
  "approved_pending_payment",
  "payment_pending",
  "active",
  "paused",
  "declined",
  "withdrawn",
  "expired",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

// Allowed transitions, enforced server-side on every admin/system action.
export const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["under_review", "withdrawn"],
  under_review: ["more_information_requested", "approved_pending_payment", "declined", "withdrawn"],
  more_information_requested: ["resubmitted", "withdrawn", "expired"],
  resubmitted: ["under_review", "withdrawn"],
  approved_pending_payment: ["payment_pending", "expired", "withdrawn"],
  payment_pending: ["active", "approved_pending_payment", "expired"],
  active: ["paused"],
  paused: ["active"],
  declined: [],
  withdrawn: [],
  expired: [],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// Member account statuses. 'pending_activation' members reach ONLY the
// activation flow; 'active' members reach the member website and catalog;
// 'past_due' members reach billing recovery only; 'paused', 'cancelled', and
// 'closed' lose protected access. past_due/cancelled require the
// research-member-billing.sql migration before the database can store them.
export const MEMBER_STATUSES = [
  "pending_activation",
  "active",
  "past_due",
  "paused",
  "cancelled",
  "closed",
] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

// Billing state, tracked separately from membership status. A single generic
// "active" boolean cannot represent dunning, refunds, or disputes; membership
// authorization requires status AND billing to agree once billing is live
// (RESEARCH_MEMBERSHIP_BILLING_ENABLED). Stored in research_members.billing_state
// after the research-member-billing.sql migration; a missing column or null
// reads as 'not_started'.
export const MEMBER_BILLING_STATES = [
  "not_started",
  "activation_pending",
  "subscription_pending",
  "active",
  "past_due",
  "cancelled",
  "refunded",
  "disputed",
] as const;

export type MemberBillingState = (typeof MEMBER_BILLING_STATES)[number];

export const APPLICATION_INTERESTS = [
  "Whole-life planning",
  "Performance",
  "Recovery",
  "Sleep",
  "Energy",
  "Body composition",
  "Longevity education",
  "Nutrition",
  "Movement and training",
  "Stress and emotional wellbeing",
  "Research education",
  "Supplements",
  "Peptide research",
  "Quantum information",
  "Professional or wholesale access",
] as const;

// What the applicant-facing status endpoint returns (never internal notes).
export type ApplicationStatusView = {
  status: ApplicationStatus;
  firstName: string;
  submittedAt: string;
  memberVisibleNote: string | null;
  approvalExpiresAt: string | null;
};
