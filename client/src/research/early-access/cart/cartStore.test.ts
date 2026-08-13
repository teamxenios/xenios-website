// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearBrowserCart, putBrowserCartItem, readBrowserCart, removeBrowserCartItem } from "./cartStore";

describe("Early Access browser cart", () => {
  beforeEach(() => sessionStorage.clear());
  it("stores only product, variant and quantity", () => {
    putBrowserCartItem({ productId: "PEX-001", variantId: "VAR-1", quantity: 2 });
    const raw = sessionStorage.getItem("xenios.research.earlyAccess.cart.v1") ?? "";
    expect(raw).toContain("PEX-001");
    for (const forbidden of ["email", "phone", "line1", "customerRef", "idempotency", "paymentReference", "session"]) expect(raw).not.toContain(forbidden);
  });
  it("supports multiple products and quantity changes", () => {
    putBrowserCartItem({ productId: "PEX-001", variantId: "VAR-1", quantity: 1 });
    putBrowserCartItem({ productId: "PEX-002", variantId: "VAR-2", quantity: 3 });
    putBrowserCartItem({ productId: "PEX-001", variantId: "VAR-1", quantity: 2 });
    expect(readBrowserCart().items).toEqual([
      { productId: "PEX-002", variantId: "VAR-2", quantity: 3 },
      { productId: "PEX-001", variantId: "VAR-1", quantity: 2 },
    ]);
  });
  it("accepts 50 directly and refuses 51 without changing the cart", () => {
    putBrowserCartItem({ productId: "PEX-001", variantId: "VAR-1", quantity: 50 });
    expect(readBrowserCart().items).toEqual([
      { productId: "PEX-001", variantId: "VAR-1", quantity: 50 },
    ]);

    putBrowserCartItem({ productId: "PEX-002", variantId: "VAR-2", quantity: 51 });
    expect(readBrowserCart().items).toEqual([
      { productId: "PEX-001", variantId: "VAR-1", quantity: 50 },
    ]);
  });
  it("purges a forged cart containing 51 units", () => {
    sessionStorage.setItem(
      "xenios.research.earlyAccess.cart.v1",
      JSON.stringify({
        version: 1,
        items: [{ productId: "PEX-001", variantId: "VAR-1", quantity: 51 }],
      }),
    );
    expect(readBrowserCart().items).toEqual([]);
    expect(sessionStorage.getItem("xenios.research.earlyAccess.cart.v1")).toBeNull();
  });
  it("removes and clears", () => {
    putBrowserCartItem({ productId: "PEX-001", variantId: "VAR-1", quantity: 1 });
    expect(removeBrowserCartItem("PEX-001", "VAR-1").items).toEqual([]);
    clearBrowserCart();
    expect(readBrowserCart().items).toEqual([]);
  });
});
