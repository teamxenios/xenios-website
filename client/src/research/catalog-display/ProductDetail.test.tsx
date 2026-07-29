// @vitest-environment jsdom
// The product detail view: accessible variant selection, truthful state, and
// the two rules that keep the page honest (no peptide price, and research
// context never rendered without its disclosure).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type {
  DisplayProductDetail,
  DisplayVariant,
} from "@shared/research/catalog-display/contract";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ProductDetail } from "./ProductDetail";
import {
  CATALOG_ERROR_COPY,
  CATALOG_LOADING_COPY,
  PEPTIDE_PRICE_PENDING_COPY,
  PRODUCT_NOT_FOUND_COPY,
} from "./labels";
import { PRICE_UNAVAILABLE_COPY } from "../pricing/format";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(node: ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container!;
}

function variant(overrides: Partial<DisplayVariant> = {}): DisplayVariant {
  return {
    id: "R360-BPC157-5MG-VIAL",
    label: "5mg vial",
    strength: "5mg",
    size: "5mg",
    format: "vial",
    availability: "APPROVAL_REQUIRED_PURCHASE",
    memberEligible: true,
    ...overrides,
  };
}

function peptideDetail(overrides: Partial<DisplayProductDetail> = {}): DisplayProductDetail {
  return {
    lane: "peptide",
    slug: "bpc-157",
    displayName: "BPC-157",
    canonicalName: "BPC-157 (pentadecapeptide BPC-157)",
    category: "Repair",
    brand: null,
    collections: [],
    availability: "APPROVAL_REQUIRED_PURCHASE",
    price: null,
    variantCount: 2,
    positioning: "The repair peptide the range is built around.",
    overview: "One vial at the strength the founder workbook records.",
    researchContext: ["Tissue repair literature", "Anti-fibrotic signalling research"],
    storageAndHandling: "Handling follows the profile recorded against each lot.",
    whyItPairs: null,
    disclosures: [
      "Research context lists the published fields a compound appears in.",
      "Every item in this catalog is held to the same documentation gate.",
    ],
    variants: [
      variant(),
      variant({
        id: "R360-BPC157-10MG-VIAL",
        label: "10mg vial",
        strength: "10mg",
        size: "10mg",
        availability: "REQUEST_ACCESS_ONLY",
      }),
    ],
    ...overrides,
  };
}

function supplementDetail(overrides: Partial<DisplayProductDetail> = {}): DisplayProductDetail {
  return {
    lane: "supplement",
    slug: "mito-recharge",
    displayName: "Mito Recharge",
    canonicalName: "Mito Recharge",
    category: "mitochondrial",
    brand: "NutriDyn",
    collections: ["mitochondrial-longevity"],
    availability: "APPROVAL_REQUIRED_PURCHASE",
    price: { amountCents: 6450, currency: "USD" },
    variantCount: 0,
    positioning: "The workbook's phase one anchor for the mitochondrial protocol.",
    overview: "Mito Recharge is the formula the workbook opens the protocol with.",
    researchContext: [],
    storageAndHandling: null,
    whyItPairs: "It sits in the mitochondrial and longevity bundle.",
    disclosures: ["Every item in this catalog is held to the same documentation gate."],
    variants: [],
    ...overrides,
  };
}

describe("ProductDetail states", () => {
  it("announces loading without showing a product or a number", () => {
    const dom = render(<ProductDetail loading />);
    expect(dom.querySelector('[data-testid="product-detail-loading"]')?.getAttribute("role")).toBe(
      "status",
    );
    expect(dom.textContent).toContain(CATALOG_LOADING_COPY);
    expect(dom.textContent).not.toMatch(/\$\d/);
  });

  it("renders an alert on error, never a raw error string", () => {
    const dom = render(<ProductDetail error />);
    const alert = dom.querySelector('[data-testid="product-detail-error"]');
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toBe(CATALOG_ERROR_COPY);
  });

  it("says a missing product is not available on this account", () => {
    const dom = render(<ProductDetail product={null} />);
    expect(dom.querySelector('[data-testid="product-detail-missing"]')?.textContent).toBe(
      PRODUCT_NOT_FOUND_COPY,
    );
  });
});

