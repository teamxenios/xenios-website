import {
  INVENTORY_LOT_DISPOSITIONS,
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_SOURCE_BUCKETS,
  LOT_QUALITY_TEST_KEYS,
  LOT_QUALITY_TEST_STATES,
  type InventoryLotAdmin,
  type InventoryLotDisposition,
  type InventoryDispositionReceipt,
  type InventoryMovementAdmin,
  type InventoryMovementCommand,
  type InventoryMovementReceipt,
  type InventoryMovementType,
  type InventorySourceBucket,
  type LotQualityDocumentAdmin,
  type LotQualityDocumentReceipt,
  type LotQualityTestAdmin,
} from "@shared/research/inventory-admin";
import type { ProductCommerceReadinessProjection } from "../products-diagnostics/product-commerce-readiness";
import { parseProductControlTimestamp } from "../products-diagnostics/product-control-price-resolver";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const STORAGE_KEY = /^lots\/[0-9a-f-]{36}\/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,120}$/i;
const MAX_COA_BYTES = 20 * 1024 * 1024;
const MAX_MOVEMENT_QUANTITY = 100_000_000;
const MAX_DATABASE_INTEGER = 2_147_483_647;

const LOT_DISPOSITIONS = new Set<string>(INVENTORY_LOT_DISPOSITIONS);
const MOVEMENT_TYPES = new Set<string>(INVENTORY_MOVEMENT_TYPES);
const SOURCE_BUCKETS = new Set<string>(INVENTORY_SOURCE_BUCKETS);
const TEST_KEYS = new Set<string>(LOT_QUALITY_TEST_KEYS);
const TEST_STATES = new Set<string>(LOT_QUALITY_TEST_STATES);
const REQUIRED_PASSED_QUALITY_TEST_KEYS = new Set<string>([
  "identity",
  "assay",
  "purity",
  "chain_of_custody",
]);

export class InventoryAdminPersistenceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "InventoryAdminPersistenceError";
  }
}

function invalid(code: string): never {
  throw new InventoryAdminPersistenceError(code);
}

export function assertInventoryMovementCommandSource(
  command: Pick<InventoryMovementCommand, "movementType" | "sourceBucket">,
): void {
  const code = "inventory_movement_rejected";
  const movementType: unknown = command.movementType;
  const sourceBucket: unknown = command.sourceBucket;
  if (
    typeof movementType !== "string" ||
    !MOVEMENT_TYPES.has(movementType) ||
    (sourceBucket !== null &&
      (typeof sourceBucket !== "string" || !SOURCE_BUCKETS.has(sourceBucket)))
  ) {
    invalid(code);
  }

  const expectedSource: Partial<Record<InventoryMovementType, InventorySourceBucket | null>> = {
    receipt: null,
    reserve: "available",
    release: "reserved",
    quarantine: "available",
    quarantine_release: "quarantined",
    adjust: "available",
    reconcile: "available",
  };
  if (movementType === "damage") {
    if (sourceBucket === null) invalid(code);
    return;
  }
  if (sourceBucket !== expectedSource[movementType as InventoryMovementType]) {
    invalid(code);
  }
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  row: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(row).sort();
  const canonical = [...expected].sort();
  if (
    actual.length !== canonical.length ||
    actual.some((key, index) => key !== canonical[index])
  ) {
    invalid(code);
  }
}

export function parseEvidenceRows(value: unknown, code: string): unknown[] {
  if (!Array.isArray(value)) invalid(code);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) invalid(code);
  }
  return value;
}

function requiredString(
  row: Record<string, unknown>,
  key: string,
  code: string,
  maxLength = 2_000,
): string {
  const value = row[key];
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    invalid(code);
  }
  return value;
}

function nullableString(
  row: Record<string, unknown>,
  key: string,
  code: string,
  maxLength = 2_000,
): string | null {
  const value = row[key];
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    invalid(code);
  }
  return value;
}

function uuid(row: Record<string, unknown>, key: string, code: string): string {
  const value = requiredString(row, key, code, 36);
  if (!UUID.test(value)) invalid(code);
  return value;
}

function nullableUuid(
  row: Record<string, unknown>,
  key: string,
  code: string,
): string | null {
  if (row[key] === null) return null;
  return uuid(row, key, code);
}

function boolean(row: Record<string, unknown>, key: string, code: string): boolean {
  const value = row[key];
  if (typeof value !== "boolean") invalid(code);
  return value;
}

