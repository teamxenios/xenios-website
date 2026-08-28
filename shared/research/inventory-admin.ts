export const INVENTORY_MOVEMENT_TYPES = [
  "receipt",
  "reserve",
  "release",
  "adjust",
  "quarantine",
  "quarantine_release",
  "damage",
  "reconcile",
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const INVENTORY_SOURCE_BUCKETS = [
  "available",
  "reserved",
  "quarantined",
] as const;
export type InventorySourceBucket = (typeof INVENTORY_SOURCE_BUCKETS)[number];

export const INVENTORY_LOT_DISPOSITIONS = [
  "available",
  "allocated",
  "picked",
  "packed",
  "shipped",
  "quarantined",
  "quality_hold",
  "temperature_hold",
  "damaged",
  "expired",
  "recalled",
  "destroyed",
] as const;
export type InventoryLotDisposition = (typeof INVENTORY_LOT_DISPOSITIONS)[number];

export const LOT_QUALITY_TEST_KEYS = [
  "identity",
  "assay",
  "purity",
  "sterility",
  "endotoxin",
  "particulate",
  "residual_solvents",
  "elemental_impurities",
  "chain_of_custody",
] as const;
export type LotQualityTestKey = (typeof LOT_QUALITY_TEST_KEYS)[number];

export const LOT_QUALITY_TEST_STATES = [
  "not_provided",
  "not_tested",
  "not_applicable",
  "under_review",
  "passed",
  "failed",
] as const;
export type LotQualityTestState = (typeof LOT_QUALITY_TEST_STATES)[number];

export const LOT_QUALITY_ACCESS_PURPOSES = [
  "quality_review",
  "compliance_review",
  "incident_investigation",
] as const;
export type LotQualityAccessPurpose = (typeof LOT_QUALITY_ACCESS_PURPOSES)[number];

export type InventoryLotAdmin = {
  id: string;
  lotCode: string;
  sku: string;
  productId: string | null;
  variantId: string | null;
  owner: "mitch" | "xenios";
  disposition: InventoryLotDisposition;
  storageLocation: string | null;
  supplierReference: string | null;
  manufacturedDate: string | null;
  expiryDate: string | null;
  retestDate: string | null;
  quantityReceived: number;
  quantityAvailable: number;
  quantityReserved: number;
  quantityQuarantined: number;
  quantityDamaged: number;
  version: number;
  allocatable: boolean;
  updatedAt: string;
};

export type InventoryMovementAdmin = {
  id: string;
  lotId: string;
  movementType: InventoryMovementType;
  quantity: number;
  sourceBucket: InventorySourceBucket | null;
  availableBefore: number;
  availableAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  quarantinedBefore: number;
  quarantinedAfter: number;
  damagedBefore: number;
  damagedAfter: number;
  resultingVersion: number;
  reason: string;
  actorId: string;
  occurredAt: string;
};

export type LotQualityTestAdmin = {
  testKey: LotQualityTestKey;
  state: LotQualityTestState;
  method: string | null;
  result: string | null;
  unit: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export type LotQualityDocumentAdmin = {
  id: string;
  lotId: string;
  lotCode: string;
  sku: string;
  documentState: "pending" | "available" | "withdrawn";
  verificationState: "pending" | "document_on_file" | "withdrawn";
  originalFilename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  reportIssuer: string | null;
  reportNumber: string | null;
  reportDate: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  version: number;
  tests: LotQualityTestAdmin[];
};

export type InventoryMovementCommand = {
  movementType: InventoryMovementType;
  quantity: number;
  sourceBucket: InventorySourceBucket | null;
  expectedVersion: number;
  idempotencyKey: string;
  reason: string;
};

export type InventoryMovementReceipt = {
  movementId: string;
  lotId: string;
  version: number;
  idempotentReplay: boolean;
  quantityAvailable: number;
  quantityReserved: number;
  quantityQuarantined: number;
  quantityDamaged: number;
};

export type InventoryDispositionReceipt = {
  lotId: string;
  disposition: InventoryLotDisposition;
  version: number;
  idempotentReplay: boolean;
};

export type LotQualityDocumentReceipt = {
  documentId: string;
  documentState: LotQualityDocumentAdmin["documentState"];
  verificationState: LotQualityDocumentAdmin["verificationState"];
  version: number;
  idempotentReplay: boolean;
};

export type CoaUploadPreparation = {
  lotId: string;
  filename: string;
  contentType: "application/pdf";
  sizeBytes: number;
  sha256: string;
  reportIssuer: string;
  reportNumber: string;
  reportDate: string;
  idempotencyKey: string;
};

export type CoaUploadMetadata = Omit<CoaUploadPreparation, "idempotencyKey">;

export type CoaUploadCancellation = CoaUploadMetadata & {
  expectedVersion: number;
  preparationIdempotencyKey: string;
  idempotencyKey: string;
};

export type CoaUploadGrant = {
  documentId: string;
  documentVersion: number;
  uploadRequired: boolean;
  uploadUrl: string | null;
  storageKey: string;
  expiresAt: string | null;
};
