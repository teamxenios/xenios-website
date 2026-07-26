import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerInventoryLotAdminApi } from "./routes";
import {
  SupabaseInventoryLotAdminRepository,
  SupabaseLotQualityAdminRepository,
} from "./production";

const LOT_ID = "10000000-0000-4000-8000-000000000001";
const DOC_ID = "20000000-0000-4000-8000-000000000001";

function appFor(allowed = true) {
  const guard = (req: any, res: any, next: any) => {
    if (!allowed) return res.status(403).json({ ok: false, code: "prelaunch_role_required" });
    req.prelaunchActorId =
      req.get("x-test-actor") ?? "operations-user";
    next();
  };
  const inventory = {
    listLots: vi.fn(async () => []),
    createLot: vi.fn(async (value) => ({ id: LOT_ID, ...value })),
    applyMovement: vi.fn(async () => ({ version: 2, quantityAvailable: 10 })),
    setDisposition: vi.fn(async () => ({ version: 3, disposition: "available" })),
    listMovements: vi.fn(async () => []),
  };
  const quality = {
    listDocuments: vi.fn(async () => []),
    prepareUpload: vi.fn(async () => ({
      documentId: DOC_ID,
      documentVersion: 1,
      uploadUrl: "https://storage.invalid/signed",
      storageKey: `lots/${LOT_ID}/coa.pdf`,
      expiresAt: "2026-07-26T12:00:00.000Z",
    })),
    confirmUpload: vi.fn(async () => ({ version: 2 })),
    review: vi.fn(async () => ({ version: 3 })),
    createReadGrant: vi.fn(async () => ({
      signedUrl: "https://storage.invalid/read",
      expiresAt: "2026-07-26T12:00:00.000Z",
    })),
  };
  const app = express();
  app.use(express.json());
  registerInventoryLotAdminApi(
    app,
    { inventory: inventory as never, quality: quality as never },
    { read: guard, mutateInventory: guard, reviewQuality: guard },
  );
  return { app, inventory, quality };
}

describe("Website 4 inventory, lots, and exact-lot COA routes", () => {
  it("registers the complete focused route family and keeps reads server-authorized", async () => {
    const { app } = appFor(false);
    for (const path of [
      "/api/admin/research/inventory/lots",
      "/api/admin/research/inventory/movements",
      "/api/admin/research/lot-quality-documents",
    ]) {
      const response = await request(app).get(path);
      expect(response.status, path).toBe(403);
      expect(response.body.code).toBe("prelaunch_role_required");
    }
  });

  it("passes the canonical server actor and never accepts a silent quantity overwrite", async () => {
    const { app, inventory } = appFor();
    const response = await request(app)
      .post(`/api/admin/research/inventory/lots/${LOT_ID}/movements`)
      .send({
        movementType: "receipt",
        quantity: 10,
        sourceBucket: null,
        expectedVersion: 1,
        idempotencyKey: "receipt-command-0001",
        reason: "Verified receiving count",
      });
    expect(response.status).toBe(200);
    expect(inventory.applyMovement).toHaveBeenCalledWith(
      LOT_ID,
      expect.objectContaining({
        quantity: 10,
        expectedVersion: 1,
        idempotencyKey: "receipt-command-0001",
      }),
      "operations-user",
    );

    const overwrite = await request(app)
      .post(`/api/admin/research/inventory/lots/${LOT_ID}/movements`)
      .send({ quantityAvailable: 999 });
    expect(overwrite.status).toBe(400);
  });

  it("requires exact PDF metadata and a digest before minting a private upload grant", async () => {
    const { app, quality } = appFor();
    const invalid = await request(app)
      .post("/api/admin/research/lot-quality-documents/upload")
      .send({
        lotId: LOT_ID,
        filename: "coa.png",
        contentType: "image/png",
        sizeBytes: 100,
        sha256: "0".repeat(64),
      });
    expect(invalid.status).toBe(400);
    expect(quality.prepareUpload).not.toHaveBeenCalled();

    const valid = await request(app)
      .post("/api/admin/research/lot-quality-documents/upload")
      .send({
        lotId: LOT_ID,
        filename: "exact-lot-coa.pdf",
        contentType: "application/pdf",
        sizeBytes: 100,
        sha256: "a".repeat(64),
        reportIssuer: "Verified Laboratory",
        reportNumber: "REPORT-001",
        reportDate: "2026-07-26",
        idempotencyKey: "upload-reference-0001",
      });
    expect(valid.status).toBe(201);
    expect(valid.body.upload.storageKey).toMatch(new RegExp(`^lots/${LOT_ID}/`));
  });

  it("separates inventory mutation from quality review authority", async () => {
    const read = (_req: any, _res: any, next: any) => next();
    const mutate = (_req: any, _res: any, next: any) => next();
    const review = (_req: any, res: any) =>
      res.status(403).json({ ok: false, code: "quality_reviewer_required" });
    const { app, inventory, quality } = appFor();
    const isolated = express();
    isolated.use(express.json());
    registerInventoryLotAdminApi(
      isolated,
      { inventory: inventory as never, quality: quality as never },
      { read, mutateInventory: mutate, reviewQuality: review },
    );
    const response = await request(isolated)
      .post(`/api/admin/research/lot-quality-documents/${DOC_ID}/review`)
      .send({
        action: "approve",
        expectedVersion: 2,
        idempotencyKey: "quality-review-0001",
        reason: "Exact lot and report reviewed",
        tests: [],
      });
    expect(response.status).toBe(403);
    expect(quality.review).not.toHaveBeenCalled();
  });

  it("requires an approved purpose and binds every private grant to the server actor", async () => {
    const { app, quality } = appFor();
    const missingPurpose = await request(app)
      .post(`/api/admin/research/lot-quality-documents/${DOC_ID}/file-access`)
      .send({});
    expect(missingPurpose.status).toBe(400);
    expect(quality.createReadGrant).not.toHaveBeenCalled();

    await request(app)
      .post(`/api/admin/research/lot-quality-documents/${DOC_ID}/file-access`)
      .set("x-test-actor", "reviewer-a")
      .send({ purpose: "quality_review" })
      .expect(200);
    await request(app)
      .post(`/api/admin/research/lot-quality-documents/${DOC_ID}/file-access`)
      .set("x-test-actor", "reviewer-b")
      .send({ purpose: "compliance_review" })
      .expect(200);

    expect(quality.createReadGrant).toHaveBeenNthCalledWith(
      1,
      DOC_ID,
      "reviewer-a",
      "quality_review",
    );
    expect(quality.createReadGrant).toHaveBeenNthCalledWith(
      2,
      DOC_ID,
      "reviewer-b",
      "compliance_review",
    );
  });
});

