export const SUPPLIER_STATES = [
  "onboarding",
  "under_review",
  "active",
  "paused",
  "disabled",
] as const;

export type SupplierState = (typeof SUPPLIER_STATES)[number];
export type SupplierProviderMode = "disabled" | "capture" | "live";
export type SupplierOfferState = "draft" | "under_review" | "active" | "paused";

export interface SupplierView {
  supplierId: string;
  displayName: string;
  legalName: string;
  state: SupplierState;
  providerMode: SupplierProviderMode;
  agreementReference: string | null;
  agreementVerifiedAt: string | null;
  version: number;
  updatedAt: string;
}

export interface SupplierOfferView {
  offerId: string;
  supplierId: string;
  productId: string;
  variantId: string;
  sku: string;
  state: SupplierOfferState;
  settlementCurrency: string | null;
  settlementAmountCents: number | null;
  agreementReference: string | null;
  version: number;
  updatedAt: string;
}

export interface OnboardSupplierInput {
  actorId: string;
  displayName: string;
  legalName: string;
  providerMode: SupplierProviderMode;
  agreementReference?: string;
  expectedVersion: 0;
  idempotencyKey: string;
  at: string;
}

export interface ConfigureSupplierOfferInput {
  actorId: string;
  supplierId: string;
  productId: string;
  variantId: string;
  sku: string;
  state: SupplierOfferState;
  settlementCurrency?: string;
  settlementAmountCents?: number;
  agreementReference?: string;
  expectedVersion: number;
  idempotencyKey: string;
  at: string;
}

export interface AssignSupplierUserInput {
  actorId: string;
  supplierId: string;
  supplierAuthUserId: string;
  state: "active" | "paused" | "revoked";
  expectedVersion: number;
  idempotencyKey: string;
  at: string;
}

export interface RecordSupplierSettlementInput {
  actorId: string;
  supplierId: string;
  assignmentId: string;
  offerId: string;
  amountCents: number;
  currency: string;
  agreementReference: string;
  externalReference?: string;
  idempotencyKey: string;
  at: string;
}

export interface SupplierCommandResult {
  recordId: string;
  state: string;
  version: number;
  idempotentReplay: boolean;
}
