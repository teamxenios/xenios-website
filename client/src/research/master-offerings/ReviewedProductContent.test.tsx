// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { ReviewedProductContent as ProductContent } from "../../../../shared/research/master-offerings/approved-content";
import { ReviewedProductContent } from "./ReviewedProductContent";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Reviewed product copy is written in paragraphs: a plain-language lead, a
// blank line, then the full description. The renderer shows each paragraph as
// its own paragraph, in order, and never drops or clips text: the limitation
// sentence is as visible as the lead. Synthetic text only.

const LEAD = "Synthetic lead: this is a synthetic material in plain words.";
const BODY = "Synthetic description: the full source-grounded text, including what it does not establish.";
const LIMIT = "Synthetic limitation: listed at 10 mg for laboratory research.";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(content: Partial<ProductContent>, inDialog = false): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const full: ProductContent = { summary: "Synthetic summary.", overview: "Synthetic overview.", ...content };
  act(() => root!.render(<ReviewedProductContent content={full} inDialog={inDialog} />));
  return host;
}

/** The paragraphs under one heading, in order. */
function paragraphsUnder(el: ParentNode, heading: string): string[] {
  const title = Array.from(el.querySelectorAll("h2, h3")).find((node) => node.textContent === heading);
  expect(title, heading).toBeDefined();
  return Array.from(title!.parentElement!.querySelectorAll("p")).map((node) => node.textContent ?? "");
}

describe("ReviewedProductContent overview paragraphs", () => {
  it("shows a lead, a description and a limitation as three paragraphs, in order and in full", () => {
    const el = render({ overview: [LEAD, BODY, LIMIT].join("\n\n") });
    expect(paragraphsUnder(el, "Overview")).toEqual([LEAD, BODY, LIMIT]);
  });

  it("splits on a blank line written with Windows line endings", () => {
    const el = render({ overview: [LEAD, BODY].join("\r\n\r\n") });
    expect(paragraphsUnder(el, "Overview")).toEqual([LEAD, BODY]);
  });

  it("keeps a one-paragraph overview as exactly one paragraph", () => {
    const el = render({ overview: LEAD });
    expect(paragraphsUnder(el, "Overview")).toEqual([LEAD]);
  });

  it("does not split on a single line break", () => {
    const el = render({ overview: `${LEAD}\n${BODY}` });
    expect(paragraphsUnder(el, "Overview")).toEqual([`${LEAD}\n${BODY}`]);
  });

  it("shows no empty paragraph for extra blank lines or surrounding space", () => {
    const el = render({ overview: `\n\n${LEAD}\n\n\n\n${BODY}\n\n` });
    expect(paragraphsUnder(el, "Overview")).toEqual([LEAD, BODY]);
  });

  it("never clips or hides the text: no clamp, truncation or height limit on the section", () => {
    const el = render({ overview: [LEAD, BODY, LIMIT].join("\n\n") });
    const section = el.querySelector('section[aria-label="Product information"]')!;
    expect(section.textContent).toContain(LIMIT);
    for (const node of [section, ...Array.from(section.querySelectorAll("*"))]) {
      expect(node.getAttribute("class") ?? "").not.toMatch(/line-clamp|truncate|overflow-hidden|max-h-/);
      expect(node.getAttribute("style") ?? "").not.toMatch(/overflow|max-height|line-clamp/);
    }
  });
});

describe("ReviewedProductContent cautions and other sections", () => {
  it("keeps showing cautions in paragraphs", () => {
    const el = render({ cautions: "Synthetic caution one.\n\nSynthetic caution two." });
    expect(paragraphsUnder(el, "Cautions")).toEqual(["Synthetic caution one.", "Synthetic caution two."]);
  });

  it("keeps a one-paragraph caution and a one-paragraph purpose as one paragraph each", () => {
    const el = render({ cautions: "Synthetic caution.", purpose: "Synthetic purpose." });
    expect(paragraphsUnder(el, "Cautions")).toEqual(["Synthetic caution."]);
    expect(paragraphsUnder(el, "Purpose")).toEqual(["Synthetic purpose."]);
  });

  it("uses h3 headings inside a dialog and h2 on a page", () => {
    expect(render({}, true).querySelector("h3")?.textContent).toBe("Overview");
    act(() => root!.unmount());
    host!.remove();
    root = null;
    expect(render({}, false).querySelector("h2")?.textContent).toBe("Overview");
  });
});
