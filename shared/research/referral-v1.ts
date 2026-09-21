import { safeResearchReturnTo } from "./auth-return-to";
import { normalizeResearchPath } from "./paths";

/** Fail-closed document privacy zone, including malformed/encoded route variants. */
export function isRecommendationPath(pathname: string): boolean {
  const path = normalizeResearchPath(pathname);
  return path === "/r" || path.startsWith("/r/");
}

/** A smaller subset of the existing auth policy, never a second redirect policy. */
export const REFERRAL_DESTINATIONS = [
  { path: "/health", label: "Xenios Health — choose Care or Research" },
  { path: "/care", label: "Care — explore the appropriate care pathway" },
  { path: "/care/how-it-works", label: "How Care works" },
  { path: "/research", label: "Research — nonclinical access and education" },
  { path: "/research/member/catalog", label: "Research member catalog" },
] as const;

export function safeReferralDestination(value: unknown): string | null {
  if (typeof value !== "string" || safeResearchReturnTo(value) !== value || value.includes("?")) return null;
  return REFERRAL_DESTINATIONS.some((item) => item.path === value)
    || /^\/research\/member\/products\/[a-z0-9][a-z0-9._-]{0,191}$/.test(value) ? value : null;
}

export const REFERRAL_API = {
  links: "/api/research/partner/links",
  bootstrap: "/api/research/referral/bootstrap",
  resolve: "/api/research/referral/resolve",
  capture: "/api/research/referral/capture",
  bind: "/api/research/referral/bind",
  admin: "/api/admin/research/referral-lifecycle",
  adminTransfer: "/api/admin/research/referral-lifecycle/transfer",
} as const;

export type RecommendationState = "ready" | "revoked" | "expired" | "partner_inactive" | "unavailable";
export interface RecommendationLink {
  id: string;
  url: string | null;
  destinationPath: string;
  state: RecommendationState;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  opens: number;
  accountsLinked: number;
}
export interface RecommendationLinks {
  eligible: boolean;
  links: RecommendationLink[];
}
export interface RecommendationContext {
  destinationPath: string;
  sharedBy: "an approved Xenios partner";
  /** The incoming link is valid; this alone does not establish attribution. */
  valid: true;
}
export interface RecommendationCapture {
  destinationPath: string;
  attribution: "recognized" | "retained_ineligible" | "self_referral" | "unavailable";
  accountBinding: "bound" | "sign_in_required" | "not_bound";
  /** True when a later referral was refused and the first valid touch stayed authoritative. */
  conflictPreserved?: boolean;
  /** True when account binding kept an earlier winner instead of the presented touch. */
  bindingConflictPreserved?: boolean;
}
export interface ReferralLifecycleLink extends Omit<RecommendationLink, "url"> { partnerId: string }
export interface ReferralLifecycleEvent {
  id: string;
  eventType: "link_issued" | "link_revoked" | "capture_recorded" | "account_bound";
  partnerId: string;
  linkId: string;
  occurredAt: string;
}
export interface ReferralLifecycleBinding {
  accountKey: string;
  partnerId: string;
  linkId: string;
  touchId: string;
  boundAt: string;
  /** Present on the qualified future-transfer authority; optional for dark predecessor fixtures. */
  revisionId?: string;
  effectiveAt?: string;
  source?: "capture" | "admin_transfer";
  availability: "ready" | "revoked" | "expired" | "partner_inactive" | "self_referral";
}
export interface ReferralLifecycleTransfer {
  id: string;
  accountKey: string;
  previousRevisionId: string;
  previousPartnerId: string;
  previousLinkId: string;
  nextPartnerId: string;
  nextLinkId: string;
  reasonCode: "customer_request" | "documented_correction" | "compliance_action";
  effectiveAt: string;
}
export interface ReferralLifecycle {
  links: ReferralLifecycleLink[];
  events: ReferralLifecycleEvent[];
  bindings: ReferralLifecycleBinding[];
  touches: { touchId: string; linkId: string; partnerId: string; capturedAt: string; expiresAt: string; availability: "ready" | "revoked" | "expired" | "partner_inactive" | "self_referral" }[];
  lineage: {
    state: "available" | "unavailable";
    records: { accountKey: string; type: "request" | "order"; reference: string; state: string; occurredAt: string; attribution: "account_binding_only" }[];
  };
  /** Future-only changes; absent on predecessor database/runtime versions. */
  transfers?: ReferralLifecycleTransfer[];
  /** Arbitrary/backdated corrections remain forbidden. */
  correctionsSupported: false;
  /** A separate append-only CAS transfer command exists; no transfer UI is implied. */
  transfersSupported?: true;
  transferPolicy?: "future_only";
}
