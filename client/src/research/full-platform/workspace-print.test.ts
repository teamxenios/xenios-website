/**
 * Printing the dashboard share card hides the rest of the page and shows only the card. The rule that shows the
 * card must be at least as specific as the rule that hides everything, or the card prints as blank pages.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve("client/src/research/full-platform/workspace.css"), "utf8");
const print = css.slice(css.indexOf("@media print{"));

describe("dashboard share card print rules", () => {
  it("hides the page with body:has(.xh-share) and shows the card with a selector carrying the same prefix", () => {
    expect(print).toContain("body:has(.xh-share) *{visibility:hidden}");
    expect(print).toContain("body:has(.xh-share) .xh-share,body:has(.xh-share) .xh-share *{visibility:visible}");
    expect(print).not.toMatch(/(^|[{}])\.xh-share,\.xh-share \*\{visibility:visible\}/);
  });

  it("removes the rest of the page from the print layout, so the PDF ends with the card", () => {
    expect(print).toContain("body:has(.xh-share) *:not(:has(.xh-share)):not(.xh-share):not(.xh-share *){display:none!important}");
  });

  it("prints the whole link and destination as wrapping text, not as one-line fields", () => {
    expect(print).toContain(".xh-share input{display:none!important}");
    expect(print).toContain(".xh-share .xh-print-only{display:block;overflow-wrap:anywhere;");
    expect(css).toMatch(/(^|\n)\.xh-print-only\{display:none\}/);
    const card = readFileSync(resolve("client/src/research/recommendation/DashboardShareCard.tsx"), "utf8");
    expect(card).toContain('<span className="xh-print-only">{qr.url}</span>');
    expect(card).toContain('<span className="xh-print-only">{chosen.destinationPath}</span>');
  });
});
