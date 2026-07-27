import { describe, expect, it, vi } from "vitest";
import {
  SupabaseInventoryLotAdminRepository,
  SupabaseLotQualityAdminRepository,
  type CreateInventoryLot,
} from "./production";

const PRODUCT_ID = "30000000-0000-4000-8000-000000000001";
const VARIANT_ID = "40000000-0000-4000-8000-000000000001";
const LOT_ID = "50000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "60000000-0000-4000-8000-000000000001";

const lotInput: CreateInventoryLot = {
  lotCode: "LOT-RPC-001",
  sku: "EXACT-SKU",
  productId: PRODUCT_ID,
  variantId: VARIANT_ID,
  owner: "xenios",
  storageLocation: "A-01",
  supplierReference: "SUPPLIER-001",
  manufacturedDate: null,
  expiryDate: "2027-07-26",
  retestDate: null,
  shelfLifeSource: "supplier_document",
  idempotencyKey: "create-rpc-001",
};

const acceptedReader = {
  getForVariant: vi.fn(async () => ({
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    sku: "EXACT-SKU",
    productApproved: true,
    productActive: true,
    variantApproved: true,
    variantActive: true,
    activePrice: null,
    shippingClass: null,
    exactLotCoaRequired: true,
    productDocumentationRequired: true,
  })),
};

function lotRow() {
  return {
    id: LOT_ID,
    lot_id: lotInput.lotCode,
    sku: lotInput.sku,
    product_id: PRODUCT_ID,
    variant_id: VARIANT_ID,
    owner: "xenios",
    disposition: "quarantined",
    storage_location: "A-01",
    supplier_reference: "SUPPLIER-001",
    manufactured_date: null,
    expiry_date: "2027-07-26",
    retest_date: null,
    quantity_received: 0,
    quantity_available: 0,
    quantity_reserved: 0,
    quantity_quarantined: 0,
    quantity_damaged: 0,
    version: 1,
    updated_at: "2026-07-26T00:00:00.000Z",
  };
}

function lotReadQuery() {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: lotRow(), error: null }));
  return query;
}

