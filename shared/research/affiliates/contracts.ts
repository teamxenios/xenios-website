export type AffiliatePartnerState =
  | "invited"
  | "under_review"
  | "active"
  | "paused"
  | "disabled";

export type AffiliateCommissionState =
  | "pending"
  | "approved"
  | "payable"
  | "paid"
  | "reversed"
  | "disputed";

export interface AffiliatePartnerView {
  partnerId: string;
  partnerCode: string;
  displayName: string;
  state: AffiliatePartnerState;
  disclosure: string | null;
  agreementReference: string | null;
  version: number;
  updatedAt: string;
}

export interface AffiliateLinkView {
  linkId: string;
  partnerId: string;
  code: string;
  destinationPath: string;
  campaign: string | null;
  state: "active" | "paused";
  version: number;
}

export interface AffiliateStatementView {
  statementId: string;
  partnerId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  grossCommissionCents: number;
  reversalCents: number;
  payableCents: number;
  state: "issued" | "superseded";
  version: number;
  supersedesStatementId: string | null;
  itemCount: number;
  issuedAt: string;
}

export interface ConfigureAffiliatePartnerInput {
  actorId: string;
  partnerId?: string;
  partnerCode: string;
  displayName: string;
  state: AffiliatePartnerState;
  disclosure?: string;
  agreementReference?: string;
  expectedVersion: number;
  idempotencyKey: string;
  at: string;
}

export interface CreateAffiliateLinkInput {
  actorId: string;
  partnerId: string;
  code: string;
  destinationPath: string;
  campaign?: string;
  expectedVersion: 0;
  idempotencyKey: string;
  at: string;
}

export interface RecordAttributionInput {
  actorId: string;
  partnerId: string;
  linkId: string;
  orderId: string;
  idempotencyKey: string;
  at: string;
}

export interface RecordCommissionInput {
  actorId: string;
  partnerId: string;
  attributionEventId: string;
  action: "accrue" | "approve" | "make_payable" | "mark_paid" | "reverse" | "dispute";
  reason?: string;
  payoutProvider?: string;
  payoutReference?: string;
  idempotencyKey: string;
  at: string;
}

export interface PublishAffiliateStatementInput {
  actorId: string;
  partnerId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  supersedesStatementId?: string;
  idempotencyKey: string;
  at: string;
}

export interface AffiliateCommandResult {
  recordId: string;
  state: string;
  version: number;
  idempotentReplay: boolean;
}