function safeInteger(
  row: Record<string, unknown>,
  key: string,
  code: string,
): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) invalid(code);
  return value;
}

function nonNegativeInteger(
  row: Record<string, unknown>,
  key: string,
  code: string,
): number {
  const value = safeInteger(row, key, code);
  if (value < 0 || value > MAX_DATABASE_INTEGER) invalid(code);
  return value;
}

function positiveInteger(
  row: Record<string, unknown>,
  key: string,
  code: string,
): number {
  const value = safeInteger(row, key, code);
  if (value < 1) invalid(code);
  return value;
}

function isoDateValue(value: unknown, code: string): string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) invalid(code);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    invalid(code);
  }
  return value;
}

function nullableIsoDateValue(value: unknown, code: string): string | null {
  return value === null ? null : isoDateValue(value, code);
}

function isoTimestampValue(value: unknown, code: string): string {
  if (
    typeof value !== "string" ||
    !ISO_TIMESTAMP.test(value) ||
    parseProductControlTimestamp(value) === null
  ) {
    invalid(code);
  }
  return value;
}

function nullableIsoTimestampValue(value: unknown, code: string): string | null {
  return value === null ? null : isoTimestampValue(value, code);
}

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  code: string,
): T {
  if (typeof value !== "string" || !allowed.has(value)) invalid(code);
  return value as T;
}

function storageKeyValue(value: unknown, code: string): string {
  if (typeof value !== "string" || !STORAGE_KEY.test(value)) invalid(code);
  return value;
}

function qualityStatePair(
  documentState: LotQualityDocumentAdmin["documentState"],
  verificationState: LotQualityDocumentAdmin["verificationState"],
  code: string,
): void {
  const valid =
    (documentState === "pending" && verificationState === "pending") ||
    (documentState === "available" && verificationState === "document_on_file") ||
    (documentState === "withdrawn" && verificationState === "withdrawn");
  if (!valid) invalid(code);
}

export function parseInventoryProductBindingRow(value: unknown): {
  productId: string;
  variantId: string;
  sku: string;
} {
  const code = "inventory_product_binding_evidence_invalid";
  const row = record(value, code);
  return {
    productId: uuid(row, "product_id", code),
    variantId: uuid(row, "variant_id", code),
    sku: requiredString(row, "sku", code, 120),
  };
}

export function parseInventoryLotReferenceRow(
  value: unknown,
  expectedLotId: string,
): { id: string; lotCode: string } {
  const code = "inventory_lot_reference_evidence_invalid";
  const row = record(value, code);
  const id = uuid(row, "id", code);
  if (id !== expectedLotId) invalid(code);
  return {
    id,
    lotCode: requiredString(row, "lot_id", code, 120),
  };
}

export function parseProductCommerceReadinessProjection(
  value: unknown,
): ProductCommerceReadinessProjection {
  const code = "inventory_product_projection_evidence_invalid";
  const row = record(value, code);
  const activePrice = row.activePrice === null
    ? null
    : (() => {
        const price = record(row.activePrice, code);
        const amountCents = positiveInteger(price, "amountCents", code);
        const currency = requiredString(price, "currency", code, 3);
        if (!CURRENCY.test(currency)) invalid(code);
        return {
          amountCents,
          currency,
          effectiveAt: isoTimestampValue(price.effectiveAt, code),
          version: positiveInteger(price, "version", code),
        };
      })();

  return {
    productId: uuid(row, "productId", code),
    variantId: uuid(row, "variantId", code),
    sku: requiredString(row, "sku", code, 120),
    productApproved: boolean(row, "productApproved", code),
    productActive: boolean(row, "productActive", code),
    variantApproved: boolean(row, "variantApproved", code),
    variantActive: boolean(row, "variantActive", code),
    activePrice,
    shippingClass: nullableString(row, "shippingClass", code, 120),
    exactLotCoaRequired: boolean(row, "exactLotCoaRequired", code),
    productDocumentationRequired: boolean(row, "productDocumentationRequired", code),
  };
}

export function parseProductReadinessGateEvidence(value: unknown): Pick<
  ProductCommerceReadinessProjection,
  | "productId"
  | "variantId"
  | "sku"
  | "productApproved"
  | "productActive"
  | "variantApproved"
  | "variantActive"
