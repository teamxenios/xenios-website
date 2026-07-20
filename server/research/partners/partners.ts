// xenios research: partner onboarding and lifecycle.
//
// A partner must EARN activation. Every gate starts unmet, `activate` accumulates
// every unmet gate rather than returning on the first, and a partner who is not
// active can neither earn nor be paid (partnerCanEarn / partnerCanBePaid).
//
// Two founder rules are structural here, not policy prose:
//
//   1. NO RECURSIVE DOWNLINE. PartnerRecord has no parent, sponsor, upline,
//      downline, tier, or level field, so a multi-level structure cannot be built
//      on this record by accident. PARTNER_STRUCTURE_FORBIDDEN_KEYS is exported so
//      the test and any future reviewer share one definition.
//   2. NO COMPENSATION FOR RECRUITING. Nothing in this file creates a monetary
//      event. Onboarding produces state, never money.
//
// The dashboard is built by EXPLICIT CONSTRUCTION from named fields. A sensitive
// field added to PartnerRecord or to a stats snapshot upstream therefore cannot
// leak into a partner response.

import {
  partnerCanBePaid,
  partnerCanEarn,
  toPartnerVisibleConversion,
  type PartnerRole,
  type PartnerState,
  type PartnerVisibleConversion,
} from "@shared/research/distribution";
import type { PartnerDashboardDto } from "@shared/research/commerce-api";

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export type TrainingModuleKey =
  | "xenios_membership"
  | "privacy_and_sensitive_data"
  | "product_lanes"
  | "ftc_disclosures"
  | "claims_restrictions"
  | "no_diagnosis_or_dosing"
  | "lead_handling"
  | "telegram_boundaries"
  | "product_concerns"
  | "fraud"
  | "brand_and_content"
  | "organizations"
  | "events"
  | "security";

export const TRAINING_MODULE_KEYS: readonly TrainingModuleKey[] = [
  "xenios_membership",
  "privacy_and_sensitive_data",
  "product_lanes",
  "ftc_disclosures",
  "claims_restrictions",
  "no_diagnosis_or_dosing",
  "lead_handling",
  "telegram_boundaries",
  "product_concerns",
  "fraud",
  "brand_and_content",
  "organizations",
  "events",
  "security",
] as const;

export type AgreementKey =
  | "partner_agreement"
  | "code_of_conduct"
  | "advertising_and_claims"
  | "privacy_and_data_handling";

export const AGREEMENT_KEYS: readonly AgreementKey[] = [
  "partner_agreement",
  "code_of_conduct",
  "advertising_and_claims",
  "privacy_and_data_handling",
] as const;

export interface RequiredVersion<K extends string> {
  key: K;
  version: string;
}

export interface PartnerRequirements {
  agreements: ReadonlyArray<RequiredVersion<AgreementKey>>;
  trainingModules: ReadonlyArray<RequiredVersion<TrainingModuleKey>>;
}

export const DEFAULT_PARTNER_REQUIREMENTS: PartnerRequirements = {
  agreements: AGREEMENT_KEYS.map((key) => ({ key, version: "1.0.0" })),
  trainingModules: TRAINING_MODULE_KEYS.map((key) => ({ key, version: "1.0.0" })),
};

/**
 * Key names that must never appear anywhere in a partner record or response.
 *
 * Checked as a lowercased substring so `parentPartnerId`, `sponsor_id`, and
 * `tierLevel` are all caught by the same list.
 */
export const PARTNER_STRUCTURE_FORBIDDEN_KEYS = [
  "parent",
  "child",
  "sponsor",
  "upline",
  "downline",
  "tier",
  "level",
  "recruit",
] as const;

// ---------------------------------------------------------------------------
// Record
// ---------------------------------------------------------------------------

export type VerificationStatus = "not_started" | "pending" | "verified" | "failed";
export type ClearanceStatus = "not_started" | "pending" | "cleared" | "failed";

export interface IdentityVerification {
  status: VerificationStatus;
  /** Opaque provider reference. Document contents never enter this record. */
  providerReference: string | null;
  updatedAt: string;
}

export interface TaxStatus {
  status: ClearanceStatus;
  formType: "w9" | "w8ben" | null;
  updatedAt: string;
}

