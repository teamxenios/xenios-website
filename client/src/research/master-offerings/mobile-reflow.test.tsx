// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type {
  MasterOfferingCardView,
  MasterOfferingDetailView,
} from "@shared/research/master-offerings/contract";
import { MasterOfferingCard } from "./MasterOfferingCard";
import { MasterOfferingDetail } from "./MasterOfferingDetail";

/**
 * Reflow at 375px.
 *
 * jsdom has no layout engine, so this file cannot measure anything. The
 * measuring was done in a real browser at 375 wide against a product whose
 * name and variant label are single unbreakable tokens, and it found exactly
 * two things that pushed the page sideways:
 *
 *   grid and flex children default to min-width:auto, so a long token widened
 *   the track instead of wrapping. The catalog list went to 743px on a 375px
 *   phone.
 *
 *   a <legend> is sized by its own content and does not shrink, so the
 *   "Variants of <name>" legend alone took the detail page to 527px.
 *
 * Both are fixed by classes, so this test holds those classes in place. It is
 * a guard on a measured finding, not a substitute for measuring: the browser
 * procedure is written down in docs/research/CATALOG_CLIENT_STATE.md.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const LONG = "BPC157TB500ExtendedReleaseCompoundedResearchBlendMultiDoseVial";

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

const VARIANT_SUMMARY = {
  id: "mov_1",
  label: LONG,
  displayState: "available_now" as const,
  displayLabel: "Available Now",
  price: { state: "on_request" as const },
};

const CARD = {
  id: "mo_1",
  slug: "research-vials-bpc-157",
  displayName: LONG,
  canonicalName: LONG,
  family: "research_vials",
  familyLabel: "Research Vials",
  category: "Peptides & Research",
  subcategory: "Single peptide",
  brand: null,
  displayState: "available_now",
  displayLabel: "Available Now",
  stateExplanation: "Available now.",
  copyState: "approved",
  variantCount: 1,
  variants: [VARIANT_SUMMARY],
  priceSummary: {
    state: "none",
    variantCount: 1,
    pricedVariantCount: 0,
    currency: null,
    fromCents: null,
    toCents: null,
    display: "Price on request",
  },
} as MasterOfferingCardView;

const DETAIL = {
  ...CARD,
  overview: "A research vial listing.",
  disclosures: ["This listing is for research use."],
  variants: [
    {
      ...VARIANT_SUMMARY,
      action: {
        kind: "request_access" as const,
        label: "Request Access",
        href: "/research/member/product-requests/new",
      },
    },
  ],
} as unknown as MasterOfferingDetailView;

/** Every ancestor of long text has to be allowed to shrink, or none of them do. */
function assertCanShrink(element: Element | null | undefined, label: string) {
  expect(element, label).toBeTruthy();
  expect(
    element?.className.split(/\s+/).includes("min-w-0"),
    `${label} is missing min-w-0`,
  ).toBe(true);
}

function assertBreaks(element: Element | null | undefined, label: string) {
  expect(element, label).toBeTruthy();
  const classes = element?.className.split(/\s+/) ?? [];
  expect(
    classes.includes("break-words") || classes.includes("break-all"),
    `${label} does not break a long word`,
  ).toBe(true);
}

describe("reflow at 375", () => {
  it("lets a card and every long field inside it shrink and wrap", () => {
    const { host, unmount } = render(
      <ul>
        <MasterOfferingCard product={CARD} />
      </ul>,
    );
    assertCanShrink(host.querySelector("li"), "the card list item");
    assertCanShrink(host.querySelector('[data-testid="mo-card"]'), "the card");
    assertBreaks(host.querySelector("h3"), "the product name");
    assertCanShrink(
      host.querySelector('[data-testid="mo-variant-row"]'),
      "the variant row",
    );
    for (const span of Array.from(
      host.querySelectorAll('[data-testid="mo-variant-row"] span'),
    )) {
      assertBreaks(span, "a variant field");
    }
    assertBreaks(
      host.querySelector('[data-testid="mo-card-price"]'),
      "the card price",
    );
    unmount();
  });

  it("keeps the variant legend from sizing the detail page", () => {
    const { host, unmount } = render(<MasterOfferingDetail product={DETAIL} />);
    const legend = host.querySelector("legend");
    expect(legend?.textContent).toContain(LONG);
    // max-w-full is the one that matters here. A legend is not a block box: it
    // takes its own content width, so without a cap the product name decides
    // how wide the page is.
    expect(legend?.className.split(/\s+/)).toContain("max-w-full");
    assertBreaks(legend, "the variant legend");
    assertBreaks(host.querySelector("h1"), "the product heading");
    unmount();
  });
});
