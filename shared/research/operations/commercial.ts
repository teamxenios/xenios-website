export type ProfessionalAccountType =
  | "wholesale"
  | "reseller"
  | "professional_membership"
  | "education"
  | "directory"
  | "implementation"
  | "software";

export type CommercialState =
  | "prospect"
  | "discovery"
  | "diligence"
  | "commercial_review"
  | "agreement"
  | "active"
  | "paused"
  | "closed";

export interface ProfessionalAccountView {
  accountId: string;
  legalName: string;
  accountType: ProfessionalAccountType;
  state: CommercialState;
  agreementReference: string | null;
  version: number;
  updatedAt: string;
}

export interface LawrenceConfigurationView {
  configurationId: string;
  partnerId: string;
  partnerCode: string;
  agreementVersion: string;
  attributionWindowDays: number;
  holdDays: number;
  payoutThresholdCents: number;
  currency: string;
  tiers: Array<{ thresholdCents: number; rateBasisPoints: number }>;
  activationBountyCents: number | null;
  optionalRetainerCents: number | null;
  state: "draft" | "under_review" | "active" | "superseded";
  version: number;
  updatedAt: string;
}

export interface OperationsCommandCenterView {
  supplierCounts: Record<string, number>;
  fulfillmentCounts: Record<string, number>;
  affiliateCounts: Record<string, number>;
  professionalCounts: Record<string, number>;
  exceptionCount: number;
  payableCommissionCents: number;
  currency: string | null;
  generatedAt: string;
}

export interface ConfigureProfessionalAccountInput {
  actorId: string;
  accountId?: string;
  legalName: string;
  accountType: ProfessionalAccountType;
  state: CommercialState;
  agreementReference?: string;
  expectedVersion: number;
  idempotencyKey: string;
  at: string;
}

export interface ConfigureLawrenceInput {
  actorId: string;
  partnerId: string;
  agreementVersion: string;
  attributionWindowDays: number;
  holdDays: number;
  payoutThresholdCents: number;
  currency: string;
  tiers: Array<{ thresholdCents: number; rateBasisPoints: number }>;
  activationBountyCents?: number;
  optionalRetainerCents?: number;
  state: LawrenceConfigurationView["state"];
  expectedVersion: number;
  idempotencyKey: string;
  at: string;
}

export interface CommercialCommandResult {
  recordId: string;
  state: string;
  version: number;
  idempotentReplay: boolean;
}
