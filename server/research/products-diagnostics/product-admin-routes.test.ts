import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerProductAdminApi } from "./product-admin-routes";
import type { ProductAdminService } from "./product-admin";

function appWith(service: Partial<ProductAdminService>) {
  const app = express();
  app.use(express.json());
  registerProductAdminApi(app, {
    service: service as ProductAdminService,
    requireAdmin(req, _res, next) {
      (req as typeof req & { adminEmail?: string }).adminEmail =
        "admin@example.invalid";
      next();
    },
  });
  return app;
}

describe("registerProductAdminApi", () => {
  it("registers the isolated product, variant, price, media, and lifecycle routes", async () => {
    const service = {
      list: vi.fn(async () => []),
      get: vi.fn(async () => ({ id: "product-1" })),
      create: vi.fn(async () => ({ id: "product-1" })),
      update: vi.fn(async () => ({ id: "product-1" })),
      duplicate: vi.fn(async () => ({ id: "product-2" })),
      archive: vi.fn(async () => ({ id: "product-1" })),
      restore: vi.fn(async () => ({ id: "product-1" })),
      publish: vi.fn(async () => ({ id: "product-1" })),
      unpublish: vi.fn(async () => ({ id: "product-1" })),
      createVariant: vi.fn(async () => ({ id: "product-1" })),
      updateVariant: vi.fn(async () => ({ id: "product-1" })),
      createPrice: vi.fn(async () => ({ id: "product-1" })),
      approvePrice: vi.fn(async () => ({ id: "product-1" })),
      createMediaUpload: vi.fn(async () => ({
        media: { id: "media-1" },
        uploadUrl: "https://storage.invalid",
        expiresAt: "2026-07-26T12:02:00Z",
      })),
      confirmMediaUpload: vi.fn(async () => ({ id: "product-1" })),
      updateMedia: vi.fn(async () => ({ id: "product-1" })),
    };
    const app = appWith(service);
    expect((await request(app).get("/api/admin/research/products")).status).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/admin/research/products")
          .set("Idempotency-Key", "create-1")
          .send({})
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post("/api/admin/research/products/product-1/duplicate")
          .set("Idempotency-Key", "duplicate-1")
          .send({})
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post("/api/admin/research/products/product-1/variants")
          .set("Idempotency-Key", "variant-1")
          .send({})
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post("/api/admin/research/products/product-1/prices")
          .set("Idempotency-Key", "price-1")
          .send({})
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post("/api/admin/research/products/product-1/media/upload")
          .set("Idempotency-Key", "media-1")
          .send({})
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .put("/api/admin/research/products/product-1/media/media-1")
          .set("Idempotency-Key", "media-2")
          .send({})
      ).status,
    ).toBe(200);
  });

  it("requires an idempotency key for every mutation", async () => {
    const app = appWith({
      create: vi.fn(async () => ({ id: "product-1" })),
    });
    const response = await request(app)
      .post("/api/admin/research/products")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      ok: false,
      code: "validation_failed",
    });
  });
});
