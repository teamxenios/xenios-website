// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parse, type Root as CssRoot, type Rule } from "postcss";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/Turnstile", () => ({ default: () => null }));
vi.mock("@/research/core", () => ({
  useResearch: () => ({ gate: "unlocked", member: { firstName: "Member" }, signOutMember: vi.fn() }),
}));

import { CareProviderReviewPage } from "@/care/CarePublicPages";
import Privacy from "@/pages/Privacy";
import ResearchLayout from "@/research/layout";
import { BRAND, pageTitle } from "./brand";
import PublicShell from "./PublicShell";
import { AboutPage, PartnersPage } from "./pages";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const publicCss = parse(readFileSync(resolve(__dirname, "../index.css"), "utf8"));
const accountCss = parse(readFileSync(resolve(__dirname, "../research/account-portal/account-portal.css"), "utf8"));
const catalogCss = parse(readFileSync(resolve(__dirname, "../research/catalog-priority/catalog-priority.css"), "utf8"));
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.style.overflow = "";
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

async function render(node: ReactNode, path: string) {
  window.history.replaceState({}, "", path);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
  return host;
}

function rulesFor(css: CssRoot, selector: string): Rule[] {
  const rules: Rule[] = [];
  css.walkRules((rule) => { if (rule.selectors.includes(selector)) rules.push(rule); });
  return rules;
}

function declarations(rule: Rule) {
  const values: Record<string, string> = {};
  rule.walkDecls((declaration) => { values[declaration.prop] = declaration.value; });
  return values;
}

describe("display-only Health public brand", () => {
  it("keeps the canonical name and title formatter independent of the visible shell name", () => {
    expect(BRAND.healthDisplayName).toBe("Xenios Health");
    expect(BRAND.publicName).toBe("Xenios");
    expect(BRAND.legalName).toBe("Xenios Technologies, Inc.");
    expect(pageTitle("Xenios")).toBe("Xenios");
    expect(pageTitle("About")).toBe("About | Xenios");
    expect(pageTitle("Xenios Health")).toBe("Xenios Health | Xenios");
  });

  it.each([
    ["Care", "/care/provider-review", <CareProviderReviewPage />],
    ["Research", "/research/policies", <ResearchLayout><h1>Research Use Policy</h1></ResearchLayout>],
    ["B2B", "/partners", <PartnersPage />],
    ["company", "/about", <AboutPage />],
    ["legal", "/privacy", <Privacy />],
  ] as const)("uses matching visible and accessible Health lockups on the %s public shell", async (_family, path, page) => {
    const view = await render(page, path);
    expect(view.querySelectorAll(".clarity-public-shell")).toHaveLength(1);
    expect(view.querySelectorAll("main")).toHaveLength(1);
    for (const selector of ['[data-testid="nav-main"]', '[data-testid="footer-main"]']) {
      const brand = view.querySelector<HTMLAnchorElement>(`${selector} .clarity-brand-link`)!;
      expect(brand).not.toBeNull();
      expect(brand.textContent).toBe("Xenios Health");
      expect(brand.getAttribute("aria-label")).toBe("Xenios Health home");
      expect(brand.getAttribute("href")).toBe("/");
      expect(brand.querySelector(".wordmark-mark")?.getAttribute("aria-hidden")).toBe("true");
    }
    expect(view.querySelector('a[href="/health"]')).toBeNull();
    expect(view.querySelector('[data-testid="text-copyright"]')?.textContent).toBe(BRAND.copyright);
    if (path === "/care/provider-review") {
      expect(view.querySelector("main")?.textContent).toContain("XENIOS CARE");
      expect(document.title).toContain("Xenios Care");
      expect(view.querySelector('nav[aria-label="Care pages"] a[href="/care/schedule"]')).not.toBeNull();
    }
    if (path === "/about") expect(document.title).toBe("About Xenios | Xenios");
    if (path === "/research/policies") {
      expect(view.querySelector('nav[aria-label="Research information"] a[href="/research/access-hub"]')?.textContent).toBe("Research");
    }
  });

  it("preserves independent Research member chrome and its destinations", async () => {
    const view = await render(<ResearchLayout><h1>Member orders</h1></ResearchLayout>, "/research/member/orders");
    expect(view.querySelector(".clarity-public-shell")).toBeNull();
    expect(view.querySelector(".clarity-brand-name")).toBeNull();
    expect(view.textContent).not.toContain("Xenios Health");
    const home = view.querySelector<HTMLAnchorElement>('[data-testid="link-research-home"]')!;
    expect(home.textContent).toMatch(/xenios\s*research/iu);
    expect(home.getAttribute("href")).toBe("/research/member");
    expect(view.querySelector('nav[aria-label="Member navigation"] a[aria-current="page"]')?.getAttribute("href")).toBe("/research/member/orders");
    expect(view.querySelector('footer a[href="mailto:research@xeniostechnology.com"]')).not.toBeNull();
  });
});

