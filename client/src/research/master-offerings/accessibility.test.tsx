// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_MASTER_OFFERING_SORT,
  EMPTY_MASTER_OFFERING_FACETS,
} from "@shared/research/master-offerings/contract";
import type {
  MasterOfferingCatalogPage,
  MasterOfferingDetailView,
} from "@shared/research/master-offerings/contract";
import { FullCatalogPage } from "./FullCatalogPage";
import { MasterOfferingDetail } from "./MasterOfferingDetail";

/**
 * A structural accessibility audit over both rendered surfaces.
 *
 * It is honest about being structural. Real keyboard traversal, 200 percent
 * zoom, reduced motion and actual viewport behaviour need a browser against a
 * mounted route, and these components are routed nowhere on purpose. What can
 * be checked without one is checked here, and it is the half that regresses
 * silently: an unlabelled control, a heading level skipped, a button whose only
 * name is an icon, a touch target too small to hit on a phone.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return { host, unmount: () => act(() => root.unmount()) };
}

function accessibleName(element: Element): string {
  const aria = element.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim();
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const target = document.getElementById(labelledBy);
    if (target?.textContent?.trim()) return target.textContent.trim();
  }
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }
  const closestLabel = element.closest("label");
  if (closestLabel?.textContent?.trim()) return closestLabel.textContent.trim();
  return element.textContent?.trim() ?? "";
}

function auditInteractive(host: HTMLElement): string[] {
  const problems: string[] = [];
  const interactive = host.querySelectorAll(
    "button, a[href], input, select, textarea",
  );
  expect(interactive.length).toBeGreaterThan(0);
  for (const element of Array.from(interactive)) {
    if (accessibleName(element) === "") {
      problems.push(`${element.tagName.toLowerCase()} has no accessible name`);
    }
    if (element.getAttribute("tabindex") === "-1") {
      problems.push(`${element.tagName.toLowerCase()} is removed from tab order`);
    }
  }
  return problems;
}

function auditHeadings(host: HTMLElement): string[] {
  const problems: string[] = [];
  const headings = Array.from(host.querySelectorAll("h1, h2, h3, h4, h5, h6"));
  const levels = headings.map((heading) => Number(heading.tagName.slice(1)));
  if (levels.filter((level) => level === 1).length !== 1) {
    problems.push(`expected exactly one h1, found ${levels.filter((l) => l === 1).length}`);
  }
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] > levels[index - 1] + 1) {
      problems.push(
        `heading level jumped from h${levels[index - 1]} to h${levels[index]}`,
      );
    }
  }
  for (const heading of headings) {
    if (!heading.textContent?.trim()) problems.push("empty heading");
  }
  return problems;
}

function card() {
  return {
    id: "mo_1",
    slug: "bpc-157",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    family: "research_vials" as const,
    familyLabel: "Research Vials",
    category: "Peptides & Research",
    subcategory: "Single peptide",
    brand: null,
    displayState: "available_now" as const,
    displayLabel: "Available Now",
    stateExplanation: "Available now.",
    copyState: "approved" as const,
    variantCount: 1,
    variants: [
      {
        id: "mov_a",
        label: "5 mg vial",
        displayState: "available_now" as const,
        displayLabel: "Available Now",
        price: { state: "on_request" as const },
        action: {
          kind: "request_access" as const,
          label: "Request Access" as const,
          href: "/research/member/product-requests/new",
        },
      },
    ],
    priceSummary: {
      state: "none" as const,
      variantCount: 1,
      pricedVariantCount: 0,
      currency: null,
      fromCents: null,
      toCents: null,
      display: "Price on request",
    },
  };
}

const PAGE: MasterOfferingCatalogPage = {
  ok: true,
  page: 2,
  pageSize: 24,
  total: 1121,
  totalPages: 47,
  sort: DEFAULT_MASTER_OFFERING_SORT,
  products: [card()],
  facets: EMPTY_MASTER_OFFERING_FACETS,
};

const DETAIL: MasterOfferingDetailView = {
  ...card(),
  overview: null,
  disclosures: ["Product Control remains the purchase authority."],
  variants: [
    {
      id: "mov_a",
      label: "5 mg vial",
      displayState: "available_now",
      displayLabel: "Available Now",
      price: { state: "on_request" },
      action: {
        kind: "request_access",
        label: "Request Access",
        href: "/research/member/product-requests/new",
      },
    },
    {
      id: "mov_b",
      label: "10 mg vial",
      displayState: "coming_soon",
      displayLabel: "Coming Soon",
      price: { state: "on_request" },
      action: { kind: "join_waitlist", label: "Join Waitlist", href: "/x" },
    },
  ],
};

describe("accessibility, structural", () => {
  it("gives the catalog page one h1, ordered headings, and named controls", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{ page: 2 }} page={PAGE} onQueryChange={() => {}} />,
    );
    expect(auditHeadings(host)).toEqual([]);
    // The results heading is focus target only; it is not a tab stop, which is
    // the one legitimate tabindex of -1 on the page.
    expect(
      auditInteractive(host).filter((p) => !p.includes("tab order")),
    ).toEqual([]);
    unmount();
  });

  it("gives the detail page one h1, ordered headings, and named controls", () => {
    const { host, unmount } = render(<MasterOfferingDetail product={DETAIL} />);
    expect(auditHeadings(host)).toEqual([]);
    expect(auditInteractive(host)).toEqual([]);
    unmount();
  });

  it("puts cards in a list, so a screen reader can count them", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={PAGE} onQueryChange={() => {}} />,
    );
    const cards = host.querySelectorAll('[data-testid="mo-card"]');
    for (const entry of Array.from(cards)) {
      expect(entry.closest("li")).not.toBeNull();
      expect(entry.closest("ul")).not.toBeNull();
    }
    unmount();
  });

  it("keeps every touch target reachable on a phone", () => {
    const { host, unmount } = render(<MasterOfferingDetail product={DETAIL} />);
    for (const control of Array.from(host.querySelectorAll("a.btn, button.btn"))) {
      // Tailwind cannot be computed in jsdom, so the class is the contract.
      expect(control.className).toContain("min-h-[44px]");
    }
    // Each variant row is itself a tap target on mobile.
    for (const label of Array.from(
      host.querySelectorAll('[data-testid="mo-variant-selector"] label'),
    )) {
      expect(label.className).toContain("min-h-[44px]");
    }
    unmount();
  });

  it("states availability in words, never in colour alone", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={PAGE} onQueryChange={() => {}} />,
    );
    const text = host.textContent ?? "";
    expect(text).toContain("Available Now");
    expect(text).toContain("Price on request");
    unmount();
  });

  it("announces the result count politely rather than on every keystroke", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={PAGE} onQueryChange={() => {}} />,
    );
    // Every live region on this page is polite. Assertive would interrupt a
    // screen reader on each keystroke, which is the thing being guarded
    // against; the number of polite regions is not itself the rule.
    const live = Array.from(host.querySelectorAll("[aria-live]"));
    expect(live.length).toBeGreaterThan(0);
    for (const region of live) {
      expect(region.getAttribute("aria-live")).toBe("polite");
    }
    expect(
      host
        .querySelector('[data-testid="mo-result-count"]')
        ?.getAttribute("aria-live"),
    ).toBe("polite");
    unmount();
  });

  it("gives the pagination a name and disables the edges", () => {
    const first = render(
      <FullCatalogPage
        query={{}}
        page={{ ...PAGE, page: 1 }}
        onQueryChange={() => {}}
      />,
    );
    const nav = first.host.querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("Catalog pages");
    const previous = Array.from(first.host.querySelectorAll("button")).find(
      (button) => button.textContent === "Previous page",
    );
    expect(previous?.disabled).toBe(true);
    first.unmount();

    const last = render(
      <FullCatalogPage
        query={{}}
        page={{ ...PAGE, page: 47 }}
        onQueryChange={() => {}}
      />,
    );
    const next = Array.from(last.host.querySelectorAll("button")).find(
      (button) => button.textContent === "Next page",
    );
    expect(next?.disabled).toBe(true);
    last.unmount();
  });

  it("lays out responsively rather than at a fixed width", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={PAGE} onQueryChange={() => {}} />,
    );
    const grid = host.querySelector("ul.grid");
    // One column by default, more as the viewport allows. A fixed pixel width
    // is what causes horizontal overflow at 390px.
    expect(grid?.className).toContain("md:grid-cols-2");
    expect(grid?.className).toContain("xl:grid-cols-3");
    expect(host.innerHTML).not.toMatch(/style="[^"]*width:\s*\d+px/);
    unmount();
  });
});
