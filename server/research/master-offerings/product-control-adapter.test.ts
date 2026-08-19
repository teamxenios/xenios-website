import { describe, expect, it, vi } from "vitest";
import { resolveMasterOfferingAction } from "./action";
import { createMasterOfferingProductControlResolver } from "./product-control-adapter";
import { cartSelection, offering } from "./test-fixtures";

function exactBinding() {
  return {
    offeringVariantId: "mov_test_variant",
    productId: "pc_product_1",
    variantId: "pc_variant_1",
  };
}

describe("master offering Product Control adapter", () => {
  it("delegates exact identity to Product Control and never reconstructs commerce", async () => {
    const select = vi.fn(() => ({ ok: true as const, selection: cartSelection() }));
    const resolver = createMasterOfferingProductControlResolver({
      bindings: { readBinding: exactBinding },
      selections: { select },
      context: () => ({
        audience: "member",
        currency: "USD",
        evaluatedAt: "2026-08-11T18:00:00.000Z",
      }),
    });
    const product = offering();
    const commerce = await resolver(product, product.variants[0]);
    expect(select).toHaveBeenCalledWith({
      productId: "pc_product_1",
      variantId: "pc_variant_1",
      audience: "member",
      currency: "USD",
      evaluatedAt: "2026-08-11T18:00:00.000Z",
    });
    expect(
      resolveMasterOfferingAction(product, product.variants[0], commerce).kind,
    ).toBe("add_to_cart");
  });

  it("hands the session's audience fact through only when the composition resolved one", async () => {
    const select = vi.fn(() => ({ ok: true as const, selection: cartSelection() }));
    const resolver = createMasterOfferingProductControlResolver({
      bindings: { readBinding: exactBinding },
      selections: { select },
      context: () => ({
        audience: "member",
        currency: "USD",
        evaluatedAt: "2026-08-11T18:00:00.000Z",
        audienceSourceVersion: "member-grant-v1",
      }),
    });
    const product = offering();
    await resolver(product, product.variants[0]);
    expect(select).toHaveBeenCalledWith(
      {
        productId: "pc_product_1",
        variantId: "pc_variant_1",
        audience: "member",
        currency: "USD",
        evaluatedAt: "2026-08-11T18:00:00.000Z",
      },
      {
        audienceEligibility: {
          audience: "member",
          state: "authorized",
          sourceVersion: "member-grant-v1",
          // The same instant as the request, never a second clock.
          evaluatedAt: "2026-08-11T18:00:00.000Z",
        },
      },
    );
    // A blank fingerprint is no authorization: the session argument is omitted
    // entirely rather than sent half-empty.
    const bare = vi.fn(() => ({ ok: true as const, selection: cartSelection() }));
    const bareResolver = createMasterOfferingProductControlResolver({
      bindings: { readBinding: exactBinding },
      selections: { select: bare },
      context: () => ({
        audience: "member",
        currency: "USD",
        evaluatedAt: "2026-08-11T18:00:00.000Z",
        audienceSourceVersion: "   ",
      }),
    });
    await bareResolver(product, product.variants[0]);
    expect(bare).toHaveBeenCalledWith({
      productId: "pc_product_1",
      variantId: "pc_variant_1",
      audience: "member",
      currency: "USD",
      evaluatedAt: "2026-08-11T18:00:00.000Z",
    });
  });

  it("fails closed without a binding and does not call Product Control", async () => {
    const select = vi.fn();
    const resolver = createMasterOfferingProductControlResolver({
      bindings: { readBinding: () => null },
      selections: { select },
      context: () => ({
        audience: "member",
        currency: "USD",
        evaluatedAt: "2026-08-11T18:00:00.000Z",
      }),
    });
    const product = offering();
    const commerce = await resolver(product, product.variants[0]);
    expect(select).not.toHaveBeenCalled();
    expect(
      resolveMasterOfferingAction(product, product.variants[0], commerce).kind,
    ).toBe("request_access");
  });

  it("preserves display and removes commerce on Product Control refusal", async () => {
    const resolver = createMasterOfferingProductControlResolver({
      bindings: { readBinding: exactBinding },
      selections: {
        select: () => ({ ok: false, code: "price_unapproved" }),
      },
      context: () => ({
        audience: "member",
        currency: "USD",
        evaluatedAt: "2026-08-11T18:00:00.000Z",
      }),
    });
    const product = offering();
    const commerce = await resolver(product, product.variants[0]);
    expect(product.slug).toBe("research-vials-bpc-157");
    expect(
      resolveMasterOfferingAction(product, product.variants[0], commerce).kind,
    ).toBe("request_access");
  });
});
