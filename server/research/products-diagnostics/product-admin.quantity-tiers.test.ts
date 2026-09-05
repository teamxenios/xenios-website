import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AdminProductDetail, CreateAdminPriceInput } from "@shared/research/product-admin";
import { ProductAdminService, type ProductAdminRepository } from "./product-admin";
import { ProductAdminValidationError } from "./product-admin-errors";
import { registerProductAdminApi } from "./product-admin-routes";

const ladder = [
  { minimumQuantity: 1, amountCents: 1000 },
  { minimumQuantity: 5, amountCents: 900 },
  { minimumQuantity: 10, amountCents: 800 },
];
const input: CreateAdminPriceInput = {
  variantId: "variant-1", audience: "retail", amountCents: 1000,
  currency: "USD", effectiveAt: "2026-09-05T12:00:00Z", quantityTiers: ladder,
};
function fixture() {
  const product = {
    id: "product-1",
    variants: [{ id: "variant-1", productId: "product-1", sku: "FIXTURE-UNIT", strength: "10 mg", catalogNumber: null }],
    prices: [{ ...input, id: "price-1", productId: "product-1" }],
  } as AdminProductDetail;
  const createPrice = vi.fn(async () => product);
  const approvePrice = vi.fn(async () => product);
  const repository = { get: vi.fn(async () => product), createPrice, approvePrice } as unknown as ProductAdminRepository;
  const service = new ProductAdminService(repository, { evaluate: vi.fn() }, {
    run: async (_scope, _key, action) => action(),
  }, () => "2026-09-05T13:00:00Z");
  return { product, service, createPrice, approvePrice };
}

describe("Product Control quantity-tier writes", () => {
  it("clones the complete ladder before awaiting authoritative variant reads", async () => {
    const { service, createPrice } = fixture();
    const supplied = structuredClone(input);
    const pending = service.createPrice("product-1", supplied, "admin@example.invalid", "one");
    (supplied.quantityTiers as typeof ladder)[1].amountCents = 1;
    await pending;
    const saved = createPrice.mock.calls[0] as unknown as [string, CreateAdminPriceInput];
    expect(saved[1].quantityTiers).toEqual(ladder);
    expect(Object.isFrozen(saved[1].quantityTiers)).toBe(true);
    expect(Object.isFrozen(saved[1].quantityTiers![1])).toBe(true);
  });

  it.each([
    null, {}, [{ minimumQuantity: 5, amountCents: 1000 }],
    [{ minimumQuantity: 1, amountCents: 999 }],
    [...ladder, { minimumQuantity: 11, amountCents: 901 }],
    [...ladder, { minimumQuantity: 10, amountCents: 700 }],
    [{ minimumQuantity: 1, amountCents: 1000, wholesaleCost: 20 }],
    [{ minimumQuantity: 1, amountCents: 1000 }, { minimumQuantity: 5.5, amountCents: 800 }],
  ])("refuses a malformed complete ladder before any persistence (%j)", async (quantityTiers) => {
    const { service, createPrice } = fixture();
    await expect(service.createPrice("product-1", { ...input, quantityTiers } as CreateAdminPriceInput,
      "admin@example.invalid", "bad")).rejects.toBeInstanceOf(ProductAdminValidationError);
    expect(createPrice).not.toHaveBeenCalled();
  });

  it("revalidates stored economic data on approval", async () => {
    const { service, product, approvePrice } = fixture();
    product.prices[0].quantityTiers = [{ minimumQuantity: 1, amountCents: 1 }];
    await expect(service.approvePrice("product-1", "price-1", "admin@example.invalid", "approve"))
      .rejects.toBeInstanceOf(ProductAdminValidationError);
    expect(approvePrice).not.toHaveBeenCalled();
  });

  it("keeps omitted and empty ladders on the legacy scalar draft contract", async () => {
    const { service, createPrice } = fixture();
    for (const quantityTiers of [undefined, []]) {
      await service.createPrice("product-1", { ...input, amountCents: 0, quantityTiers }, "admin@example.invalid", "legacy");
    }
    for (const call of createPrice.mock.calls) {
      expect((call as unknown as [string, CreateAdminPriceInput])[1]).not.toHaveProperty("quantityTiers");
    }
  });

  it("keeps authentication, admin actor and no-store authority on the mounted route", async () => {
    const { service, createPrice } = fixture();
    const app = express(); app.use(express.json());
    registerProductAdminApi(app, { service, requireAdmin(req, res, next) {
      if (req.headers.authorization !== "fixture-admin") { res.status(401).end(); return; }
      (req as typeof req & { adminEmail: string }).adminEmail = "admin@example.invalid"; next();
    } });
    const path = "/api/admin/research/products/product-1/prices";
    expect((await request(app).post(path).send(input)).status).toBe(401);
    expect(createPrice).not.toHaveBeenCalled();
    const response = await request(app).post(path).set("Authorization", "fixture-admin")
      .set("Idempotency-Key", "tier-route").send({ ...input, actor: "forged@example.invalid" });
    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(createPrice).toHaveBeenCalledWith("product-1", expect.objectContaining({ quantityTiers: ladder }),
      "admin@example.invalid", "2026-09-05T13:00:00Z");
  });
});