> {
  const code = "inventory_product_gate_evidence_invalid";
  const row = record(value, code);
  return {
    productId: uuid(row, "productId", code),
    variantId: uuid(row, "variantId", code),
    sku: requiredString(row, "sku", code, 120),
    productApproved: boolean(row, "productApproved", code),
    productActive: boolean(row, "productActive", code),
    variantApproved: boolean(row, "variantApproved", code),
    variantActive: boolean(row, "variantActive", code),
  };
}

export function parseInventoryLotRow(
  value: unknown,
  allocatableEvidence: unknown,
): InventoryLotAdmin {
  const code = "inventory_lot_evidence_invalid";
  const row = record(value, code);
  if (typeof allocatableEvidence !== "boolean") invalid(code);

  const productId = nullableUuid(row, "product_id", code);
  const variantId = nullableUuid(row, "variant_id", code);
  if ((productId === null) !== (variantId === null)) invalid(code);

  const quantityReceived = nonNegativeInteger(row, "quantity_received", code);
  const quantityAvailable = nonNegativeInteger(row, "quantity_available", code);
  const quantityReserved = nonNegativeInteger(row, "quantity_reserved", code);
  const quantityQuarantined = nonNegativeInteger(row, "quantity_quarantined", code);
  const quantityDamaged = nonNegativeInteger(row, "quantity_damaged", code);
  if (
    quantityAvailable + quantityReserved + quantityQuarantined + quantityDamaged >
    quantityReceived
  ) {
    invalid(code);
  }

  const owner = row.owner;
  if (owner !== "mitch" && owner !== "xenios") invalid(code);

  return {
    id: uuid(row, "id", code),
    lotCode: requiredString(row, "lot_id", code, 120),
    sku: requiredString(row, "sku", code, 120),
    productId,
    variantId,
    owner,
    disposition: enumValue<InventoryLotDisposition>(row.disposition, LOT_DISPOSITIONS, code),
    storageLocation: nullableString(row, "storage_location", code, 160),
    supplierReference: nullableString(row, "supplier_reference", code, 200),
    manufacturedDate: nullableIsoDateValue(row.manufactured_date, code),
    expiryDate: nullableIsoDateValue(row.expiry_date, code),
    retestDate: nullableIsoDateValue(row.retest_date, code),
    quantityReceived,
    quantityAvailable,
    quantityReserved,
    quantityQuarantined,
    quantityDamaged,
    version: positiveInteger(row, "version", code),
    allocatable: allocatableEvidence,
    updatedAt: isoTimestampValue(row.updated_at, code),
  };
}

