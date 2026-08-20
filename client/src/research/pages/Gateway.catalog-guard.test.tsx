// @vitest-environment jsdom
//
// SCOPE CHANGED 2026-08-19, AND THE CHANGE IS NOT SETTLED YET. Read this
// before editing.
//
// The original founder directive (Samuel), enforced here since it was
// written: there must be no "Research Catalog" button, card, tile, hero CTA,
// navigation CTA, or equivalent public catalog-entry control on the /research
// home page. It was recorded as a repeated nonnegotiable.
//
// The 2026-08-19 launch directive ("PUBLIC STOREFRONT + ORDER ENTRY")
// reverses that for ONE surface: "MAKE THE LANDING PAGE COMMERCIAL. Primary
// CTA: Browse Research Catalog. Secondary CTA: Member Sign In." The two
// directives are in direct conflict; the newer one is implemented on
// lane/launch-public-storefront in an isolated commit so it can be dropped
// whole, and it is logged in .xenios/FOUNDER_ACTIONS.md awaiting Samuel's
// confirmation. If the reversal was not intended, revert that commit and this
// file returns to forbidding every catalog CTA.
//
// WHAT THIS GUARD STILL PROTECTS, unchanged and just as hard: the Gateway
// must never link to a MEMBER-PRIVATE, partner, supplier, or admin catalog
// surface. /research/member/products, /research/member/catalog,
// /research/supplements, /research/products and anything catalog-display
// remain forbidden. Only the fail-closed public storefront projection at
// /research/catalog is permitted, and it is separately asserted to be
// present, so the page's commercial intent cannot silently regress either.
//
// See docs/research/RESEARCH_HOME_CATALOG_POLICY.md for the full rationale,
// what changed materially, and how to extend this guard.
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

// The PHRASE denylist is retired as of 2026-08-19 and deliberately empty.
//
// It cannot survive the reversal: the directed primary CTA is literally
// "Browse Research Catalog", so every phrase in the old list ("catalog",
// "research catalog", "browse products", "shop", ...) would now reject the
// page the founder asked for. Renaming the CTA to dodge the denylist, which
// the old policy's rule 5 would otherwise require, is not available either —
// the wording itself is the directive.
//
// Deleting a whole layer of a lock deserves to be uncomfortable, so it is
// stated plainly rather than quietly widened: WORDING IS NO LONGER GUARDED ON
// THIS PAGE. What replaces it is stricter than a word list and is what
// actually mattered — the href denylist below (where a CTA leads, which no
// rename can disguise), the closed allowlist (what may exist at all), and the
// positive storefront assertion. A CTA reading "Shop now" that pointed at
// /research/member/products still fails, on its href, as it always did.
const DENYLISTED_PHRASES: string[] = [];

