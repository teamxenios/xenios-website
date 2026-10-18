// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type {
  MemberCatalog,
  MemberCatalogCard,
  MemberCatalogVariant,
  MemberProductDetail,
} from "@shared/research/member-catalog";
import {
  PeptideCatalogExperience,
  PeptideProductDetailExperience,
} from "./peptide-catalog-ui";

const AT = "2026-08-02T23:00:00.000Z";

function eligibleCard(overrides: Partial<MemberCatalogCard> = {}): MemberCatalogCard {
  return {
    id: "alpha",
    slug: "alpha",
    displayName: "Alpha Peptide",
    aliases: ["A-1"],
    lane: "research_material",
    category: "Single peptides",
    classification: "Research peptide / material",
    summary: "Reviewed Research catalog summary.",
    displayState: "available",
    media: {
      mediaId: "media-alpha",
      productId: "alpha",
      href: "https://media.xeniostechnology.com/media-alpha",
      altText: "Alpha Peptide exact vial",
      filename: "alpha.webp",
      sourceVersion: "media-v1",
      policy: "xenios_public_media_v1",
      expiresAt: null,
    },
    price: {
      id: "price-alpha",
      amountCents: 14900,
      currency: "USD",
      effectiveAt: "2026-08-01T00:00:00.000Z",
      expiresAt: null,
      version: 1,
    },
    readiness: {
      ready: true,
      verifiedInputCount: 1,
      inputVersions: [{ id: "input-alpha", version: 1 }],
      domainVersions: [{ domain: "products", version: 1 }],
    },
    selection: {
      productId: "alpha",
      variantId: "alpha-10",
      sku: "ALPHA-10",
      audience: "member",
      audienceEligibility: {
        audience: "member",
        state: "authorized",
        sourceVersion: "audience-v1",
        evaluatedAt: AT,
      },
      price: {
        id: "price-alpha",
        amountCents: 14900,
        currency: "USD",
        effectiveAt: "2026-08-01T00:00:00.000Z",
        expiresAt: null,
        version: 1,
      },
      media: {
        id: "media-alpha",
        kind: "primary_image",
        altText: "Alpha Peptide exact vial",
      },
      canonicalReadiness: {
        ready: true,
        verifiedInputCount: 1,
        inputVersions: [{ id: "input-alpha", version: 1 }],
        domainVersions: [{ domain: "products", version: 1 }],
      },
      inventoryEligibility: {
        productId: "alpha",
        variantId: "alpha-10",
        state: "eligible",
        sourceVersion: "inventory-v1",
        evaluatedAt: AT,
      },
      evaluatedAt: AT,
    },
    variantCount: 2,
    updatedAt: AT,
    ...overrides,
  };
}

const heldCard = eligibleCard({
  id: "held",
  slug: "held",
  displayName: "Held Peptide",
  aliases: ["H-1"],
  category: "Peptide blends",
  media: null,
  selection: null,
  updatedAt: "2026-08-01T23:00:00.000Z",
});

const pendingCard = eligibleCard({
  id: "pending",
  slug: "pending",
  displayName: "Pending Peptide",
  aliases: [],
  category: "Single peptides",
  displayState: "documentation_pending",
  media: null,
  price: null,
  readiness: null,
  selection: null,
  updatedAt: "2026-07-31T23:00:00.000Z",
});

const careCard = eligibleCard({
  id: "care",
  slug: "care",
  displayName: "Clinician Peptide Pathway",
  aliases: [],
  lane: "future_clinical",
  category: "Peptide pathways",
  classification: "Peptide pathway",
  displayState: "catalog_only",
  media: null,
  price: null,
  readiness: null,
  selection: null,
  variantCount: 0,
});

const supplementCard = eligibleCard({
  id: "supplement",
  slug: "supplement",
  displayName: "Not a Peptide",
  lane: "supplement",
  category: "Supplements",
  classification: "Supplement",
  media: null,
  price: null,
  readiness: null,
  selection: null,
});

