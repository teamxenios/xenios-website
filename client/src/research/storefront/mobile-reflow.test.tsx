// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  PublicStorefrontCard,
  PublicStorefrontDetail,
} from "@shared/research/storefront/contract";
import Gateway from "../pages/Gateway";
import { StorefrontCard } from "./StorefrontCard";
import { StorefrontProductPage } from "./StorefrontProductPage";

/**
 * Mobile reflow at 430, 390, 375, 360 and 320.
 *
 * jsdom has no layout engine, so this file measures NOTHING and does not
 * pretend to. What it honestly holds in place are the specific classes that a
 * real-browser pass found to be load-bearing for narrow widths, on the same
 * two failure modes the member catalog already hit and documented:
 *
 *   grid and flex children default to min-width:auto, so a long unbreakable
 *   token widens the track instead of wrapping. Every such child needs
 *   min-w-0, and the text needs break-words.
 *
 *   a <legend> is sized by its own content and does not shrink, so a long
 *   product name in "Options for <name>" alone pushes the page sideways. It
 *   needs max-w-full min-w-0 break-words.
 *
 * Plus the touch-target floor: every control a thumb must hit carries a 44px
 * minimum, which IS assertable from the class list without layout.
 *
 * The real-browser procedure is in docs/research/CATALOG_CLIENT_STATE.md; the
 * widths this lane was asked to pass are recorded in the handoff.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const WIDTHS = [430, 390, 375, 360, 320];
const gatewayCss = readFileSync(
  resolve(__dirname, "../pages/gateway-editorial.css"),
  "utf8",
);

/** One long unbreakable token: the shape that actually breaks narrow layouts. */
const LONG =
  "BPC157TB500ExtendedReleaseCompoundedResearchBlendMultiDoseVialLongName";

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

function atWidth<T>(width: number, run: () => T): T {
  const original = window.innerWidth;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
  try {
    return run();
  } finally {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: original });
  }
}

const CARD: PublicStorefrontCard = {
  slug: "research-vials-bpc-157",
  family: "research_vials",
  familyLabel: "Research Vials",
  displayName: LONG,
  category: "Peptides & Research",
  subcategory: "Single peptide",
  displayState: "available_now",
  displayLabel: "Available now",
  stateExplanation: "Ready to order.",
  variantCount: 1,
  variants: [
    {
      id: "mov_1",
      label: LONG,
      displayLabel: "Available now",
      displayState: "available_now",
      action: "BUY_NOW",
      price: { state: "priced", amountCents: 9900, currency: "USD", display: "$99.00" },
    },
  ],
  priceSummary: "$99.00",
  action: "BUY_NOW",
};

const DETAIL: PublicStorefrontDetail = {
  ...CARD,
  overview: LONG,
  disclosures: [LONG],
};

/**
 * Every grid/flex descendant that can hold a long token must be able to
 * shrink. This walks the rendered tree rather than checking a fixed list, so
 * a future element added without min-w-0 is caught.
 */
function unshrinkableTextHolders(host: HTMLElement): string[] {
  const offenders: string[] = [];
  for (const el of Array.from(host.querySelectorAll<HTMLElement>("*"))) {
    const classes = el.className;
    if (typeof classes !== "string") continue;
    const holdsLongToken = (el.textContent ?? "").includes(LONG);
    if (!holdsLongToken) continue;
    // Only leaf-ish text holders need break-words; every ancestor in a
    // grid/flex track needs min-w-0 to be allowed to shrink at all.
    const isTrackChild = /\b(grid|flex)\b/.test(
      (el.parentElement?.className as string) ?? "",
    );
    if (isTrackChild && !/\bmin-w-0\b/.test(classes)) {
      offenders.push(`<${el.tagName.toLowerCase()} class="${classes}">`);
    }
  }
  return offenders;
}

describe("public storefront reflow", () => {
  for (const width of WIDTHS) {
    it(`card keeps every long-token holder shrinkable at ${width}px`, () => {
      atWidth(width, () => {
        const view = render(
          <ul>
            <StorefrontCard product={CARD} />
          </ul>,
        );
        expect(unshrinkableTextHolders(view.host)).toEqual([]);
        view.unmount();
      });
    });

    it(`product page keeps every long-token holder shrinkable at ${width}px`, () => {
      atWidth(width, () => {
        const view = render(<StorefrontProductPage product={DETAIL} />);
        expect(unshrinkableTextHolders(view.host)).toEqual([]);
        view.unmount();
      });
    });

  }

  it("the legend cannot widen the product page", () => {
    const view = render(<StorefrontProductPage product={DETAIL} />);
    const legend = view.host.querySelector("legend");
    expect(legend).not.toBeNull();
    for (const required of ["max-w-full", "min-w-0", "break-words"]) {
      expect(legend!.className).toContain(required);
    }
    view.unmount();
  });

  it("every thumb target carries the 44px floor", () => {
    const card = render(
      <ul>
        <StorefrontCard product={CARD} />
      </ul>,
    );
    const detail = render(<StorefrontProductPage product={DETAIL} />);
    for (const host of [card.host, detail.host]) {
      for (const control of Array.from(
        host.querySelectorAll<HTMLElement>("a.btn, button.btn"),
      )) {
        expect(
          control.className,
          `control "${(control.textContent ?? "").trim()}" is missing the 44px floor`,
        ).toContain("min-h-[44px]");
      }
    }
    card.unmount();
    detail.unmount();
  });

  it("the gateway's real editorial CTAs are present and use the guarded responsive classes", () => {
    const view = render(<Gateway />);
    const ctas = Array.from(
      view.host.querySelectorAll<HTMLAnchorElement>("a.rg-btn, a.rg-mobile-access"),
    );
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta.className).toMatch(/\brg-(?:btn|mobile-access)\b/u);
    }
    view.unmount();
  });

  it("pins wrapping, narrow-width stacking, and the 44px target floor in gateway CSS", () => {
    expect(gatewayCss).toMatch(
      /\.rg-stacked-actions\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/su,
    );
    expect(gatewayCss).toMatch(
      /\.rg-btn,\s*\.rg-mobile-access\s*\{[^}]*min-height:\s*52px;/su,
    );
    expect(gatewayCss).toMatch(
      /@media\s*\(max-width:\s*620px\)[\s\S]*?\.rg-hero-actions\s+\.rg-btn,\s*\.rg-final-actions\s+\.rg-btn\s*\{\s*width:\s*100%;/u,
    );
    expect(gatewayCss).toMatch(
      /@media\s*\(max-width:\s*260px\)[\s\S]*?\.rg-btn,\s*\.rg-mobile-access\s*\{[^}]*overflow-wrap:\s*anywhere;/u,
    );
  });
});