/**
 * Payout READINESS only. There is no live payout in this build, so this records
 * whether a payout destination has been established, never an amount or a
 * credential.
 */
export interface PayoutStatus {
  status: ClearanceStatus;
  methodReference: string | null;
  updatedAt: string;
}

export interface AcceptedAgreement {
  key: AgreementKey;
  version: string;
  /** Hash of the exact text accepted, so a later edit cannot be backdated. */
  contentHash: string;
  acceptedAt: string;
}

export interface CompletedTrainingModule {
  moduleKey: TrainingModuleKey;
  moduleVersion: string;
  completedAt: string;
}

export type PartnerLifecycleEventType =
  | "applied"
  | "identity_recorded"
  | "tax_recorded"
  | "payout_recorded"
  | "agreement_accepted"
  | "training_completed"
  | "certified"
  | "certification_revoked"
  | "activated"
  | "quality_review_opened"
  | "suspended"
  | "terminated"
  | "reinstated"
  | "recertification_required";

export interface PartnerLifecycleEvent {
  type: PartnerLifecycleEventType;
  at: string;
  actorId: string | null;
  detail: string | null;
}

/**
 * The internal partner record.
 *
 * `legalName`, `contactEmail`, and `internalNotes` are administrative and are never
 * serialized to a partner. They are only ever read by explicit name inside this
 * file, and `dashboardFor` names none of them.
 */
export interface PartnerRecord {
  partnerId: string;
  role: PartnerRole;
  state: PartnerState;
  legalName: string;
  contactEmail: string;
  internalNotes: string | null;
  appliedAt: string;
  updatedAt: string;

  identity: IdentityVerification;
  tax: TaxStatus;
  payout: PayoutStatus;
  agreements: AcceptedAgreement[];
  training: CompletedTrainingModule[];

  certifiedAt: string | null;
  certifiedByAdminId: string | null;
  activatedAt: string | null;
  activatedByAdminId: string | null;

