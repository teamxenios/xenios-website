import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptCartProductSelection } from "./cartProductSelection";

const valid = {
  ok: true,
  selection: {
    productId: "product-a",
    variantId: "variant-a",
    sku: "SKU-A",
    audience: "member",
    price: {
      id: "price-a",
      amountCents: 14900,
      currency: "USD",
      effectiveAt: "2026-07-01T00:00:00.000Z",
      expiresAt: null,
      version: 2,
    },
    media: {
      id: "media-a",
      kind: "primary_image",
      altText: "Product A",
    },
    canonicalReadiness: {
      ready: true,
      verifiedInputCount: 4,
      inputVersions: [
        { id: "input-a", version: 1 },
        { id: "input-b", version: 1 },
        { id: "input-c", version: 1 },
        { id: "input-d", version: 1 },
      ],
      domainVersions: [{ domain: "products", version: 2 }],
    },
    inventoryEligibility: {
      productId: "product-a",
      variantId: "variant-a",
      state: "eligible",
      reason: null,
      sourceVersion: "inventory-v1",
      evaluatedAt: "2026-07-26T22:00:00.000Z",
    },
    evaluatedAt: "2026-07-26T22:00:00.000Z",
  },
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cart product selection client adapter", () => {
  it("accepts the typed server projection without making a route call", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(adaptCartProductSelection(valid)).toEqual(valid);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed for malformed price or readiness identity", () => {
    expect(
      adaptCartProductSelection({
        ...valid,
        selection: {
          ...valid.selection,
          price: { ...valid.selection.price, id: "" },
        },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
    expect(
      adaptCartProductSelection({
        ...valid,
        selection: {
          ...valid.selection,
          canonicalReadiness: {
            ...valid.selection.canonicalReadiness,
            ready: false,
          },
        },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
  });

  it("rejects cross-product inventory and preserves canonical failures", () => {
    expect(
      adaptCartProductSelection({
        ...valid,
        selection: {
          ...valid.selection,
          inventoryEligibility: {
            ...valid.selection.inventoryEligibility,
            productId: "product-b",
          },
        },
      }),
    ).toEqual({ ok: false, code: "invalid_projection" });
    expect(
      adaptCartProductSelection({ ok: false, code: "price_stale" }),
    ).toEqual({ ok: false, code: "price_stale" });
  });

  it("removes fields outside the browser-safe contract", () => {
    const result = adaptCartProductSelection({
      ...valid,
      selection: {
        ...valid.selection,
        privateStorageKey: "private/product-a.webp",
        canonicalReadiness: {
          ...valid.selection.canonicalReadiness,
          enteredValue: "must-not-reach-browser",
        },
      },
    });

    expect(result).toEqual(valid);
    expect(JSON.stringify(result)).not.toContain("privateStorageKey");
    expect(JSON.stringify(result)).not.toContain("enteredValue");
  });
});
