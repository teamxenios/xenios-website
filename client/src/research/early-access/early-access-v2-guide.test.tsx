// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { EarlyAccessRequestGuide, EarlyAccessRequestNextSteps } from "./EarlyAccessRequestGuide";
import {
  EARLY_ACCESS_BRAND,
  EARLY_ACCESS_CATEGORY_EXPLANATION,
  EARLY_ACCESS_RECEIPT_STEPS,
  EARLY_ACCESS_REQUEST_BOUNDARY,
  EARLY_ACCESS_REQUEST_CTA,
  EARLY_ACCESS_REQUEST_INTRO,
  EARLY_ACCESS_REQUEST_STEPS,
} from "./request-experience-copy";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

/** Text a reader can perceive: every text node outside an aria-hidden subtree. */
function perceivableText(scope: Element): string[] {
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (text && !node.parentElement?.closest('[aria-hidden="true"]')) out.push(text);
  }
  return out;
}

describe("Early Access 2.0 guide is presentation only", () => {
  it("shows only reviewed copy constants (no new customer sentences)", async () => {
    await act(async () => root.render(<EarlyAccessRequestGuide browseTargetId="early-access-catalog" />));
    const reviewed = new Set<string>([
      EARLY_ACCESS_BRAND.name,
      // Existing #448 heading, tagline and summary strings, unchanged.
      "How Early Access works", "One request. Clear next steps.", "How review, decisions and payment work",
      EARLY_ACCESS_REQUEST_INTRO, EARLY_ACCESS_REQUEST_CTA.browse, EARLY_ACCESS_REQUEST_CTA.help,
      EARLY_ACCESS_CATEGORY_EXPLANATION, EARLY_ACCESS_REQUEST_BOUNDARY,
      ...EARLY_ACCESS_REQUEST_STEPS.flatMap((step) => [step.title, step.description]),
    ]);
    for (const text of perceivableText(container)) expect(reviewed, text).toContain(text);
  });
  it("keeps the Browse products link text exact (no arrow glyph in the DOM)", async () => {
    await act(async () => root.render(<EarlyAccessRequestGuide browseTargetId="early-access-catalog" />));
    const link = container.querySelector('a[href="#early-access-catalog"]');
    expect(link?.textContent).toBe("Browse products");
    expect(link?.children).toHaveLength(0);
  });
  it("lists step titles only; each description appears once, inside the closed details", async () => {
    await act(async () => root.render(<EarlyAccessRequestGuide />));
    const list = container.querySelector("ol");
    expect([...list!.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(EARLY_ACCESS_REQUEST_STEPS.map((s) => s.title));
    const details = container.querySelector("details")!;
    for (const step of EARLY_ACCESS_REQUEST_STEPS) {
      expect(list!.textContent).not.toContain(step.description);
      expect(container.textContent!.split(step.description)).toHaveLength(2);
      expect(details.textContent).toContain(step.description);
    }
  });
  it("keeps visible headline text available to assistive technology", async () => {
    await act(async () => root.render(<EarlyAccessRequestGuide />));
    for (const hidden of container.querySelectorAll('[aria-hidden="true"]')) {
      // Hidden decoration may carry stage numerals only, never words.
      expect(hidden.textContent ?? "").toMatch(/^[\d\s]*$/);
    }
    expect(container.querySelectorAll("[aria-label]")).toHaveLength(0);
  });
  it("renders all five steps, the local browse target and the support link over SSR", () => {
    const html = renderToStaticMarkup(<EarlyAccessRequestGuide browseTargetId="early-access-catalog" />);
    expect((html.match(/<h3>/g) ?? []).length).toBe(5);
    expect(html).toContain('href="#early-access-catalog"');
    expect(html).toContain('href="/research/support"');
    expect(html).toContain('data-testid="early-access-how-it-works"');
    expect(html).toContain("does not collect payment");
    expect(html).toContain("not human or veterinary use");
    expect(html).not.toMatch(/<form|<input|<button|<select|<textarea/i);
  });
  it("will not convert a caller string into an arbitrary URL", () => {
    const html = renderToStaticMarkup(<EarlyAccessRequestGuide browseTargetId="javascript:alert(1)" />);
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="#');
  });
});

describe("Early Access 2.0 receipt next steps", () => {
  it("stays read-only and shows only the reviewed receipt steps", async () => {
    await act(async () => root.render(<EarlyAccessRequestNextSteps />));
    expect(container.querySelectorAll("form,input,button,select,textarea,a")).toHaveLength(0);
    const reviewed = new Set<string>([
      "What happens next",
      "Keep your reference. There is no need to send the same request again while the team reviews it.",
      ...EARLY_ACCESS_RECEIPT_STEPS.flatMap((step) => [step.title, step.description]),
    ]);
    for (const text of perceivableText(container)) expect(reviewed, text).toContain(text);
    expect(container.textContent).toContain("has not collected payment");
  });
});

describe("Early Access 2.0 stylesheet contract", () => {
  const css = readFileSync(resolve(__dirname, "./early-access-v2.css"), "utf8");
  it("gives the details summary a visible focus ring on the dark panel", () => {
    expect(css).toMatch(/\.xenios-ea-v2 \.xenios-request-guide__details > summary:focus-visible\s*\{[^}]*outline: 3px solid #fff/);
  });
  it("uses em breakpoints so the grid collapses at enlarged text", () => {
    const queries = [...css.matchAll(/@media \(max-width: ([^)]+)\)/g)].map((m) => m[1]);
    expect(queries.length).toBeGreaterThan(0);
    for (const value of queries) expect(value).toMatch(/^[\d.]+em$/);
  });
  it("sets no text below .8125rem and no px font sizes", () => {
    for (const [, value] of css.matchAll(/font-size:\s*([^;]+);/g)) {
      expect(value).not.toMatch(/px/);
      const rem = /^([\d.]+)rem$/.exec(value.trim());
      if (rem) expect(Number(rem[1])).toBeGreaterThanOrEqual(0.8125);
    }
  });
  it("stays scoped: every selector starts with an Early Access 2.0 class", () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...body.matchAll(/(^|[{}])\s*([^{}@\s][^{}]*)\{/g)].map((m) => m[2].trim());
    expect(selectors.length).toBeGreaterThan(10);
    for (const group of selectors) for (const selector of group.split(/,(?![^(]*\))/)) {
      expect(selector.trim()).toMatch(/^\.xenios-(request-guide\.xenios-)?ea-v2/);
    }
    expect(body).not.toMatch(/!important|@import|url\(|position:\s*fixed/);
  });
  it("lets forced-colors rules outrank the panel's own colours", () => {
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toContain(".xenios-request-guide.xenios-ea-v2,");
    expect(forced).toMatch(/\.xenios-request-guide\.xenios-ea-v2 :is\([^)]*\.xenios-ea-v2__kicker/);
    expect(forced).toMatch(/background: Canvas/);
    expect(forced).not.toMatch(/\.xenios-ea-v2 :where\(/);
  });
});
