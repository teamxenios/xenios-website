import type { Express, RequestHandler } from "express";
import { APPROVED_USER_ACCESS_PATH, ApprovedUserAccessInput, ApprovedUserAccessSchema, type ApprovedUserAccess } from "@shared/research/approved-user-access";
import { DEFAULT_PARTNER_REQUIREMENTS } from "./partners/partners";

export interface AccessInspectionFacts {
  auth: Array<{ id: string; email: string; emailVerified: boolean; signInRecorded: boolean }>;
  applications: Array<{ id: string; email: string; status: string; updatedAt?: string | null }>;
  approvedCustomerAccess?: boolean;
  partnerLifecycleReview?: boolean;
  members: Array<{ id: string; email: string; authUserId: string | null; status: string }>;
  partners: Array<{
    id: string; memberId: string; role: string; state: string; identityVerified: boolean; updatedAt?: string | null;
    taxStatus: string; payoutStatus: string; certifiedAt: string | null; certifiedByAdminId?: string | null;
    agreements: Array<{ key: string; version: string; accepted: boolean; contentHash: string; decidedAt: string }>;
    training: Array<{ key: string; version: string; completedAt: string }>;
  }>;
  organizations: ApprovedUserAccess["organizationRelationships"];
}
export interface AccessInspectionDependencies {
  inspect(email: string): Promise<AccessInspectionFacts>;
  membershipBillingEnabled(): boolean;
  now(): Date;
}

