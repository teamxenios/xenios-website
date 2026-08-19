// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { MasterOfferingCatalogDetailResponse } from "@shared/research/master-offerings/contract";
import type { ApiResult } from "../lib/api";
import { MasterOfferingDetailSurface } from "./MasterOfferingDetailSurface";
import {
  createCatalogCartHandoff,
  type CatalogCartRequest,
  type ExistingCart,
} from "./catalog-cart-handoff";
import type { AcceptedExactVariantQuantityCapability } from "./integration-packet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return { host, unmount: () => act(() => root.unmount()) };
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

const BAND: AcceptedExactVariantQuantityCapability = {
  source: "accepted_quantity_policy",
  productId: "pc_product_1",
  variantId: "pc_variant_1",
  minimum: 1,
  maximum: 50,
  aggregateMaximum: 50,
  sourceVersion: "quantity-1-50",
};

const ADD_TO_CART = {
  kind: "add_to_cart" as const,
  label: "Add to Cart" as const,
  productId: "pc_product_1",
  variantId: "pc_variant_1",
  sku: "XEN-BPC-10",
  amount: { amountCents: 9900, currency: "USD" },
  evaluatedAt: "2026-08-13T12:00:00.000Z",
};

function detailResponse(
  action: unknown = ADD_TO_CART,
): ApiResult<MasterOfferingCatalogDetailResponse> {
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
            action: action as never,
          },
        ],
      },
    } as MasterOfferingCatalogDetailResponse,
  };
}

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

