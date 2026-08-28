import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CoaUploadCancellation,
  CoaUploadGrant,
  CoaUploadPreparation,
  InventoryLotAdmin,
  InventoryDispositionReceipt,
  InventoryLotDisposition,
  InventoryMovementAdmin,
  InventoryMovementCommand,
  InventoryMovementReceipt,
  LotQualityAccessPurpose,
  LotQualityDocumentAdmin,
  LotQualityDocumentReceipt,
  LotQualityTestAdmin,
} from "@shared/research/inventory-admin";
import { getSupabaseAdmin } from "../../supabase";
import type { ProductCommerceReadinessReader } from "../products-diagnostics/product-commerce-readiness";
import {
  assertInventoryMovementCommandSource,
  InventoryAdminPersistenceError,
  parseCoaUploadPreparationReceipt,
  parseEvidenceRows,
  parseInventoryDispositionReceipt,
  parseInventoryLotCreateReceipt,
  parseInventoryLotReferenceRow,
  parseInventoryLotRow,
  parseInventoryMovementReceipt,
  parseInventoryMovementRow,
  parseInventoryProductBindingRow,
  parseLotQualityDocumentHeaderRow,
  parseLotQualityDocumentRow,
  parseLotQualityTestRow,
  parseProductReadinessGateEvidence,
  parseQualityAccessReceipt,
  parseQualityDocumentReceipt,
  parseReadinessEvidence,
  parseSignedUrl,
  parseStorageObjectInfo,
  parseStoredQualityObjectReference,
} from "./row-parsers";

export { InventoryAdminPersistenceError } from "./row-parsers";

const COA_BUCKET = process.env.RESEARCH_COA_BUCKET ?? "research-coa-production";
const COA_MAX_BYTES = 20 * 1024 * 1024;

type Db = SupabaseClient;

function failed(code: string): never {
  throw new InventoryAdminPersistenceError(code);
}

export type CreateInventoryLot = {
  lotCode: string;
  sku: string;
  productId: string;
  variantId: string;
  owner: "mitch" | "xenios";
  storageLocation: string;
  supplierReference: string;
  manufacturedDate: string | null;
  expiryDate: string;
  retestDate: string | null;
  shelfLifeSource: "supplier_document" | "coa";
  idempotencyKey: string;
};

export type QualityReviewCommand = {
  action: "approve" | "reject" | "publish" | "withdraw";
  expectedVersion: number;
  idempotencyKey: string;
  reason: string;
  tests: LotQualityTestAdmin[];
};

export class SupabaseInventoryLotAdminRepository {
  constructor(
    private readonly db: Db = getSupabaseAdmin(),
    private readonly productReadiness?: ProductCommerceReadinessReader,
  ) {}

  private async assertCanonicalProductVariantInputReady(
    productId: string,
    variantId: string,
    sku: string,
  ): Promise<void> {
    if (!this.productReadiness) failed("inventory_product_control_unavailable");
    let value: unknown;
    try {
      value = await this.productReadiness.getForVariant(variantId);
    } catch {
      failed("inventory_product_control_unavailable");
    }
    if (value === null) failed("inventory_product_binding_rejected");
    const projection = parseProductReadinessGateEvidence(value);
    if (
      projection.productId !== productId ||
      projection.variantId !== variantId ||
      projection.sku !== sku ||
      projection.productApproved !== true ||
      projection.productActive !== true ||
      projection.variantApproved !== true ||
      projection.variantActive !== true
    ) {
      failed("inventory_product_binding_rejected");
    }
  }

  private async assertCanonicalProductVariantReady(lotId: string): Promise<void> {
    const lot = await this.db
      .from("research_inventory_lots")
      .select("product_id,variant_id,sku")
      .eq("id", lotId)
      .maybeSingle();
    if (lot.error || !lot.data) failed("inventory_product_binding_missing");
    let binding;
    try {
      binding = parseInventoryProductBindingRow(lot.data);
    } catch (error) {
      if (error instanceof InventoryAdminPersistenceError) {
        failed("inventory_product_binding_missing");
      }
      throw error;
    }
    await this.assertCanonicalProductVariantInputReady(
      binding.productId,
      binding.variantId,
      binding.sku,
    );
  }

  private async readAllocatable(lotId: string): Promise<boolean> {
    const result = await this.db.rpc("research_lot_is_allocatable", {
      p_lot_id: lotId,
      p_as_of: new Date().toISOString(),
    });
    if (result.error) failed("inventory_lot_readiness_failed");
    return parseReadinessEvidence(result.data);
  }