export function projectAccessInspection(email: string, facts: AccessInspectionFacts, deps: Pick<AccessInspectionDependencies, "membershipBillingEnabled" | "now">): ApprovedUserAccess {
  const now = deps.now();
  const validPast = (value: string | null) => value !== null && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now.getTime();
  const identityConflict = facts.auth.length > 1 || facts.auth.some((a) => a.email.toLowerCase() !== email);
  const auth = !identityConflict && facts.auth.length === 1 ? facts.auth[0] : null;
  const members: ApprovedUserAccess["members"] = facts.members.map((member) => ({
    id: member.id, status: member.status, authUserId: member.authUserId,
    binding: identityConflict || member.email.toLowerCase() !== email ? "conflict"
      : member.authUserId === null ? "missing"
      : !auth || auth.id !== member.authUserId ? "conflict"
      : auth.emailVerified ? "verified" : "unverified",
    href: `/admin/research/members/${member.id}`,
  }));
  const partners: ApprovedUserAccess["partners"] = facts.partners.map((partner) => {
    const member = members.find((m) => m.id === partner.memberId);
    const missing: string[] = [];
    if (!member || member.binding !== "verified") missing.push("verified_member_binding");
    if (!member || member.status !== "active") missing.push("active_customer_access");
    if (!partner.identityVerified) missing.push("identity_verification");
    if (partner.taxStatus !== "verified") missing.push("tax_clearance");
    if (partner.payoutStatus !== "verified") missing.push("payout_readiness");
    for (const required of DEFAULT_PARTNER_REQUIREMENTS.agreements) {
      if (!partner.agreements.some((a) => a.key === required.key && a.version === required.version && a.accepted && a.contentHash.trim() !== "" && validPast(a.decidedAt))) {
        missing.push(`agreement:${required.key}:${required.version}`);
      }
    }
    for (const required of DEFAULT_PARTNER_REQUIREMENTS.trainingModules) {
      if (!partner.training.some((t) => t.key === required.key && t.version === required.version && validPast(t.completedAt))) {
        missing.push(`training:${required.key}:${required.version}`);
      }
    }
    if (!validPast(partner.certifiedAt) || !partner.certifiedByAdminId) missing.push("admin_certification");
    if (partner.state !== "active") missing.push("admin_activation");
    return { id: partner.id, memberId: partner.memberId, role: partner.role, state: partner.state, binding: member?.binding ?? "missing", updatedAt: partner.updatedAt ?? null, missingRequirements: missing };
  });
  const nextActions: ApprovedUserAccess["nextActions"] = [];
  if (identityConflict || members.some((m) => m.binding === "conflict")) {
    nextActions.push({ label: "Resolve identity conflict", href: null, notification: "none", consequence: "Review the exact Auth and member identifiers. No email-based rebinding or account merging is performed." });
  } else if (facts.applications.length === 0 && members.length === 0) {
    nextActions.push({ label: facts.approvedCustomerAccess ? "Approve customer access" : "Prepare approved account access", href: null,
      notification: facts.approvedCustomerAccess ? "application_email" : "not_available",
      consequence: facts.approvedCustomerAccess
        ? "The explicit approval action records customer approval and queues an ownership-verification email. Claiming it opens customer access without a paid membership. Partner and Care authority are separate."
        : "No account or application exists. The public application page is currently read-only. Use the approved-account workflow once provisioned; it must send an ownership-verification link and grant no partner or Care authority." });
  }
  for (const application of facts.applications) {
    nextActions.push({ label: "Review customer application", href: `/admin/research/applications/${application.id}`, notification: "none", consequence: "Reviewing the record sends nothing. Paid membership approval has been retired. Use the explicit Approve customer access workflow; it does not verify payment or approve a partner." });
  }
  if (members.some((m) => m.status !== "active") && !facts.approvedCustomerAccess) {
    nextActions.push({ label: "Customer access approval required", href: null, notification: "not_available", consequence: "Paid membership is no longer the launch access model. The approved-account workflow must be provisioned before granting access; do not invent payment verification or use a sponsored business claim as a shortcut." });
  }
  if (partners.length || members.length) {
    nextActions.push(facts.partnerLifecycleReview
      ? { label: "Review partner access", href: null, notification: "none", consequence: "Use the explicit partner review actions after verifying the customer identity and reviewing actual requirement evidence. Certification and activation are separate actions. No commission terms, payout or notification is created." }
      : { label: "Partner lifecycle provisioning required", href: null, notification: "not_available", consequence: "The partner review authority could not be confirmed. Customer approval does not certify or activate a partner, create commission terms or send a partner invitation." });
  }
  return ApprovedUserAccessSchema.parse({
    schemaVersion: 1, observedAt: now.toISOString(), email,
    identityState: identityConflict || members.some((m) => m.binding === "conflict") ? "conflict" : !auth ? "absent" : auth.emailVerified ? "verified" : "unverified",
    authAccounts: facts.auth.map((a) => ({ authUserId: a.id, emailVerified: a.emailVerified, signInRecorded: a.signInRecorded })),
    applications: facts.applications.map((a) => ({ id: a.id, status: a.status, href: `/admin/research/applications/${a.id}`, updatedAt: a.updatedAt ?? null })),
    members, partners, partnerRequirements: facts.partnerLifecycleReview ? DEFAULT_PARTNER_REQUIREMENTS : null, organizationRelationships: facts.organizations,
    boundaries: { care: "separate_authority", membershipBillingEnabled: deps.membershipBillingEnabled(), customerAccessApproval: facts.approvedCustomerAccess ? "available" : "unavailable", partnerLifecycleReview: facts.partnerLifecycleReview ? "available" : "unavailable", referralEligibility: "checked_by_referral_authority" },
    nextActions,
  });
}

export function registerAccessInspectionApi(app: Express, deps: AccessInspectionDependencies, requireAdmin: RequestHandler): void {
  // POST keeps the exact email out of URLs, access logs and referrers. This
  // handler only reads; there is no approval, invitation or account writer.
  app.post(APPROVED_USER_ACCESS_PATH, (_req, res, next) => {
    res.set({ "Cache-Control": "private, no-store", Pragma: "no-cache", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", Vary: "Authorization, Cookie" });
    next();
  }, requireAdmin, async (req, res) => {
    const input = ApprovedUserAccessInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ ok: false, code: "invalid_input" });
    try {
      const inspection = projectAccessInspection(input.data.email, await deps.inspect(input.data.email), deps);
      return res.json({ ok: true, inspection });
    } catch {
      return res.status(503).json({ ok: false, code: "access_inspection_unavailable", message: "Account records could not be verified. No action was taken." });
    }
  });
}
