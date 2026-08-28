import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_MASTER_OFFERING_SORT,
  EMPTY_MASTER_OFFERING_FACETS,
  type MasterOfferingAction,
  type MasterOfferingCardView,
  type MasterOfferingCatalogPage,
  type MasterOfferingDetailView,
  type MasterOfferingDisplayState,
  type MasterOfferingVariantSummary,
} from "@shared/research/master-offerings/contract";
import {
  MASTER_OFFERING_DISPLAY_LABELS,
} from "@shared/research/master-offerings/contract";
import {
  MASTER_OFFERING_PRICE_ON_REQUEST,
  type MasterOfferingPriceView,
} from "@shared/research/master-offerings/pricing-contract";

/**
 * Fixtures for the catalog presentation tests.
 *
 * Every fixture is a plain member-safe DTO of the shape the server already
 * emits. Nothing here is a workbook row, an activation record, or a binding;
 * the tests that use these are testing what the browser DOES with a verdict,
 * never how a verdict is reached.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

export function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return {
    host,
    rerender: (next: React.ReactElement) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

export function click(element: Element | null | undefined) {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

export function select(element: HTMLSelectElement | null, value: string) {
  if (!element) throw new Error("select element missing");
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export function type(element: HTMLInputElement | null, value: string) {
  if (!element) throw new Error("input element missing");
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export const PRICED: MasterOfferingPriceView = {
  state: "priced",
  basis: "exact_listed_unit",
  amountCents: 9900,
  currency: "USD",
  display: "$99.00",
  priceId: "price_1",
  priceVersion: 1,
  effectiveAt: "2026-08-01T00:00:00.000Z",
  expiresAt: null,
};

export const ON_REQUEST: MasterOfferingPriceView = MASTER_OFFERING_PRICE_ON_REQUEST;

export const ADD_TO_CART: Extract<MasterOfferingAction, { kind: "add_to_cart" }> =
  {
    kind: "add_to_cart",
    label: "Add to Cart",
    productId: "prod_1",
    variantId: "var_1",
    sku: "GEN-GRP-0001",
    amount: { amountCents: 9900, currency: "USD" },
    evaluatedAt: "2026-08-28T12:00:00.000Z",
  };

export const REQUEST_HREF = "/research/member/product-requests/new";
export const CARE_HREF = "/research/care";

export const ACTIONS: Readonly<Record<MasterOfferingAction["kind"], MasterOfferingAction>> = {
  add_to_cart: ADD_TO_CART,
  request_access: { kind: "request_access", label: "Request Access", href: REQUEST_HREF },
  request_early_access_purchase: {
    kind: "request_early_access_purchase",
    label: "Request Early Access Purchase",
    href: REQUEST_HREF,
  },
  apply: { kind: "apply", label: "Apply", href: "/research/apply" },
  notify_me: { kind: "notify_me", label: "Notify Me", href: REQUEST_HREF },
  join_waitlist: { kind: "join_waitlist", label: "Join Waitlist", href: REQUEST_HREF },
  explore_care: { kind: "explore_care", label: "Explore Care", href: CARE_HREF },
  get_updates: { kind: "get_updates", label: "Get Updates", href: "/research/updates" },
  none: { kind: "none", label: null, href: null },
};

export function variant(
  overrides: Partial<MasterOfferingVariantSummary> = {},
): MasterOfferingVariantSummary {
  const displayState: MasterOfferingDisplayState =
    overrides.displayState ?? "available_now";
  return {
    id: "mov_a",
    label: "5 mg vial",
    displayState,
    displayLabel: MASTER_OFFERING_DISPLAY_LABELS[displayState],
    price: PRICED,
    action: ACTIONS.request_access,
    ...overrides,
  };
}

export function card(
  overrides: Partial<MasterOfferingCardView> = {},
): MasterOfferingCardView {
  const displayState: MasterOfferingDisplayState =
    overrides.displayState ?? "available_now";
  const variants = overrides.variants ?? [variant()];
  return {
    id: "mo_1",
    slug: "research-vials-bpc-157",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    family: "research_vials",
    familyLabel: "Research Vials",
    category: "Peptides & Research",
    subcategory: "Single peptide",
    brand: null,
    displayState,
    displayLabel: MASTER_OFFERING_DISPLAY_LABELS[displayState],
    stateExplanation: "What the catalog can say about this row.",
    copyState: "approved",
    variantCount: variants.length,
    variants,
    priceSummary: {
      state: "single",
      variantCount: variants.length,
      pricedVariantCount: 1,
      currency: "USD",
      fromCents: 9900,
      toCents: 9900,
      display: "$99.00",
    },
    ...overrides,
  };
}

export function detail(
  overrides: Partial<MasterOfferingDetailView> = {},
): MasterOfferingDetailView {
  return {
    ...card(overrides),
    overview: null,
    disclosures: ["A listing is not a promise of stock."],
    ...overrides,
  };
}

export function page(
  overrides: Partial<MasterOfferingCatalogPage> = {},
): MasterOfferingCatalogPage {
  const products = overrides.products ?? [card()];
  return {
    ok: true,
    page: 1,
    pageSize: 24,
    total: products.length,
    totalPages: 1,
    sort: DEFAULT_MASTER_OFFERING_SORT,
    products,
    facets: EMPTY_MASTER_OFFERING_FACETS,
    ...overrides,
  };
}

/** Set the viewport width jsdom reports, for the mobile tests. */
export function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}