export function parseInventoryMovementRow(value: unknown): InventoryMovementAdmin {
  const code = "inventory_movement_evidence_invalid";
  const row = record(value, code);
  const movementType = enumValue<InventoryMovementType>(
    row.movement_type,
    MOVEMENT_TYPES,
    code,
  );
  const quantity = safeInteger(row, "quantity", code);
  if (
    quantity === 0 ||
    Math.abs(quantity) > MAX_MOVEMENT_QUANTITY ||
    (!(["adjust", "reconcile"] as string[]).includes(movementType) && quantity < 1)
  ) {
    invalid(code);
  }

  const sourceBucket = row.source_bucket === null
    ? null
    : enumValue<InventorySourceBucket>(row.source_bucket, SOURCE_BUCKETS, code);
  try {
    assertInventoryMovementCommandSource({ movementType, sourceBucket });
  } catch {
    // Stored/read evidence must obey the same canonical bucket semantics as
    // commands. A mathematically valid delta with the wrong source label is
    // ambiguous audit evidence, not an authoritative movement.
    invalid(code);
  }

  const availableBefore = nonNegativeInteger(row, "available_before", code);
  const availableAfter = nonNegativeInteger(row, "available_after", code);
  const reservedBefore = nonNegativeInteger(row, "reserved_before", code);
  const reservedAfter = nonNegativeInteger(row, "reserved_after", code);
  const quarantinedBefore = nonNegativeInteger(row, "quarantined_before", code);
  const quarantinedAfter = nonNegativeInteger(row, "quarantined_after", code);
  const damagedBefore = nonNegativeInteger(row, "damaged_before", code);
  const damagedAfter = nonNegativeInteger(row, "damaged_after", code);
  const deltas = {
    available: availableAfter - availableBefore,
    reserved: reservedAfter - reservedBefore,
    quarantined: quarantinedAfter - quarantinedBefore,
    damaged: damagedAfter - damagedBefore,
  };
  const exactDeltas = (
    available: number,
    reserved: number,
    quarantined: number,
    damaged: number,
  ) =>
    deltas.available === available &&
    deltas.reserved === reserved &&
    deltas.quarantined === quarantined &&
    deltas.damaged === damaged;

  let validTransition = false;
  switch (movementType) {
    case "receipt":
      validTransition = exactDeltas(0, 0, quantity, 0);
      break;
    case "reserve":
      validTransition = exactDeltas(-quantity, quantity, 0, 0);
      break;
    case "release":
      validTransition = exactDeltas(quantity, -quantity, 0, 0);
      break;
    case "adjust":
    case "reconcile":
      validTransition = sourceBucket === "available" && exactDeltas(quantity, 0, 0, 0);
      break;
    case "quarantine":
      validTransition = exactDeltas(-quantity, 0, quantity, 0);
      break;
    case "quarantine_release":
      validTransition = exactDeltas(quantity, 0, -quantity, 0);
      break;
    case "damage":
      validTransition = sourceBucket !== null && exactDeltas(
        sourceBucket === "available" ? -quantity : 0,
        sourceBucket === "reserved" ? -quantity : 0,
        sourceBucket === "quarantined" ? -quantity : 0,
        quantity,
      );
      break;
  }
  if (!validTransition) invalid(code);

  return {
    id: uuid(row, "id", code),
    lotId: uuid(row, "lot_id", code),
    movementType,
    quantity,
    sourceBucket,
    availableBefore,
    availableAfter,
    reservedBefore,
    reservedAfter,
    quarantinedBefore,
    quarantinedAfter,
    damagedBefore,
    damagedAfter,
    resultingVersion: (() => {
      const version = positiveInteger(row, "resulting_version", code);
      if (version < 2) invalid(code);
      return version;
    })(),
    reason: requiredString(row, "reason", code, 500),
    actorId: requiredString(row, "actor_id", code, 200),
    occurredAt: isoTimestampValue(row.occurred_at, code),
  };
}

export function parseLotQualityTestRow(value: unknown): LotQualityTestAdmin {
  const code = "lot_quality_test_evidence_invalid";
  const row = record(value, code);
  const state = enumValue<LotQualityTestAdmin["state"]>(row.state, TEST_STATES, code);
  const method = nullableString(row, "method", code, 300);
  const result = nullableString(row, "result", code, 500);
  const reviewedBy = nullableString(row, "reviewed_by", code, 200);
  const reviewedAt = nullableIsoTimestampValue(row.reviewed_at, code);
  if ((reviewedBy === null) !== (reviewedAt === null)) invalid(code);
  if (
    (state === "passed" || state === "failed") &&
    (method === null || result === null || reviewedBy === null)
  ) {
    invalid(code);
  }

  return {
    testKey: enumValue<LotQualityTestAdmin["testKey"]>(row.test_key, TEST_KEYS, code),
    state,
    method,
    result,
    unit: nullableString(row, "unit", code, 80),
    reviewedBy,
    reviewedAt,
  };
}