  /** Append-only. A correction adds an event, it never edits or drops one. */
  history: PartnerLifecycleEvent[];
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type PartnerDenialCode =
  | "partner_not_found"
  | "partner_already_exists"
  | "partner_terminated"
  | "identity_not_verified"
  | "tax_not_cleared"
  | "payout_not_cleared"
  | "agreement_missing"
  | "training_incomplete"
  | "not_certified"
  | "already_active"
  | "unknown_agreement"
  | "unknown_training_module"
  | "stale_version"
  | "invalid_state_transition";

export interface PartnerDenial {
  code: PartnerDenialCode;
  message: string;
  /** Names the specific agreement or module when the code alone is not enough. */
  subject: string | null;
}

export type PartnerResult =
  | { ok: true; partner: PartnerRecord }
  | { ok: false; denials: PartnerDenial[] };

export type PartnerDashboardResult =
  | { ok: true; dashboard: PartnerDashboardDto }
  | { ok: false; denials: PartnerDenial[] };

function denial(code: PartnerDenialCode, message: string, subject: string | null = null): PartnerDenial {
  return { code, message, subject };
}

// ---------------------------------------------------------------------------
// Repository and stats
// ---------------------------------------------------------------------------

export interface PartnerRepository {
  get(partnerId: string): Promise<PartnerRecord | null>;
  save(record: PartnerRecord): Promise<void>;
  list(): Promise<PartnerRecord[]>;
}

export function createInMemoryPartnerRepository(seed: readonly PartnerRecord[] = []): PartnerRepository {
  const rows = new Map<string, PartnerRecord>();
  seed.forEach((record) => rows.set(record.partnerId, record));
  return {
    async get(partnerId) {
      return rows.get(partnerId) ?? null;
    },
    async save(record) {
      rows.set(record.partnerId, record);
    },
    async list() {
      const all: PartnerRecord[] = [];
      rows.forEach((record) => all.push(record));
      return all;
    },
  };
}

/**
 * The aggregate numbers behind the dashboard.
 *
 * Deliberately aggregate-shaped. There is no member id, email, or order in this
 * snapshot, and `dashboardFor` rebuilds each conversion through
 * `toPartnerVisibleConversion` anyway, so a richer conversion supplied here is
 * still narrowed before it reaches a partner.
 */
export interface PartnerStatsSnapshot {
  leadCount: number;
  conversionCount: number;
  totalCommissionCents: number;
  payableCents: number;
  conversions: readonly PartnerVisibleConversion[];
}

export interface PartnerStatsSource {
  statsFor(partnerId: string): Promise<PartnerStatsSnapshot>;
}

export const EMPTY_PARTNER_STATS: PartnerStatsSnapshot = {
  leadCount: 0,
  conversionCount: 0,
  totalCommissionCents: 0,
  payableCents: 0,
  conversions: [],
};

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

function acceptedCurrentAgreement(record: PartnerRecord, required: RequiredVersion<AgreementKey>): boolean {
  return record.agreements.some((a) => a.key === required.key && a.version === required.version);
}

function completedCurrentModule(record: PartnerRecord, required: RequiredVersion<TrainingModuleKey>): boolean {
  return record.training.some(
    (t) => t.moduleKey === required.key && t.moduleVersion === required.version,
  );
}

export function outstandingTrainingFor(
  record: PartnerRecord,
  requirements: PartnerRequirements,
): Array<{ moduleKey: string; version: string }> {
  const outstanding: Array<{ moduleKey: string; version: string }> = [];
  requirements.trainingModules.forEach((required) => {
    if (!completedCurrentModule(record, required)) {
      outstanding.push({ moduleKey: required.key, version: required.version });
    }
  });
  return outstanding;
}

/**
 * Every unmet gate, accumulated. Fails closed: an unknown or partial state is an
 * unmet gate, never a pass.
 */
export function unmetActivationGates(
  record: PartnerRecord,
  requirements: PartnerRequirements,
  options: { includeCertification: boolean },
): PartnerDenial[] {
  const denials: PartnerDenial[] = [];

  if (record.identity.status !== "verified") {
    denials.push(denial("identity_not_verified", "Identity verification is not complete.", "identity"));
  }
  if (record.tax.status !== "cleared") {
    denials.push(denial("tax_not_cleared", "Tax status is not cleared.", "tax"));
  }
  if (record.payout.status !== "cleared") {
    denials.push(denial("payout_not_cleared", "Payout status is not cleared.", "payout"));
  }
  requirements.agreements.forEach((required) => {
    if (!acceptedCurrentAgreement(record, required)) {
      denials.push(
        denial("agreement_missing", `Agreement ${required.key} v${required.version} is not accepted.`, required.key),
      );
    }
  });
  requirements.trainingModules.forEach((required) => {
    if (!completedCurrentModule(record, required)) {
      denials.push(
        denial("training_incomplete", `Training ${required.key} v${required.version} is not complete.`, required.key),
      );
    }
  });
  if (options.includeCertification && record.certifiedAt === null) {
    denials.push(denial("not_certified", "Certification has not been granted.", "certification"));
  }
  return denials;
}

const PRE_ACTIVE_STATES: readonly PartnerState[] = [
  "application",
  "identity_verification_pending",
  "tax_status_pending",
  "payout_status_pending",
  "agreement_pending",
  "training_pending",
  "certification_pending",
];

/**
 * The pending state that names the next unmet gate.
 *
 * PartnerState has no "activation_pending" member, so a fully certified partner
 * waits in `certification_pending` until an admin calls `activate`. Certification
 * alone never grants the ability to earn.
 */
function nextPendingState(record: PartnerRecord, requirements: PartnerRequirements): PartnerState {
  if (record.identity.status !== "verified") return "identity_verification_pending";
  if (record.tax.status !== "cleared") return "tax_status_pending";
  if (record.payout.status !== "cleared") return "payout_status_pending";
  const agreementMissing = requirements.agreements.some((r) => !acceptedCurrentAgreement(record, r));
  if (agreementMissing) return "agreement_pending";
  const trainingMissing = requirements.trainingModules.some((r) => !completedCurrentModule(record, r));
  if (trainingMissing) return "training_pending";
  return "certification_pending";
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface PartnerApplicationInput {
  partnerId?: string;
  role: PartnerRole;
  legalName: string;
  contactEmail: string;
  internalNotes?: string;
}

export interface IdentityVerificationResult {
  status: VerificationStatus;
  providerReference?: string;
}

export interface ClearanceResult {
  status: ClearanceStatus;
  formType?: TaxStatus["formType"];
  methodReference?: string;
}

export interface PartnerService {
  apply(input: PartnerApplicationInput, asOf: Date): Promise<PartnerResult>;
  recordIdentityVerification(
    partnerId: string,
    result: IdentityVerificationResult,
    asOf: Date,
  ): Promise<PartnerResult>;
  recordTaxStatus(partnerId: string, result: ClearanceResult, asOf: Date): Promise<PartnerResult>;
  recordPayoutStatus(partnerId: string, result: ClearanceResult, asOf: Date): Promise<PartnerResult>;
  acceptAgreement(
    partnerId: string,
    key: AgreementKey,
    version: string,
    contentHash: string,
    asOf: Date,
  ): Promise<PartnerResult>;
  completeTraining(
    partnerId: string,
    moduleKey: TrainingModuleKey,
    moduleVersion: string,
    asOf: Date,
  ): Promise<PartnerResult>;
  certify(partnerId: string, adminId: string, asOf: Date): Promise<PartnerResult>;
  activate(partnerId: string, adminId: string, asOf: Date): Promise<PartnerResult>;
  openQualityReview(partnerId: string, adminId: string, reason: string, asOf: Date): Promise<PartnerResult>;
  suspend(partnerId: string, adminId: string, reason: string, asOf: Date): Promise<PartnerResult>;
  terminate(partnerId: string, adminId: string, reason: string, asOf: Date): Promise<PartnerResult>;
  reinstate(partnerId: string, adminId: string, asOf: Date): Promise<PartnerResult>;
  requireRecertification(
    moduleKey: TrainingModuleKey,
    newVersion: string,
    asOf: Date,
  ): Promise<PartnerRecord[]>;
  dashboardFor(partnerId: string): Promise<PartnerDashboardResult>;
  requirements(): PartnerRequirements;
}

export interface PartnerServiceDeps {
  repository: PartnerRepository;
  stats?: PartnerStatsSource;
  requirements?: PartnerRequirements;
  generateId?: () => string;
}

export function createPartnerService(deps: PartnerServiceDeps): PartnerService {
  const repository = deps.repository;
  const stats = deps.stats;
  let requirements: PartnerRequirements = {
    agreements: deps.requirements ? deps.requirements.agreements.slice() : DEFAULT_PARTNER_REQUIREMENTS.agreements.slice(),
    trainingModules: deps.requirements
      ? deps.requirements.trainingModules.slice()
      : DEFAULT_PARTNER_REQUIREMENTS.trainingModules.slice(),
  };

  let sequence = 0;
  const generateId = deps.generateId ?? (() => `partner_${++sequence}`);

  function log(
    record: PartnerRecord,
    type: PartnerLifecycleEventType,
    asOf: Date,
    actorId: string | null,
    detail: string | null,
  ): void {
    record.history.push({ type, at: asOf.toISOString(), actorId, detail });
    record.updatedAt = asOf.toISOString();
  }

  /** Advances the pending chain only. An active, reviewed, suspended, or
   * terminated partner never silently changes state from a data update. */
  function advancePending(record: PartnerRecord): void {
    if (!PRE_ACTIVE_STATES.includes(record.state)) return;
    record.state = nextPendingState(record, requirements);
  }

  async function load(partnerId: string): Promise<PartnerRecord | PartnerDenial[]> {
    const record = await repository.get(partnerId);
    if (!record) return [denial("partner_not_found", `No partner ${partnerId}.`, partnerId)];
    if (record.state === "terminated") {
      return [denial("partner_terminated", "This partner is terminated. Termination is final.", partnerId)];
    }
    return record;
  }

  function isDenials(value: PartnerRecord | PartnerDenial[]): value is PartnerDenial[] {
    return Array.isArray(value);
  }

  return {
    requirements(): PartnerRequirements {
      return { agreements: requirements.agreements.slice(), trainingModules: requirements.trainingModules.slice() };
    },

    async apply(input: PartnerApplicationInput, asOf: Date): Promise<PartnerResult> {
      const partnerId = input.partnerId ?? generateId();
      const existing = await repository.get(partnerId);
      if (existing) {
        return { ok: false, denials: [denial("partner_already_exists", `Partner ${partnerId} exists.`, partnerId)] };
      }
      const at = asOf.toISOString();
      const record: PartnerRecord = {
        partnerId,
        role: input.role,
        state: "application",
        legalName: input.legalName,
        contactEmail: input.contactEmail,
        internalNotes: input.internalNotes ?? null,
        appliedAt: at,
        updatedAt: at,
        identity: { status: "not_started", providerReference: null, updatedAt: at },
        tax: { status: "not_started", formType: null, updatedAt: at },
        payout: { status: "not_started", methodReference: null, updatedAt: at },
        agreements: [],
        training: [],
        certifiedAt: null,
        certifiedByAdminId: null,
        activatedAt: null,
        activatedByAdminId: null,
        history: [],
      };
      log(record, "applied", asOf, null, input.role);
      await repository.save(record);
      return { ok: true, partner: record };
    },

    async recordIdentityVerification(
      partnerId: string,
      result: IdentityVerificationResult,
      asOf: Date,
    ): Promise<PartnerResult> {
      const loaded = await load(partnerId);
      if (isDenials(loaded)) return { ok: false, denials: loaded };
      loaded.identity = {
        status: result.status,
        providerReference: result.providerReference ?? null,
        updatedAt: asOf.toISOString(),
      };
      log(loaded, "identity_recorded", asOf, null, result.status);
      advancePending(loaded);
      await repository.save(loaded);
      return { ok: true, partner: loaded };
    },

    async recordTaxStatus(partnerId: string, result: ClearanceResult, asOf: Date): Promise<PartnerResult> {
      const loaded = await load(partnerId);
      if (isDenials(loaded)) return { ok: false, denials: loaded };
      loaded.tax = {
        status: result.status,
        formType: result.formType ?? null,
        updatedAt: asOf.toISOString(),
      };
      log(loaded, "tax_recorded", asOf, null, result.status);
      advancePending(loaded);
      await repository.save(loaded);
      return { ok: true, partner: loaded };
    },

    async recordPayoutStatus(partnerId: string, result: ClearanceResult, asOf: Date): Promise<PartnerResult> {
      const loaded = await load(partnerId);
      if (isDenials(loaded)) return { ok: false, denials: loaded };
      loaded.payout = {
        status: result.status,
        methodReference: result.methodReference ?? null,
        updatedAt: asOf.toISOString(),
      };
      log(loaded, "payout_recorded", asOf, null, result.status);
      advancePending(loaded);
      await repository.save(loaded);
      return { ok: true, partner: loaded };
    },

    async acceptAgreement(
      partnerId: string,
      key: AgreementKey,
      version: string,
      contentHash: string,
      asOf: Date,
    ): Promise<PartnerResult> {
      const loaded = await load(partnerId);
      if (isDenials(loaded)) return { ok: false, denials: loaded };
      const required = requirements.agreements.find((a) => a.key === key);
      if (!required) {
        return { ok: false, denials: [denial("unknown_agreement", `Unknown agreement ${key}.`, key)] };
      }
      if (required.version !== version) {
        return {
          ok: false,
          denials: [
            denial("stale_version", `Agreement ${key} requires v${required.version}, not v${version}.`, key),
          ],
        };
      }
      loaded.agreements.push({ key, version, contentHash, acceptedAt: asOf.toISOString() });
      log(loaded, "agreement_accepted", asOf, null, `${key}@${version}`);
      advancePending(loaded);
      await repository.save(loaded);
      return { ok: true, partner: loaded };
    },

    async completeTraining(
      partnerId: string,
      moduleKey: TrainingModuleKey,
      moduleVersion: string,
      asOf: Date,
    ): Promise<PartnerResult> {
      const loaded = await load(partnerId);
      if (isDenials(loaded)) return { ok: false, denials: loaded };
      const required = requirements.trainingModules.find((m) => m.key === moduleKey);
      if (!required) {
        return {
          ok: false,
          denials: [denial("unknown_training_module", `Unknown training module ${moduleKey}.`, moduleKey)],
        };
      }
      if (required.version !== moduleVersion) {
        return {
          ok: false,
          denials: [
            denial(
              "stale_version",
              `Module ${moduleKey} requires v${required.version}, not v${moduleVersion}.`,
              moduleKey,
            ),
          ],
        };
      }
      loaded.training.push({ moduleKey, moduleVersion, completedAt: asOf.toISOString() });
      log(loaded, "training_completed", asOf, null, `${moduleKey}@${moduleVersion}`);
      advancePending(loaded);
      await repository.save(loaded);
      return { ok: true, partner: loaded };
    },

    async certify(partnerId: string, adminId: string, asOf: Date): Promise<PartnerResult> {
      const loaded = await load(partnerId);
      if (isDenials(loaded)) return { ok: false, denials: loaded };
      const gates = unmetActivationGates(loaded, requirements, { includeCertification: false });
      if (gates.length > 0) return { ok: false, denials: gates };
      loaded.certifiedAt = asOf.toISOString();
      loaded.certifiedByAdminId = adminId;
      log(loaded, "certified", asOf, adminId, null);
      advancePending(loaded);
      await repository.save(loaded);
      return { ok: true, partner: loaded };
    },

    /**
     * Fails CLOSED and reports the COMPLETE list of unmet gates, so an admin sees
     * everything outstanding in one pass instead of discovering it one refusal at
     * a time.
     */
    async activate(partnerId: string, adminId: string, asOf: Date): Promise<PartnerResult> {
      const loaded = await load(partnerId);
      if (isDenials(loaded)) return { ok: false, denials: loaded };
      if (loaded.state === "active") {
        return { ok: false, denials: [denial("already_active", "Partner is already active.", partnerId)] };
      }
      const gates = unmetActivationGates(loaded, requirements, { includeCertification: true });
      if (gates.length > 0) {
        advancePending(loaded);
        await repository.save(loaded);
        return { ok: false, denials: gates };
      }
      loaded.state = "active";
      loaded.activatedAt = asOf.toISOString();
      loaded.activatedByAdminId = adminId;
      log(loaded, "activated", asOf, adminId, null);
      await repository.save(loaded);
      return { ok: true, partner: loaded };
    },

    async openQualityReview(
      partnerId: string,
      adminId: string,
      reason: string,
      asOf: Date,
    ): Promise<PartnerResult> {
      const loaded = await load(partnerId);
      if (isDenials(loaded)) return { ok: false, denials: loaded };
      loaded.state = "quality_review";
      log(loaded, "quality_review_opened", asOf, adminId, reason);
      await repository.save(loaded);
      return { ok: true, partner: loaded };
    },

    async suspend(partnerId: string, adminId: string, reason: string, asOf: Date): Promise<PartnerResult> {
      const loaded = await load(partnerId);
      if (isDenials(loaded)) return { ok: false, denials: loaded };
      loaded.state = "suspended";
      log(loaded, "suspended", asOf, adminId, reason);
      await repository.save(loaded);
      return { ok: true, partner: loaded };
    },

    async terminate(partnerId: string, adminId: string, reason: string, asOf: Date): Promise<PartnerResult> {
      const loaded = await load(partnerId);
      if (isDenials(loaded)) return { ok: false, denials: loaded };
      loaded.state = "terminated";
      loaded.certifiedAt = null;
      loaded.certifiedByAdminId = null;
      log(loaded, "terminated", asOf, adminId, reason);
      await repository.save(loaded);
      return { ok: true, partner: loaded };
    },

    /**
     * Reinstatement re-runs every gate. A partner who lapsed a requirement while
     * suspended returns to the pending chain, not to active.
     */
    async reinstate(partnerId: string, adminId: string, asOf: Date): Promise<PartnerResult> {
      const loaded = await load(partnerId);
      if (isDenials(loaded)) return { ok: false, denials: loaded };
      if (loaded.state !== "suspended" && loaded.state !== "quality_review") {
        return {
          ok: false,
          denials: [
            denial("invalid_state_transition", `Cannot reinstate from ${loaded.state}.`, loaded.state),
          ],
        };
      }
      const gates = unmetActivationGates(loaded, requirements, { includeCertification: true });
      if (gates.length > 0) {
        loaded.state = nextPendingState(loaded, requirements);
        log(loaded, "reinstated", asOf, adminId, "returned to onboarding, gates unmet");
        await repository.save(loaded);
        return { ok: false, denials: gates };
      }
      loaded.state = "active";
      log(loaded, "reinstated", asOf, adminId, null);
      await repository.save(loaded);
      return { ok: true, partner: loaded };
    },

    /**
     * A materially changed module version invalidates every completion of the old
     * version. Certification is revoked with it, so a partner cannot keep earning
     * on training they have not taken. Terminated partners are left alone.
     */
    async requireRecertification(
      moduleKey: TrainingModuleKey,
      newVersion: string,
      asOf: Date,
    ): Promise<PartnerRecord[]> {
      const known = requirements.trainingModules.find((m) => m.key === moduleKey);
      if (!known) return [];
      const previousVersion = known.version;
      requirements = {
        agreements: requirements.agreements.slice(),
        trainingModules: requirements.trainingModules.map((m) =>
          m.key === moduleKey ? { key: m.key, version: newVersion } : m,
        ),
      };
      if (previousVersion === newVersion) return [];

      const all = await repository.list();
      const affected: PartnerRecord[] = [];
      for (const record of all) {
        if (record.state === "terminated") continue;
        const hadOld = record.training.some(
          (t) => t.moduleKey === moduleKey && t.moduleVersion === previousVersion,
        );
        if (!hadOld) continue;
        record.training = record.training.filter(
          (t) => !(t.moduleKey === moduleKey && t.moduleVersion === previousVersion),
        );
        record.certifiedAt = null;
        record.certifiedByAdminId = null;
        // Suspended and quality_review partners keep their state, because a review
        // outranks onboarding. They lose certification either way, so they cannot
        // be reinstated straight to active without retaking the module.
        if (record.state === "active" || PRE_ACTIVE_STATES.includes(record.state)) {
          record.state = "certification_pending";
        }
        log(record, "certification_revoked", asOf, null, `${moduleKey} v${previousVersion} superseded`);
        log(record, "recertification_required", asOf, null, `${moduleKey}@${newVersion}`);
        await repository.save(record);
        affected.push(record);
      }
      return affected;
    },

    /**
     * Built by EXPLICIT CONSTRUCTION. Every field below is named individually and
     * comes from a named source field, so nothing on PartnerRecord or on a stats
     * snapshot can reach a partner unless it is written here on purpose.
     */
    async dashboardFor(partnerId: string): Promise<PartnerDashboardResult> {
      const record = await repository.get(partnerId);
      if (!record) {
        return { ok: false, denials: [denial("partner_not_found", `No partner ${partnerId}.`, partnerId)] };
      }
      const snapshot = stats ? await stats.statsFor(partnerId) : EMPTY_PARTNER_STATS;

      const conversions: PartnerDashboardDto["conversions"] = snapshot.conversions.map((c) =>
        toPartnerVisibleConversion({
          attributedAt: c.attributedAt,
          eligibleNetCents: c.eligibleNetCents,
          commissionCents: c.commissionCents,
          state: c.state,
        }),
      );

      const dashboard: PartnerDashboardDto = {
        partnerId: record.partnerId,
        role: record.role,
        state: record.state,
        leadCount: snapshot.leadCount,
        conversionCount: snapshot.conversionCount,
        totalCommissionCents: snapshot.totalCommissionCents,
        // Accrued history stays visible, but nothing is payable while the partner
        // cannot be paid, so a suspended partner never sees a payable balance.
        payableCents: partnerCanBePaid(record.state) ? snapshot.payableCents : 0,
        conversions,
        outstandingTraining: outstandingTrainingFor(record, requirements),
      };
      return { ok: true, dashboard };
    },
  };
}

/** Convenience for callers that hold a record rather than a state. */
export function partnerRecordCanEarn(record: PartnerRecord): boolean {
  return partnerCanEarn(record.state);
}

export function partnerRecordCanBePaid(record: PartnerRecord): boolean {
  return partnerCanBePaid(record.state);
}
