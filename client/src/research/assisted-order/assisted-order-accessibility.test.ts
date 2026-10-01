import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const assistedOrderRoot = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(assistedOrderRoot, "assisted-order.css"), "utf8");

function declarationsFor(selector: string): string {
  return Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/gu))
    .filter((match) => match[1].split(",").some((part) => part.trim() === selector))
    .map((match) => match[2])
    .join("\n");
}

describe("assisted-order pointer target source contracts", () => {
  it("keeps text controls at least 44px tall without resizing checkbox or radio controls", () => {
    expect(css).toMatch(
      /\.xenios-order-page input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\), \.xenios-order-page select, \.xenios-order-page textarea \{ min-height: 44px; \}/u,
    );
    expect(css).toMatch(/\.xenios-order-check input \{ width: 18px; height: 18px;/u);
  });

  it("lays out all four customer stages without orphaning the final stage", () => {
    expect(css).toMatch(
      /\.xenios-order-steps \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/u,
    );
    expect(css).toMatch(
      /@media \(max-width: 1000px\)[\s\S]*?\.xenios-order-steps \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/u,
    );
    expect(css).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?\.xenios-order-steps \{ grid-template-columns: 1fr; \}/u,
    );
  });

  it("gives the native product-details summary a scoped 44px target and visible focus", () => {
    // Source contracts only: the JSDOM page suite mocks this stylesheet and
    // cannot establish actual browser layout, keyboard behavior or zoom.
    const summary = declarationsFor(".xenios-order-details > summary");
    expect(summary).toMatch(/\bmin-height:\s*44px\s*;/u);
    expect(summary).toMatch(/\bpadding:\s*11px\s+8px\s*;/u);
    expect(summary).toMatch(/\bbox-sizing:\s*border-box\s*;/u);
    expect(summary).toMatch(/\bcursor:\s*pointer\s*;/u);
    expect(summary).toMatch(/\bfont-weight:\s*700\s*;/u);
    expect(summary).not.toMatch(/\blist-style:\s*none/u);

    const focus = declarationsFor(".xenios-order-details > summary:focus-visible");
    expect(focus).toMatch(/\boutline:\s*3px\s+solid\s+var\(--accent\)\s*;/u);
    expect(focus).toMatch(/\boutline-offset:\s*2px\s*;/u);
  });

  it("lets product details shrink and wrap long canonical facts without clipping", () => {
    const details = declarationsFor(".xenios-order-details");
    expect(details).toMatch(/\bmin-width:\s*0\s*;/u);
    expect(details).toMatch(/\boverflow-wrap:\s*anywhere\s*;/u);
    expect(details).not.toMatch(/\b(?:overflow|overflow-x|overflow-y):\s*(?:hidden|clip)\b/u);
    expect(details).not.toMatch(/\b(?:height|max-height):\s*\d/u);
  });

  it("wraps long facts in the outer product card before details are opened without hiding overflow", () => {
    const card = declarationsFor(".xenios-order-card");
    expect(card).toMatch(/\bmin-width:\s*0\s*;/u);
    expect(card).toMatch(/\boverflow-wrap:\s*anywhere\s*;/u);
    expect(card).not.toMatch(/\b(?:overflow|overflow-x|overflow-y):\s*(?:hidden|clip)\b/u);
  });
});
