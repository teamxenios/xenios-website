import type { CommissionProgramId, CommissionScheduleDefinition } from "./contract";

const COMMON_EXCLUSIONS = [
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

export const SETH_OPERATING_ADVISOR_SCHEDULE: CommissionScheduleDefinition = Object.freeze({
  schemaVersion: 1,
  programId: "seth_operating_advisor_2026_09_signed",
  version: 1,
  label: "Seth operating advisor signed schedule",
  effectiveDate: "2026-09-02",
  currency: "USD",
  eligibleBasis: "eligible_net_collected_product_channel_revenue",
  initialTermDays: 90,
  measurementPeriod: Object.freeze({ anchor: "binding_effective_at", days: 30 }),
  ratePolicy: Object.freeze({
    kind: "marginal_period",
    bands: Object.freeze([
      Object.freeze({ throughCents: 5_000_000, rateBasisPoints: 2_500 }),
      Object.freeze({ throughCents: null, rateBasisPoints: 3_000 }),
    ]),
  }),
  // Section 3.6 preserves only the 25% base rate after the 90-day term unless
  // a later signed Part II or account-specific writing says otherwise.
  postTermTailRatePolicy: Object.freeze({ kind: "flat", rateBasisPoints: 2_500 }),
  customerAttribution: Object.freeze({
    startsAt: "first_eligible_transaction",
    durationMonths: 12,
    requiresAcceptedRelationship: true,
    requiresActiveManagement: true,
  }),
  reconciliation: Object.freeze({
    cadence: "day_15_and_day_30",
    statementDays: Object.freeze([15, 30]),
    payWithinBusinessDays: 5,
  }),
  // This is compensation metadata, not an order commission. The order ledger
  // never mints the shortfall automatically.
  phaseOneGuarantee: Object.freeze({
    periodIndex: 0,
    minimumCents: 500_000,
    treatment: "greater_of_commission_or_nonrecoverable_guarantee",
  }),
  exclusions: Object.freeze([...COMMON_EXCLUSIONS]),
  sponsorOverridesEnabled: false,
  recruiterOverridesEnabled: false,
  downlineOverridesEnabled: false,
  compensationForRecruitingEnabled: false,
  pricingAuthority: Object.freeze({
    serverApprovalRequired: true,
    floorsCeilingsAndMarginRulesApply: true,
  }),
  sourceEvidence: Object.freeze([
    Object.freeze({
      file: "SIGNED_XENIOS_SETH_90_DAY_OPERATING_ADVISOR_AGREEMENT_REVISED (1).pdf",
      sha256: "09318a530d989ce3b1da2b0c24827b604d4e7958f716d6c9f368149f4382d911",
      location: "Sections 3.1-3.7; Sections 2.3-2.4; signature page",
      authority: "signed_agreement",
    }),
  ]),
});

export const STANDARD_REPRESENTATIVE_SCHEDULE: CommissionScheduleDefinition = Object.freeze({
  schemaVersion: 1,
  programId: "xenios_standard_rep_2026_09",
  version: 1,
  label: "Xenios standard representative schedule",
  effectiveDate: "2026-09-15",
  currency: "USD",
  eligibleBasis: "eligible_net_collected_product_channel_revenue",
  initialTermDays: 90,
  measurementPeriod: Object.freeze({ anchor: "binding_effective_at", days: 14 }),
  ratePolicy: Object.freeze({ kind: "flat", rateBasisPoints: 2_000 }),
  postTermTailRatePolicy: null,
  customerAttribution: Object.freeze({
    startsAt: "binding_effective_at",
    durationMonths: null,
    requiresAcceptedRelationship: true,
    requiresActiveManagement: false,
  }),
  reconciliation: Object.freeze({
    cadence: "biweekly",
    statementDays: Object.freeze([]),
    payWithinBusinessDays: null,
  }),
  phaseOneGuarantee: null,
  exclusions: Object.freeze([...COMMON_EXCLUSIONS]),
  sponsorOverridesEnabled: false,
  recruiterOverridesEnabled: false,
  downlineOverridesEnabled: false,
  compensationForRecruitingEnabled: false,
  pricingAuthority: Object.freeze({
    serverApprovalRequired: true,
    floorsCeilingsAndMarginRulesApply: true,
  }),
  sourceEvidence: Object.freeze([
    Object.freeze({
      file: "XENIOS_REPRESENTATIVE_20_PERCENT_STRUCTURE_AND_OPPORTUNITY_GUIDE_2026-09-15(1).pdf",
      sha256: "deaa4aca0d3dcf8d9ead6f7d94e41e5538ada5d41a2eba2e44a679d5087da15c",
      location: "Core structure; How it works; Guardrails",
      authority: "program_guide",
    }),
    Object.freeze({
      file: "XENIOS_RESEARCH_MASTER_FINANCIAL_PRODUCT_AFFILIATE_MODEL.xlsx",
      sha256: "80fb6e6fb63ae3b72f337f443185b86d1c8e58e04b32baffaba1114b8855cf89",
      location: "README rows 6 and 12; Affiliate Program rows 3-21",
      authority: "planning_model",
    }),
  ]),
});

export const COMMISSION_SCHEDULE_CATALOG: Readonly<
  Record<CommissionProgramId, Readonly<Record<number, CommissionScheduleDefinition>>>
> = Object.freeze({
  seth_operating_advisor_2026_09_signed: Object.freeze({
    1: SETH_OPERATING_ADVISOR_SCHEDULE,
  }),
  xenios_standard_rep_2026_09: Object.freeze({
    1: STANDARD_REPRESENTATIVE_SCHEDULE,
  }),
});

export function commissionScheduleDefinition(
  programId: CommissionProgramId,
  version: number,
): CommissionScheduleDefinition | null {
  return COMMISSION_SCHEDULE_CATALOG[programId][version] ?? null;
}