describe("ProductDetail variant selection", () => {
  it("renders a labelled radio group with one accessible option per presentation", () => {
    const dom = render(<ProductDetail product={peptideDetail()} />);
    const fieldset = dom.querySelector('[data-testid="product-detail-variants"]');
    expect(fieldset?.tagName).toBe("FIELDSET");
    expect(fieldset?.querySelector("legend")?.textContent).toBe("Choose a presentation");

    const radios = Array.from(dom.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios).toHaveLength(2);
    // One radio group, so arrow keys move within it and Tab leaves it.
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
    for (const radio of radios) {
      // Every input has a real label bound by htmlFor, so it has an
      // accessible name and its whole row is a click target.
      const label = dom.querySelector<HTMLLabelElement>(`label[for="${radio.id}"]`);
      expect(label, radio.id).not.toBeNull();
      expect((label?.textContent ?? "").length).toBeGreaterThan(0);
    }
  });

  it("selects the first presentation by default", () => {
    const dom = render(<ProductDetail product={peptideDetail()} />);
    const radios = Array.from(dom.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
  });

  it("moves the selection and the shown availability when a presentation changes", () => {
    const chosen: string[] = [];
    const dom = render(
      <ProductDetail
        product={peptideDetail()}
        onVariantChange={(next) => chosen.push(next.id)}
      />,
    );
    expect(dom.querySelector('[data-testid="product-detail-availability-text"]')?.textContent).toBe(
      "Available by approval",
    );

    const radios = Array.from(dom.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    act(() => {
      radios[1].click();
    });

    expect(chosen).toEqual(["R360-BPC157-10MG-VIAL"]);
    expect(radios[1].checked).toBe(true);
    // The header badge follows the selection, so the words on screen describe
    // the presentation the member is actually looking at.
    expect(dom.querySelector('[data-testid="product-detail-availability-text"]')?.textContent).toBe(
      "Request access",
    );
  });

  it("states each presentation's own availability in words", () => {
    const dom = render(<ProductDetail product={peptideDetail()} />);
    const lines = Array.from(
      dom.querySelectorAll('[data-testid$="-availability"]'),
    ).map((node) => node.textContent);
    expect(lines).toContain("Availability: Available by approval");
    expect(lines).toContain("Availability: Request access");
  });

  it("says so plainly when a record has one presentation and no options", () => {
    const dom = render(<ProductDetail product={supplementDetail()} />);
    expect(dom.querySelector('[data-testid="product-detail-variants"]')).toBeNull();
    expect(dom.querySelector('[data-testid="product-detail-no-variants"]')?.textContent).toContain(
      "one presentation",
    );
  });
});

describe("ProductDetail truthfulness", () => {
  it("shows no peptide price, and says why", () => {
    const dom = render(<ProductDetail product={peptideDetail()} />);
    expect(dom.querySelector('[data-testid="product-detail-amount-pending"]')?.textContent).toBe(
      PEPTIDE_PRICE_PENDING_COPY,
    );
    expect(dom.textContent).not.toMatch(/\$\d/);
  });

  it("shows a founder approved supplement amount with its accessible phrase", () => {
    const dom = render(<ProductDetail product={supplementDetail()} />);
    const value = dom.querySelector('[data-testid="product-detail-amount-value"]');
    expect(value?.textContent).toBe("$64.50");
    expect(value?.getAttribute("aria-label")).toBe("Price: $64.50 for members");
  });

  it("never renders a zero, whatever the record carries", () => {
    for (const amountCents of [0, -1, 0.5]) {
      const dom = render(
        <ProductDetail
          product={supplementDetail({ price: { amountCents, currency: "USD" } as never })}
        />,
      );
      expect(dom.textContent, String(amountCents)).toContain(PRICE_UNAVAILABLE_COPY);
      expect(dom.textContent, String(amountCents)).not.toContain("$0");
      act(() => root!.unmount());
      container?.remove();
      root = null;
      container = null;
    }
  });

  it("withholds the amount when the mode denies one", () => {
    const dom = render(
      <ProductDetail
        product={supplementDetail({ availability: "REQUEST_ACCESS_ONLY", price: null })}
      />,
    );
    expect(dom.querySelector('[data-testid="product-detail-availability-text"]')?.textContent).toBe(
      "Request access",
    );
    expect(dom.textContent).toContain(PRICE_UNAVAILABLE_COPY);
    expect(dom.textContent).not.toMatch(/\$\d/);
  });

  it("never renders research context without its disclosure", () => {
    const dom = render(<ProductDetail product={peptideDetail()} />);
    expect(dom.querySelector('[data-testid="product-detail-research-context"]')).not.toBeNull();
    const disclosures = dom.querySelector('[data-testid="product-detail-disclosures"]');
    expect(disclosures?.textContent).toContain("Research context lists");
    expect(disclosures?.textContent).toContain("documentation gate");
  });

  it("falls back to the weakest statement for a mode off the enum", () => {
    const dom = render(
      <ProductDetail
        product={supplementDetail({ availability: "TOTALLY_FINE_TO_BUY" as never, price: null })}
      />,
    );
    expect(dom.querySelector('[data-testid="product-detail-availability-text"]')?.textContent).toBe(
      "Not currently available",
    );
  });

  it("gives the section a heading it is labelled by", () => {
    const dom = render(<ProductDetail product={supplementDetail()} />);
    const section = dom.querySelector('[data-testid="product-detail"]');
    const headingId = section?.getAttribute("aria-labelledby");
    expect(headingId).toBeTruthy();
    expect(dom.querySelector(`#${headingId}`)?.textContent).toBe("Mito Recharge");
  });
});
