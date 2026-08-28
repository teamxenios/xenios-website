// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Route, Router } from "wouter";
import type { MasterOfferingCatalogDetailResponse } from "@shared/research/master-offerings/contract";
import {
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY,
} from "@shared/research/early-access-quantity";
import type { ApiResult } from "../lib/api";
import { MEMBER_ROUTES } from "../lib/routes";

/**
 * The route is the composition point: it injects the existing cart adapter and
 * the founder quantity capability into the detail surface. These tests prove
 * the wiring is alive end to end (card action -> handoff -> the one mounted
 * cart door) and that a cart refusal surfaces truthfully instead of as a fake
 * success or a dead control.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("../core", () => ({
  useResearch: () => ({ memberToken: "member-token" }),
}));

const addCartLine = vi.fn();
vi.mock("../adapters/commerce", () => ({
  addCartLine: (...args: unknown[]) => addCartLine(...args),
}));

const getMasterOfferingDetail = vi.fn();
vi.mock("./catalogApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("./catalogApi")>();
  return {
    ...original,
    getMasterOfferingDetail: (...args: unknown[]) =>
      getMasterOfferingDetail(...args),
  };
});

import FullCatalogProductRoute, {
  createMemberCartAdapter,
  founderQuantityCapabilityFor,
} from "./FullCatalogProductRoute";
import { fullCatalogProductHref } from "./integration-packet";

const ADD_TO_CART = {
  kind: "add_to_cart" as const,
  label: "Add to Cart" as const,
  productId: "pc_product_1",
  variantId: "pc_variant_1",
  sku: "XEN-BPC-10",
  amount: { amountCents: 9900, currency: "USD" },
  evaluatedAt: "2026-08-13T12:00:00.000Z",
};

function detailResponse(): ApiResult<MasterOfferingCatalogDetailResponse> {
  return {
    kind: "ok",
    data: {
      ok: true,
      audience: "member",
      launchScope: "founder_admin",
      product: {
        id: "mo_1",
        slug: "research-vials-bpc-157",
        displayName: "BPC-157",
        canonicalName: "BPC-157",
        family: "research_vials",
        familyLabel: "Research Vials",
        category: "Peptides & Research",
        subcategory: null,
        brand: null,
        displayState: "available_now",
        displayLabel: "Available Now",
        stateExplanation: "Available now.",
        copyState: "approved",
        variantCount: 1,
        overview: null,
        disclosures: ["Product Control remains the purchase authority."],
        priceSummary: {
          state: "single",
          variantCount: 1,
          pricedVariantCount: 1,
          currency: "USD",
          fromCents: 9900,
          toCents: 9900,
          display: "$99.00",
        },
        variants: [
          {
            id: "mov_a",
            label: "5 mg vial",
            displayState: "available_now",
            displayLabel: "Available Now",
            price: {
              state: "priced",
              amountCents: 9900,
              currency: "USD",
              display: "$99.00",
              basis: "exact_listed_unit",
              priceId: "price_1",
              priceVersion: 1,
              effectiveAt: "2026-08-01T00:00:00.000Z",
              expiresAt: null,
            },
            action: ADD_TO_CART,
          },
        ],
      },
    } as MasterOfferingCatalogDetailResponse,
  };
}

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function click(element: Element | null | undefined) {
  act(() => element?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function mountRoute(search = "") {
  window.history.replaceState(
    null,
    "",
    `${fullCatalogProductHref("research_vials", "research-vials-bpc-157")}${search}`,
  );
  return render(
    <Router>
      <Route
        path={MEMBER_ROUTES.fullCatalogProduct}
        component={FullCatalogProductRoute}
      />
    </Router>,
  );
}

beforeEach(() => {
  addCartLine.mockReset();
  getMasterOfferingDetail.mockReset();
  getMasterOfferingDetail.mockImplementation(async () => detailResponse());
});

describe("the founder quantity capability", () => {
  it("exists only for a server-resolved add_to_cart, with the action's own identity", () => {
    const variant = detailResponse();
    const view =
      variant.kind === "ok" && variant.data.ok
        ? variant.data.product.variants[0]
        : null;
    expect(view).not.toBeNull();
    expect(founderQuantityCapabilityFor(view!)).toEqual({
      source: "accepted_quantity_policy",
      productId: "pc_product_1",
      variantId: "pc_variant_1",
      sku: "XEN-BPC-10",
      evaluatedAt: "2026-08-13T12:00:00.000Z",
      minimum: EARLY_ACCESS_MIN_QUANTITY,
      maximum: EARLY_ACCESS_MAX_QUANTITY,
      aggregateMaximum: EARLY_ACCESS_MAX_QUANTITY,
      sourceVersion: `early-access-quantity:${EARLY_ACCESS_MIN_QUANTITY}-${EARLY_ACCESS_MAX_QUANTITY}`,
    });
    expect(
      founderQuantityCapabilityFor({
        id: "mov_b",
        label: "10 mg vial",
        displayState: "available_now",
        displayLabel: "Available Now",
        price: { state: "on_request" },
        action: {
          kind: "request_access",
          label: "Request Access",
          href: "/research/member/product-requests/new",
        },
      }),
    ).toBeNull();
  });

  it("does not synthesize capability from malformed browser action identity", () => {
    const response = detailResponse();
    const view =
      response.kind === "ok" && response.data.ok
        ? response.data.product.variants[0]
        : null;
    expect(view).not.toBeNull();
    if (!view || view.action.kind !== "add_to_cart") return;

    for (const action of [
      { ...view.action, sku: "" },
      { ...view.action, sku: " XEN-BPC-10" },
      { ...view.action, sku: undefined },
      { ...view.action, evaluatedAt: "not-an-instant" },
      { ...view.action, evaluatedAt: "2026-02-30T12:00:00.000Z" },
      { ...view.action, evaluatedAt: undefined },
      { ...view.action, kind: "add-to-basket" },
      { ...view.action, amount: null },
    ]) {
      expect(
        founderQuantityCapabilityFor({ ...view, action: action as never }),
      ).toBeNull();
    }
  });
});

describe("the member cart adapter", () => {
  const request = {
    productId: "pc_product_1",
    variantId: "pc_variant_1",
    sku: "XEN-BPC-10",
    quantity: 3,
    amountCents: 9900,
    currency: "USD",
    evaluatedAt: "2026-08-13T12:00:00.000Z",
    idempotencyKey: "catalog:pc_product_1:pc_variant_1:3:2026-08-13T12:00:00.000Z",
  };

  it("adds through the one mounted cart door as a one-time SKU line", async () => {
    addCartLine.mockResolvedValueOnce({ kind: "ok", data: { cart: {} } });
    const adapter = createMemberCartAdapter("member-token");
    expect(await adapter.addExactVariant(request)).toEqual({ ok: true });
    expect(addCartLine).toHaveBeenCalledExactlyOnceWith("member-token", {
      sku: "XEN-BPC-10",
      quantity: 3,
      purchaseMode: "one_time",
    });
  });

  it("relays the cart's own machine code unrewritten", async () => {
    addCartLine.mockResolvedValueOnce({
      kind: "denied",
      code: "commerce_disabled",
    });
    const adapter = createMemberCartAdapter("member-token");
    expect(await adapter.addExactVariant(request)).toEqual({
      ok: false,
      code: "commerce_disabled",
    });
  });

  it("answers an unmounted cart door as unavailable, never as success", async () => {
    addCartLine.mockResolvedValueOnce({ kind: "unavailable" });
    const adapter = createMemberCartAdapter("member-token");
    expect(await adapter.addExactVariant(request)).toEqual({
      ok: false,
      code: "cart_unavailable",
    });
  });
});

describe("the routed page wires the handoff", () => {
  it("updates restored intent when the mounted route search changes", async () => {
    const { host, unmount } = mountRoute();
    await settle();
    expect(
      host.querySelector<HTMLInputElement>('[data-testid="mo-quantity"]')
        ?.value,
    ).toBe("1");

    act(() => {
      window.history.pushState(
        null,
        "",
        `${fullCatalogProductHref(
          "research_vials",
          "research-vials-bpc-157",
        )}?variant=mov_a&qty=7&intent=buy_now`,
      );
    });
    await settle();
    expect(
      host.querySelector<HTMLInputElement>('[data-testid="mo-quantity"]')
        ?.value,
    ).toBe("7");
    unmount();
  });

  it("restores a validated exact-variant quantity intent before the add", async () => {
    addCartLine.mockResolvedValue({ kind: "ok", data: { cart: {} } });
    const { host, unmount } = mountRoute("?variant=mov_a&qty=7&intent=buy_now");
    await settle();

    const quantity = host.querySelector<HTMLInputElement>(
      '[data-testid="mo-quantity"]',
    );
    expect(quantity?.value).toBe("7");

    click(host.querySelector('[data-testid="mo-cta"]'));
    await settle();
    expect(addCartLine).toHaveBeenCalledExactlyOnceWith("member-token", {
      sku: "XEN-BPC-10",
      quantity: 7,
      purchaseMode: "one_time",
    });
    unmount();
  });

  it("clicking Add to Cart reaches the cart with the server's own values", async () => {
    addCartLine.mockResolvedValue({ kind: "ok", data: { cart: {} } });
    const { host, unmount } = mountRoute();
    await settle();
    click(host.querySelector('[data-testid="mo-cta"]'));
    await settle();
    expect(addCartLine).toHaveBeenCalledExactlyOnceWith("member-token", {
      sku: "XEN-BPC-10",
      quantity: 1,
      purchaseMode: "one_time",
    });
    unmount();
  });

  it("shows the truthful commerce_disabled copy, not success and not a dead page", async () => {
    addCartLine.mockResolvedValue({ kind: "denied", code: "commerce_disabled" });
    const { host, unmount } = mountRoute();
    await settle();
    click(host.querySelector('[data-testid="mo-cta"]'));
    await settle();
    expect(host.textContent).toContain(
      "Direct checkout is not enabled.",
    );
    expect(host.textContent).not.toContain("commerce_disabled");
    // Still on the product page: a refusal never navigates to the cart.
    expect(window.location.pathname).toBe(
      "/research/member/catalog/research_vials/research-vials-bpc-157",
    );
    unmount();
  });

  it("lands the member on the existing cart page after a real add", async () => {
    addCartLine.mockResolvedValue({ kind: "ok", data: { cart: {} } });
    const { host, unmount } = mountRoute();
    await settle();
    click(host.querySelector('[data-testid="mo-cta"]'));
    await settle();
    expect(window.location.pathname).toBe(MEMBER_ROUTES.cart);
    unmount();
  });
});