describe("Website 4 accepted product-control and access-audit repository boundaries", () => {
  function inventoryDb() {
    const query: any = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.maybeSingle = vi.fn(async () => ({
      data: {
        product_id: "30000000-0000-4000-8000-000000000001",
        variant_id: "40000000-0000-4000-8000-000000000001",
        sku: "EXACT-SKU",
      },
      error: null,
    }));
    return {
      from: vi.fn(() => query),
      rpc: vi.fn(async () => ({ data: { version: 2 }, error: null })),
    };
  }

  it("fails reserve and release closed without the accepted Product Control reader", async () => {
    const db = inventoryDb();
    const repository = new SupabaseInventoryLotAdminRepository(db as never);
    await expect(repository.setDisposition(
      LOT_ID,
      {
        disposition: "available",
        expectedVersion: 1,
        idempotencyKey: "release-command-0001",
        reason: "Attempt without Product Control",
      },
      "operations-user",
    )).rejects.toMatchObject({ code: "inventory_product_control_unavailable" });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("rejects mismatched readiness and accepts only the exact approved active projection", async () => {
    const rejectedDb = inventoryDb();
    const rejected = new SupabaseInventoryLotAdminRepository(
      rejectedDb as never,
      {
        getForVariant: vi.fn(async () => ({
          productId: "30000000-0000-4000-8000-000000000001",
          variantId: "40000000-0000-4000-8000-000000000999",
          sku: "EXACT-SKU",
          productApproved: true,
          productActive: true,
          variantApproved: true,
          variantActive: true,
        })),
      },
    );
    await expect(rejected.setDisposition(
      LOT_ID,
      {
        disposition: "available",
        expectedVersion: 1,
        idempotencyKey: "release-command-0002",
        reason: "Mismatched variant",
      },
      "operations-user",
    )).rejects.toMatchObject({ code: "inventory_product_binding_rejected" });
    expect(rejectedDb.rpc).not.toHaveBeenCalled();

    const acceptedDb = inventoryDb();
    const accepted = new SupabaseInventoryLotAdminRepository(
      acceptedDb as never,
      {
        getForVariant: vi.fn(async () => ({
          productId: "30000000-0000-4000-8000-000000000001",
          variantId: "40000000-0000-4000-8000-000000000001",
          sku: "EXACT-SKU",
          productApproved: true,
          productActive: true,
          variantApproved: true,
          variantActive: true,
        })),
      },
    );
    await accepted.setDisposition(
      LOT_ID,
      {
        disposition: "available",
        expectedVersion: 1,
        idempotencyKey: "release-command-0003",
        reason: "Exact accepted projection",
      },
      "operations-user",
    );
    expect(acceptedDb.rpc).toHaveBeenCalledWith(
      "research_set_inventory_lot_disposition",
      expect.objectContaining({ p_lot_id: LOT_ID }),
    );
  });

  it("never asks Storage for a signed URL when the access audit RPC fails", async () => {
    const createSignedUrl = vi.fn();
    const db = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "audit rejected" } })),
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    };
    const repository = new SupabaseLotQualityAdminRepository(db as never);
    await expect(
      repository.createReadGrant(DOC_ID, "reviewer-a", "quality_review"),
    ).rejects.toMatchObject({ code: "coa_access_audit_failed" });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
