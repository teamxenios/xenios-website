import { describe, expect, it, vi } from "vitest";
import type { MasterOfferingAction } from "@shared/research/master-offerings/contract";
import {
  buildCatalogCartRequest,
  catalogCartIdempotencyKey,
  createCatalogCartHandoff,
  type CatalogCartRequest,
  type ExistingCart,
} from "./catalog-cart-handoff";
import type { AcceptedExactVariantQuantityCapability } from "./integration-packet";

const BAND: AcceptedExactVariantQuantityCapability = {
  source: "accepted_quantity_policy",
  productId: "pc_product_1",
  variantId: "pc_variant_1",
  sku: "XEN-BPC-10",
  evaluatedAt: "2026-08-13T12:00:00.000Z",
  minimum: 1,
  maximum: 50,
  aggregateMaximum: 50,
  sourceVersion: "quantity-1-50",
};

const ADD_TO_CART: MasterOfferingAction = {
  kind: "add_to_cart",
  label: "Add to Cart",
  productId: "pc_product_1",
  variantId: "pc_variant_1",
  sku: "XEN-BPC-10",
  amount: { amountCents: 9900, currency: "USD" },
  evaluatedAt: "2026-08-13T12:00:00.000Z",
};

function recordingCart(): ExistingCart & { adds: CatalogCartRequest[] } {
  const adds: CatalogCartRequest[] = [];
  return {
    adds,
    async addExactVariant(request) {
      adds.push(request);
      return { ok: true };
    },
  };
}

describe("catalog to cart handoff", () => {
  it("carries only what the server already resolved", () => {
    const outcome = buildCatalogCartRequest(ADD_TO_CART, 7, BAND);
    expect(outcome).toEqual({
      ok: true,
      request: {
        productId: "pc_product_1",
        variantId: "pc_variant_1",
        sku: "XEN-BPC-10",
        quantity: 7,
        amountCents: 9900,
        currency: "USD",
        evaluatedAt: "2026-08-13T12:00:00.000Z",
        idempotencyKey:
          "catalog:pc_product_1:pc_variant_1:7:2026-08-13T12:00:00.000Z",
      },
    });
  });

  it("refuses malformed browser action identity without throwing", () => {
    const malformed = [
      { ...ADD_TO_CART, sku: "" },
      { ...ADD_TO_CART, sku: "   " },
      { ...ADD_TO_CART, sku: undefined },
      { ...ADD_TO_CART, evaluatedAt: "not-an-instant" },
      { ...ADD_TO_CART, evaluatedAt: "2026-02-30T12:00:00.000Z" },
      { ...ADD_TO_CART, evaluatedAt: undefined },
      { ...ADD_TO_CART, kind: "add-to-basket" },
      { ...ADD_TO_CART, amount: null },
      { ...ADD_TO_CART, amount: { amountCents: 0, currency: "USD" } },
      { ...ADD_TO_CART, amount: { amountCents: 9900, currency: "" } },
    ];
    for (const action of malformed) {
      expect(() =>
        buildCatalogCartRequest(action as never, 1, BAND),
      ).not.toThrow();
      expect(buildCatalogCartRequest(action as never, 1, BAND)).toEqual({
        ok: false,
        reason: "not_purchasable",
      });
    }
  });

  it("accepts the whole 1 to 50 band and refuses 51 without clamping", () => {
    for (const quantity of [1, 20, 21, 49, 50]) {
      const outcome = buildCatalogCartRequest(ADD_TO_CART, quantity, BAND);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.request.quantity).toBe(quantity);
    }
    for (const quantity of [0, -1, 51, 1000, 1.5, Number.NaN]) {
      expect(buildCatalogCartRequest(ADD_TO_CART, quantity, BAND)).toEqual({
        ok: false,
        reason: "quantity_out_of_band",
      });
    }
  });

  it("refuses every non-purchase action at every quantity", () => {
    const actions: MasterOfferingAction[] = [
      { kind: "request_access", label: "Request Access", href: "/x" },
      {
        kind: "request_early_access_purchase",
        label: "Request Early Access Purchase",
        href: "/x",
      },
      { kind: "explore_care", label: "Explore Care", href: "/care" },
      { kind: "apply", label: "Apply", href: "/x" },
      { kind: "notify_me", label: "Notify Me", href: "/x" },
      { kind: "join_waitlist", label: "Join Waitlist", href: "/x" },
      { kind: "get_updates", label: "Get Updates", href: "/x" },
      { kind: "none", label: null, href: null },
    ];
    for (const action of actions) {
      for (const quantity of [1, 25, 50]) {
        expect(buildCatalogCartRequest(action, quantity, BAND)).toEqual({
          ok: false,
          reason: "not_purchasable",
        });
      }
    }
  });

  it("keeps a real Care pathway a Care pathway", () => {
    // The clearest statement of the rule: a care product cannot become a
    // checkout by any quantity, capability, or repetition.
    const care: MasterOfferingAction = {
      kind: "explore_care",
      label: "Explore Care",
      href: "/research/member/metabolic-care",
    };
    expect(buildCatalogCartRequest(care, 1, BAND)).toEqual({
      ok: false,
      reason: "not_purchasable",
    });
  });

  it("refuses when no accepted capability names the exact action identity", () => {
    expect(buildCatalogCartRequest(ADD_TO_CART, 5, null)).toEqual({
      ok: false,
      reason: "quantity_unauthorized",
    });
    expect(
      buildCatalogCartRequest(ADD_TO_CART, 5, {
        ...BAND,
        variantId: "pc_variant_other",
      }),
    ).toEqual({ ok: false, reason: "quantity_unauthorized" });
    expect(
      buildCatalogCartRequest(ADD_TO_CART, 5, {
        ...BAND,
        sku: "XEN-BPC-20",
      }),
    ).toEqual({ ok: false, reason: "quantity_unauthorized" });
    expect(
      buildCatalogCartRequest(ADD_TO_CART, 5, {
        ...BAND,
        sku: undefined,
      } as never),
    ).toEqual({ ok: false, reason: "quantity_unauthorized" });
    expect(
      buildCatalogCartRequest(ADD_TO_CART, 5, {
        ...BAND,
        evaluatedAt: "2026-08-13T12:00:01.000Z",
      }),
    ).toEqual({ ok: false, reason: "quantity_unauthorized" });
  });

  it("gives the same key to the same request and a new key to a new intent", () => {
    const base = {
      productId: "p",
      variantId: "v",
      quantity: 3,
      evaluatedAt: "2026-08-13T12:00:00.000Z",
    };
    expect(catalogCartIdempotencyKey(base)).toBe(
      catalogCartIdempotencyKey({ ...base }),
    );
    expect(catalogCartIdempotencyKey({ ...base, quantity: 4 })).not.toBe(
      catalogCartIdempotencyKey(base),
    );
    // A re-evaluated price is a new intent, not a duplicate of the old one.
    expect(
      catalogCartIdempotencyKey({
        ...base,
        evaluatedAt: "2026-08-13T13:00:00.000Z",
      }),
    ).not.toBe(catalogCartIdempotencyKey(base));
  });
});

