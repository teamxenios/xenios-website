import type { Express, NextFunction, Request, Response } from "express";
import type {
  AdminProductListFilters,
  CreateAdminPriceInput,
  CreateAdminProductInput,
  CreateAdminVariantInput,
  DuplicateAdminProductInput,
  UpdateAdminProductInput,
} from "@shared/research/product-admin";
import type { ProductAdminService } from "./product-admin";
import {
  ProductAdminConflictError,
  ProductAdminNotFoundError,
  ProductAdminStrengthDisputeError,
  ProductAdminValidationError,
} from "./product-admin-errors";

type Guard = (req: Request, res: Response, next: NextFunction) => unknown;

export interface ProductAdminRouteDependencies {
  service: ProductAdminService;
  requireAdmin: Guard;
}

type AdminRequest = Request & { adminEmail?: string };

function noStore(res: Response): void {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
}

function actor(req: Request): string | null {
  const value = (req as AdminRequest).adminEmail;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function idempotencyKey(req: Request): string {
  const value = req.get("Idempotency-Key");
  if (!value?.trim()) {
    throw new ProductAdminValidationError("Idempotency-Key header is required");
  }
  return value.trim();
}

function filters(req: Request): AdminProductListFilters {
  const pick = (key: string) =>
    typeof req.query[key] === "string" && req.query[key]
      ? String(req.query[key])
      : undefined;
  return {
    query: pick("q"),
    lane: pick("lane") as AdminProductListFilters["lane"],
    visibility: pick(
      "visibility",
    ) as AdminProductListFilters["visibility"],
    status: pick("status") as AdminProductListFilters["status"],
    commerceApproval: pick(
      "commerceApproval",
    ) as AdminProductListFilters["commerceApproval"],
    qualityDocumentState: pick(
      "qualityDocumentState",
    ) as AdminProductListFilters["qualityDocumentState"],
    missingInputsOnly: req.query.missingInputs === "true" || undefined,
  };
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ProductAdminValidationError) {
    res
      .status(400)
      .json({ ok: false, code: error.code, message: error.message });
    return;
  }
  if (error instanceof ProductAdminNotFoundError) {
    res
      .status(404)
      .json({ ok: false, code: error.code, message: error.message });
    return;
  }
  // Checked before the general conflict arm, which replaces the message with a
  // fixed sentence. A contested presentation is refused WITH its reason: the
  // operator has to see which two presentations disagree to act on it.
  if (error instanceof ProductAdminStrengthDisputeError) {
    res.status(409).json({
      ok: false,
      code: error.code,
      blockingKeys: error.blockingKeys,
      reason: error.reason,
      message: error.reason,
    });
    return;
  }
  if (error instanceof ProductAdminConflictError) {
    res.status(409).json({
      ok: false,
      code: error.code,
      blockingKeys: error.blockingKeys,
      message:
        "The product is not ready for that transition. Complete the listed required inputs first.",
    });
    return;
  }
  res.status(503).json({
    ok: false,
    code: "persistence_failed",
    message: "The product update could not be saved.",
  });
}

function withActor(
  handler: (req: Request, res: Response, adminActor: string) => Promise<void>,
) {
  return async (req: Request, res: Response) => {
    noStore(res);
    const adminActor = actor(req);
    if (!adminActor) {
      res.status(401).json({ ok: false, code: "admin_session_required" });
      return;
    }
    try {
      await handler(req, res, adminActor);
    } catch (error) {
      sendError(res, error);
    }
  };
}

/**
 * Website 3's isolated admin registration seam. Website 2 owns mounting this
 * function in the shared server registry after its migration delta is applied.
 */
