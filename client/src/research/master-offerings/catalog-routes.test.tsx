// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ResearchContext,
  type ResearchContextValue,
} from "../core";
import { isMemberNavActive } from "../layout";
import MasterOfferingDetailRoute from "./MasterOfferingDetailRoute";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const realFetch = globalThis.fetch;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function memberContext(): ResearchContextValue {
  return {
    gate: "open",
    member: { firstName: "Kris", status: "active", applicationStatus: null },
    memberToken: "canonical-member-token",
    memberChecking: false,
    memberSessionStatus: "authenticated",
    recovery: "none",
  } as ResearchContextValue;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function detailResponse() {
  return {
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
      disclosures: [],
      priceSummary: {
        state: "single",
        variantCount: 1,
        pricedVariantCount: 0,
        currency: null,
        fromCents: null,
        toCents: null,
        display: "Price on request",
      },
      variants: [
        {
          id: "mov_1",
          label: "5 mg vial",
          displayState: "available_now",
          displayLabel: "Available Now",
          price: { state: "on_request" },
          action: { kind: "none", label: null, href: null },
        },
      ],
    },
  };
}

describe("member catalog routes", () => {
  it("cold-loads a family-aware detail with the canonical member token", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(detailResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const memory = memoryLocation({
      path: "/research/member/catalog/research_vials/research-vials-bpc-157",
      record: true,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <Router hook={memory.hook}>
          <ResearchContext.Provider value={memberContext()}>
            <Route
              path="/research/member/catalog/:family/:slug"
              component={MasterOfferingDetailRoute}
            />
          </ResearchContext.Provider>
        </Router>,
      );
    });
    await settle();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/catalog-display/v2/products/research_vials/research-vials-bpc-157",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer canonical-member-token",
        }),
      }),
    );
    expect(host.querySelector("h1")?.textContent).toBe("BPC-157");
    expect(
      host.querySelector('[data-testid="mo-back-to-catalog"]')?.getAttribute("href"),
    ).toBe("/research/member/catalog");
  });

  it("redirects an unknown family to the catalog without fetching detail", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const memory = memoryLocation({
      path: "/research/member/catalog/not_a_family/bpc-157",
      record: true,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <Router hook={memory.hook}>
          <ResearchContext.Provider value={memberContext()}>
            <Route
              path="/research/member/catalog/:family/:slug"
              component={MasterOfferingDetailRoute}
            />
          </ResearchContext.Provider>
        </Router>,
      );
    });
    await settle();

    expect(memory.history.at(-1)).toBe("/research/member/catalog");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps both lazy routes behind RequireMember and injects no cart", () => {
    const researchRoot = resolve(__dirname, "..");
    const section = readFileSync(resolve(researchRoot, "section.tsx"), "utf8");
    const detailWrapper = readFileSync(
      resolve(__dirname, "MasterOfferingDetailRoute.tsx"),
      "utf8",
    );
    expect(section).toContain(
      '<Route path="/research/member/catalog/:family/:slug">{() => <L member component={MemberFullCatalogDetail} />}</Route>',
    );
    expect(section).toContain(
      '<Route path="/research/member/catalog">{() => <L member component={MemberFullCatalog} />}</Route>',
    );
    expect(detailWrapper).not.toMatch(/\bcart\s*=/);
    expect(detailWrapper).not.toContain("createCatalogCartHandoff");
  });

  it("marks Catalog navigation active on both list and detail paths", () => {
    const layout = readFileSync(resolve(__dirname, "..", "layout.tsx"), "utf8");
    expect(layout).toContain(
      '{ label: "Catalog", href: "/research/member/catalog" }',
    );
    expect(
      isMemberNavActive(
        "/research/member/catalog",
        "/research/member/catalog",
      ),
    ).toBe(true);
    expect(
      isMemberNavActive(
        "/research/member/catalog/research_vials/bpc-157",
        "/research/member/catalog",
      ),
    ).toBe(true);
    expect(
      isMemberNavActive(
        "/research/member/products/bpc-157",
        "/research/member/catalog",
      ),
    ).toBe(false);
  });
});