describe("adversarial: repeated and concurrent adds", () => {
  it("turns a double click into one cart add", async () => {
    const cart = recordingCart();
    const handoff = createCatalogCartHandoff(cart);
    const [first, second] = await Promise.all([
      handoff.add(ADD_TO_CART, 3, BAND),
      handoff.add(ADD_TO_CART, 3, BAND),
    ]);
    expect(cart.adds).toHaveLength(1);
    expect(first.ok !== second.ok).toBe(true);
    const refused = first.ok ? second : first;
    expect(refused).toEqual({ ok: false, reason: "already_in_flight" });
  });

  it("survives an impatient triple click", async () => {
    const cart = recordingCart();
    const handoff = createCatalogCartHandoff(cart);
    const outcomes = await Promise.all([
      handoff.add(ADD_TO_CART, 50, BAND),
      handoff.add(ADD_TO_CART, 50, BAND),
      handoff.add(ADD_TO_CART, 50, BAND),
    ]);
    expect(cart.adds).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
  });

  it("does not block a different variant while one add is in flight", async () => {
    const cart = recordingCart();
    const handoff = createCatalogCartHandoff(cart);
    const other: MasterOfferingAction = {
      ...ADD_TO_CART,
      variantId: "pc_variant_2",
    };
    const outcomes = await Promise.all([
      handoff.add(ADD_TO_CART, 2, BAND),
      handoff.add(other, 2, { ...BAND, variantId: "pc_variant_2" }),
    ]);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
    expect(cart.adds).toHaveLength(2);
  });

  it("releases the lock so a deliberate second add still works", async () => {
    const cart = recordingCart();
    const handoff = createCatalogCartHandoff(cart);
    expect((await handoff.add(ADD_TO_CART, 3, BAND)).ok).toBe(true);
    expect((await handoff.add(ADD_TO_CART, 3, BAND)).ok).toBe(true);
    expect(cart.adds).toHaveLength(2);
    // Both carry the same key, so the cart itself can collapse them if it
    // treats the key as an idempotency token.
    expect(cart.adds[0].idempotencyKey).toBe(cart.adds[1].idempotencyKey);
  });

  it("releases the lock even when the cart throws", async () => {
    const cart: ExistingCart = {
      addExactVariant: vi
        .fn()
        .mockRejectedValueOnce(new Error("network"))
        .mockResolvedValueOnce({ ok: true }),
    };
    const handoff = createCatalogCartHandoff(cart);
    await expect(handoff.add(ADD_TO_CART, 3, BAND)).rejects.toThrow("network");
    // A stuck lock would leave the button dead for the rest of the session.
    expect((await handoff.add(ADD_TO_CART, 3, BAND)).ok).toBe(true);
  });

  it("surfaces the cart's own refusal code rather than inventing one", async () => {
    const cart: ExistingCart = {
      addExactVariant: async () => ({ ok: false, code: "price_stale" }),
    };
    const handoff = createCatalogCartHandoff(cart);
    expect(await handoff.add(ADD_TO_CART, 3, BAND)).toEqual({
      ok: false,
      reason: "cart_refused",
      code: "price_stale",
    });
  });

  it("never reaches the cart for a refused request", async () => {
    const cart = recordingCart();
    const handoff = createCatalogCartHandoff(cart);
    await handoff.add(ADD_TO_CART, 51, BAND);
    await handoff.add(ADD_TO_CART, 3, null);
    await handoff.add(
      { kind: "request_access", label: "Request Access", href: "/x" },
      3,
      BAND,
    );
    expect(cart.adds).toHaveLength(0);
  });
});
