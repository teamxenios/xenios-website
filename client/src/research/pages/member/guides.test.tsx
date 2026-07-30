// @vitest-environment jsdom
// The client half of the guide pipeline, against the FROZEN wire contract the
// production deps now serve for real:
//
//   1. Guides.tsx renders real GuideSummaryDto shapes: an unpublished Guide is
//      a status-only card with NO link into content; a published one links to
//      the reader and shows its date.
//   2. GuideReader.tsx renders a real GuideDetailDto: sections, graded claims,
//      sources, correction history.
//   3. An unknown slug (the route 404s; the api lib reports "unavailable")
//      renders the honest absent state, never a crash.
//   4. A known unpublished slug (403 guide_not_published) renders the designed
//      denial state, status-aware from the library list.
//
// fetch is stubbed with json content-type headers, matching the api lib's
// envelope parsing (same harness pattern as cart-checkout.test.tsx).

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { Route, Router } from "wouter";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../../core";
import Guides from "./Guides";
import GuideReader from "./GuideReader";
import { MEMBER_ROUTES } from "../../lib/routes";
import type { GuideDetailDto, GuideSummaryDto } from "@shared/research/commerce-api";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

// Only the fields the pages read need real values (test-only cast, same
// pattern as cart-checkout.test.tsx).
function fixtureContext(): ResearchContextValue {
  return {
    gate: "open",
    member: { firstName: "Sam", status: "active", applicationStatus: null },
    memberToken: "member-jwt",
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

type StubRoute = { method: string; path: string; status: number; body: unknown };

function stubFetch(routes: StubRoute[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const route = routes.find((r) => r.method === method && r.path === url);
      if (!route) throw new TypeError(`unstubbed fetch: ${method} ${url}`);
      return {
        status: route.status,
        ok: route.status >= 200 && route.status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => route.body,
      };
    }),
  );
}

async function renderPage(node: ReactNode): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ResearchContext.Provider value={fixtureContext()}>{node}</ResearchContext.Provider>,
    );
  });
  return container;
}

// The real shapes the production guide source serves today: unreviewed
// packets, in_development, no publication date, catalog-linked SKUs.
const DRAFT_SUMMARY: GuideSummaryDto = {
  slug: "bpc-157",
  title: "BPC-157 Research Guide",
  status: "in_development",
  publishedAt: null,
  relatedProductSkus: ["P001", "P002"],
};

const PUBLISHED_SUMMARY: GuideSummaryDto = {
  slug: "tb-500",
  title: "TB-500 Research Guide",
  status: "published",
  publishedAt: "2026-07-01T00:00:00Z",
  relatedProductSkus: ["P001"],
};

const PUBLISHED_DETAIL: GuideDetailDto = {
  ...PUBLISHED_SUMMARY,
  revision: 2,
  sections: [{ heading: "One-minute summary", body: "What is honestly known." }],
  claims: [{ id: "c1", text: "A preclinical finding in rats.", grade: "D", sourceIds: ["s1"] }],
  sources: [{ id: "s1", citation: "Example et al. 2021", url: null, verified: false }],
  correctionHistory: [{ at: "2026-07-02T00:00:00Z", note: "Clarified the species." }],
};

function readerAt(slug: string): ReactNode {
  window.history.replaceState(null, "", MEMBER_ROUTES.guide.replace(":slug", slug));
  return (
    <Router>
      <Route path={MEMBER_ROUTES.guide} component={GuideReader} />
    </Router>
  );
}

describe("Guides library page", () => {
  it("renders an unpublished Guide as a status-only card with no link, and a published one with a link", async () => {
    stubFetch([
      {
        method: "GET",
        path: "/api/research/guides",
        status: 200,
        body: { ok: true, guides: [DRAFT_SUMMARY, PUBLISHED_SUMMARY] },
      },
    ]);
    const page = await renderPage(<Guides />);

    // The unpublished packet: card present, title shown, NO reader link.
    const draftCard = page.querySelector('[data-testid="guide-card-bpc-157"]');
    expect(draftCard).not.toBeNull();
    expect(draftCard!.textContent).toContain("BPC-157 Research Guide");
    expect(draftCard!.textContent).toContain("In development");
    expect(page.querySelector('[data-testid="guide-link-bpc-157"]')).toBeNull();

    // The published one links into the reader.
    const link = page.querySelector('[data-testid="guide-link-tb-500"]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/research/member/guides/tb-500");

    // Grouped honestly: the drafts sit under the in-preparation section.
    expect(page.textContent).toContain("In preparation");
  });

  it("renders the honest empty state when no guides exist", async () => {
    stubFetch([
      { method: "GET", path: "/api/research/guides", status: 200, body: { ok: true, guides: [] } },
    ]);
    const page = await renderPage(<Guides />);
    expect(page.textContent).toContain("No Guides are published yet.");
  });
});

describe("Guide reader page", () => {
  it("renders a published GuideDetailDto: sections, graded claims, sources, corrections", async () => {
    stubFetch([
      {
        method: "GET",
        path: "/api/research/guides/tb-500",
        status: 200,
        body: { ok: true, guide: PUBLISHED_DETAIL },
      },
    ]);
    const page = await renderPage(readerAt("tb-500"));
    expect(page.textContent).toContain("TB-500 Research Guide");
    expect(page.textContent).toContain("What is honestly known.");
    expect(page.querySelector('[data-testid="ra-guide-revision"]')!.textContent).toContain("Revision 2");
    expect(page.querySelector('[data-testid="ra-claim-c1"]')!.textContent).toContain("Grade D");
    expect(page.querySelector('[data-testid="ra-source-s1"]')!.textContent).toContain("Example et al. 2021");
    expect(page.textContent).toContain("Clarified the species.");
  });

  it("renders the designed not-published state for a known unpublished slug, status-aware", async () => {
    stubFetch([
      {
        method: "GET",
        path: "/api/research/guides/bpc-157",
        status: 403,
        body: { ok: false, code: "guide_not_published", message: "This Guide has not completed review." },
      },
      {
        method: "GET",
        path: "/api/research/guides",
        status: 200,
        body: { ok: true, guides: [DRAFT_SUMMARY] },
      },
    ]);
    const page = await renderPage(readerAt("bpc-157"));
    const denied = page.querySelector('[data-testid="ra-guide-denied"]');
    expect(denied).not.toBeNull();
    // The library list supplied this Guide's real status, so the denial is specific.
    expect(denied!.textContent).toContain("In development");
  });

  it("renders the honest absent state for an unknown slug (404), never a crash", async () => {
    stubFetch([
      {
        method: "GET",
        path: "/api/research/guides/no-such-guide",
        status: 404,
        body: { ok: false, code: "guide_not_found" },
      },
    ]);
    const page = await renderPage(readerAt("no-such-guide"));
    expect(page.textContent).toContain("This Guide is not available yet.");
  });
});