describe("Health shell navigation continuity", () => {
  it("keeps the mobile label, complete menu, canonical actions and both keyboard wrap directions", async () => {
    const view = await render(<PublicShell><h1>Partners</h1></PublicShell>, "/partners");
    const trigger = view.querySelector<HTMLButtonElement>('button[aria-label="Open site menu"]')!;
    expect(view.querySelector('.clarity-nav-actions a[href="/sign-in"]')?.textContent).toBe("Sign In");
    expect(view.querySelector('.clarity-nav-actions a[href="/care/schedule"]')?.textContent).toBe("Start Care");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.hasAttribute("aria-controls")).toBe(false);
    document.body.style.overflow = "auto";
    await act(async () => trigger.click());
    await act(async () => new Promise((done) => window.setTimeout(done, 0)));

    const dialog = view.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')!;
    expect(dialog.getAttribute("aria-label")).toBe("Site navigation");
    expect(trigger.getAttribute("aria-controls")).toBe(dialog.id);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(dialog.querySelector(".clarity-brand-name")?.textContent).toBe("Xenios Health");
    expect(Array.from(dialog.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Full site navigation"] a'), (link) => link.getAttribute("href"))).toEqual([
      "/individuals", "/practices", "/partners", "/how-it-works", "/quality", "/about", "/careers",
      "/products", "/status", "/suppliers", "/faq", "/support",
    ]);
    expect(dialog.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe("/partners");
    expect(Array.from(dialog.querySelectorAll<HTMLAnchorElement>(".clarity-nav-panel-actions a"), (link) => link.getAttribute("href"))).toEqual(["/care/schedule", "/products", "/sign-in"]);
    const controls = dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    const first = controls.item(0);
    const last = controls.item(controls.length - 1);
    expect(document.activeElement).toBe(first);
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(last);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(first);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(view.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("auto");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.hasAttribute("aria-controls")).toBe(false);
  });
});

describe("bounded premium accent and button contracts", () => {
  it("uses exact purple and teal tokens with one decorative gradient consumer", () => {
    const tokens = declarations(rulesFor(publicCss, ":root")[0]);
    expect(tokens["--ink"]).toBe("#0E0E0E");
    expect(tokens["--pulse"]).toBe("#7C3AED");
    expect(tokens["--teal"]).toBe("#14B8C7");
    expect(tokens["--health-accent-rule"]).toBe("linear-gradient(90deg, var(--pulse), var(--teal))");
    const consumers: string[] = [];
    for (const css of [publicCss, accountCss, catalogCss]) css.walkDecls((declaration) => {
      if (declaration.value.includes("var(--health-accent-rule)")) consumers.push((declaration.parent as Rule).selector);
    });
    expect(consumers).toEqual([".clarity-footer-brand::before"]);
    expect(declarations(rulesFor(publicCss, consumers[0])[0])).toMatchObject({ content: '""', display: "block", height: "4px", width: "min(240px, 100%)" });
    // Existing unused gradient primitives are outside this slice.
    expect([tokens["--pill-1"], tokens["--pill-2"], tokens["--pill-3"], tokens["--pill-4"]]).toEqual(["#7C3AED", "#5B6CF0", "#3B9AE0", "#14B8C7"]);
  });

  it("gives public/member controls solid purple focus without a global or admin button override", () => {
    for (const [css, selector] of [
      [publicCss, ".clarity-public-shell .btn:focus-visible"],
      [accountCss, ".account-portal .btn:focus-visible"],
      [accountCss, ".account-portal-nav-link:focus-visible"],
      [catalogCss, ".catalog-priority-filters button:focus-visible"],
    ] as const) {
      const focusRules = rulesFor(css, selector);
      expect(focusRules.some((rule) => declarations(rule).outline === "3px solid var(--pulse)")).toBe(true);
      for (const rule of focusRules) expect(rule.toString()).not.toMatch(/gradient|border-image/iu);
    }
    for (const css of [publicCss, accountCss, catalogCss]) {
      expect(rulesFor(css, ".btn:focus-visible")).toHaveLength(0);
      css.walkRules((rule) => {
        if (rule.selector.includes(".btn:focus-visible")) expect(rule.selector).not.toMatch(/admin|\bra-/iu);
      });
    }
    for (const [css, selector] of [[accountCss, ".account-portal-nav-active"], [catalogCss, ".catalog-priority-filters .catalog-priority-filter-active"]] as const) {
      expect(declarations(rulesFor(css, selector)[0])).toMatchObject({ background: "var(--pulse)", "border-color": "var(--pulse)", color: "#fff" });
    }
  });

  it("preserves shared button heights and the black, outlined and text action variants", () => {
    const sharedButtons = rulesFor(publicCss, ".btn");
    expect(sharedButtons.map((rule) => declarations(rule).height).filter(Boolean)).toEqual(["52px", "56px", "60px", "64px"]);
    expect(declarations(sharedButtons[0])["border-radius"]).toBe("4px");
    expect(declarations(rulesFor(publicCss, ".btn-primary")[0])).toMatchObject({ background: "var(--ink)", color: "var(--paper)", "border-color": "var(--ink)" });
    expect(declarations(rulesFor(publicCss, ".btn-secondary")[0])).toMatchObject({ background: "var(--paper)", color: "var(--ink)", "border-color": "var(--ink)" });
    expect(declarations(rulesFor(publicCss, ".btn-primary:hover")[0]).background).toBeTruthy();
    expect(declarations(rulesFor(publicCss, ".btn-ghost")[0])).toMatchObject({ background: "transparent", "min-height": "44px", "border-bottom": "1px solid var(--ink)" });
    expect(declarations(rulesFor(publicCss, ".clarity-header-care.btn")[0])).toMatchObject({ height: "44px", "min-height": "44px" });
  });

  it("keeps the decorative divider and public focus visible in forced colors", () => {
    const forcedRules: Rule[] = [];
    publicCss.walkAtRules("media", (media) => {
      if (media.params === "(forced-colors: active)") media.walkRules((rule) => { forcedRules.push(rule); });
    });
    expect(forcedRules.some((rule) => rule.selector === ".clarity-footer-brand::before" && declarations(rule).background === "CanvasText")).toBe(true);
    expect(forcedRules.some((rule) => rule.selector === ".clarity-public-shell .btn:focus-visible" && declarations(rule)["outline-color"] === "Highlight")).toBe(true);
  });
});
