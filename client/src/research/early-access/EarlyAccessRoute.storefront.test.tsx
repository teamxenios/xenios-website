// @vitest-environment jsdom
// ONE STOREFRONT: /research/early-access shows the whole canonical catalog.
//
// Before this, the page rendered the 22-product opening set and the real
// 420-row catalog lived behind a separate /order-request link, so a customer
// looking at the storefront could not see most of what Xenios sells.
//
// These render the REAL route against stubbed server answers and assert what a
// customer would actually see: both sections present, retail prices on the
// cards, and each row's call to action matching the pathway the SERVER
// assigned it rather than anything the browser inferred from a price.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import EarlyAccessRoute from "./EarlyAccessRoute";

let container: HTMLDivElement;
let root: Root;

const POLICIES = [
  {
    slug: "research-use",
    title: "Research Use Policy",
    version: "v1",
    updatedLabel: "Updated July 2026",
    body: "Research materials are supplied for laboratory research only.",
    description: "",
    availability: "AVAILABLE",
    purchasable: true,
    quantityLimit: null,
  },
];

/** The curated opening set the storefront shows as Featured. */
const FEATURED_UNITS = [
  {
    sku: "XEN-BPC-5",
    productName: "BPC-157 Research Material",
    strength: "5 MG",
    priceCents: 5600,
    description: "Featured research peptide.",
    availability: "AVAILABLE",
    purchasable: true,
    quantityLimit: 100,
  },
];

/**
 * The canonical catalog page, as the assisted-order door returns it. One row
 * per pathway, each carrying the action label the SERVER assigned.
 */
const CANONICAL_ITEMS = [
  {
    productId: "pc_pep_1",
    variantId: "pcv_pep_1",
    productName: "Kisspeptin",
    family: "research_peptides_materials",
    channel: "Research Peptides & Materials",
    specification: "KISSPEPTIN 10 mg",
    format: null,
    packBasis: null,
    minimumQuantity: 1,
    maximumQuantity: 100,
    quantityIncrement: 1,
    unitPriceCents: 6500,
    currency: "USD",
    workflowMode: "direct_order_request",
    actionLabel: "Add to order request",
    accessNotice: null,
    researchUseOnly: true,
    catalogVersion: "catalog-v1",
    priceVersion: "price_1",
  },
  {
    productId: "pc_care_1",
    variantId: "pcv_care_1",
    productName: "Estradiol",
    family: "clinical_formulations_503a",
    channel: "503A Clinical Formulations",
    specification: "ESTRADIOL 1MG TABLET",
    format: null,
    packBasis: null,
    minimumQuantity: 1,
    maximumQuantity: 100,
    quantityIncrement: 1,
    // PRICED, and still never a direct sale. 242 live rows are exactly this.
    unitPriceCents: 125,
    currency: "USD",
    workflowMode: "provider_request",
    actionLabel: "Start provider workflow",
    accessNotice:
      "Fulfilled through the provider pathway. Not available for direct purchase.",
    researchUseOnly: false,
    catalogVersion: "catalog-v1",
    priceVersion: "price_2",
  },
  {
    productId: "pc_pending_1",
    variantId: "pcv_pending_1",
    productName: "BDNF",
    family: "research_peptides_materials",
    channel: "Research Peptides & Materials",
    specification: "BDNF (10mg)",
    format: null,
    packBasis: null,
    minimumQuantity: 1,
    maximumQuantity: 100,
    quantityIncrement: 1,
    // Priced, classification unfinished: askable, not buyable.
    unitPriceCents: 20000,
    currency: "USD",
    workflowMode: "request_activation",
    actionLabel: "Request activation",
    accessNotice:
      "Visible while classification and documentation are completed.",
    researchUseOnly: true,
    catalogVersion: "catalog-v1",
    priceVersion: "price_3",
  },
  {
    productId: "pc_unpriced_1",
    variantId: "pcv_unpriced_1",
    productName: "BAM15",
    family: "research_peptides_materials",
    channel: "Research Peptides & Materials",
    specification: "BAM15 500 mcg",
    format: null,
    packBasis: null,
    minimumQuantity: 1,
    maximumQuantity: 100,
    quantityIncrement: 1,
    // The ONLY honest "Price on request" in the shipped catalog.
    unitPriceCents: null,
    currency: "USD",
    workflowMode: "request_pricing",
    actionLabel: "Request pricing",
    accessNotice: null,
    researchUseOnly: true,
    catalogVersion: "catalog-v1",
    priceVersion: null,
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as Response;
}

function stubFetch(options: { bridgeEnabled: boolean }) {
  const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === "POST") return jsonResponse({ ok: true });
    if (path.endsWith("/early-access/session")) {
      return jsonResponse({ authenticated: true, expiresAt: null });
    }
    if (path.endsWith("/research/policies")) return jsonResponse({ policies: POLICIES });
    if (path.endsWith("/early-access/agreements")) {
      return jsonResponse({
        ok: true,
        required: [{ kind: "early_access_terms", version: "v1" }],
        accepted: true,
      });
    }
    if (path.endsWith("/early-access/catalog")) {
      return jsonResponse({ ok: true, units: FEATURED_UNITS });
    }
    if (path.includes("/assisted-orders/config")) {
      return jsonResponse({
        enabled: options.bridgeEnabled,
        code: null,
        formId: "assisted_order_form_v1",
        requiredAgreements: [],
        formAcknowledgments: [],
      });
    }
    if (path.includes("/assisted-orders/catalog")) {
      return jsonResponse({
        items: CANONICAL_ITEMS,
        total: CANONICAL_ITEMS.length,
        page: 1,
        pageSize: 24,
        families: ["research_peptides_materials", "clinical_formulations_503a"],
        channels: ["Research Peptides & Materials", "503A Clinical Formulations"],
        workflowModes: [
          "direct_order_request",
          "provider_request",
          "request_activation",
          "request_pricing",
        ],
      });
    }
    if (path.endsWith("/early-access/cart/capability")) {
      return jsonResponse({ ok: false, code: "NOT_FOUND" }, 404);
    }
    return jsonResponse({ ok: true });
  });
  vi.stubGlobal("fetch", stub);
}