function parseLotQualityDocumentRowInternal(
  value: unknown,
  tests: LotQualityTestAdmin[],
  requireAvailableTests: boolean,
): LotQualityDocumentAdmin {
  const code = "lot_quality_document_evidence_invalid";
  const row = record(value, code);
  const lot = record(row.research_inventory_lots, code);
  const documentState = enumValue<LotQualityDocumentAdmin["documentState"]>(
    row.document_state,
    new Set(["pending", "available", "withdrawn"]),
    code,
  );
  const verificationState = enumValue<LotQualityDocumentAdmin["verificationState"]>(
    row.verification_state,
    new Set(["pending", "document_on_file", "withdrawn"]),
    code,
  );
  qualityStatePair(documentState, verificationState, code);

  const seenTests = new Set<string>();
  for (const test of tests) {
    if (!TEST_KEYS.has(test.testKey) || !TEST_STATES.has(test.state)) invalid(code);
    if (seenTests.has(test.testKey)) invalid(code);
    seenTests.add(test.testKey);
  }

  const coaOnFile = boolean(row, "coa_on_file", code);

  const privateStorageKey = nullableString(row, "private_storage_key", code, 500);
  const originalFilename = nullableString(row, "original_filename", code, 180);
  const contentType = nullableString(row, "content_type", code, 100);
  const sizeBytes = row.size_bytes === null
    ? null
    : nonNegativeInteger(row, "size_bytes", code);
  const sha256 = nullableString(row, "sha256", code, 64);
  const fileFields = [privateStorageKey, originalFilename, contentType, sizeBytes, sha256];
  const fileGroupAbsent = fileFields.every((field) => field === null);
  const fileGroupPresent = fileFields.every((field) => field !== null);
  if (!fileGroupAbsent && !fileGroupPresent) invalid(code);
  if (fileGroupPresent) {
    if (
      !STORAGE_KEY.test(privateStorageKey as string) ||
      contentType !== "application/pdf" ||
      (sizeBytes as number) < 5 ||
      (sizeBytes as number) > MAX_COA_BYTES ||
      !SHA256.test(sha256 as string) ||
      requiredString(row, "bucket_id", code, 100) !== "research-coa-production"
    ) {
      invalid(code);
    }
  }

  const reportIssuer = nullableString(row, "report_issuer", code, 200);
  const reportNumber = nullableString(row, "report_number", code, 160);
  const reportDate = nullableIsoDateValue(row.report_date, code);
  const reportFields = [reportIssuer, reportNumber, reportDate];
  const reportGroupAbsent = reportFields.every((field) => field === null);
  const reportGroupPresent = reportFields.every((field) => field !== null);
  if (!reportGroupAbsent && !reportGroupPresent) invalid(code);

  const reviewedAt = nullableIsoTimestampValue(row.reviewed_at, code);
  const reviewedBy = nullableString(row, "reviewed_by", code, 200);
  const publishedAt = nullableIsoTimestampValue(row.published_at, code);
  const publishedBy = nullableString(row, "published_by", code, 200);
  if ((reviewedAt === null) !== (reviewedBy === null)) invalid(code);
  if ((publishedAt === null) !== (publishedBy === null)) invalid(code);
  if (
    publishedAt !== null &&
    (documentState !== "available" || verificationState !== "document_on_file" || reviewedAt === null)
  ) {
    invalid(code);
  }
  if (documentState === "available") {
    if (
      !coaOnFile ||
      !fileGroupPresent ||
      !reportGroupPresent ||
      reviewedAt === null
    ) {
      invalid(code);
    }
    if (
      requireAvailableTests &&
      (
        tests.length !== LOT_QUALITY_TEST_KEYS.length ||
        LOT_QUALITY_TEST_KEYS.some((testKey) => !seenTests.has(testKey)) ||
        tests.some((test) =>
          REQUIRED_PASSED_QUALITY_TEST_KEYS.has(test.testKey)
            ? test.state !== "passed"
            : test.state !== "passed" && test.state !== "not_applicable"
        )
      )
    ) invalid(code);
  }

  return {
    id: uuid(row, "id", code),
    lotId: uuid(row, "lot_id", code),
    lotCode: requiredString(lot, "lot_id", code, 120),
    sku: requiredString(lot, "sku", code, 120),
    documentState,
    verificationState,
    originalFilename,
    contentType,
    sizeBytes,
    reportIssuer,
    reportNumber,
    reportDate,
    reviewedAt,
    reviewedBy,
    publishedAt,
    publishedBy,
    version: positiveInteger(row, "version", code),
    tests,
  };
}

export function parseLotQualityDocumentRow(
  value: unknown,
  tests: LotQualityTestAdmin[],
): LotQualityDocumentAdmin {
  return parseLotQualityDocumentRowInternal(value, tests, true);
}

export function parseLotQualityDocumentHeaderRow(
  value: unknown,
): LotQualityDocumentAdmin {
  return parseLotQualityDocumentRowInternal(value, [], false);
}

export function parseReadinessEvidence(value: unknown): boolean {
  if (typeof value !== "boolean") invalid("inventory_lot_readiness_evidence_invalid");
  return value;
}

export type InventoryLotCreateReceipt = {
  lotId: string;
  version: number;
  idempotentReplay: boolean;
};

export function parseInventoryLotCreateReceipt(value: unknown): InventoryLotCreateReceipt {
  const code = "inventory_lot_create_receipt_invalid";
  const row = record(value, code);
  exactKeys(row, ["lotId", "version", "idempotentReplay"], code);
  const receipt = {
    lotId: uuid(row, "lotId", code),
    version: positiveInteger(row, "version", code),
    idempotentReplay: boolean(row, "idempotentReplay", code),
  };
  if (!receipt.idempotentReplay && receipt.version !== 1) invalid(code);
  return receipt;
}