const catalog: MemberCatalog = {
  audience: "member",
  currency: "USD",
  evaluatedAt: AT,
  categories: ["Single peptides", "Peptide blends", "Peptide pathways", "Supplements"],
  lanes: ["research_material", "future_clinical", "supplement"],
  items: [heldCard, eligibleCard(), pendingCard, careCard, supplementCard],
};

function eligibleVariant(): MemberCatalogVariant {
  const source = eligibleCard();
  return {
    id: "alpha-10",
    productId: "alpha",
    sku: "ALPHA-10",
    label: "10 mg vial",
    strength: "10 mg",
    size: "1 vial",
    format: "Lyophilized material",
    presentation: "Vial",
    shippingClass: "standard",
    price: source.price,
    availability: "available",
    lotCoaState: "verified",
    selection: source.selection,
    selectionFailure: null,
  };
}

function detail(): MemberProductDetail {
  return {
    ...eligibleCard(),
    audience: "member",
    currency: "USD",
    evaluatedAt: AT,
    canonicalName: "Alpha Peptide",
    overview: "Approved overview.",
    specifications: "Approved specifications.",
    researchInformation: "Approved Research information.",
    storageInformation: "Approved storage information.",
    shippingInformation: null,
    returnInformation: null,
    disclaimers: null,
    reviewDate: null,
    variants: [
      eligibleVariant(),
      {
        ...eligibleVariant(),
        id: "alpha-20",
        sku: "ALPHA-20",
        label: "20 mg vial",
        strength: "20 mg",
        price: null,
        availability: "unavailable",
        lotCoaState: "required",
        selection: null,
        selectionFailure: "price_unapproved",
      },
    ],
    relatedProducts: [heldCard, supplementCard],
    researchOnlyBoundary: true,
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState({}, "", "/research/member/products");
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

function setControlValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype =
    element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(
    new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
  );
}

describe("peptide catalog UI", () => {
  it("renders every peptide state, excludes other lanes, and never exposes a planning price", () => {
    const html = renderToStaticMarkup(<PeptideCatalogExperience catalog={catalog} />);
    expect(html).toContain("Peptides and research materials");
    expect(html).toContain("Alpha Peptide");
    expect(html).toContain("Held Peptide");
    expect(html).toContain("Pending Peptide");
    expect(html).toContain("Clinician Peptide Pathway");
    expect(html).not.toContain("Not a Peptide");
    expect(html).toContain("Eligible variant available");
    expect(html).toContain("Held");
    expect(html).toContain("Pending documentation");
    expect(html).toContain("Care only");
    expect(html).toContain("$149.00");
    expect(html.match(/\$149\.00/g)).toHaveLength(1);
    expect(html).toContain("Not published");
    expect(html).not.toMatch(/\$0(?:\.00)?|Add to cart|Buy now/i);
    expect(html).not.toMatch(/alpha\.webp|media-v1|inventory-v1|Source Notes|Inventory Quantity/);
  });

  it("searches aliases and filters by category and truthful access state", () => {
    const view = mount(<PeptideCatalogExperience catalog={catalog} />);
    const search = view.querySelector<HTMLInputElement>("#peptide-catalog-search")!;
    act(() => setControlValue(search, "H-1"));
    expect(view.textContent).toContain("Held Peptide");
    expect(view.textContent).not.toContain("Alpha Peptide");

    const clear = Array.from(view.querySelectorAll("button")).find(
      (button) => button.textContent === "Clear filters",
    )!;
    act(() => clear.click());

    const category = view.querySelector<HTMLSelectElement>("#peptide-catalog-category")!;
    act(() => setControlValue(category, "Peptide pathways"));
    expect(view.textContent).toContain("Clinician Peptide Pathway");
    expect(view.textContent).not.toContain("Held Peptide");

    act(() => setControlValue(category, "all"));
    const access = view.querySelector<HTMLSelectElement>("#peptide-catalog-access")!;
    act(() => setControlValue(access, "pending_documentation"));
    expect(view.textContent).toContain("Pending Peptide");
    expect(view.textContent).not.toContain("Alpha Peptide");
  });

  it("uses a stable truthful media frame for null and browser-error images", () => {
    const view = mount(<PeptideCatalogExperience catalog={catalog} />);
    expect(view.textContent).toContain("Approved product image is not available.");
    const image = view.querySelector<HTMLImageElement>('img[alt="Alpha Peptide exact vial"]')!;
    act(() => image.dispatchEvent(new Event("error", { bubbles: true })));
    expect(view.querySelector('img[alt="Alpha Peptide exact vial"]')).toBeNull();
    expect(view.textContent?.match(/Approved product image is not available\./g)?.length).toBeGreaterThan(1);
  });

  it("keeps loading, empty, error, unavailable, and unauthorized states explicit", () => {
    const empty = { ...catalog, items: [supplementCard] };
    const renders = [
      renderToStaticMarkup(<PeptideCatalogExperience catalog={catalog} state="loading" />),
      renderToStaticMarkup(<PeptideCatalogExperience catalog={empty} />),
      renderToStaticMarkup(
        <PeptideCatalogExperience catalog={catalog} state="error" errorMessage="Catalog failed." />,
      ),
      renderToStaticMarkup(<PeptideCatalogExperience catalog={catalog} state="unavailable" />),
      renderToStaticMarkup(<PeptideCatalogExperience catalog={catalog} state="unauthorized" />),
    ];
    expect(renders[0]).toContain("ra-loading");
    expect(renders[1]).toContain("No peptide records are published");
    expect(renders[2]).toContain("Catalog failed.");
    expect(renders[3]).toContain("The peptide catalog is not available");
    expect(renders[4]).toContain("Please sign in.");
  });

  it("uses accessible, reflow-safe structures", () => {
    const html = renderToStaticMarkup(<PeptideCatalogExperience catalog={catalog} />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).not.toContain("<main");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("xl:grid-cols-3");
    expect(html).toContain('style="min-width:0;overflow-wrap:anywhere"');
    expect(html).not.toMatch(/min-width:\s*[4-9]\d\dpx|width:\s*[4-9]\d\dpx|overflow-x:scroll/);
  });
});

describe("peptide detail UI", () => {
  it("renders exact identity, price, documentation, and Research boundaries", () => {
    const html = renderToStaticMarkup(
      <PeptideProductDetailExperience product={detail()} />,
    );
    expect(html).toContain("Exact variant");
    expect(html).toContain("10 mg vial · 10 mg · 1 vial · Vial · Lyophilized material · SKU ALPHA-10");
    expect(html).toContain("20 mg vial · 20 mg · 1 vial · Vial · Lyophilized material · SKU ALPHA-20");
    expect(html).toContain("Exact-lot documentation verified");
    expect(html).toContain("$149.00");
    expect(html).toContain("not prescribing");
    expect(html).not.toMatch(/Add to cart|Buy now|5 mg weekly|inject 1 ml/i);
    expect(html).not.toContain("Not a Peptide");
  });

  it("fails closed when the selected exact variant is ineligible", () => {
    const view = mount(<PeptideProductDetailExperience product={detail()} />);
    const selector = view.querySelector<HTMLSelectElement>("#peptide-detail-variant")!;
    expect(view.textContent).toContain("$149.00");
    act(() => setControlValue(selector, "alpha-20"));
    const state = view.querySelector('[data-testid="peptide-variant-state"]')!;
    expect(state.textContent).toContain("documentation");
    expect(view.textContent).not.toContain("$149.00");
    expect(view.textContent).toContain("Not published");
    expect(view.textContent).toContain("Request access");
  });

  it("rejects non-peptide and missing records without retaining identity", () => {
    const nonPeptide = { ...detail(), ...supplementCard } as MemberProductDetail;
    const renders = [
      renderToStaticMarkup(<PeptideProductDetailExperience product={null} />),
      renderToStaticMarkup(<PeptideProductDetailExperience product={nonPeptide} />),
      renderToStaticMarkup(
        <PeptideProductDetailExperience product={detail()} state="unauthorized" />,
      ),
    ];
    expect(renders[0]).toContain("Peptide record not found");
    expect(renders[1]).toContain("Peptide record not found");
    expect(renders[1]).not.toContain("Not a Peptide");
    expect(renders[2]).toContain("Please sign in.");
    expect(renders[2]).not.toContain("Alpha Peptide exact vial");
  });
});
