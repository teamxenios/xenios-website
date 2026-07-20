// xenios research: organizations, events, approved content, and violations.
//
// Four rules shape this file.
//
// First, an organization is a REPORTING boundary, not a compensation structure. An
// organization holds representatives, and a representative is a partner who works
// with that organization. There is no parent organization, no child organization,
// no rank, and no override: nothing here pays anyone for anyone else's activity.
// The aggregate is a rollup of the organization's own attributed conversions.
//
// Second, isolation is enforced on read. Every organization read takes a viewer and
// refuses a viewer who does not represent that organization, so a cross-organization
// read is impossible rather than merely unlikely.
//
// Third, an aggregate is counts and totals. It is built by explicit construction from
// the numeric fields alone, so a member id, name, email, health datum, plan, or order
// that appears on an upstream record cannot survive into an organization response.
//
// Fourth, a testimonial cannot make a claim xenios could not make directly. The same
// claim screen runs on every asset kind at submission, and an admin cannot approve a
// claim the screen rejects.

import type { PartnerLinkDto } from "@shared/research/commerce-api";
import {
  partnerCanEarn,
  type CommissionState,
  type PartnerRole,
  type PartnerState,
} from "@shared/research/distribution";

// ---------------------------------------------------------------------------
// Denials
// ---------------------------------------------------------------------------

export type OrganizationDenialCode =
  | "organization_not_found"
  | "organization_forbidden"
  | "organization_invalid"
  | "partner_not_found"
  | "partner_not_active"
  | "partner_role_not_eligible"
  | "representative_already_added"
  | "not_a_representative"
  | "campaign_invalid"
  | "event_invalid"
  | "event_not_found"
  | "rsvp_duplicate"
  | "rsvp_subject_not_opaque"
  | "asset_not_found"
  | "asset_body_empty"
  | "asset_prohibited_claim"
  | "asset_state_invalid"
  | "asset_disclosure_required"
  | "asset_expiry_invalid"
  | "violation_not_found"
  | "violation_state_invalid";

export interface OrganizationDenial {
  ok: false;
  denials: OrganizationDenialCode[];
  message: string;
}

export type OrganizationResult<T> = { ok: true; value: T } | OrganizationDenial;

