import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CoaUploadGrant,
  CoaUploadPreparation,
  InventoryLotAdmin,
  InventoryMovementAdmin,
  InventoryMovementCommand,
  LotQualityAccessPurpose,
  LotQualityDocumentAdmin,
  LotQualityTestAdmin,
} from "@shared/research/inventory-admin";
import { getSupabaseAdmin } from "../../supabase";

const COA_BUCKET = process.env.RESEARCH_COA_BUCKET ?? "research-coa-production";
const COA_MAX_BYTES = 20 * 1024 * 1024;

type Db = SupabaseClient;
type Row = Record<string, any>;
export type AcceptedProductCommerceReadinessReader = {
  getForVariant(variantId: string): Promise<unknown>;
};


export class InventoryAdminPersistenceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function failed(code: string): never {
  throw new InventoryAdminPersistenceError(code);
}

function lotView(row: Row): InventoryLotAdmin {
  return {
    id: String(row.id),
    lotCode: String(row.lot_id),
    sku: String(row.sku),
    productId: row.product_id ? String(row.product_id) : null,
    variantId: row.variant_id ? String(row.variant_id) : null,
    owner: row.owner,
    disposition: String(row.disposition),
    storageLocation: row.storage_location ? String(row.storage_location) : null,
    supplierReference: row.supplier_reference ? String(row.supplier_reference) : null,
    manufacturedDate: row.manufactured_date ? String(row.manufactured_date) : null,
    expiryDate: row.expiry_date ? String(row.expiry_date) : null,
    retestDate: row.retest_date ? String(row.retest_date) : null,
    quantityReceived: Number(row.quantity_received ?? 0),
    quantityAvailable: Number(row.quantity_available ?? 0),
    quantityReserved: Number(row.quantity_reserved ?? 0),
    quantityQuarantined: Number(row.quantity_quarantined ?? 0),
    quantityDamaged: Number(row.quantity_damaged ?? 0),
    version: Number(row.version ?? 1),
    allocatable: row.allocatable === true,
    updatedAt: String(row.updated_at),
  };
}

function movementView(row: Row): InventoryMovementAdmin {
  return {
    id: String(row.id),
    lotId: String(row.lot_id),
    movementType: row.movement_type,
    quantity: Number(row.quantity),
    sourceBucket: row.source_bucket ?? null,
    availableBefore: Number(row.available_before),
    availableAfter: Number(row.available_after),
    reservedBefore: Number(row.reserved_before),
    reservedAfter: Number(row.reserved_after),
    quarantinedBefore: Number(row.quarantined_before),
    quarantinedAfter: Number(row.quarantined_after),
    damagedBefore: Number(row.damaged_before),
    damagedAfter: Number(row.damaged_after),
    resultingVersion: Number(row.resulting_version),
    reason: String(row.reason),
    actorId: String(row.actor_id),
    occurredAt: String(row.occurred_at),
  };
}

function testView(row: Row): LotQualityTestAdmin {
  return {
    testKey: row.test_key,
    state: row.state,
    method: row.method ?? null,
    result: row.result ?? null,
    unit: row.unit ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
  };
}

