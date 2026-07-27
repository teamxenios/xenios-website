import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_SOURCE_BUCKETS,
  LOT_QUALITY_ACCESS_PURPOSES,
  LOT_QUALITY_TEST_KEYS,
  LOT_QUALITY_TEST_STATES,
} from "@shared/research/inventory-admin";
import type {
  SupabaseInventoryLotAdminRepository,
  SupabaseLotQualityAdminRepository,
} from "./production";
import { InventoryAdminPersistenceError } from "./production";

type Guard = (req: Request, res: Response, next: NextFunction) => unknown;

export type InventoryLotAdminGuards = {
  read: Guard;
  mutateInventory: Guard;
  reviewQuality: Guard;
};

export type InventoryLotAdminDependencies = {
  inventory: Pick<
    SupabaseInventoryLotAdminRepository,
    "listLots" | "createLot" | "applyMovement" | "setDisposition" | "listMovements"
  >;
  quality: Pick<
    SupabaseLotQualityAdminRepository,
    | "listDocuments"
    | "prepareUpload"
    | "cancelUpload"
    | "confirmUpload"
    | "review"
    | "createReadGrant"
  >;
};

const uuid = z.string().uuid();
const idempotencyKey = z.string().min(8).max(160);
const reason = z.string().trim().min(3).max(500);
const isoDate = z.string().date();
const nullableDate = isoDate.nullable();

const createLotSchema = z.object({
  lotCode: z.string().trim().min(2).max(120).regex(/^[A-Za-z0-9._-]+$/),
  sku: z.string().trim().min(1).max(120),
  productId: uuid,
  variantId: uuid,
  owner: z.enum(["mitch", "xenios"]),
  storageLocation: z.string().trim().min(2).max(160),
  supplierReference: z.string().trim().min(2).max(200),
  manufacturedDate: nullableDate,
  expiryDate: isoDate,
  retestDate: nullableDate,
  shelfLifeSource: z.enum(["supplier_document", "coa"]),
  idempotencyKey,
});

const movementSchema = z.object({
  movementType: z.enum(INVENTORY_MOVEMENT_TYPES),
  quantity: z.number().int().min(-100_000_000).max(100_000_000).refine((value) => value !== 0),
  sourceBucket: z.enum(INVENTORY_SOURCE_BUCKETS).nullable(),
  expectedVersion: z.number().int().positive(),
  idempotencyKey,
  reason,
});

const dispositionSchema = z.object({
  disposition: z.enum([
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
  ]),
  expectedVersion: z.number().int().positive(),
  idempotencyKey,
  reason,
});

