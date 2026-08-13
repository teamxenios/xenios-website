// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Route, Router } from "wouter";
import type { MasterOfferingCardView } from "@shared/research/master-offerings/contract";
import { MEMBER_ROUTES } from "../lib/routes";
import { MasterOfferingCard } from "./MasterOfferingCard";
import {
  FULL_CATALOG_PATH,
  fullCatalogHref,
  fullCatalogProductHref,
  memberOfferingDetailHref,
} from "./integration-packet";

/**
 * THE DEAD LINK.
 *
 * Every card used to link to `/research/member/products/:slug`, the v1 member
 * product page. A v2 slug is family-prefixed (`research-vials-bpc-157`) and is
 * keyed in a different store, so v1 fetched it, found nothing, re-checked the
 * slug it got back, and fell quietly to `unavailable`. Every product in the
 * catalog was a dead link, and it failed silently.
 *
 * The detail surface needs a family and a slug, because the v2 detail API is
 * `/products/:family/:slug`. So the page route carries both, and these tests
 * hold the card, the manifest and the router to the same string.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("../core", () => ({
  useResearch: () => ({ memberToken: "member-token" }),
}));

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

function card(
  overrides: Partial<MasterOfferingCardView> = {},
): MasterOfferingCardView {
  return {
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
    variantCount: 0,
    variants: [],
    priceSummary: {
      state: "none",
      variantCount: 0,
      pricedVariantCount: 0,
      currency: null,
      fromCents: null,
      toCents: null,
      display: "Price on request",
    },
    ...overrides,
  } as MasterOfferingCardView;
}

describe("the v2 detail link", () => {
  it("carries the family segment the detail API needs", () => {
    expect(fullCatalogProductHref("research_vials", "research-vials-bpc-157")).toBe(
      "/research/member/catalog/research_vials/research-vials-bpc-157",
    );
    expect(fullCatalogHref({ q: "bpc", page: 2 })).toBe(
      "/research/member/catalog?q=bpc&page=2",
    );
    expect(FULL_CATALOG_PATH).toBe(MEMBER_ROUTES.fullCatalog);
  });

  it("leaves the v1 href alone, because the v1 catalog still uses it", () => {
    expect(memberOfferingDetailHref("nad-plus")).toBe(
      "/research/member/products/nad-plus",
    );
    expect(MEMBER_ROUTES.product).toBe("/research/member/products/:slug");
  });

  it("points a card at the v2 page and never at the v1 one", () => {
    const { host, unmount } = render(
      <ul>
        <MasterOfferingCard product={card()} />
      </ul>,
    );
    const link = host.querySelector('[data-testid="mo-card-link"]');
    expect(link?.getAttribute("href")).toBe(
      "/research/member/catalog/research_vials/research-vials-bpc-157",
    );
    expect(host.innerHTML).not.toContain("/research/member/products/");
    unmount();
  });

  it("encodes both segments, so an odd slug cannot escape the route", () => {
    const { host, unmount } = render(
      <ul>
        <MasterOfferingCard
          product={card({ slug: "peptide blends/../admin", id: "mo_2" })}
        />
      </ul>,
    );
    const href =
      host.querySelector('[data-testid="mo-card-link"]')?.getAttribute("href") ??
      "";
    expect(href).toBe(
      "/research/member/catalog/research_vials/peptide%20blends%2F..%2Fadmin",
    );
    unmount();
  });
});

describe("the routed pages", () => {
  // Normalized, because this repository checks out CRLF on Windows.
  const section = readFileSync(resolve(__dirname, "..", "section.tsx"), "utf8")
    .split("\r\n")
    .join("\n");

  it("registers both catalog routes in the manifest and the router", () => {
    expect(MEMBER_ROUTES.fullCatalog).toBe("/research/member/catalog");
    expect(MEMBER_ROUTES.fullCatalogProduct).toBe(
      "/research/member/catalog/:family/:slug",
    );
    // routes-parity.test.ts reads the raw router source, so the literal has to
    // be present character for character.
    expect(section).toContain('"/research/member/catalog"');
    expect(section).toContain('"/research/member/catalog/:family/:slug"');
  });

  it("keeps both catalog pages behind the member gate and code split", () => {
    for (const route of [
      '<Route path="/research/member/catalog">',
      '<Route path="/research/member/catalog/:family/:slug">',
    ]) {
      const at = section.indexOf(route);
      expect(at).toBeGreaterThan(-1);
      expect(section.slice(at, at + 220)).toContain("<L member component=");
    }
    expect(section).toContain('lazy(\n  () => import("./master-offerings/FullCatalogRoute"),\n)');
    expect(section).toContain(
      'lazy(\n  () => import("./master-offerings/FullCatalogProductRoute"),\n)',
    );
  });

  async function routeAt(href: string) {
    const { default: FullCatalogProductRoute } = await import(
      "./FullCatalogProductRoute"
    );
    window.history.replaceState(null, "", href);
    return render(
      <Router>
        <Route
          path={MEMBER_ROUTES.fullCatalogProduct}
          component={FullCatalogProductRoute}
        />
      </Router>,
    );
  }

  it("matches the exact href a card renders, and passes both params through", async () => {
    // The whole point of the fix: the link the card emits is matched by the
    // route that is registered, and the surface it lands on has what it needs.
    const href = fullCatalogProductHref(
      "research_vials",
      "research-vials-bpc-157",
    );
    const { host, unmount } = await routeAt(href);
    // The surface starts by fetching, so its skeleton is the proof it mounted
    // rather than falling through to the not-found copy.
    expect(host.querySelector('[data-testid="mo-detail-skeleton"]')).not.toBeNull();
    expect(host.textContent).not.toContain("That product is not in the catalog.");
    unmount();
  });

  it("answers an unknown family itself rather than asking the server", async () => {
    const { host, unmount } = await routeAt(
      "/research/member/catalog/not_a_family/whatever",
    );
    expect(host.textContent).toContain("That product is not in the catalog.");
    expect(host.querySelector('[data-testid="mo-detail-skeleton"]')).toBeNull();
    unmount();
  });
});