  async listLots(): Promise<InventoryLotAdmin[]> {
    const { data, error } = await this.db
      .from("research_inventory_lots")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) failed("inventory_lot_list_failed");
    const rows = parseEvidenceRows(data, "inventory_lot_evidence_invalid");
    const lots = rows.map((row) => parseInventoryLotRow(row, false));
    return Promise.all(
      lots.map(async (lot) => ({
        ...lot,
        allocatable: await this.readAllocatable(lot.id),
      })),
    );
  }

  async createLot(input: CreateInventoryLot, actorId: string): Promise<InventoryLotAdmin> {
    await this.assertCanonicalProductVariantInputReady(
      input.productId,
      input.variantId,
      input.sku,
    );
    const created = await this.db.rpc("research_create_inventory_lot", {
      p_lot_code: input.lotCode,
      p_sku: input.sku,
      p_product_id: input.productId,
      p_variant_id: input.variantId,
      p_owner: input.owner,
      p_storage_location: input.storageLocation,
      p_supplier_reference: input.supplierReference,
      p_manufactured_date: input.manufacturedDate,
      p_expiry_date: input.expiryDate,
      p_retest_date: input.retestDate,
      p_shelf_life_source: input.shelfLifeSource,
      p_idempotency_key: input.idempotencyKey,
      p_actor_id: actorId,
      p_occurred_at: new Date().toISOString(),
    });
    if (created.error) failed("inventory_lot_create_failed");
    const receipt = parseInventoryLotCreateReceipt(created.data);

    const { data, error } = await this.db
      .from("research_inventory_lots")
      .select("*")
      .eq("id", receipt.lotId)
      .maybeSingle();
    if (error || !data) failed("inventory_lot_create_failed");
    const lot = parseInventoryLotRow(data, false);
    if (lot.id !== receipt.lotId || lot.version < receipt.version) {
      failed("inventory_lot_create_receipt_invalid");
    }
    return {
      ...lot,
      allocatable: await this.readAllocatable(lot.id),
    };
  }

  async applyMovement(
    lotId: string,
    command: InventoryMovementCommand,
    actorId: string,
  ): Promise<InventoryMovementReceipt> {
    assertInventoryMovementCommandSource(command);
    if (command.movementType === "reserve") {
      await this.assertCanonicalProductVariantReady(lotId);
    }
    const { data, error } = await this.db.rpc("research_apply_inventory_movement", {
      p_lot_id: lotId,
      p_movement_type: command.movementType,
      p_quantity: command.quantity,
      p_source_bucket: command.sourceBucket,
      p_expected_version: command.expectedVersion,
      p_idempotency_key: command.idempotencyKey,
      p_reason: command.reason,
      p_actor_id: actorId,
      p_occurred_at: new Date().toISOString(),
    });
    if (error) failed("inventory_movement_rejected");
    return parseInventoryMovementReceipt(data, lotId, command.expectedVersion);
  }

  async setDisposition(
    lotId: string,
    input: {
      disposition: InventoryLotDisposition;
      expectedVersion: number;
      idempotencyKey: string;
      reason: string;
    },
    actorId: string,
  ): Promise<InventoryDispositionReceipt> {
    if (input.disposition === "available") {
      await this.assertCanonicalProductVariantReady(lotId);
    }
    const { data, error } = await this.db.rpc("research_set_inventory_lot_disposition", {
      p_lot_id: lotId,
      p_disposition: input.disposition,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
      p_reason: input.reason,
      p_actor_id: actorId,
      p_occurred_at: new Date().toISOString(),
    });
    if (error) failed("inventory_lot_status_rejected");
    return parseInventoryDispositionReceipt(
      data,
      lotId,
      input.disposition,
      input.expectedVersion,
    );
  }

  async listMovements(lotId?: string): Promise<InventoryMovementAdmin[]> {
    let query = this.db
      .from("research_inventory_movements")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (lotId) query = query.eq("lot_id", lotId);
    const { data, error } = await query;
    if (error) failed("inventory_movement_list_failed");
    return parseEvidenceRows(data, "inventory_movement_evidence_invalid")
      .map(parseInventoryMovementRow);
  }
}