export function registerProductAdminApi(
  app: Express,
  deps: ProductAdminRouteDependencies,
): void {
  const admin = deps.requireAdmin;

  app.get("/api/admin/research/products", admin, async (req, res) => {
    noStore(res);
    try {
      res.json({ ok: true, products: await deps.service.list(filters(req)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post(
    "/api/admin/research/products",
    admin,
    withActor(async (req, res, adminActor) => {
      const product = await deps.service.create(
        (req.body ?? {}) as CreateAdminProductInput,
        adminActor,
        idempotencyKey(req),
      );
      res.status(201).json({ ok: true, product });
    }),
  );

  app.get("/api/admin/research/products/:productId", admin, async (req, res) => {
    noStore(res);
    try {
      res.json({
        ok: true,
        product: await deps.service.get(String(req.params.productId)),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put(
    "/api/admin/research/products/:productId",
    admin,
    withActor(async (req, res, adminActor) => {
      const product = await deps.service.update(
        String(req.params.productId),
        (req.body ?? {}) as UpdateAdminProductInput,
        adminActor,
        idempotencyKey(req),
      );
      res.json({ ok: true, product });
    }),
  );

  app.post(
    "/api/admin/research/products/:productId/duplicate",
    admin,
    withActor(async (req, res, adminActor) => {
      const product = await deps.service.duplicate(
        String(req.params.productId),
        (req.body ?? {}) as DuplicateAdminProductInput,
        adminActor,
        idempotencyKey(req),
      );
      res.status(201).json({ ok: true, product });
    }),
  );

  for (const action of ["archive", "restore", "publish", "unpublish"] as const) {
    app.post(
      `/api/admin/research/products/:productId/${action}`,
      admin,
      withActor(async (req, res, adminActor) => {
        const productId = String(req.params.productId);
        const reason =
          typeof req.body?.reason === "string" ? req.body.reason : "";
        const product =
          action === "archive"
            ? await deps.service.archive(
                productId,
                adminActor,
                reason,
                idempotencyKey(req),
              )
            : action === "restore"
              ? await deps.service.restore(
                  productId,
                  adminActor,
                  idempotencyKey(req),
                )
              : action === "publish"
                ? await deps.service.publish(
                    productId,
                    adminActor,
                    idempotencyKey(req),
                  )
                : await deps.service.unpublish(
                    productId,
                    adminActor,
                    reason,
                    idempotencyKey(req),
                  );
        res.json({ ok: true, product });
      }),
    );
  }

  app.post(
    "/api/admin/research/products/:productId/variants",
    admin,
    withActor(async (req, res, adminActor) => {
      const product = await deps.service.createVariant(
        String(req.params.productId),
        (req.body ?? {}) as CreateAdminVariantInput,
        adminActor,
        idempotencyKey(req),
      );
      res.status(201).json({ ok: true, product });
    }),
  );

  app.put(
    "/api/admin/research/products/:productId/variants/:variantId",
    admin,
    withActor(async (req, res, adminActor) => {
      const product = await deps.service.updateVariant(
        String(req.params.productId),
        String(req.params.variantId),
        req.body ?? {},
        adminActor,
        idempotencyKey(req),
      );
      res.json({ ok: true, product });
    }),
  );

  app.post(
    "/api/admin/research/products/:productId/prices",
    admin,
    withActor(async (req, res, adminActor) => {
      const product = await deps.service.createPrice(
        String(req.params.productId),
        (req.body ?? {}) as CreateAdminPriceInput,
        adminActor,
        idempotencyKey(req),
      );
      res.status(201).json({ ok: true, product });
    }),
  );

  app.post(
    "/api/admin/research/products/:productId/prices/:priceId/approve",
    admin,
    withActor(async (req, res, adminActor) => {
      const product = await deps.service.approvePrice(
        String(req.params.productId),
        String(req.params.priceId),
        adminActor,
        idempotencyKey(req),
      );
      res.json({ ok: true, product });
    }),
  );

  app.post(
    "/api/admin/research/products/:productId/media/upload",
    admin,
    withActor(async (req, res, adminActor) => {
      const result = await deps.service.createMediaUpload(
        String(req.params.productId),
        req.body ?? {},
        adminActor,
        idempotencyKey(req),
      );
      res.status(201).json({ ok: true, ...result });
    }),
  );

  app.post(
    "/api/admin/research/products/:productId/media/:mediaId/confirm",
    admin,
    withActor(async (req, res, adminActor) => {
      const product = await deps.service.confirmMediaUpload(
        String(req.params.productId),
        String(req.params.mediaId),
        adminActor,
        idempotencyKey(req),
      );
      res.json({ ok: true, product });
    }),
  );

  app.put(
    "/api/admin/research/products/:productId/media/:mediaId",
    admin,
    withActor(async (req, res, adminActor) => {
      const product = await deps.service.updateMedia(
        String(req.params.productId),
        String(req.params.mediaId),
        req.body ?? {},
        adminActor,
        idempotencyKey(req),
      );
      res.json({ ok: true, product });
    }),
  );
}
