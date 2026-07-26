import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerInventoryLotAdminApi } from "./routes";

const LOT_ID = "10000000-0000-4000-8000-000000000001";
const DOC_ID = "20000000-0000-4000-8000-000000000001";

function appFor(allowed = true) {
  const guard = (req: any, res: any, next: any) => {
    if (!allowed) return res.status(403).json({ ok: false, code: "prelaunch_role_required" });
    req.prelaunchActorId = "operations-user";
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
});