export function parseInventoryMovementReceipt(
  value: unknown,
  expectedLotId: string,
  expectedVersion: number,
): InventoryMovementReceipt {
  const code = "inventory_movement_receipt_invalid";
  const row = record(value, code);
  exactKeys(row, [
    "movementId",
    "lotId",
    "version",
    "idempotentReplay",
    "quantityAvailable",
    "quantityReserved",
    "quantityQuarantined",
    "quantityDamaged",
  ], code);
  const lotId = uuid(row, "lotId", code);
  if (lotId !== expectedLotId) invalid(code);
  const receipt = {
    movementId: uuid(row, "movementId", code),
    lotId,
    version: positiveInteger(row, "version", code),
    idempotentReplay: boolean(row, "idempotentReplay", code),
    quantityAvailable: nonNegativeInteger(row, "quantityAvailable", code),
    quantityReserved: nonNegativeInteger(row, "quantityReserved", code),
    quantityQuarantined: nonNegativeInteger(row, "quantityQuarantined", code),
    quantityDamaged: nonNegativeInteger(row, "quantityDamaged", code),
  };
  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1 ||
    receipt.version !== expectedVersion + 1
  ) {
    invalid(code);
  }
  return receipt;
}

export function parseInventoryDispositionReceipt(
  value: unknown,
  expectedLotId: string,
  expectedDisposition: InventoryLotDisposition,
  expectedVersion: number,
): InventoryDispositionReceipt {
  const code = "inventory_disposition_receipt_invalid";
  const row = record(value, code);
  exactKeys(row, ["lotId", "disposition", "version", "idempotentReplay"], code);
  const lotId = uuid(row, "lotId", code);
  const disposition = enumValue<InventoryLotDisposition>(
    row.disposition,
    LOT_DISPOSITIONS,
    code,
  );
  if (lotId !== expectedLotId || disposition !== expectedDisposition) invalid(code);
  const receipt = {
    lotId,
    disposition,
    version: positiveInteger(row, "version", code),
    idempotentReplay: boolean(row, "idempotentReplay", code),
  };
  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1 ||
    receipt.version !== expectedVersion + 1
  ) {
    invalid(code);
  }
  return receipt;
}

export type CoaUploadPreparationReceipt = {
  documentId: string;
  documentVersion: number;
  storageKey: string;
  objectConfirmed: boolean;
  idempotentReplay: boolean;
};

export function parseCoaUploadPreparationReceipt(
  value: unknown,
  expectedLotId: string,
): CoaUploadPreparationReceipt {
  const code = "coa_upload_receipt_invalid";
  const row = record(value, code);
  exactKeys(row, [
    "documentId",
    "documentVersion",
    "storageKey",
    "objectConfirmed",
    "idempotentReplay",
  ], code);
  const documentId = uuid(row, "documentId", code);
  const storageKey = storageKeyValue(row.storageKey, code);
  if (!storageKey.startsWith(`lots/${expectedLotId}/${documentId}-`)) invalid(code);
  const receipt = {
    documentId,
    documentVersion: positiveInteger(row, "documentVersion", code),
    storageKey,
    objectConfirmed: boolean(row, "objectConfirmed", code),
    idempotentReplay: boolean(row, "idempotentReplay", code),
  };
  if (
    (!receipt.objectConfirmed && receipt.documentVersion !== 1) ||
    (receipt.objectConfirmed && receipt.documentVersion < 2) ||
    (!receipt.idempotentReplay && receipt.objectConfirmed)
  ) {
    invalid(code);
  }
  return receipt;
}

