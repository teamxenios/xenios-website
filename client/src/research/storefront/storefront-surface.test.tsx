// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_MASTER_OFFERING_SORT } from "@shared/research/master-offerings/contract";
import {
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY,
} from "@shared/research/early-access-quantity";
import {
  EMPTY_PUBLIC_STOREFRONT_FACETS,
  type PublicStorefrontCard,
  type PublicStorefrontCatalogResponse,
  type PublicStorefrontDetail,
  type PublicStorefrontDetailResponse,
  type PublicStorefrontVariant,
} from "@shared/research/storefront/contract";
import type { CustomerAction } from "@shared/research/launch/customer-action";
import type { ApiResult } from "../lib/api";
import type { CatalogHistory } from "../master-offerings/useCatalogQueryState";
import { StorefrontCatalogSurface } from "./StorefrontCatalogSurface";
import { StorefrontProductSurface } from "./StorefrontProductRoute";

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
  });
}

function testHistory(initial = ""): CatalogHistory {
  return recordingHistory(initial).history;
}

function recordingHistory(initial = "") {
  let search = initial;
  const listeners: Array<() => void> = [];
  const pushes: string[] = [];
  const replacements: string[] = [];
  return {
    history: {
      search: () => search,
      push(next: string) {
        search = next;
        pushes.push(next);
      },
      replace(next: string) {
        search = next;
        replacements.push(next);
      },
      subscribe(listener: () => void) {
        listeners.push(listener);
        return () => {
          const at = listeners.indexOf(listener);
          if (at >= 0) listeners.splice(at, 1);
        };
      },
    } satisfies CatalogHistory,
    pushes,
    replacements,
    navigate(next: string) {
      search = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

function variant(
  overrides: Partial<PublicStorefrontVariant> = {},
): PublicStorefrontVariant {
  return {
    id: "mov_v1",
    label: "10 mg vial",
    displayLabel: "Available now",
    displayState: "available_now",
    action: "BUY_NOW",
    price: { state: "priced", amountCents: 9900, currency: "USD", display: "$99.00" },
    ...overrides,
  };
}

function card(
  overrides: Partial<PublicStorefrontCard> = {},
): PublicStorefrontCard {
  const variants = overrides.variants ?? [variant()];
  return {
    slug: "research-vials-bpc-157",
    family: "research_vials",
    familyLabel: "Research Vials",
    displayName: "BPC-157",
    category: "Peptides & Research",
    subcategory: "Single peptide",
    displayState: "available_now",
    displayLabel: "Available now",
    stateExplanation: "Ready to order.",
    variantCount: variants.length,
    variants,
    priceSummary: "$99.00",
    action: "BUY_NOW",
    ...overrides,
  };
}

function detail(
  overrides: Partial<PublicStorefrontDetail> = {},
): PublicStorefrontDetail {
  return {
    ...card(),
    overview: "An overview.",
    disclosures: ["Research use only."],
    ...overrides,
  };
}

function catalogOk(
  products: readonly PublicStorefrontCard[],
): () => Promise<ApiResult<PublicStorefrontCatalogResponse>> {
  return async () => ({
    kind: "ok",
    data: {
      ok: true,
      catalog: {
        page: 1,
        pageSize: 24,
        total: products.length,
        totalPages: 1,
        sort: DEFAULT_MASTER_OFFERING_SORT,
        products,
        facets: EMPTY_PUBLIC_STOREFRONT_FACETS,
      },
    },
  });
}

describe("public catalog surface", () => {
  it("offers an accessible mobile filter toggle and debounces search", async () => {
    vi.useFakeTimers();
    try {
      const fetchCatalog = vi.fn(catalogOk([card()]));
      const view = render(
        <StorefrontCatalogSurface
          history={testHistory()}
          fetchCatalog={fetchCatalog}
        />,
      );
      await settle();

      const toggle = view.host.querySelector<HTMLButtonElement>(
        '[data-testid="sf-filter-toggle"]',
      );
      expect(toggle?.getAttribute("aria-controls")).toBe("sf-filter-fields");
      expect(toggle?.getAttribute("aria-expanded")).toBe("false");
      act(() => toggle?.click());
      expect(toggle?.getAttribute("aria-expanded")).toBe("true");

      const search = view.host.querySelector<HTMLInputElement>(
        '[data-testid="sf-search"]',
      );
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(search, "bpc");
      act(() => search?.dispatchEvent(new Event("input", { bubbles: true })));
      expect(fetchCatalog).toHaveBeenCalledTimes(1);
      act(() => vi.advanceTimersByTime(249));
      expect(fetchCatalog).toHaveBeenCalledTimes(1);
      await act(async () => {
        vi.advanceTimersByTime(1);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(fetchCatalog).toHaveBeenLastCalledWith({ q: "bpc" });
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces debounced search history, pushes filters, and cancels search on Back", async () => {
    vi.useFakeTimers();
    try {
      const recorded = recordingHistory("?q=old");
      const fetchCatalog = vi.fn(catalogOk([card()]));
      const view = render(
        <StorefrontCatalogSurface
          history={recorded.history}
          fetchCatalog={fetchCatalog}
        />,
      );
      await settle();

      const inputSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      const search = view.host.querySelector<HTMLInputElement>(
        '[data-testid="sf-search"]',
      );
      inputSetter?.call(search, "updated");
      act(() => search?.dispatchEvent(new Event("input", { bubbles: true })));
      await act(async () => {
        vi.advanceTimersByTime(250);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(recorded.replacements).toEqual(["?q=updated"]);
      expect(recorded.pushes).toEqual([]);

      const selectSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value",
      )?.set;
      const sort = view.host.querySelector<HTMLSelectElement>(
        '[data-testid="sf-sort"]',
      );
      selectSetter?.call(sort, "name_asc");
      act(() => sort?.dispatchEvent(new Event("change", { bubbles: true })));
      expect(recorded.pushes).toEqual([
        "?q=updated&sort=name_asc",
      ]);

      inputSetter?.call(search, "stale");
      act(() => search?.dispatchEvent(new Event("input", { bubbles: true })));
      act(() => recorded.navigate("?q=back"));
      expect(search?.value).toBe("back");
      await act(async () => {
        vi.advanceTimersByTime(250);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(recorded.replacements).toEqual(["?q=updated"]);
      expect(fetchCatalog).toHaveBeenLastCalledWith({ q: "back" });
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders cards with server prices and never invents one", async () => {
    const view = render(
      <StorefrontCatalogSurface
        history={testHistory()}
        fetchCatalog={catalogOk([
          card(),
          card({
            slug: "blends-wolverine",
            displayName: "Wolverine Blend",
            priceSummary: "Price on request",
            action: "REQUEST_QUOTE",
            variants: [
              variant({ id: "v_q", action: "REQUEST_QUOTE", price: { state: "on_request" } }),
            ],
          }),
        ])}
      />,
    );
    await settle();
    const text = view.host.textContent ?? "";
    expect(text).toContain("BPC-157");
    expect(text).toContain("$99.00");
    expect(text).toContain("Price on request");
    expect(text).not.toContain("$0.00");
    expect(view.host.querySelectorAll('[data-testid="sf-card"]')).toHaveLength(2);
    for (const testId of [
      "sf-card-link",
      "sf-catalog-signin",
      "sf-catalog-apply",
    ]) {
      const target = view.host.querySelector<HTMLElement>(
        `[data-testid="${testId}"]`,
      );
      expect(target?.className).toContain("min-h-[44px]");
      expect(target?.className).toContain("min-w-[44px]");
    }
    // ResearchLayout supplies the page-level main landmark.
    expect(view.host.querySelector("main")).toBeNull();
    view.unmount();
  });

  it("gives every card a real next step, never a dead end", async () => {
    const actions: CustomerAction[] = [
      "BUY_NOW",
      "ASSISTED_ORDER",
      "REQUEST_QUOTE",
      "CARE",
      "TEMPORARILY_HELD",
      "NOT_AVAILABLE",
    ];
    const view = render(
      <StorefrontCatalogSurface
        history={testHistory()}
        fetchCatalog={catalogOk(
          actions.map((action, index) =>
            card({
              slug: `product-${index}`,
              displayName: `Product ${index}`,
              action,
              variants: [variant({ id: `v${index}`, action })],
            }),
          ),
        )}
      />,
    );
    await settle();
    for (const cardEl of Array.from(
      view.host.querySelectorAll('[data-testid="sf-card"]'),
    )) {
      const cta = cardEl.querySelector('[data-testid="sf-card-cta"]');
      const status = cardEl.querySelector('[data-testid="sf-card-status"]');
      const details = cardEl.querySelector('[data-testid="sf-card-details"]');
      // Either an action button, or a status in words PLUS a way to the page.
      expect(cta !== null || (status !== null && details !== null)).toBe(true);
      expect((cardEl.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
    view.unmount();
  });

  it("a closed storefront still offers sign-in and apply", async () => {
    const view = render(
      <StorefrontCatalogSurface
        history={testHistory()}
        fetchCatalog={async () => ({ kind: "unavailable" })}
      />,
    );
    await settle();
    expect(view.host.textContent).toContain("not open yet");
    expect(
      view.host.querySelector('[data-testid="sf-closed-signin"]'),
    ).not.toBeNull();
    expect(
      view.host.querySelector('[data-testid="sf-closed-apply"]'),
    ).not.toBeNull();
    view.unmount();
  });

  it("shows an honest empty state with a way out", async () => {
    const view = render(
      <StorefrontCatalogSurface
        history={testHistory("?q=nothingmatches")}
        fetchCatalog={catalogOk([])}
      />,
    );
    await settle();
    expect(view.host.textContent).toContain("Nothing matches your search");
    expect(view.host.querySelector('[data-testid="sf-clear"]')).not.toBeNull();
    view.unmount();
  });

  it("drops a pasted member-only states filter instead of failing the page", async () => {
    const fetchCatalog = vi.fn(catalogOk([card()]));
    const view = render(
      <StorefrontCatalogSurface
        history={testHistory("?q=bpc&states=available_now")}
        fetchCatalog={fetchCatalog}
      />,
    );
    await settle();
    expect(fetchCatalog).toHaveBeenCalled();
    expect(view.host.textContent).toContain("BPC-157");
    view.unmount();
  });
});

describe("public product surface", () => {
  const okDetail = (product: PublicStorefrontDetail) =>
    async (): Promise<ApiResult<PublicStorefrontDetailResponse>> => ({
      kind: "ok",
      data: { ok: true, product },
    });

  it("carries the selection into sign-in for an orderable variant", async () => {
    const view = render(
      <StorefrontProductSurface
        family="research_vials"
        slug="research-vials-bpc-157"
        fetchDetail={okDetail(detail())}
      />,
    );
    await settle();
    const cta = view.host.querySelector(
      '[data-testid="sf-detail-cta"]',
    ) as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toBe("Order");
    const href = cta!.getAttribute("href") ?? "";
    expect(href.startsWith("/research/sign-in?returnTo=")).toBe(true);
    const returnTo = decodeURIComponent(
      href.slice("/research/sign-in?returnTo=".length),
    );
    expect(returnTo).toBe(
      "/research/member/catalog/research_vials/research-vials-bpc-157?variant=mov_v1&qty=1&intent=buy_now",
    );
    expect(
      view.host.querySelector('[data-testid="catalog-evidence-notice"]')?.textContent,
    ).toContain("No lot-specific COA is attached to this catalog view.");
    for (const testId of [
      "sf-back-to-catalog",
      "sf-detail-early-access",
      "sf-detail-apply",
    ]) {
      const target = view.host.querySelector<HTMLElement>(
        `[data-testid="${testId}"]`,
      );
      expect(target?.className).toContain("min-h-[44px]");
      expect(target?.className).toContain("min-w-[44px]");
    }
    expect(view.host.querySelector("main")).toBeNull();
    view.unmount();
  });

  it("routes a Care variant to Care, never to a purchase", async () => {
    const view = render(
      <StorefrontProductSurface
        family="research_vials"
        slug="research-vials-bpc-157"
        fetchDetail={okDetail(
          detail({
            action: "CARE",
            variants: [variant({ action: "CARE", price: { state: "on_request" } })],
          }),
        )}
      />,
    );
    await settle();
    const cta = view.host.querySelector('[data-testid="sf-detail-cta"]');
    expect(cta?.textContent).toBe("Continue through Care");
    expect(cta?.getAttribute("href")).toBe("/research/access-hub");
    expect(view.host.querySelector('[data-testid="sf-detail-quantity"]')).toBeNull();
    view.unmount();
  });

  it("keeps an invalid public quantity from creating a continuation link", async () => {
    const view = render(
      <StorefrontProductSurface
        family="research_vials"
        slug="research-vials-bpc-157"
        fetchDetail={okDetail(detail())}
      />,
    );
    await settle();
    const quantity = view.host.querySelector<HTMLInputElement>(
      '[data-testid="sf-detail-quantity"]',
    );
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(quantity, String(EARLY_ACCESS_MAX_QUANTITY + 1));
    act(() => quantity?.dispatchEvent(new Event("input", { bubbles: true })));
    const cta = view.host.querySelector<HTMLButtonElement>(
      '[data-testid="sf-detail-cta"]',
    );
    expect(cta?.tagName).toBe("BUTTON");
    expect(cta?.disabled).toBe(true);
    expect(cta?.getAttribute("href")).toBeNull();
    const describedBy = quantity?.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(view.host.querySelector(`#${describedBy}`)).not.toBeNull();
    expect(view.host.textContent).toContain(
      `Choose between ${EARLY_ACCESS_MIN_QUANTITY} and ${EARLY_ACCESS_MAX_QUANTITY}.`,
    );
    view.unmount();
  });

  it("resets invalid quantity when the visitor chooses another variant", async () => {
    const view = render(
      <StorefrontProductSurface
        family="research_vials"
        slug="research-vials-bpc-157"
        fetchDetail={okDetail(
          detail({
            variants: [
              variant(),
              variant({ id: "mov_v2", label: "20 mg vial" }),
            ],
          }),
        )}
      />,
    );
    await settle();
    const quantity = view.host.querySelector<HTMLInputElement>(
      '[data-testid="sf-detail-quantity"]',
    );
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(quantity, "");
    act(() => quantity?.dispatchEvent(new Event("input", { bubbles: true })));
    expect(
      view.host.querySelector<HTMLButtonElement>('[data-testid="sf-detail-cta"]')
        ?.disabled,
    ).toBe(true);

    const nextVariant = view.host.querySelector<HTMLInputElement>(
      'input[name="sf-variant"][value="mov_v2"]',
    );
    act(() => nextVariant?.click());
    expect(
      view.host.querySelector<HTMLInputElement>(
        '[data-testid="sf-detail-quantity"]',
      )?.value,
    ).toBe(String(EARLY_ACCESS_MIN_QUANTITY));
    expect(
      view.host.querySelector('[data-testid="sf-detail-cta"]')?.tagName,
    ).toBe("A");
    view.unmount();
  });

  it("states a held variant truthfully and offers no order button", async () => {
    const view = render(
      <StorefrontProductSurface
        family="research_vials"
        slug="research-vials-bpc-157"
        fetchDetail={okDetail(
          detail({
            action: "TEMPORARILY_HELD",
            variants: [
              variant({ action: "TEMPORARILY_HELD", price: { state: "on_request" } }),
            ],
          }),
        )}
      />,
    );
    await settle();
    expect(view.host.querySelector('[data-testid="sf-detail-cta"]')).toBeNull();
    expect(view.host.textContent).toContain("temporarily unavailable");
    expect(view.host.textContent).toContain("future status change");
    expect(view.host.textContent).not.toContain("notified");
    expect(view.host.querySelector('[data-testid="sf-detail-apply"]')).not.toBeNull();
    view.unmount();
  });

  it("a missing product offers the catalog rather than a dead end", async () => {
    const view = render(
      <StorefrontProductSurface
        family="research_vials"
        slug="gone"
        fetchDetail={async () => ({ kind: "error", code: "storefront_not_found", message: "x" })}
      />,
    );
    await settle();
    expect(view.host.textContent).toContain("not in the catalog");
    expect(view.host.querySelector('[data-testid="sf-detail-browse"]')).not.toBeNull();
    view.unmount();
  });
});
