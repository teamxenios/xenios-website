import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const assistedOrderRoot = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(assistedOrderRoot, "assisted-order.css"), "utf8");

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

  it("stops the phone catalog toolbar sticking on a short screen or at enlarged text", () => {
    // The toolbar is sticky on a phone.
    expect(css).toMatch(
      /@media \(max-width: 700px\) \{[\s\S]*?\.xenios-order-page--guest-catalog \.xenios-order-catalog-toolbar \{\s*position: sticky;/u,
    );
    // It is released by a later rule whose height is in em, so it follows text size as well as zoom.
    const sticky = css.search(/position: sticky;\s+top: 0;/u);
    const released = css.search(
      /@media \(max-width: 700px\) and \(max-height: 38em\) \{\s+\.xenios-order-page--guest-catalog \.xenios-order-catalog-toolbar \{ position: static; \}\s+\}/u,
    );
    expect(sticky).toBeGreaterThan(-1);
    expect(released).toBeGreaterThan(sticky);
    // 38em is 608px at the default text size: below a 390 x 664 phone viewport, so the toolbar still sticks there.
    expect(38 * 16).toBeLessThan(664);
  });
});