export function parseQualityDocumentReceipt(
  value: unknown,
  expectations: {
    documentId?: string;
    expectedVersion: number;
    documentState: LotQualityDocumentAdmin["documentState"];
    verificationState: LotQualityDocumentAdmin["verificationState"];
  },
): LotQualityDocumentReceipt {
  const code = "coa_document_receipt_invalid";
  const row = record(value, code);
  exactKeys(row, [
    "documentId",
    "documentState",
    "verificationState",
    "version",
    "idempotentReplay",
  ], code);
  const documentId = uuid(row, "documentId", code);
  if (expectations.documentId && documentId !== expectations.documentId) invalid(code);
  const documentState = enumValue<LotQualityDocumentAdmin["documentState"]>(
    row.documentState,
    new Set(["pending", "available", "withdrawn"]),
    code,
  );
  const verificationState = enumValue<LotQualityDocumentAdmin["verificationState"]>(
    row.verificationState,
    new Set(["pending", "document_on_file", "withdrawn"]),
    code,
  );
  qualityStatePair(documentState, verificationState, code);
  const receipt = {
    documentId,
    documentState,
    verificationState,
    version: positiveInteger(row, "version", code),
    idempotentReplay: boolean(row, "idempotentReplay", code),
  };
  if (
    !Number.isSafeInteger(expectations.expectedVersion) ||
    expectations.expectedVersion < 1 ||
    receipt.version !== expectations.expectedVersion + 1 ||
    receipt.documentState !== expectations.documentState ||
    receipt.verificationState !== expectations.verificationState
  ) {
    invalid(code);
  }
  return receipt;
}

export type StoredQualityObjectReference = {
  id: string;
  privateStorageKey: string;
  sizeBytes: number;
  contentType: "application/pdf";
  sha256: string;
};

export function parseStoredQualityObjectReference(
  value: unknown,
  expectedDocumentId: string,
): StoredQualityObjectReference {
  const code = "coa_document_reference_evidence_invalid";
  const row = record(value, code);
  const id = uuid(row, "id", code);
  if (id !== expectedDocumentId) invalid(code);
  const contentType = requiredString(row, "content_type", code, 100);
  if (contentType !== "application/pdf") invalid(code);
  const sha256 = requiredString(row, "sha256", code, 64);
  if (!SHA256.test(sha256)) invalid(code);
  const sizeBytes = nonNegativeInteger(row, "size_bytes", code);
  if (sizeBytes < 5 || sizeBytes > MAX_COA_BYTES) invalid(code);
  const privateStorageKey = storageKeyValue(row.private_storage_key, code);
  if (!privateStorageKey.includes(`/${id}-`)) invalid(code);
  return {
    id,
    privateStorageKey,
    sizeBytes,
    contentType,
    sha256,
  };
}

export function parseStorageObjectInfo(value: unknown): {
  contentType: string;
  size: number;
} {
  const code = "coa_storage_evidence_invalid";
  const row = record(value, code);
  return {
    contentType: requiredString(row, "contentType", code, 100),
    size: nonNegativeInteger(row, "size", code),
  };
}

export function parseQualityAccessReceipt(
  value: unknown,
  expectedAccessEventId: string,
  expectedBucketId: string,
  expectedDocumentId: string,
): { storageKey: string; documentVersion: number } {
  const code = "coa_access_receipt_invalid";
  const row = record(value, code);
  exactKeys(row, ["accessEventId", "bucketId", "storageKey", "documentVersion"], code);
  if (
    uuid(row, "accessEventId", code) !== expectedAccessEventId ||
    requiredString(row, "bucketId", code, 100) !== expectedBucketId
  ) {
    invalid(code);
  }
  const storageKey = storageKeyValue(row.storageKey, code);
  if (!storageKey.includes(`/${expectedDocumentId}-`)) invalid(code);
  return {
    storageKey,
    documentVersion: positiveInteger(row, "documentVersion", code),
  };
}

export function parseSignedUrl(
  value: unknown,
  code: string,
  expectedStorageOrigin: unknown,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 8_192 ||
    value.trim() !== value ||
    typeof expectedStorageOrigin !== "string" ||
    expectedStorageOrigin.length === 0
  ) {
    invalid(code);
  }
  let signed: URL;
  let expected: URL;
  try {
    signed = new URL(value);
    expected = new URL(expectedStorageOrigin);
  } catch {
    invalid(code);
  }
  if (
    expected.protocol !== "https:" ||
    expected.username !== "" ||
    expected.password !== "" ||
    expected.pathname !== "/" ||
    expected.search !== "" ||
    expected.hash !== "" ||
    signed.protocol !== "https:" ||
    signed.origin !== expected.origin ||
    signed.username !== "" ||
    signed.password !== "" ||
    signed.hash !== "" ||
    !signed.pathname.startsWith("/storage/v1/object/") ||
    !signed.searchParams.get("token")
  ) {
    invalid(code);
  }
  return signed.toString();
}