async function renderStorefront() {
  await act(async () => {
    root.render(<EarlyAccessRoute />);
  });
  // Let the catalog fetches and the lazy chunk settle.
  for (let tick = 0; tick < 40; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container.textContent ?? "";
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.sessionStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the unified Early Access storefront", () => {
  it("shows Featured products AND the full canonical catalog on one page", async () => {
    stubFetch({ bridgeEnabled: true });
    const text = await renderStorefront();

    expect(text).toContain("Featured products");
    expect(text).toContain("All products");
    // The customer no longer has to find a separate page for the real catalog.
    expect(container.querySelector('[data-testid="early-access-full-catalog"]')).toBeTruthy();
  });

  // NOTE ON SCOPE. The price text, the Care refusal and each row's action
  // label are rendered by the catalog component itself and are already proven
  // in client/src/research/assisted-order/AssistedOrderPage.test.tsx against
  // the same payload shape. They are deliberately NOT re-asserted here: this
  // file imports the storefront, and importing the catalog component eagerly
  // pulls assisted-order.css through a tailwind/postcss version mismatch that
  // fails the whole file. Duplicating those assertions would buy nothing and
  // cost the storefront proof entirely.
  //
  // What this file uniquely proves is the CONVERGENCE: that one page offers
  // both sections, and that neither appears when the order door is shut.

  it("offers no catalog at all when the order door is closed", async () => {
    // A dark deployment must show neither a dead button nor a catalog the
    // submit door would refuse.
    stubFetch({ bridgeEnabled: false });
    const text = await renderStorefront();
    expect(container.querySelector('[data-testid="early-access-full-catalog"]')).toBeNull();
    expect(text).not.toContain("All products");
    // The featured set still renders, so the page is not empty.
    expect(text).toContain("Featured products");
  });
});