function documentView(row: Row, tests: LotQualityTestAdmin[]): LotQualityDocumentAdmin {
  const lot = row.research_inventory_lots ?? {};
  return {
    id: String(row.id),
    lotId: String(row.lot_id),
    lotCode: String(lot.lot_id ?? ""),
    sku: String(lot.sku ?? ""),
    documentState: row.document_state,
    verificationState: row.verification_state,
    originalFilename: row.original_filename ?? null,
    contentType: row.content_type ?? null,
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    reportIssuer: row.report_issuer ?? null,
    reportNumber: row.report_number ?? null,
    reportDate: row.report_date ?? null,
    reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewed_by ?? null,
    publishedAt: row.published_at ?? null,
    publishedBy: row.published_by ?? null,
    version: Number(row.version ?? 1),
    tests,
  };
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
    private readonly productReadiness?: AcceptedProductCommerceReadinessReader,
  ) {}

  private async assertCanonicalProductVariantReady(lotId: string): Promise<void> {
    if (!this.productReadiness) failed("inventory_product_control_unavailable");
    const lot = await this.db
      .from("research_inventory_lots")
      .select("product_id,variant_id,sku")
      .eq("id", lotId)
      .maybeSingle();
    if (lot.error || !lot.data?.product_id || !lot.data?.variant_id || !lot.data?.sku) {
      failed("inventory_product_binding_missing");
    }
    let value: unknown;
    try {
      value = await this.productReadiness.getForVariant(String(lot.data.variant_id));
    } catch {
      failed("inventory_product_control_unavailable");
    }
    if (!value || typeof value !== "object") failed("inventory_product_binding_rejected");
    const projection = value as Row;
    if (
      projection.productId !== String(lot.data.product_id) ||
      projection.variantId !== String(lot.data.variant_id) ||
      projection.sku !== String(lot.data.sku) ||
      projection.productApproved !== true ||
      projection.productActive !== true ||
      projection.variantApproved !== true ||
      projection.variantActive !== true
    ) {
      failed("inventory_product_binding_rejected");
    }
  }

  async listLots(): Promise<InventoryLotAdmin[]> {
    const { data, error } = await this.db
      .from("research_inventory_lots")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) failed("inventory_lot_list_failed");
    const rows = data ?? [];
    const readiness = await Promise.all(
      rows.map(async (row) => {
        const result = await this.db.rpc("research_lot_is_allocatable", {
          p_lot_id: row.id,
          p_as_of: new Date().toISOString(),
        });
        if (result.error) failed("inventory_lot_readiness_failed");
        return { ...row, allocatable: result.data === true };
      }),
    );
    return readiness.map(lotView);
  }

  async createLot(input: CreateInventoryLot, actorId: string): Promise<InventoryLotAdmin> {
    const commandHash = createHash("sha256")
      .update(JSON.stringify({ ...input, actorId }))
      .digest("hex");
    const existing = await this.db
      .from("research_inventory_lots")
      .select("*")
      .eq("creation_idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing.error) failed("inventory_lot_idempotency_read_failed");
    if (existing.data) {
      if (existing.data.creation_command_hash !== commandHash) {
        failed("inventory_lot_idempotency_conflict");
      }
      return lotView({ ...existing.data, allocatable: false });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const { data, error } = await this.db
      .from("research_inventory_lots")
      .insert({
        id,
        lot_id: input.lotCode,
        sku: input.sku,
        product_id: input.productId,
        variant_id: input.variantId,
        owner: input.owner,
        disposition: "quarantined",
        storage_location: input.storageLocation,
        supplier_reference: input.supplierReference,
        manufactured_date: input.manufacturedDate,
        expiry_date: input.expiryDate,
        retest_date: input.retestDate,
        shelf_life_source: input.shelfLifeSource,
        creation_idempotency_key: input.idempotencyKey,
        creation_command_hash: commandHash,
        reviewed_at: now,
        reviewed_by: actorId,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error || !data) failed("inventory_lot_create_failed");
    return lotView({ ...data, allocatable: false });
  }

  async applyMovement(
    lotId: string,
    command: InventoryMovementCommand,
    actorId: string,
  ): Promise<Record<string, unknown>> {
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
    if (error || !data) failed("inventory_movement_rejected");
    return data as Record<string, unknown>;
  }

  async setDisposition(
    lotId: string,
    input: {
      disposition: string;
      expectedVersion: number;
      idempotencyKey: string;
      reason: string;
    },
    actorId: string,
  ): Promise<Record<string, unknown>> {
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
    if (error || !data) failed("inventory_lot_status_rejected");
    return data as Record<string, unknown>;
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
    return (data ?? []).map(movementView);
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
    return Promise.all(
      (data ?? []).map(async (row) => {
        const tests = await this.db
          .from("research_lot_quality_tests")
          .select("*")
          .eq("quality_document_id", row.id)
          .order("test_key");
        if (tests.error) failed("lot_quality_tests_list_failed");
        return documentView(row, (tests.data ?? []).map(testView));
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

    const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const storageKey = `lots/${input.lotId}/${randomUUID()}-${safeName}`;
    const existing = await this.db
      .from("research_lot_quality_documents")
      .select("id,version,document_state,verification_state,published_at,coa_on_file")
      .eq("lot_id", input.lotId)
      .maybeSingle();
    if (existing.error) failed("coa_document_read_failed");
    if (
      existing.data &&
      (
        existing.data.document_state !== "pending" ||
        existing.data.verification_state !== "pending" ||
        existing.data.published_at ||
        existing.data.coa_on_file
      )
    ) {
      failed("coa_document_not_replaceable");
    }
    const documentId = existing.data?.id ?? randomUUID();
    let currentVersion = Number(existing.data?.version ?? 1);
    if (!existing.data) {
      const created = await this.db
        .from("research_lot_quality_documents")
        .insert({
          id: documentId,
          lot_id: input.lotId,
          coa_on_file: false,
          document_state: "pending",
          verification_state: "pending",
          version: 1,
        })
        .select("version")
        .single();
      if (created.error || !created.data) failed("coa_upload_reference_failed");
      currentVersion = Number(created.data.version);
    }
    const prepared = await this.db.rpc("research_manage_lot_quality_document", {
      p_document_id: documentId,
      p_action: "replace_upload",
      p_tests: {
        bucketId: this.bucketName,
        storageKey,
        documentRef: storageKey,
        originalFilename: safeName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        reportIssuer: input.reportIssuer.trim(),
        reportNumber: input.reportNumber.trim(),
        reportDate: input.reportDate,
      },
      p_expected_version: currentVersion,
      p_idempotency_key: input.idempotencyKey,
      p_reason: "Private exact-lot COA upload reference prepared",
      p_actor_id: actorId,
      p_occurred_at: new Date().toISOString(),
    });
    if (prepared.error || !prepared.data) failed("coa_upload_reference_failed");
    const documentVersion = Number((prepared.data as Row).version);
    const testSeed = [
      "identity",
      "assay",
      "purity",
      "sterility",
      "endotoxin",
      "particulate",
      "residual_solvents",
      "elemental_impurities",
      "chain_of_custody",
    ].map((testKey) => ({
      quality_document_id: documentId,
      test_key: testKey,
      state: "not_provided",
      updated_at: new Date().toISOString(),
    }));
    const tests = await this.db
      .from("research_lot_quality_tests")
      .upsert(testSeed, { onConflict: "quality_document_id,test_key", ignoreDuplicates: true });
    if (tests.error) failed("coa_missing_test_state_failed");

    const { data, error } = await this.db.storage
      .from(this.bucketName)
      .createSignedUploadUrl(storageKey);
    if (error || !data?.signedUrl) failed("coa_upload_grant_failed");
    return {
      documentId,
      documentVersion,
      uploadUrl: data.signedUrl,
      storageKey,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    };
  }

  async confirmUpload(
    documentId: string,
    expectedVersion: number,
    idempotencyKey: string,
    actorId: string,
  ): Promise<Record<string, unknown>> {
    const document = await this.db
      .from("research_lot_quality_documents")
      .select("id,private_storage_key,size_bytes,content_type,sha256")
      .eq("id", documentId)
      .maybeSingle();
    if (document.error || !document.data?.private_storage_key) {
      failed("coa_upload_reference_not_found");
    }
    const bucket = this.db.storage.from(this.bucketName);
    const [{ data: info, error: infoError }, { data: file, error: fileError }] =
      await Promise.all([
        bucket.info(document.data.private_storage_key),
        bucket.download(document.data.private_storage_key),
      ]);
    if (infoError || fileError || !info || !file) failed("coa_private_object_missing");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const signature = new TextDecoder().decode(bytes.slice(0, 5));
    const digest = createHash("sha256").update(bytes).digest("hex");
    const contentType = String((info as { contentType?: unknown }).contentType ?? "");
    const size = Number((info as { size?: unknown }).size ?? 0);
    if (
      signature !== "%PDF-" ||
      contentType !== document.data.content_type ||
      size !== Number(document.data.size_bytes) ||
      bytes.byteLength !== size ||
      digest !== document.data.sha256
    ) {
      await bucket.remove([document.data.private_storage_key]);
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
    if (error || !data) failed("coa_upload_confirmation_rejected");
    return data as Record<string, unknown>;
  }

  async review(
    documentId: string,
    command: QualityReviewCommand,
    actorId: string,
  ): Promise<Record<string, unknown>> {
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
    if (error || !data) failed("coa_review_rejected");
    return data as Record<string, unknown>;
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
    const authorized = authorization.data as Row | null;
    if (
      authorization.error ||
      !authorized?.storageKey ||
      authorized.bucketId !== this.bucketName ||
      authorized.accessEventId !== accessId
    ) {
      failed("coa_access_audit_failed");
    }
    const { data, error } = await this.db.storage
      .from(this.bucketName)
      .createSignedUrl(String(authorized.storageKey), 60);
    if (error || !data?.signedUrl) failed("coa_access_grant_failed");
    return {
      signedUrl: data.signedUrl,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  }
}

export function buildInventoryLotAdminProductionDependencies(
  productReadiness?: AcceptedProductCommerceReadinessReader,
) {
  return {
    inventory: new SupabaseInventoryLotAdminRepository(
      getSupabaseAdmin(),
      productReadiness,
    ),
    quality: new SupabaseLotQualityAdminRepository(),
  };
}
