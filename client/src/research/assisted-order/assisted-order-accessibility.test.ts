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
      /@media \(max-width: 700px\) and \(max-height: 38em\) \{\s+\.xenios-order-page--guest-catalog \.xenios-order-catalog-toolbar \{ position: static; \}/u,
    );
    // With the toolbar, and the pager inside it, scrolled away, the lower pager is shown
    // again and one sticky button returns to search and paging. Both conditions do this.
    const shownAgain = css.match(/\.xenios-order-page--guest-catalog \.xenios-order-bottom-pagination \{ display: block; \}/gu) ?? [];
    const returnButton = css.match(/\.xenios-order-page--guest-catalog \.xenios-order-find-tools \{\s+display: block; position: sticky;/gu) ?? [];
    expect(shownAgain).toHaveLength(2);
    expect(returnButton).toHaveLength(2);
    expect(css).toMatch(/^\.xenios-order-find-tools \{ display: none; \}$/mu);
    // The large-text condition reaches a 430px phone: 13.5rem is 432px when the page text is doubled
    // and 216px at the default size, which no phone is narrower than.
    expect(css).toMatch(/@media \(max-width: 430px\) and \(max-height: 940px\) \{\s+\.xenios-order-page--guest-catalog \{ container: guest-order-reflow \/ inline-size; \}\s+@container guest-order-reflow \(max-width: 13\.5rem\) \{/u);
    expect(13.5 * 32).toBeGreaterThanOrEqual(430);
    expect(13.5 * 16).toBeLessThan(320);
    // While the toolbar sticks, a control reached by keyboard keeps clear of it.
    expect(css).toMatch(/\.xenios-order-page--guest-catalog \.xenios-order-card :is\(a, button, input, select, summary\) \{\s+scroll-margin-top: 14rem;/u);
    expect(sticky).toBeGreaterThan(-1);
    expect(released).toBeGreaterThan(sticky);
    // 38em is 608px at the default text size: below a 390 x 664 phone viewport, so the toolbar still sticks there.
    expect(38 * 16).toBeLessThan(664);
  });

  it("is a well-formed stylesheet: every block that opens also closes, in both request stylesheets", () => {
    // The type check and the component suites never parse CSS; only the build does.
    for (const name of ["assisted-order.css", "persistent-request-bar.css"]) {
      const text = readFileSync(resolve(assistedOrderRoot, name), "utf8");
      let depth = 0;
      for (const character of text) {
        if (character === "{") depth += 1;
        if (character === "}") depth -= 1;
        expect(depth, name).toBeGreaterThanOrEqual(0);
      }
      expect(depth, name).toBe(0);
    }
  });
});