describe("Website 4 production repository command wiring", () => {
  it("creates lots only through the atomic RPC and returns the quarantined zero/version-1 row", async () => {
    const query = lotReadQuery();
    const db = {
      from: vi.fn((table: string) => {
        expect(table).toBe("research_inventory_lots");
        return query;
      }),
      rpc: vi.fn(async (name: string) => {
        expect(name).toBe("research_create_inventory_lot");
        return {
          data: { lotId: LOT_ID, version: 1, idempotentReplay: false },
          error: null,
        };
      }),
    };
    const repository = new SupabaseInventoryLotAdminRepository(
      db as never,
      acceptedReader,
    );

    const result = await repository.createLot(lotInput, "operations-admin");

    expect(db.rpc).toHaveBeenCalledWith(
      "research_create_inventory_lot",
      expect.objectContaining({
        p_lot_code: "LOT-RPC-001",
        p_product_id: PRODUCT_ID,
        p_variant_id: VARIANT_ID,
        p_sku: "EXACT-SKU",
        p_idempotency_key: "create-rpc-001",
        p_actor_id: "operations-admin",
      }),
    );
    expect(result).toMatchObject({
      id: LOT_ID,
      disposition: "quarantined",
      quantityReceived: 0,
      quantityAvailable: 0,
      quantityReserved: 0,
      quantityQuarantined: 0,
      quantityDamaged: 0,
      version: 1,
    });
    expect(query.insert).toBeUndefined();
  });

  it("fails create closed before the RPC when Product Control identity is mismatched", async () => {
    const db = { from: vi.fn(), rpc: vi.fn() };
    const repository = new SupabaseInventoryLotAdminRepository(
      db as never,
      {
        getForVariant: vi.fn(async () => ({
          ...(await acceptedReader.getForVariant(VARIANT_ID)),
          variantId: "40000000-0000-4000-8000-000000000999",
        })),
      },
    );

    await expect(
      repository.createLot(lotInput, "operations-admin"),
    ).rejects.toMatchObject({ code: "inventory_product_binding_rejected" });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("prepares every upload through the replayable RPC and signs its persisted identity", async () => {
    const query = lotReadQuery();
    const createSignedUploadUrl = vi.fn(async (storageKey: string) => ({
      data: { signedUrl: `https://storage.invalid/${storageKey}` },
      error: null,
    }));
    const storageFrom = vi.fn(() => ({ createSignedUploadUrl }));
    const rpc = vi.fn(async (name: string) => {
      expect(name).toBe("research_prepare_lot_quality_upload");
      return {
        data: {
          documentId: DOCUMENT_ID,
          documentVersion: 1,
          storageKey: `lots/${LOT_ID}/${DOCUMENT_ID}-exact.pdf`,
          idempotentReplay: rpc.mock.calls.length > 1,
        },
        error: null,
      };
    });
    const db = {
      from: vi.fn(() => query),
      rpc,
      storage: { from: storageFrom },
    };
    const repository = new SupabaseLotQualityAdminRepository(db as never);
    const input = {
      lotId: LOT_ID,
      filename: "exact.pdf",
      contentType: "application/pdf" as const,
      sizeBytes: 100,
      sha256: "a".repeat(64),
      reportIssuer: "Verified Lab",
      reportNumber: "REPORT-001",
      reportDate: "2026-07-26",
      idempotencyKey: "prepare-upload-001",
    };

    const first = await repository.prepareUpload(input, "quality-reviewer");
    const replay = await repository.prepareUpload(input, "quality-reviewer");

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "research_prepare_lot_quality_upload",
      expect.objectContaining({
        p_lot_id: LOT_ID,
        p_idempotency_key: "prepare-upload-001",
        p_actor_id: "quality-reviewer",
        p_upload: expect.objectContaining({
          bucketId: "research-coa-production",
          originalFilename: "exact.pdf",
          reportNumber: "REPORT-001",
        }),
      }),
    );
    expect(first.documentId).toBe(DOCUMENT_ID);
    expect(replay.documentId).toBe(DOCUMENT_ID);
    expect(replay.storageKey).toBe(first.storageKey);
    expect(createSignedUploadUrl).toHaveBeenNthCalledWith(1, first.storageKey);
    expect(createSignedUploadUrl).toHaveBeenNthCalledWith(2, first.storageKey);
    expect(query.insert).toBeUndefined();
  });

  it("recovers a signed-grant failure by replaying the same prepared document identity", async () => {
    const query = lotReadQuery();
    const storageKey = `lots/${LOT_ID}/${DOCUMENT_ID}-retry.pdf`;
    const createSignedUploadUrl = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { message: "temporary signing failure" },
      })
      .mockResolvedValueOnce({
        data: { signedUrl: `https://storage.invalid/${storageKey}` },
        error: null,
      });
    const rpc = vi.fn(async () => ({
      data: {
        documentId: DOCUMENT_ID,
        documentVersion: 1,
        storageKey,
        idempotentReplay: rpc.mock.calls.length > 1,
      },
      error: null,
    }));
    const db = {
      from: vi.fn(() => query),
      rpc,
      storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
    };
    const repository = new SupabaseLotQualityAdminRepository(db as never);
    const input = {
      lotId: LOT_ID,
      filename: "retry.pdf",
      contentType: "application/pdf" as const,
      sizeBytes: 100,
      sha256: "b".repeat(64),
      reportIssuer: "Verified Lab",
      reportNumber: "REPORT-RETRY",
      reportDate: "2026-07-27",
      idempotencyKey: "prepare-upload-retry",
    };

    await expect(
      repository.prepareUpload(input, "quality-reviewer"),
    ).rejects.toMatchObject({ code: "coa_upload_grant_failed" });
    const replay = await repository.prepareUpload(input, "quality-reviewer");

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_idempotency_key: "prepare-upload-retry",
    });
    expect(rpc.mock.calls[1]?.[1]).toEqual(rpc.mock.calls[0]?.[1]);
    expect(replay).toMatchObject({
      documentId: DOCUMENT_ID,
      documentVersion: 1,
      storageKey,
    });
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(2);
    expect(createSignedUploadUrl).toHaveBeenNthCalledWith(1, storageKey);
    expect(createSignedUploadUrl).toHaveBeenNthCalledWith(2, storageKey);
    expect(query.insert).toBeUndefined();
  });
});