export class SupabaseLotQualityAdminRepository {
  constructor(
    private readonly db: Db = getSupabaseAdmin(),
    private readonly bucketName = COA_BUCKET,
  ) {}

  async listDocuments(): Promise<LotQualityDocumentAdmin[]> {
    const { data, error } = await this.db
      .from("research_lot_quality_documents")
      .select("*,research_inventory_lots!inner(lot_id,sku)")
      .order("recorded_at", { ascending: false })
      .limit(500);
    if (error) failed("lot_quality_list_failed");
    const rows = parseEvidenceRows(data, "lot_quality_document_evidence_invalid");
    return Promise.all(
      rows.map(async (row) => {
        const document = parseLotQualityDocumentHeaderRow(row);
        const tests = await this.db
          .from("research_lot_quality_tests")
          .select("*")
          .eq("quality_document_id", document.id)
          .order("test_key");
        if (tests.error) failed("lot_quality_tests_list_failed");
        const parsedTests = parseEvidenceRows(
          tests.data,
          "lot_quality_test_evidence_invalid",
        ).map(parseLotQualityTestRow);
        return parseLotQualityDocumentRow(row, parsedTests);
      }),
    );
  }

  async prepareUpload(
    input: CoaUploadPreparation,
    actorId: string,
  ): Promise<CoaUploadGrant> {
    if (
      input.contentType !== "application/pdf" ||
      input.sizeBytes < 5 ||
      input.sizeBytes > COA_MAX_BYTES ||
      !/^[a-f0-9]{64}$/.test(input.sha256) ||
      input.reportIssuer.trim().length < 2 ||
      input.reportNumber.trim().length < 2 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate)
    ) {
      failed("coa_upload_metadata_invalid");
    }
    const lot = await this.db
      .from("research_inventory_lots")
      .select("id,lot_id")
      .eq("id", input.lotId)
      .maybeSingle();
    if (lot.error || !lot.data) failed("coa_lot_not_found");
    parseInventoryLotReferenceRow(lot.data, input.lotId);

    const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const prepared = await this.db.rpc("research_prepare_lot_quality_upload", {
      p_lot_id: input.lotId,
      p_upload: {
        bucketId: this.bucketName,
        originalFilename: safeName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        reportIssuer: input.reportIssuer.trim(),
        reportNumber: input.reportNumber.trim(),
        reportDate: input.reportDate,
      },
      p_idempotency_key: input.idempotencyKey,
      p_reason: "Private exact-lot COA upload reference prepared",
      p_actor_id: actorId,
      p_occurred_at: new Date().toISOString(),
    });
    if (prepared.error) failed("coa_upload_reference_failed");
    const preparation = parseCoaUploadPreparationReceipt(prepared.data, input.lotId);
    const {
      documentId,
      documentVersion,
      storageKey,
      objectConfirmed,
    } = preparation;