const uploadSchema = z.object({
  lotId: uuid,
  filename: z.string().trim().min(1).max(180),
  contentType: z.literal("application/pdf"),
  sizeBytes: z.number().int().min(5).max(20 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  reportIssuer: z.string().trim().min(2).max(200),
  reportNumber: z.string().trim().min(2).max(160),
  reportDate: isoDate,
  idempotencyKey,
});

const cancelUploadSchema = uploadSchema.omit({ idempotencyKey: true }).extend({
  expectedVersion: z.number().int().positive(),
  preparationIdempotencyKey: idempotencyKey,
  idempotencyKey,
});

const testSchema = z.object({
  testKey: z.enum(LOT_QUALITY_TEST_KEYS),
  state: z.enum(LOT_QUALITY_TEST_STATES),
  method: z.string().trim().max(300).nullable(),
  result: z.string().trim().max(500).nullable(),
  unit: z.string().trim().max(80).nullable(),
  reviewedBy: z.string().nullable().optional().transform(() => null),
  reviewedAt: z.string().nullable().optional().transform(() => null),
});

const reviewSchema = z.object({
  action: z.enum(["approve", "reject", "publish", "withdraw"]),
  expectedVersion: z.number().int().positive(),
  idempotencyKey,
  reason,
  tests: z.array(testSchema).max(9),
});

const confirmSchema = z.object({
  expectedVersion: z.number().int().positive(),
  idempotencyKey,
});

const accessSchema = z.object({
  purpose: z.enum(LOT_QUALITY_ACCESS_PURPOSES),
});

type ActorRequest = Request & {
  prelaunchActorId?: string;
  adminEmail?: string;
};

function actor(req: Request): string {
  const value = (req as ActorRequest).prelaunchActorId ??
    (req as ActorRequest).adminEmail;
  if (!value) throw new InventoryAdminPersistenceError("inventory_actor_missing");
  return value;
}

function noStore(res: Response): void {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

function failure(res: Response, error: unknown): Response {
  if (error instanceof InventoryAdminPersistenceError) {
    const conflict = /rejected|conflict|mismatch|already|invalid/.test(error.code);
    return res.status(conflict ? 409 : 503).json({ ok: false, code: error.code });
  }
  return res.status(503).json({ ok: false, code: "inventory_admin_unavailable" });
}

export function registerInventoryLotAdminApi(
  app: Express,
  deps: InventoryLotAdminDependencies,
  guards: InventoryLotAdminGuards,
): void {
  app.get("/api/admin/research/inventory/lots", guards.read, async (_req, res) => {
    noStore(res);
    try {
      return res.json({ ok: true, lots: await deps.inventory.listLots() });
    } catch (error) {
      return failure(res, error);
    }
  });

  app.post("/api/admin/research/inventory/lots", guards.mutateInventory, async (req, res) => {
    noStore(res);
    const parsed = createLotSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: "validation_failed" });
    try {
      return res.status(201).json({
        ok: true,
        lot: await deps.inventory.createLot(parsed.data, actor(req)),
      });
    } catch (error) {
      return failure(res, error);
    }
  });

  app.get("/api/admin/research/inventory/movements", guards.read, async (req, res) => {
    noStore(res);
    const lotId = typeof req.query.lotId === "string" ? uuid.safeParse(req.query.lotId) : null;
    if (lotId && !lotId.success) {
      return res.status(400).json({ ok: false, code: "validation_failed" });
    }
    try {
      return res.json({
        ok: true,
        movements: await deps.inventory.listMovements(lotId?.data),
      });
    } catch (error) {
      return failure(res, error);
    }
  });

  app.post(
    "/api/admin/research/inventory/lots/:lotId/movements",
    guards.mutateInventory,
    async (req, res) => {
      noStore(res);
      const lotId = uuid.safeParse(req.params.lotId);
      const parsed = movementSchema.safeParse(req.body);
      if (!lotId.success || !parsed.success) {
        return res.status(400).json({ ok: false, code: "validation_failed" });
      }
      try {
        return res.json({
          ok: true,
          result: await deps.inventory.applyMovement(lotId.data, parsed.data, actor(req)),
        });
      } catch (error) {
        return failure(res, error);
      }
    },
  );

  app.post(
    "/api/admin/research/inventory/lots/:lotId/disposition",
    guards.mutateInventory,
    async (req, res) => {
      noStore(res);
      const lotId = uuid.safeParse(req.params.lotId);
      const parsed = dispositionSchema.safeParse(req.body);
      if (!lotId.success || !parsed.success) {
        return res.status(400).json({ ok: false, code: "validation_failed" });
      }
      try {
        return res.json({
          ok: true,
          result: await deps.inventory.setDisposition(lotId.data, parsed.data, actor(req)),
        });
      } catch (error) {
        return failure(res, error);
      }
    },
  );

  app.get("/api/admin/research/lot-quality-documents", guards.read, async (_req, res) => {
    noStore(res);
    try {
      return res.json({ ok: true, documents: await deps.quality.listDocuments() });
    } catch (error) {
      return failure(res, error);
    }
  });

  app.post(
    "/api/admin/research/lot-quality-documents/upload",
    guards.mutateInventory,
    async (req, res) => {
      noStore(res);
      const parsed = uploadSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ ok: false, code: "validation_failed" });
      try {
        return res.status(201).json({
          ok: true,
          upload: await deps.quality.prepareUpload(parsed.data, actor(req)),
        });
      } catch (error) {
        return failure(res, error);
      }
    },
  );

  app.post(
    "/api/admin/research/lot-quality-documents/upload/cancel",
    guards.mutateInventory,
    async (req, res) => {
      noStore(res);
      const parsed = cancelUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, code: "validation_failed" });
      }
      try {
        return res.json({
          ok: true,
          result: await deps.quality.cancelUpload(parsed.data, actor(req)),
        });
      } catch (error) {
        return failure(res, error);
      }
    },
  );

  app.post(
    "/api/admin/research/lot-quality-documents/:documentId/confirm",
    guards.mutateInventory,
    async (req, res) => {
      noStore(res);
      const documentId = uuid.safeParse(req.params.documentId);
      const parsed = confirmSchema.safeParse(req.body);
      if (!documentId.success || !parsed.success) {
        return res.status(400).json({ ok: false, code: "validation_failed" });
      }
      try {
        return res.json({
          ok: true,
          result: await deps.quality.confirmUpload(
            documentId.data,
            parsed.data.expectedVersion,
            parsed.data.idempotencyKey,
            actor(req),
          ),
        });
      } catch (error) {
        return failure(res, error);
      }
    },
  );

  app.post(
    "/api/admin/research/lot-quality-documents/:documentId/review",
    guards.reviewQuality,
    async (req, res) => {
      noStore(res);
      const documentId = uuid.safeParse(req.params.documentId);
      const parsed = reviewSchema.safeParse(req.body);
      if (!documentId.success || !parsed.success) {
        return res.status(400).json({ ok: false, code: "validation_failed" });
      }
      try {
        return res.json({
          ok: true,
          result: await deps.quality.review(documentId.data, parsed.data, actor(req)),
        });
      } catch (error) {
        return failure(res, error);
      }
    },
  );

  app.post(
    "/api/admin/research/lot-quality-documents/:documentId/file-access",
    guards.reviewQuality,
    async (req, res) => {
      noStore(res);
      const documentId = uuid.safeParse(req.params.documentId);
      const parsed = accessSchema.safeParse(req.body);
      if (!documentId.success || !parsed.success) {
        return res.status(400).json({ ok: false, code: "validation_failed" });
      }
      try {
        return res.json({
          ok: true,
          grant: await deps.quality.createReadGrant(
            documentId.data,
            actor(req),
            parsed.data.purpose,
          ),
        });
      } catch (error) {
        return failure(res, error);
      }
    },
  );
}
