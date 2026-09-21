export const COMMISSION_PROGRAM_IDS = [
  "seth_operating_advisor_2026_09_signed",
  "xenios_standard_rep_2026_09",
] as const;

export type CommissionProgramId = (typeof COMMISSION_PROGRAM_IDS)[number];

export const PROGRAM_COMMISSION_STATES = [
  "pending",
  "held",
  "approved",
  "payable",
  "paid",
  "reversed",
  "disputed",
] as const;

export type ProgramCommissionState = (typeof PROGRAM_COMMISSION_STATES)[number];

export const COMMISSION_EXCLUSION_KINDS = [
  "refund",
  "chargeback",
  "discount",
  "credit",
  "tax",
  "shipping_pass_through",
  "complimentary_value",
  "fraud_or_duplicate",
  "clinical_professional_fee",
  "patient_referral",
  "medication_or_pharmacy_revenue",
  "laboratory_revenue",
  "prescription_revenue",
  "care_clinical_charge",
  "other_written_exclusion",
] as const;

export type CommissionExclusionKind = (typeof COMMISSION_EXCLUSION_KINDS)[number];

export type ScheduleSourceEvidence = Readonly<{
  file: string;
  sha256: string;
  location: string;
  authority: "signed_agreement" | "program_guide" | "planning_model";
}>;

export type MarginalCommissionRatePolicy = Readonly<{
  kind: "marginal_period";
  bands: readonly Readonly<{ throughCents: number | null; rateBasisPoints: number }>[];
}>;

export type FlatCommissionRatePolicy = Readonly<{
  kind: "flat";
  rateBasisPoints: number;
}>;

export type CommissionRatePolicy = MarginalCommissionRatePolicy | FlatCommissionRatePolicy;

export type CommissionScheduleDefinition = Readonly<{
  schemaVersion: 1;
  programId: CommissionProgramId;
  version: number;
  label: string;
  effectiveDate: string;
  currency: "USD";
  eligibleBasis: "eligible_net_collected_product_channel_revenue";
  initialTermDays: number;
  measurementPeriod: Readonly<{
    anchor: "binding_effective_at";
    days: number;
  }>;
  ratePolicy: CommissionRatePolicy;
  postTermTailRatePolicy: FlatCommissionRatePolicy | null;
  customerAttribution: Readonly<{
    startsAt: "first_eligible_transaction" | "binding_effective_at";
    durationMonths: number | null;
    requiresAcceptedRelationship: boolean;
    requiresActiveManagement: boolean;
  }>;
  reconciliation: Readonly<{
    cadence: "day_15_and_day_30" | "biweekly";
    statementDays: readonly number[];
    payWithinBusinessDays: number | null;
  }>;
  phaseOneGuarantee: Readonly<{
    periodIndex: 0;
    minimumCents: number;
    treatment: "greater_of_commission_or_nonrecoverable_guarantee";
  }> | null;
  exclusions: readonly CommissionExclusionKind[];
  sponsorOverridesEnabled: false;
  recruiterOverridesEnabled: false;
  downlineOverridesEnabled: false;
  compensationForRecruitingEnabled: false;
  pricingAuthority: Readonly<{
    serverApprovalRequired: true;
    floorsCeilingsAndMarginRulesApply: true;
  }>;
  sourceEvidence: readonly ScheduleSourceEvidence[];
}>;

export type CommissionScheduleSnapshot = Readonly<{
  definition: CommissionScheduleDefinition;
  hashAlgorithm: "sha256";
  scheduleHash: string;
}>;

export type CommissionRevenueExclusion = Readonly<{
  kind: CommissionExclusionKind;
  amountCents: number;
  /** Required when kind is other_written_exclusion. Never customer-authored. */
  authorityReference: string | null;
}>;

export type CommissionRevenueBreakdown = Readonly<{
  grossProductChannelRevenueCents: number;
  exclusions: readonly CommissionRevenueExclusion[];
}>;

export type CommissionRateComponent = Readonly<{
  basisCents: number;
  rateBasisPoints: number;
  commissionCents: number;
}>;

export type CommissionCalculation = Readonly<{
  eligibleBasisCents: number;
  commissionCents: number;
  components: readonly CommissionRateComponent[];
}>;

export type CommissionPeriodWindow = Readonly<{
  index: number;
  startsAt: string;
  endsAt: string;
}>;