function denied(denials: OrganizationDenialCode[], message: string): OrganizationDenial {
  return { ok: false, denials, message };
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type OrganizationKind =
  | "clinic"
  | "gym"
  | "wellness_center"
  | "private_community"
  | "professional_practice";

/**
 * Roles permitted to represent an organization. A member referral or affiliate is a
 * personal relationship, not an institutional one, so those roles are excluded.
 */
export const ORGANIZATION_ELIGIBLE_ROLES: readonly PartnerRole[] = [
  "organization_partner",
  "private_community_partner",
  "professional_partner",
] as const;

/**
 * An organization. Note what is absent: there is no parentOrgId, no childOrgIds, no
 * tier, and no sponsor. Representation is a flat membership list.
 */
export interface OrganizationRecord {
  orgId: string;
  displayName: string;
  kind: OrganizationKind;
  representativePartnerIds: string[];
  createdByAdminId: string;
  createdAt: string;
}

export interface OrganizationCampaignRecord {
  campaignId: string;
  orgId: string;
  name: string;
  code: string;
  createdAt: string;
}

export interface OrganizationEventRecord {
  eventId: string;
  orgId: string;
  name: string;
  startsAt: string;
  campaignId: string | null;
  createdAt: string;
}

/**
 * An RSVP. `subjectKey` is an OPAQUE key supplied by the caller. It is never an email,
 * a name, or a member id, because an organization must not be able to read a member
 * identity out of its own event list.
 */
export interface EventRsvpRecord {
  eventId: string;
  orgId: string;
  subjectKey: string;
  recordedAt: string;
}

/**
 * The conversion shape this module reads. There is deliberately no member field, and
 * `aggregateFor` reads only the numeric fields regardless of what the repository
 * actually returns.
 */
export interface OrganizationConversionRecord {
  orgId: string;
  attributedAt: string;
  eligibleNetCents: number;
  commissionCents: number;
  state: CommissionState;
}

export interface OrganizationExpenseRecord {
  orgId: string;
  amountCents: number;
  category: "event" | "print" | "sample" | "travel" | "other";
  incurredAt: string;
}

/** Counts and totals only. No member-level record can be expressed in this shape. */
export interface OrganizationAggregate {
  orgId: string;
  leadCount: number;
  conversionCount: number;
  totalCommissionCents: number;
  expenseCents: number;
}

export type ContentAssetKind =
  | "testimonial"
  | "social_post"
  | "flyer"
  | "email"
  | "presentation"
  | "video_script";

export type ContentAssetState = "submitted" | "preapproved" | "rejected" | "withdrawn";

export interface ContentAssetRecord {
  assetId: string;
  partnerId: string;
  kind: ContentAssetKind;
  body: string;
  state: ContentAssetState;
  approvedClaims: string[];
  prohibitedClaims: string[];
  disclosure: string | null;
  approvedByAdminId: string | null;
  approvedAt: string | null;
  /** Null means the asset has never been approved, so it is not usable. */
  expiresAt: string | null;
  submittedAt: string;
}

export interface SubmitContentAssetInput {
  kind: ContentAssetKind;
  body: string;
  /** Claims the partner believes the asset makes. Screened exactly like the body. */
  declaredClaims?: string[];
}

export type ViolationKind =
  | "unapproved_claim"
  | "prohibited_claim"
  | "missing_disclosure"
  | "expired_asset_use"
  | "misrepresentation"
  | "privacy_breach";

export type ViolationState = "recorded" | "correction_required" | "suspended";

/**
 * Kinds severe enough to skip the correction step. Everything else must escalate
 * through a correction request first, so suspension is never the first response to a
 * fixable mistake.
 */
export const SEVERE_VIOLATION_KINDS: readonly ViolationKind[] = [
  "privacy_breach",
  "prohibited_claim",
] as const;

export interface ViolationRecord {
  violationId: string;
  partnerId: string;
  assetId: string | null;
  kind: ViolationKind;
  detail: string;
  recordedByAdminId: string;
  state: ViolationState;
  recordedAt: string;
  correctionRequiredAt: string | null;
  suspendedAt: string | null;
}

// ---------------------------------------------------------------------------
// Claim screening
// ---------------------------------------------------------------------------

export interface ClaimRule {
  code: string;
  label: string;
  pattern: RegExp;
}

/**
 * The claims xenios could not make directly, so a partner may not make them either.
 * Dosing, disease and diagnosis language, guaranteed outcomes, and borrowed
 * regulatory authority.
 */
export const PROHIBITED_CLAIM_RULES: readonly ClaimRule[] = [
  { code: "dosing_amount", label: "dosing amount", pattern: /\b\d+(\.\d+)?\s?(mg|mcg|ml|iu|units?)\b/i },
  { code: "dosing_directive", label: "dosing directive", pattern: /\b(take|inject|dose|administer|stack)\s+(this|it|these|\d)/i },
  { code: "disease_claim", label: "disease claim", pattern: /\b(cure|cures|cured|treats?|treating|heals?|reverses?|prevents?)\b/i },
  { code: "diagnosis_claim", label: "diagnosis claim", pattern: /\b(diagnose[sd]?|diagnosis)\b/i },
  { code: "guaranteed_outcome", label: "guaranteed outcome", pattern: /\b(guarantee[sd]?|risk[- ]free|100%\s+effective)\b/i },
  { code: "regulatory_claim", label: "borrowed regulatory authority", pattern: /\b(fda[- ]approved|clinically proven|medically approved)\b/i },
];

/** Returns the rule codes a text trips. Empty means the text passed the screen. */
export function screenProhibitedClaims(
  text: string,
  extraPhrases: readonly string[] = [],
): string[] {
  const found: string[] = [];
  PROHIBITED_CLAIM_RULES.forEach((rule) => {
    if (rule.pattern.test(text)) found.push(rule.code);
  });
  const lowered = text.toLowerCase();
  extraPhrases.forEach((phrase) => {
    const p = phrase.trim().toLowerCase();
    if (p.length > 0 && lowered.includes(p)) found.push(`phrase:${p}`);
  });
  return found;
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface PartnerDirectoryEntry {
  partnerId: string;
  role: PartnerRole;
  state: PartnerState;
}

export interface PartnerDirectory {
  getPartner(partnerId: string): PartnerDirectoryEntry | undefined;
  /** Suspension flows through the partner state, so earning and payout stop at once. */
  setState(partnerId: string, state: PartnerState): void;
}

export interface OrganizationRepository {
  saveOrganization(org: OrganizationRecord): void;
  getOrganization(orgId: string): OrganizationRecord | undefined;

  saveCampaign(campaign: OrganizationCampaignRecord): void;
  listCampaigns(orgId: string): readonly OrganizationCampaignRecord[];

  saveEvent(event: OrganizationEventRecord): void;
  getEvent(eventId: string): OrganizationEventRecord | undefined;
  listEvents(orgId: string): readonly OrganizationEventRecord[];

  saveRsvp(rsvp: EventRsvpRecord): void;
  listRsvps(eventId: string): readonly EventRsvpRecord[];
  countRsvpsForOrg(orgId: string): number;

  listConversions(orgId: string): readonly OrganizationConversionRecord[];
  listExpenses(orgId: string): readonly OrganizationExpenseRecord[];

  saveAsset(asset: ContentAssetRecord): void;
  getAsset(assetId: string): ContentAssetRecord | undefined;
  listAssets(partnerId: string): readonly ContentAssetRecord[];

  saveViolation(violation: ViolationRecord): void;
  getViolation(violationId: string): ViolationRecord | undefined;
  listViolations(partnerId: string): readonly ViolationRecord[];
}

export type OrganizationViewer =
  | { kind: "partner"; partnerId: string }
  | { kind: "admin"; adminId: string };

export interface OrganizationServiceDeps {
  repository: OrganizationRepository;
  partners: PartnerDirectory;
  /** Base URL for an RSVP link. No member data is ever placed in the query string. */
  rsvpBaseUrl: string;
  /** Extra prohibited phrases, so counsel can tighten the screen without a deploy. */
  extraProhibitedClaims?: readonly string[];
  newId?: (prefix: string) => string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface CreateOrganizationInput {
  displayName: string;
  kind: OrganizationKind;
  createdByAdminId: string;
}

export interface CreateCampaignInput {
  name: string;
  code: string;
}

export interface CreateEventInput {
  name: string;
  startsAt: string;
  campaignId?: string | null;
}

export interface OrganizationService {
  createOrganization(input: CreateOrganizationInput, asOf: Date): OrganizationResult<OrganizationRecord>;
  addRepresentative(orgId: string, partnerId: string, asOf: Date): OrganizationResult<OrganizationRecord>;
  removeRepresentative(orgId: string, partnerId: string, asOf: Date): OrganizationResult<OrganizationRecord>;

  createCampaign(orgId: string, input: CreateCampaignInput, asOf: Date): OrganizationResult<OrganizationCampaignRecord>;
  createEvent(orgId: string, input: CreateEventInput, asOf: Date): OrganizationResult<OrganizationEventRecord>;

  rsvpLinkFor(eventId: string): OrganizationResult<PartnerLinkDto>;
  recordRsvp(eventId: string, subjectKey: string, asOf: Date): OrganizationResult<EventRsvpRecord>;

  aggregateFor(orgId: string, viewer: OrganizationViewer): OrganizationResult<OrganizationAggregate>;

  submitContentAsset(
    partnerId: string,
    asset: SubmitContentAssetInput,
    asOf: Date,
  ): OrganizationResult<ContentAssetRecord>;
  preapproveAsset(
    assetId: string,
    adminId: string,
    approvedClaims: readonly string[],
    prohibitedClaims: readonly string[],
    disclosure: string,
    expiresAt: Date,
    asOf: Date,
  ): OrganizationResult<ContentAssetRecord>;
  activeAssetsFor(partnerId: string, asOf: Date): ContentAssetRecord[];

  recordViolation(
    partnerId: string,
    assetId: string | null,
    kind: ViolationKind,
    detail: string,
    adminId: string,
    asOf: Date,
  ): OrganizationResult<ViolationRecord>;
  requireCorrection(violationId: string, adminId: string, asOf: Date): OrganizationResult<ViolationRecord>;
  suspendForViolation(violationId: string, adminId: string, asOf: Date): OrganizationResult<ViolationRecord>;
}

/** Commission states that represent value the organization actually holds. */
const COUNTED_COMMISSION_STATES: readonly CommissionState[] = [
  "pending",
  "held",
  "approved",
  "payable",
  "paid",
  "disputed",
];

export function createOrganizationService(deps: OrganizationServiceDeps): OrganizationService {
  let counter = 0;
  const newId = deps.newId ?? ((prefix: string) => `${prefix}_${++counter}`);
  const extraPhrases = deps.extraProhibitedClaims ?? [];

  function requireOrg(orgId: string): OrganizationRecord | null {
    return deps.repository.getOrganization(orgId) ?? null;
  }

  function isRepresentative(org: OrganizationRecord, partnerId: string): boolean {
    return org.representativePartnerIds.indexOf(partnerId) >= 0;
  }

  function persistOrg(org: OrganizationRecord, representatives: string[]): OrganizationRecord {
    const next: OrganizationRecord = { ...org, representativePartnerIds: representatives };
    deps.repository.saveOrganization(next);
    return next;
  }

  return {
    createOrganization(input, asOf) {
      const denials: OrganizationDenialCode[] = [];
      if (input.displayName.trim().length === 0) denials.push("organization_invalid");
      if (input.createdByAdminId.trim().length === 0) denials.push("organization_invalid");
      if (denials.length > 0) {
        return denied(denials, "An organization needs a display name and a named admin.");
      }
      const org: OrganizationRecord = {
        orgId: newId("org"),
        displayName: input.displayName.trim(),
        kind: input.kind,
        representativePartnerIds: [],
        createdByAdminId: input.createdByAdminId,
        createdAt: asOf.toISOString(),
      };
      deps.repository.saveOrganization(org);
      return { ok: true, value: org };
    },

    addRepresentative(orgId, partnerId, asOf) {
      void asOf;
      const denials: OrganizationDenialCode[] = [];
      const org = requireOrg(orgId);
      if (!org) denials.push("organization_not_found");

      const partner = deps.partners.getPartner(partnerId);
      if (!partner) {
        denials.push("partner_not_found");
      } else {
        if (!partnerCanEarn(partner.state)) denials.push("partner_not_active");
        if (ORGANIZATION_ELIGIBLE_ROLES.indexOf(partner.role) < 0) {
          denials.push("partner_role_not_eligible");
        }
      }
      if (org && isRepresentative(org, partnerId)) denials.push("representative_already_added");

      if (denials.length > 0 || !org) {
        return denied(denials, "This partner cannot represent this organization.");
      }
      return { ok: true, value: persistOrg(org, org.representativePartnerIds.concat([partnerId])) };
    },

    removeRepresentative(orgId, partnerId, asOf) {
      void asOf;
      const org = requireOrg(orgId);
      if (!org) return denied(["organization_not_found"], "Unknown organization.");
      if (!isRepresentative(org, partnerId)) {
        return denied(["not_a_representative"], "This partner does not represent this organization.");
      }
      const remaining = org.representativePartnerIds.filter((id) => id !== partnerId);
      return { ok: true, value: persistOrg(org, remaining) };
    },

    createCampaign(orgId, input, asOf) {
      const denials: OrganizationDenialCode[] = [];
      const org = requireOrg(orgId);
      if (!org) denials.push("organization_not_found");
      if (input.name.trim().length === 0) denials.push("campaign_invalid");
      if (input.code.trim().length === 0) denials.push("campaign_invalid");
      if (denials.length > 0 || !org) return denied(denials, "The campaign is not valid.");

      const campaign: OrganizationCampaignRecord = {
        campaignId: newId("camp"),
        orgId: org.orgId,
        name: input.name.trim(),
        code: input.code.trim(),
        createdAt: asOf.toISOString(),
      };
      deps.repository.saveCampaign(campaign);
      return { ok: true, value: campaign };
    },

    createEvent(orgId, input, asOf) {
      const denials: OrganizationDenialCode[] = [];
      const org = requireOrg(orgId);
      if (!org) denials.push("organization_not_found");
      if (input.name.trim().length === 0) denials.push("event_invalid");
      if (Number.isNaN(new Date(input.startsAt).getTime())) denials.push("event_invalid");
      if (denials.length > 0 || !org) return denied(denials, "The event is not valid.");

      const event: OrganizationEventRecord = {
        eventId: newId("evt"),
        orgId: org.orgId,
        name: input.name.trim(),
        startsAt: input.startsAt,
        campaignId: input.campaignId ?? null,
        createdAt: asOf.toISOString(),
      };
      deps.repository.saveEvent(event);
      return { ok: true, value: event };
    },

    rsvpLinkFor(eventId) {
      const event = deps.repository.getEvent(eventId);
      if (!event) return denied(["event_not_found"], "Unknown event.");
      const base = deps.rsvpBaseUrl.replace(/\/+$/, "");
      return {
        ok: true,
        value: {
          code: event.eventId,
          url: `${base}/rsvp/${encodeURIComponent(event.eventId)}`,
          channel: "event",
          campaign: event.campaignId,
          qrSvgPath: null,
        },
      };
    },

    recordRsvp(eventId, subjectKey, asOf) {
      const denials: OrganizationDenialCode[] = [];
      const event = deps.repository.getEvent(eventId);
      if (!event) denials.push("event_not_found");

      const key = subjectKey.trim();
      // An address or a name is not an opaque key. Refusing it here keeps a member
      // identity out of the organization's own records.
      if (key.length === 0 || key.indexOf("@") >= 0 || key.indexOf(" ") >= 0) {
        denials.push("rsvp_subject_not_opaque");
      }
      if (event && denials.length === 0) {
        const existing = deps.repository.listRsvps(eventId);
        if (existing.some((r) => r.subjectKey === key)) denials.push("rsvp_duplicate");
      }
      if (denials.length > 0 || !event) return denied(denials, "The RSVP was not recorded.");

      const rsvp: EventRsvpRecord = {
        eventId: event.eventId,
        orgId: event.orgId,
        subjectKey: key,
        recordedAt: asOf.toISOString(),
      };
      deps.repository.saveRsvp(rsvp);
      return { ok: true, value: rsvp };
    },

    /**
     * Counts and totals for ONE organization, for a viewer entitled to read it.
     *
     * The returned object is constructed field by field from numbers, so a member id,
     * email, or health datum that a repository row happens to carry cannot travel out
     * of here even if the row shape grows later.
     */
    aggregateFor(orgId, viewer) {
      const org = requireOrg(orgId);
      if (!org) return denied(["organization_not_found"], "Unknown organization.");
      if (viewer.kind === "partner" && !isRepresentative(org, viewer.partnerId)) {
        return denied(
          ["organization_forbidden"],
          "This partner does not represent this organization.",
        );
      }

      const conversions = deps.repository.listConversions(org.orgId);
      let conversionCount = 0;
      let totalCommissionCents = 0;
      conversions.forEach((c) => {
        if (c.orgId !== org.orgId) return;
        if (COUNTED_COMMISSION_STATES.indexOf(c.state) < 0) return;
        conversionCount += 1;
        totalCommissionCents += Math.floor(Math.max(0, c.commissionCents));
      });

      let expenseCents = 0;
      deps.repository.listExpenses(org.orgId).forEach((e) => {
        if (e.orgId !== org.orgId) return;
        expenseCents += Math.floor(Math.max(0, e.amountCents));
      });

      return {
        ok: true,
        value: {
          orgId: org.orgId,
          leadCount: deps.repository.countRsvpsForOrg(org.orgId),
          conversionCount,
          totalCommissionCents,
          expenseCents,
        },
      };
    },

    submitContentAsset(partnerId, asset, asOf) {
      const denials: OrganizationDenialCode[] = [];
      const partner = deps.partners.getPartner(partnerId);
      if (!partner) denials.push("partner_not_found");
      else if (!partnerCanEarn(partner.state)) denials.push("partner_not_active");

      const body = asset.body.trim();
      if (body.length === 0) denials.push("asset_body_empty");

      // The screen runs on every kind. A testimonial gets no exemption, because a
      // client voice cannot carry a claim xenios could not make directly.
      const declared = (asset.declaredClaims ?? []).join("\n");
      const matches = screenProhibitedClaims(`${body}\n${declared}`, extraPhrases);
      if (matches.length > 0) denials.push("asset_prohibited_claim");

      if (denials.length > 0) {
        const detail = matches.length > 0 ? ` Prohibited: ${matches.join(", ")}.` : "";
        return denied(denials, `The asset was not accepted.${detail}`);
      }

      const record: ContentAssetRecord = {
        assetId: newId("asset"),
        partnerId,
        kind: asset.kind,
        body,
        state: "submitted",
        approvedClaims: [],
        prohibitedClaims: [],
        disclosure: null,
        approvedByAdminId: null,
        approvedAt: null,
        expiresAt: null,
        submittedAt: asOf.toISOString(),
      };
      deps.repository.saveAsset(record);
      return { ok: true, value: record };
    },

    preapproveAsset(assetId, adminId, approvedClaims, prohibitedClaims, disclosure, expiresAt, asOf) {
      const denials: OrganizationDenialCode[] = [];
      const asset = deps.repository.getAsset(assetId);
      if (!asset) denials.push("asset_not_found");
      else if (asset.state !== "submitted" && asset.state !== "preapproved") {
        denials.push("asset_state_invalid");
      }
      if (adminId.trim().length === 0) denials.push("asset_state_invalid");
      if (disclosure.trim().length === 0) denials.push("asset_disclosure_required");
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= asOf.getTime()) {
        denials.push("asset_expiry_invalid");
      }

      // An admin cannot approve a claim the screen rejects. Approval is permission to
      // reuse language xenios already stands behind, not permission to widen it.
      const approvedText = approvedClaims.join("\n");
      const matches = screenProhibitedClaims(approvedText, extraPhrases);
      if (matches.length > 0) denials.push("asset_prohibited_claim");
      if (asset && screenProhibitedClaims(asset.body, prohibitedClaims).length > 0) {
        denials.push("asset_prohibited_claim");
      }

      if (denials.length > 0 || !asset) return denied(denials, "The asset was not approved.");

      const next: ContentAssetRecord = {
        ...asset,
        state: "preapproved",
        approvedClaims: approvedClaims.slice(),
        prohibitedClaims: prohibitedClaims.slice(),
        disclosure: disclosure.trim(),
        approvedByAdminId: adminId,
        approvedAt: asOf.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
      deps.repository.saveAsset(next);
      return { ok: true, value: next };
    },

    /**
     * Usable assets only. Approval alone is not enough: the approval must be unexpired
     * and the partner must still be able to earn, so a suspension or a lapsed approval
     * silently withdraws the material rather than leaving it in circulation.
     */
    activeAssetsFor(partnerId, asOf) {
      const partner = deps.partners.getPartner(partnerId);
      if (!partner || !partnerCanEarn(partner.state)) return [];
      const now = asOf.getTime();
      return deps.repository.listAssets(partnerId).filter((a) => {
        if (a.state !== "preapproved") return false;
        if (!a.expiresAt) return false;
        return new Date(a.expiresAt).getTime() > now;
      });
    },

    recordViolation(partnerId, assetId, kind, detail, adminId, asOf) {
      const denials: OrganizationDenialCode[] = [];
      if (!deps.partners.getPartner(partnerId)) denials.push("partner_not_found");
      if (assetId !== null && !deps.repository.getAsset(assetId)) denials.push("asset_not_found");
      if (adminId.trim().length === 0 || detail.trim().length === 0) {
        denials.push("violation_state_invalid");
      }
      if (denials.length > 0) return denied(denials, "The violation was not recorded.");

      const violation: ViolationRecord = {
        violationId: newId("viol"),
        partnerId,
        assetId,
        kind,
        detail: detail.trim(),
        recordedByAdminId: adminId,
        state: "recorded",
        recordedAt: asOf.toISOString(),
        correctionRequiredAt: null,
        suspendedAt: null,
      };
      deps.repository.saveViolation(violation);
      return { ok: true, value: violation };
    },

    requireCorrection(violationId, adminId, asOf) {
      const denials: OrganizationDenialCode[] = [];
      const violation = deps.repository.getViolation(violationId);
      if (!violation) denials.push("violation_not_found");
      else if (violation.state !== "recorded") denials.push("violation_state_invalid");
      if (adminId.trim().length === 0) denials.push("violation_state_invalid");
      if (denials.length > 0 || !violation) {
        return denied(denials, "A correction cannot be requested for this violation.");
      }

      const next: ViolationRecord = {
        ...violation,
        state: "correction_required",
        recordedByAdminId: adminId,
        correctionRequiredAt: asOf.toISOString(),
      };
      deps.repository.saveViolation(next);
      return { ok: true, value: next };
    },

    /**
     * Suspension. It moves the PARTNER state, so `partnerCanEarn` and `partnerCanBePaid`
     * both turn false at the same moment and no separate flag can drift out of step.
     *
     * A fixable violation must pass through a correction request first. Only a severe
     * kind may suspend straight from `recorded`.
     */
    suspendForViolation(violationId, adminId, asOf) {
      const denials: OrganizationDenialCode[] = [];
      const violation = deps.repository.getViolation(violationId);
      if (!violation) {
        denials.push("violation_not_found");
      } else {
        const severe = SEVERE_VIOLATION_KINDS.indexOf(violation.kind) >= 0;
        const escalated = violation.state === "correction_required";
        if (!escalated && !(severe && violation.state === "recorded")) {
          denials.push("violation_state_invalid");
        }
        if (!deps.partners.getPartner(violation.partnerId)) denials.push("partner_not_found");
      }
      if (adminId.trim().length === 0) denials.push("violation_state_invalid");
      if (denials.length > 0 || !violation) {
        return denied(denials, "This violation cannot suspend the partner.");
      }

      const next: ViolationRecord = {
        ...violation,
        state: "suspended",
        recordedByAdminId: adminId,
        suspendedAt: asOf.toISOString(),
      };
      deps.repository.saveViolation(next);
      deps.partners.setState(violation.partnerId, "suspended");
      return { ok: true, value: next };
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory implementations for tests and local development
// ---------------------------------------------------------------------------

export function createInMemoryPartnerDirectory(
  seed: readonly PartnerDirectoryEntry[] = [],
): PartnerDirectory & { entries(): PartnerDirectoryEntry[] } {
  const byId = new Map<string, PartnerDirectoryEntry>();
  seed.forEach((p) => byId.set(p.partnerId, { ...p }));
  return {
    getPartner(partnerId) {
      const found = byId.get(partnerId);
      return found ? { ...found } : undefined;
    },
    setState(partnerId, state) {
      const found = byId.get(partnerId);
      if (found) byId.set(partnerId, { ...found, state });
    },
    entries() {
      return Array.from(byId.values(), (p) => ({ ...p }));
    },
  };
}

export interface InMemoryOrganizationRepository extends OrganizationRepository {
  addConversion(conversion: OrganizationConversionRecord): void;
  addExpense(expense: OrganizationExpenseRecord): void;
}

export function createInMemoryOrganizationRepository(): InMemoryOrganizationRepository {
  const orgs = new Map<string, OrganizationRecord>();
  const campaigns: OrganizationCampaignRecord[] = [];
  const events = new Map<string, OrganizationEventRecord>();
  const rsvps: EventRsvpRecord[] = [];
  const conversions: OrganizationConversionRecord[] = [];
  const expenses: OrganizationExpenseRecord[] = [];
  const assets = new Map<string, ContentAssetRecord>();
  const violations = new Map<string, ViolationRecord>();

  return {
    saveOrganization(org) {
      orgs.set(org.orgId, { ...org, representativePartnerIds: org.representativePartnerIds.slice() });
    },
    getOrganization(orgId) {
      const found = orgs.get(orgId);
      return found ? { ...found, representativePartnerIds: found.representativePartnerIds.slice() } : undefined;
    },
    saveCampaign(campaign) {
      campaigns.push({ ...campaign });
    },
    listCampaigns(orgId) {
      return campaigns.filter((c) => c.orgId === orgId);
    },
    saveEvent(event) {
      events.set(event.eventId, { ...event });
    },
    getEvent(eventId) {
      const found = events.get(eventId);
      return found ? { ...found } : undefined;
    },
    listEvents(orgId) {
      return Array.from(events.values(), (e) => ({ ...e })).filter((e) => e.orgId === orgId);
    },
    saveRsvp(rsvp) {
      rsvps.push({ ...rsvp });
    },
    listRsvps(eventId) {
      return rsvps.filter((r) => r.eventId === eventId);
    },
    countRsvpsForOrg(orgId) {
      return rsvps.filter((r) => r.orgId === orgId).length;
    },
    listConversions(orgId) {
      return conversions.filter((c) => c.orgId === orgId);
    },
    listExpenses(orgId) {
      return expenses.filter((e) => e.orgId === orgId);
    },
    addConversion(conversion) {
      conversions.push(conversion);
    },
    addExpense(expense) {
      expenses.push(expense);
    },
    saveAsset(asset) {
      assets.set(asset.assetId, { ...asset });
    },
    getAsset(assetId) {
      const found = assets.get(assetId);
      return found ? { ...found } : undefined;
    },
    listAssets(partnerId) {
      return Array.from(assets.values(), (a) => ({ ...a })).filter((a) => a.partnerId === partnerId);
    },
    saveViolation(violation) {
      violations.set(violation.violationId, { ...violation });
    },
    getViolation(violationId) {
      const found = violations.get(violationId);
      return found ? { ...found } : undefined;
    },
    listViolations(partnerId) {
      return Array.from(violations.values(), (v) => ({ ...v })).filter((v) => v.partnerId === partnerId);
    },
  };
}
