// @vitest-environment jsdom
// Founder directive (Samuel): there must be no "Research Catalog" button,
// card, tile, hero CTA, navigation CTA, or equivalent public catalog-entry
// control on the /research home page (client/src/research/pages/Gateway.tsx,
// mounted at "/research" in client/src/research/section.tsx). This file is
// the automated lock: it must keep failing the build the moment a catalog
// CTA reappears here, whether by direct regression, a responsive-only
// variant, or a feature flag. See docs/research/RESEARCH_HOME_CATALOG_POLICY.md
// for where catalog access legitimately lives instead, and how to extend
// this guard if a new, genuinely non-catalog Gateway CTA is ever added.
//
// Three independent checks live in this one file on purpose, each catching
// something the others cannot:
//   1. A DOM check (this jsdom environment) that renders Gateway and
//      inspects every real element React actually produced, plus a closed
//      allowlist so ANY unexpected new anchor or button fails, not only
//      ones matching the denylist wording.
//   2. A responsive / feature-flag dimension: re-running the same DOM check
//      after changing window.innerWidth, plus an assertion over Gateway's
//      declared parameters and source text proving there is no prop or flag
//      surface today that could vary what renders. jsdom has no layout
//      engine, so this cannot honestly measure "hidden by CSS at this
//      width" the way a real browser could; what it DOES honestly prove is
//      that Gateway's rendered output does not depend on viewport width or
//      on any prop/flag, because it reads none. That is stated plainly
//      rather than pretending to test layout.
//   3. A source-level check (raw text of Gateway.tsx) that scans for the
//      denylisted route strings directly, so a link written inside a branch
//      this render never takes (an `if (flag)`, a dev-only block) would
//      still fail, even though the DOM check above only sees what actually
//      rendered.

import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import Gateway from "./Gateway";

const GATEWAY_SOURCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "Gateway.tsx");

// Phrases that, in an accessible name, visible text, or data-testid, mean
// "this is a way into the product catalog." Matched case-insensitively as
// substrings, so "Research Catalog", "See the catalog", "Shop now", etc. all
// trip it.
const DENYLISTED_PHRASES = [
  "research catalog",
  "catalog",
  "browse products",
  "shop",
  "view products",
  "product catalog",
  "see catalog",
  "enter catalog",
];

// Hrefs that lead to a real or legacy catalog surface. section.tsx redirects
// the legacy /research/* paths to their canonical /research/member/*
// equivalents, so a public Gateway CTA pointed at either form is equally a
// catalog entry point.
const DENYLISTED_HREF_PATTERNS: RegExp[] = [
  /\/research\/products(\/|$|\?)/i,
  /\/research\/catalog(\/|$|\?)/i,
  /\/research\/member\/catalog(\/|$|\?)/i,
  /\/research\/supplements(\/|$|\?)/i,
  /\/research\/member\/products(\/|$|\?)/i, // the real member-catalog route today
  /catalog-display/i,
];

interface Finding {
  reason: string;
  element: string;
}

function describeElement(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const testId = el.getAttribute("data-testid") ?? "";
  const href = el.getAttribute("href") ?? "";
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return `<${tag} data-testid="${testId}" href="${href}">${text}</${tag}>`;
}

// Checks accessible name, visible text, href, and data-testid of every
// anchor and button against both denylists. Returns every match found, not
// just the first, so a failure names every offending element at once.
function collectDenylistFindings(root: HTMLElement): Finding[] {
  const findings: Finding[] = [];
  const elements = Array.from(root.querySelectorAll<HTMLElement>("a, button"));
  for (const el of elements) {
    const label = describeElement(el);
    const ariaLabel = el.getAttribute("aria-label") ?? "";
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const accessibleName = ariaLabel || text;
    const testId = el.getAttribute("data-testid") ?? "";
    const href = el.getAttribute("href") ?? "";

    for (const phrase of DENYLISTED_PHRASES) {
      if (accessibleName.toLowerCase().includes(phrase)) {
        findings.push({ reason: `accessible name matches denylisted phrase "${phrase}"`, element: label });
      }
      if (text.toLowerCase().includes(phrase)) {
        findings.push({ reason: `visible text matches denylisted phrase "${phrase}"`, element: label });
      }
      if (testId.toLowerCase().includes(phrase)) {
        findings.push({ reason: `data-testid matches denylisted phrase "${phrase}"`, element: label });
      }
    }
    for (const pattern of DENYLISTED_HREF_PATTERNS) {
      if (pattern.test(href)) {
        findings.push({ reason: `href matches denylisted pattern ${pattern}`, element: label });
      }
    }
  }
  return findings;
}

function assertNoDenylistFindings(root: HTMLElement, context: string) {
  const findings = collectDenylistFindings(root);
  const detail = findings.map((f) => `${f.element} : ${f.reason}`);
  expect(
    detail,
    `${context}: found ${detail.length} catalog entry point(s) on the /research Gateway page.\n${detail.join("\n")}`,
  ).toEqual([]);
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function renderGateway(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Gateway />);
  });
  return container;
}