// Hrefs that lead to a MEMBER-PRIVATE, partner, supplier, or admin catalog
// surface. section.tsx redirects the legacy /research/* paths to their
// canonical /research/member/* equivalents, so a public Gateway CTA pointed
// at either form is equally a private-catalog entry point.
//
// /research/catalog is NOT here any more: it is the fail-closed public
// storefront projection (no SKUs, no member pricing, sells nothing, noindex,
// off unless RESEARCH_PUBLIC_STOREFRONT_ENABLED is exactly "true").
// /research/member/catalog IS still here, and the patterns are anchored so
// the public route can never be read as permission for the member one.
const DENYLISTED_HREF_PATTERNS: RegExp[] = [
  /\/research\/products(\/|$|\?)/i,
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
      // Private Early Access door (link-gateway-early-access). REVIEWED:
      // Samuel's war-room directive routes the founding cohort through
      // /research to the password wall, and the page behind this link is a
      // gate, not a catalog: no product, no price, and nothing purchasable
      // is reachable without the password, an admin-approved customer, and
      // a session-bound email verification. It is an entry point to a lock,
      // which the catalog policy permits; a catalog CTA it is not.
      "/research/early-access",
      // Access Hub door (link-gateway-access-hub). REVIEWED: Samuel's
      // 2026-08-15 General Platform Foundation package adds this on the
      // Gateway by name. The page behind it is a role chooser: it lists the
      // access paths (membership, organization, partner, supplier, Care,
      // Early Access) and links only to application, sign-in, and support
      // doors. No product, no price, and no catalog data are reachable from
      // it without a server-authorized session; a catalog CTA it is not.
      "/research/access-hub",
      // The public storefront (link-gateway-catalog). REVIEWED under the
      // 2026-08-19 launch directive, and the one entry that reverses the
      // original policy. The page behind it is a projection composed for a
      // viewer with no pricing grant: no SKU, no Product Control identity, no
      // price provenance, no member href, no cart, no checkout. It shows a
      // price only where the server supplied one, never zero. It is off
      // unless RESEARCH_PUBLIC_STOREFRONT_ENABLED is exactly "true", and it
      // stays noindex. A member-catalog CTA it is not.
      "/research/catalog",
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
  // "/research/catalog" is deliberately absent: it is the reviewed public
  // storefront. Note it is also a PREFIX of "/research/catalog/:family/:slug",
  // which is fine, and NOT a prefix of "/research/member/catalog", which is
  // listed separately and still forbidden.
  const DENYLISTED_ROUTE_STRINGS = [
    "/research/products",
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
      `Gateway.tsx source contains denylisted catalog route string(s): ${hits.join(", ")}. A member-private, ` +
        `partner, supplier, or admin catalog entry point is not allowed on the /research home page, even inside ` +
        `a conditional the DOM tests above never render. Remove it, or if this is a legitimate addition, update ` +
        `docs/research/RESEARCH_HOME_CATALOG_POLICY.md and the rationale here first.`,
    ).toEqual([]);
  });
});

describe("Gateway: the commercial storefront CTA is present (2026-08-19 directive)", () => {
  // The reversal asserted POSITIVELY. Everything else in this file constrains
  // what may not appear; without this, someone could quietly delete the
  // directed primary CTA and every remaining test would still pass, which is
  // how a commercial landing page silently becomes a wall again.

  it("links to the public storefront exactly once, as a primary CTA", async () => {
    const view = await renderGateway();
    const storefrontLinks = Array.from(
      view.querySelectorAll<HTMLAnchorElement>('a[href="/research/catalog"]'),
    );
    expect(
      storefrontLinks.map(describeElement),
      "the /research Gateway must offer exactly one Browse Research Catalog CTA",
    ).toHaveLength(1);

    const cta = storefrontLinks[0];
    expect(cta.getAttribute("data-testid")).toBe("link-gateway-catalog");
    expect((cta.textContent ?? "").trim()).toBe("Browse Research Catalog");
    // Primary, not a buried text link: the directive names it the primary CTA.
    expect(cta.className).toContain("btn-primary");
  });

  it("offers Member Sign In beside it", async () => {
    const view = await renderGateway();
    const signIn = view.querySelector<HTMLAnchorElement>(
      'a[data-testid="link-gateway-signin"]',
    );
    expect(signIn, "the Gateway must offer a Member Sign In CTA").not.toBeNull();
    expect(signIn!.getAttribute("href")).toBe("/research/sign-in");
    expect((signIn!.textContent ?? "").trim()).toBe("Member Sign In");
  });

  it("still refuses a member-catalog link even alongside the public one", async () => {
    // The anchored patterns must not be readable as blanket permission: prove
    // the member route is rejected while the public route is accepted.
    const host = document.createElement("div");
    host.innerHTML =
      '<a href="/research/catalog">ok</a>' +
      '<a href="/research/member/catalog">not ok</a>';
    const findings = collectDenylistFindings(host);
    expect(findings).toHaveLength(1);
    expect(findings[0].element).toContain("/research/member/catalog");
  });
});