    if (objectConfirmed) {
      return {
        documentId,
        documentVersion,
        uploadRequired: false,
        uploadUrl: null,
        storageKey,
        expiresAt: null,
      };
    }
    const { data, error } = await this.db.storage
      .from(this.bucketName)
      .createSignedUploadUrl(storageKey);
    if (error) failed("coa_upload_grant_failed");
    const uploadUrl = parseSignedUrl(data?.signedUrl, "coa_upload_grant_invalid");
    return {
      documentId,
      documentVersion,
      uploadRequired: true,
      uploadUrl,
      storageKey,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    };
  }

  async cancelUpload(
    input: CoaUploadCancellation,
    actorId: string,
  ): Promise<LotQualityDocumentReceipt> {
    const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const { data, error } = await this.db.rpc("research_cancel_lot_quality_upload", {
      p_lot_id: input.lotId,
      p_upload: {
        bucketId: this.bucketName,
        originalFilename: safeName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        reportIssuer: input.reportIssuer.trim(),
        reportNumber: input.reportNumber.trim(),
        reportDate: input.reportDate,
      },
      p_expected_version: input.expectedVersion,
      p_preparation_idempotency_key: input.preparationIdempotencyKey,
      p_idempotency_key: input.idempotencyKey,
      p_reason: "Unconfirmed exact-lot COA upload abandoned before metadata replacement",
      p_actor_id: actorId,
      p_occurred_at: new Date().toISOString(),
    });
    if (error) failed("coa_upload_cancellation_rejected");
    return parseQualityDocumentReceipt(data, {
      expectedVersion: input.expectedVersion,
      documentState: "withdrawn",
      verificationState: "withdrawn",
    });
  }

  async confirmUpload(
    documentId: string,
    expectedVersion: number,
    idempotencyKey: string,
    actorId: string,
  ): Promise<LotQualityDocumentReceipt> {
    const document = await this.db
      .from("research_lot_quality_documents")
      .select("id,private_storage_key,size_bytes,content_type,sha256")
      .eq("id", documentId)
      .maybeSingle();
    if (document.error || !document.data) {
      failed("coa_upload_reference_not_found");
    }
    const reference = parseStoredQualityObjectReference(document.data, documentId);
    const bucket = this.db.storage.from(this.bucketName);
    const [{ data: info, error: infoError }, { data: file, error: fileError }] =
      await Promise.all([
        bucket.info(reference.privateStorageKey),
        bucket.download(reference.privateStorageKey),
      ]);
    if (infoError || fileError || !info || !file) failed("coa_private_object_missing");
    if (typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== "function") {
      failed("coa_storage_evidence_invalid");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const signature = new TextDecoder().decode(bytes.slice(0, 5));
    const digest = createHash("sha256").update(bytes).digest("hex");
    const { contentType, size } = parseStorageObjectInfo(info);
    if (
      signature !== "%PDF-" ||
      contentType !== reference.contentType ||
      size !== reference.sizeBytes ||
      bytes.byteLength !== size ||
      digest !== reference.sha256
    ) {
      await bucket.remove([reference.privateStorageKey]);
      failed("coa_private_object_mismatch");
    }
    const { data, error } = await this.db.rpc("research_manage_lot_quality_document", {
      p_document_id: documentId,
      p_action: "confirm_upload",
      p_tests: [],
      p_expected_version: expectedVersion,
      p_idempotency_key: idempotencyKey,
      p_reason: "Private exact-lot COA object verified",
      p_actor_id: actorId,
      p_occurred_at: new Date().toISOString(),
    });
    if (error) failed("coa_upload_confirmation_rejected");
    return parseQualityDocumentReceipt(data, {
      documentId,
      expectedVersion,
      documentState: "pending",
      verificationState: "pending",
    });
  }

  async review(
    documentId: string,
    command: QualityReviewCommand,
    actorId: string,
  ): Promise<LotQualityDocumentReceipt> {
    const { data, error } = await this.db.rpc("research_manage_lot_quality_document", {
      p_document_id: documentId,
      p_action: command.action,
      p_tests: command.tests,
      p_expected_version: command.expectedVersion,
      p_idempotency_key: command.idempotencyKey,
      p_reason: command.reason,
      p_actor_id: actorId,
      p_occurred_at: new Date().toISOString(),
    });
    if (error) failed("coa_review_rejected");
    const expectedState = command.action === "approve" || command.action === "publish"
      ? { documentState: "available" as const, verificationState: "document_on_file" as const }
      : { documentState: "withdrawn" as const, verificationState: "withdrawn" as const };
    return parseQualityDocumentReceipt(data, {
      documentId,
      expectedVersion: command.expectedVersion,
      ...expectedState,
    });
  }

  async createReadGrant(
    documentId: string,
    actorId: string,
    purpose: LotQualityAccessPurpose,
  ): Promise<{ signedUrl: string; expiresAt: string }> {
    const accessId = randomUUID();
    const authorization = await this.db.rpc("research_authorize_lot_quality_access", {
      p_document_id: documentId,
      p_actor_id: actorId,
      p_purpose: purpose,
      p_access_id: accessId,
      p_occurred_at: new Date().toISOString(),
    });
    if (authorization.error) failed("coa_access_audit_failed");
    const authorized = parseQualityAccessReceipt(
      authorization.data,
      accessId,
      this.bucketName,
      documentId,
    );
    const { data, error } = await this.db.storage
      .from(this.bucketName)
      .createSignedUrl(authorized.storageKey, 60);
    if (error) failed("coa_access_grant_failed");
    const signedUrl = parseSignedUrl(data?.signedUrl, "coa_access_grant_invalid");
    return {
      signedUrl,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  }
}

export function buildInventoryLotAdminProductionDependencies(
  productReadiness?: ProductCommerceReadinessReader,
) {
  return {
    inventory: new SupabaseInventoryLotAdminRepository(
      getSupabaseAdmin(),
      productReadiness,
    ),
    quality: new SupabaseLotQualityAdminRepository(),
  };
}