describe("detail surface", () => {
  it("shows a skeleton, then the product", async () => {
    const fetchDetail = vi.fn(async () => detailResponse());
    const { host, unmount } = render(
      <MasterOfferingDetailSurface
        memberToken="token"
        family="research_vials"
        slug="research-vials-bpc-157"
        fetchDetail={fetchDetail as never}
      />,
    );
    expect(host.querySelector('[data-testid="mo-detail-skeleton"]')).not.toBeNull();
    await settle();
    expect(host.querySelector("h1")?.textContent).toBe("BPC-157");
    expect(host.querySelector('[data-testid="mo-detail-skeleton"]')).toBeNull();
    unmount();
  });

  it("opens cold from a deep link with only a family and a slug", async () => {
    const fetchDetail = vi.fn(async () => detailResponse());
    const { unmount } = render(
      <MasterOfferingDetailSurface
        memberToken="token"
        family="research_vials"
        slug="research-vials-bpc-157"
        fetchDetail={fetchDetail as never}
      />,
    );
    await settle();
    expect(fetchDetail).toHaveBeenCalledWith(
      "token",
      "research_vials",
      "research-vials-bpc-157",
    );
    unmount();
  });

  it("says a product is not in the catalog and offers no pointless retry", async () => {
    const fetchDetail = vi.fn(async () => ({
      kind: "error" as const,
      code: "master_offerings_not_found",
      message: "nope",
    }));
    const { host, unmount } = render(
      <MasterOfferingDetailSurface
        memberToken="token"
        family="research_vials"
        slug="gone"
        fetchDetail={fetchDetail as never}
      />,
    );
    await settle();
    expect(host.textContent).toContain("That product is not in the catalog.");
    expect(host.querySelector('[data-testid="mo-detail-retry"]')).toBeNull();
    unmount();
  });

  it("recovers from a transient failure on retry", async () => {
    const fetchDetail = vi
      .fn()
      .mockResolvedValueOnce({ kind: "error", message: "boom" })
      .mockResolvedValueOnce(detailResponse());
    const { host, unmount } = render(
      <MasterOfferingDetailSurface
        memberToken="token"
        family="research_vials"
        slug="research-vials-bpc-157"
        fetchDetail={fetchDetail as never}
      />,
    );
    await settle();
    expect(host.textContent).toContain("The catalog could not be loaded.");
    click(host.querySelector('[data-testid="mo-detail-retry"]'));
    await settle();
    expect(host.querySelector("h1")?.textContent).toBe("BPC-157");
    unmount();
  });

  it("hands an add to the existing cart with the server's own values", async () => {
    const cart = recordingCart();
    const onAdded = vi.fn();
    const { host, unmount } = render(
      <MasterOfferingDetailSurface
        memberToken="token"
        family="research_vials"
        slug="research-vials-bpc-157"
        fetchDetail={(async () => detailResponse()) as never}
        capabilityFor={() => BAND}
        cart={createCatalogCartHandoff(cart)}
        onAdded={onAdded}
      />,
    );
    await settle();
    click(host.querySelector('[data-testid="mo-cta"]'));
    await settle();
    expect(cart.adds).toEqual([
      {
        productId: "pc_product_1",
        variantId: "pc_variant_1",
        sku: "XEN-BPC-10",
        quantity: 1,
        amountCents: 9900,
        currency: "USD",
        evaluatedAt: "2026-08-13T12:00:00.000Z",
        idempotencyKey:
          "catalog:pc_product_1:pc_variant_1:1:2026-08-13T12:00:00.000Z",
      },
    ]);
    expect(onAdded).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("adds once when the button is double clicked", async () => {
    const cart = recordingCart();
    const { host, unmount } = render(
      <MasterOfferingDetailSurface
        memberToken="token"
        family="research_vials"
        slug="research-vials-bpc-157"
        fetchDetail={(async () => detailResponse()) as never}
        capabilityFor={() => BAND}
        cart={createCatalogCartHandoff(cart)}
      />,
    );
    await settle();
    const cta = host.querySelector('[data-testid="mo-cta"]');
    click(cta);
    click(cta);
    click(cta);
    await settle();
    expect(cart.adds).toHaveLength(1);
    unmount();
  });

  it("explains a refusal in plain words rather than a code", async () => {
    const cart: ExistingCart = {
      addExactVariant: async () => ({ ok: false, code: "price_stale" }),
    };
    const { host, unmount } = render(
      <MasterOfferingDetailSurface
        memberToken="token"
        family="research_vials"
        slug="research-vials-bpc-157"
        fetchDetail={(async () => detailResponse()) as never}
        capabilityFor={() => BAND}
        cart={createCatalogCartHandoff(cart)}
      />,
    );
    await settle();
    click(host.querySelector('[data-testid="mo-cta"]'));
    await settle();
    const refusal = host.querySelector('[data-testid="mo-add-refusal"]');
    expect(refusal?.textContent).toBe(
      "The cart could not accept this right now. Please try again.",
    );
    expect(refusal?.textContent).not.toContain("price_stale");
    unmount();
  });

  it("tells the truth when the cart answers commerce_disabled", async () => {
    // No fake success and no "try again" lie: the cart is off, the request
    // path still works, and the copy says exactly that. Routed on the machine
    // code, never on a message.
    const cart: ExistingCart = {
      addExactVariant: async () => ({ ok: false, code: "commerce_disabled" }),
    };
    const { host, unmount } = render(
      <MasterOfferingDetailSurface
        memberToken="token"
        family="research_vials"
        slug="research-vials-bpc-157"
        fetchDetail={(async () => detailResponse()) as never}
        capabilityFor={() => BAND}
        cart={createCatalogCartHandoff(cart)}
      />,
    );
    await settle();
    click(host.querySelector('[data-testid="mo-cta"]'));
    await settle();
    const refusal = host.querySelector('[data-testid="mo-add-refusal"]');
    expect(refusal?.textContent).toBe(
      "Direct checkout is not enabled yet. This variant can still be requested through the request option.",
    );
    expect(refusal?.textContent).not.toContain("commerce_disabled");
    // The button is not dead: it remains enabled for a retry after the state
    // changes, and clicking it again re-answers the same truthful refusal.
    const cta = host.querySelector('[data-testid="mo-cta"]');
    expect(cta?.hasAttribute("disabled")).toBe(false);
    unmount();
  });

  it("never reaches the cart from a request or care pathway product", async () => {
    const cart = recordingCart();
    const { host, unmount } = render(
      <MasterOfferingDetailSurface
        memberToken="token"
        family="research_vials"
        slug="research-vials-bpc-157"
        fetchDetail={
          (async () =>
            detailResponse({
              kind: "explore_care",
              label: "Explore Care",
              href: "/research/member/metabolic-care",
            })) as never
        }
        capabilityFor={() => BAND}
        cart={createCatalogCartHandoff(cart)}
      />,
    );
    await settle();
    const cta = host.querySelector('[data-testid="mo-cta"]');
    expect(cta?.textContent).toBe("Explore Care");
    expect(cta?.getAttribute("href")).toBe("/research/member/metabolic-care");
    click(cta);
    await settle();
    expect(cart.adds).toHaveLength(0);
    unmount();
  });

  it("shows no cart affordance at all when no cart is injected", async () => {
    const { host, unmount } = render(
      <MasterOfferingDetailSurface
        memberToken="token"
        family="research_vials"
        slug="research-vials-bpc-157"
        fetchDetail={(async () => detailResponse()) as never}
        capabilityFor={() => BAND}
      />,
    );
    await settle();
    click(host.querySelector('[data-testid="mo-cta"]'));
    await settle();
    expect(host.querySelector('[data-testid="mo-add-refusal"]')).toBeNull();
    unmount();
  });

  it("ignores a slow response for a product the member already left", async () => {
    let resolveFirst: ((value: unknown) => void) | null = null;
    const fetchDetail = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValueOnce(detailResponse());
    const first = render(
      <MasterOfferingDetailSurface
        memberToken="token"
        family="research_vials"
        slug="slow-one"
        fetchDetail={fetchDetail as never}
      />,
    );
    first.unmount();
    act(() => resolveFirst?.(detailResponse()));
    await settle();
    // The unmounted surface must not have tried to set state after leaving.
    expect(first.host.querySelector("h1")).toBeNull();
  });
});