describe("Gateway: no public catalog entry point (DOM)", () => {
  it("has zero elements matching the catalog-entry-point denylist", async () => {
    const view = await renderGateway();
    assertNoDenylistFindings(view, "base render");
  });

  it("contains no anchor or button outside the known-good allowlist", async () => {
    // Defense in depth beyond the denylist above: rather than only reject
    // known-bad wording, this asserts the CLOSED set of legitimate elements,
    // so any unexpected new anchor or button on this page fails review even
    // if its label happens not to match a denylisted phrase.
    const ALLOWED_HREFS = new Set([
      "/", // Wordmark's link back to the site root
      "/research/apply",
      "/research/sign-in",
      "/research/privacy",
      "/research/terms",
      "/research/support",
    ]);

    const view = await renderGateway();
    const buttons = view.querySelectorAll("button");
    expect(buttons, "the Gateway page is expected to render no <button> elements at all").toHaveLength(0);

    const anchors = Array.from(view.querySelectorAll<HTMLAnchorElement>("a"));
    expect(anchors.length, "expected at least one anchor on the Gateway page").toBeGreaterThan(0);

    const unexpected = anchors.filter((a) => !ALLOWED_HREFS.has(a.getAttribute("href") ?? ""));
    const detail = unexpected.map(describeElement);
    expect(
      detail,
      `Unexpected anchor(s) on the /research Gateway page (not in the known-good allowlist). ` +
        `Any new CTA on this public page must be reviewed against docs/research/RESEARCH_HOME_CATALOG_POLICY.md ` +
        `before being added:\n${detail.join("\n")}`,
    ).toEqual([]);
  });
});

describe("Gateway: responsive + feature-flag dimension", () => {
  // jsdom does not run a layout engine, so there is no honest way here to
  // assert "this element is hidden by CSS at a narrow width" the way a real
  // browser could. What this section actually, honestly proves instead:
  //   (a) Gateway declares no props/parameters and reads no flag, env, or
  //       storage API, so there is currently no prop/flag permutation space
  //       to drive at all (and the assertions below fail the instant that
  //       changes, forcing the new surface to be enumerated here); and
  //   (b) Gateway's rendered DOM is identical (and clean) whether the
  //       reported viewport is narrow or wide, since nothing in its source
  //       branches on window size either.

  it("declares zero parameters, so there is no prop-driven flag to permute", () => {
    // A component that reads a boolean prop must declare a parameter to
    // receive it. Gateway is `export default function Gateway()`, so
    // Gateway.length is 0 today. The instant a future author adds a props
    // type/parameter, this fails, and the fix is to enumerate every new
    // boolean prop/flag and drive collectDenylistFindings() across every
    // value of it, not just the default.
    expect(
      Gateway.length,
      "Gateway now declares a parameter (a props type). Enumerate every boolean prop/flag it reads and " +
        "render it under every value, asserting collectDenylistFindings() stays empty for each, before this " +
        "test is allowed to pass again.",
    ).toBe(0);
  });

  it("reads no flag, env, storage, or context API that could branch its output", () => {
    const source = readFileSync(GATEWAY_SOURCE_PATH, "utf8");
    const FLAG_APIS = [
      "useContext(",
      "useFeatureFlag",
      "useFlag",
      "import.meta.env",
      "process.env",
      "localStorage",
      "sessionStorage",
      "useSearch(",
      "useParams(",
      "matchMedia",
    ];
    const hits = FLAG_APIS.filter((api) => source.includes(api));
    expect(
      hits,
      `Gateway.tsx now reads: ${hits.join(", ")}. Any of these can branch what renders, so each must be ` +
        `enumerated and driven through every value in this test file (not just the default render) before ` +
        `this test is allowed to pass again.`,
    ).toEqual([]);
  });

  const VIEWPORT_WIDTHS = [320, 375, 768, 1024, 1440];

  for (const width of VIEWPORT_WIDTHS) {
    it(`stays clean at a reported ${width}px viewport width (DOM re-check only, see comment above)`, async () => {
      const original = window.innerWidth;
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      window.dispatchEvent(new Event("resize"));
      try {
        const view = await renderGateway();
        assertNoDenylistFindings(view, `${width}px render`);
      } finally {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: original });
      }
    });
  }
});

describe("Gateway: source-level route guard", () => {
  // A DOM render only proves what THIS render produced. A link written
  // inside a branch this render never takes would never show up in the DOM
  // checks above and would still ship. This test reads the raw source text
  // instead, so it catches a denylisted route string anywhere in the file,
  // reachable by this render or not. It intentionally checks specific route
  // STRINGS rather than the word-denylist above: Gateway.tsx's own header
  // comment legitimately contains the word "catalog" ("No navigation, no
  // catalog, ..."), so a bare word scan would false-positive on that
  // comment; a route-string scan does not.
  const DENYLISTED_ROUTE_STRINGS = [
    "/research/products",
    "/research/catalog",
    "/research/member/catalog",
    "/research/supplements",
    "/research/member/products", // the real member-catalog route today
    "catalog-display",
  ];

  it("contains none of the denylisted catalog route strings anywhere in its source", () => {
    const source = readFileSync(GATEWAY_SOURCE_PATH, "utf8");
    const hits = DENYLISTED_ROUTE_STRINGS.filter((route) => source.includes(route));
    expect(
      hits,
      `Gateway.tsx source contains denylisted catalog route string(s): ${hits.join(", ")}. A public catalog ` +
        `entry point is not allowed on the /research home page, even inside a conditional the DOM tests above ` +
        `never render. Remove it, or if this is a legitimate non-catalog addition, update ` +
        `docs/research/RESEARCH_HOME_CATALOG_POLICY.md and the rationale here first.`,
    ).toEqual([]);
  });
});
