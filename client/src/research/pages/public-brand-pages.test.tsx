// @vitest-environment jsdom

import { act } from "react";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import AboutResearch from "./AboutResearch";
import AccessHub from "./AccessHub";
import Faq from "./Faq";
import Gateway from "./Gateway";
import HowItWorks from "./HowItWorks";
import PoliciesIndex from "./PoliciesIndex";
import { PublicEditorialFooter, PublicEditorialNav } from "./PublicEditorialNav";
import ResearchContact from "./ResearchContact";
import Support from "./Support";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const INITIAL_HEAD_HTML = document.head.innerHTML;
const INITIAL_TITLE = document.title;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  document.head.innerHTML = INITIAL_HEAD_HTML;
  document.title = INITIAL_TITLE;
  window.history.replaceState({}, "", "/");
});

async function renderPage(component: React.ReactNode): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(component);
  });
  return host;
}

function hrefs(view: HTMLElement): string[] {
  return Array.from(view.querySelectorAll<HTMLAnchorElement>("a[href]"), (anchor) =>
    anchor.getAttribute("href") ?? "",
  );
}

describe("public editorial page system", () => {
  const pages = [
    ["About", <AboutResearch />],
    ["How it works", <HowItWorks />],
    ["Access Hub", <AccessHub />],
    ["FAQ", <Faq />],
    ["Policies", <PoliciesIndex />],
    ["Contact", <ResearchContact />],
    ["Support", <Support />],
  ] as const;

  for (const [name, page] of pages) {
    it(`${name} has one page heading and a keyboard-reachable action`, async () => {
      const view = await renderPage(page);
      expect(view.querySelectorAll("h1")).toHaveLength(1);
      const actions = Array.from(view.querySelectorAll<HTMLElement>("a[href], button"));
      expect(actions.length).toBeGreaterThan(0);
      for (const action of actions) {
        expect(action.getAttribute("tabindex")).not.toBe("-1");
        if (action instanceof HTMLButtonElement) expect(action.disabled).toBe(false);
      }
    });
  }

  it("exports one responsive public nav and footer for Lead-owned MinimalChrome", async () => {
    const view = await renderPage(
      <>
        <PublicEditorialNav current="/research/about" />
        <PublicEditorialFooter />
      </>,
    );
    expect(view.querySelector('nav[aria-label="Research information"]')).not.toBeNull();
    expect(view.querySelector('nav[aria-label="Research information mobile"]')).not.toBeNull();
    expect(view.querySelector('nav[aria-label="Research public footer"]')).not.toBeNull();
    expect(view.querySelector("details.public-editorial-menu summary")?.textContent).toContain("Explore Research");
    expect(view.querySelector('a[href="/research/about"]')?.getAttribute("aria-current")).toBe("page");
    const footerLinks = Array.from(view.querySelectorAll(".public-editorial-footer-link"));
    expect(footerLinks.length).toBeGreaterThanOrEqual(10);
  });

  it("keeps the Access Hub public and fail-closed instead of linking to unprovisioned workspaces", async () => {
    const view = await renderPage(<AccessHub />);
    const links = hrefs(view);
    expect(links).toContain("/research/organizations");
    expect(links).toContain("/research/partners");
    expect(links).toContain("/research/affiliates");
    expect(links).not.toContain("/research/partners/apply");
    expect(links).toContain("/research/supplier-access");
    expect(links).toContain("/research/support");
    expect(view.textContent).toContain("No public supplier workspace is promised");
    expect(view.textContent).toContain("must fail closed");
    expect(view.textContent).toContain("Open early-access entry");
    expect(view.textContent).not.toContain("Invited early-access users");
    expect(view.querySelectorAll("article")).toHaveLength(6);
  });

  it("opens FAQ panels with explicit button and region relationships", async () => {
    const view = await renderPage(<Faq />);
    const buttons = Array.from(view.querySelectorAll<HTMLButtonElement>('[data-testid^="button-faq-"]'));
    expect(buttons).toHaveLength(18);
    expect(buttons[0].getAttribute("aria-expanded")).toBe("true");
    expect(view.querySelector(`#${buttons[0].getAttribute("aria-controls")}`)).not.toBeNull();

    await act(async () => {
      buttons[1].click();
    });

    expect(buttons[0].getAttribute("aria-expanded")).toBe("false");
    expect(buttons[1].getAttribute("aria-expanded")).toBe("true");
    const panel = view.querySelector(`#${buttons[1].getAttribute("aria-controls")}`);
    expect(panel?.getAttribute("role")).toBe("region");
    expect(panel?.getAttribute("aria-labelledby")).toBe(buttons[1].id);
  });

  it("makes policy status discoverable without presenting draft or unconfirmed documents as approved", async () => {
    const view = await renderPage(<PoliciesIndex />);
    expect(view.textContent).toContain("Operational draft");
    expect(view.textContent).toContain("Publication status unconfirmed");
    expect(view.textContent).not.toContain("Approved policy");
    expect(view.querySelector("form")).toBeNull();
    const links = hrefs(view);
    expect(links).toContain("/research/policies/research-use");
    expect(links).toContain("/research/policies/shipping");
    expect(links).toContain("/research/policies/returns");
    expect(links).toContain("/research/privacy");
    expect(links).toContain("/research/terms");
  });

  it("keeps Contact read-only, routes clinical questions away, and makes no SLA promise", async () => {
    const view = await renderPage(<ResearchContact />);
    expect(view.querySelector("form")).toBeNull();
    expect(hrefs(view)).toContain("mailto:research@xeniostechnology.com");
    expect(hrefs(view)).toContain("/care");
    expect(view.textContent).toContain("No response-time promise");
    expect(view.textContent).toContain("Do not email passwords");
  });

  it("uses shared rules for 44px targets, narrow reflow, and forced colors", () => {
    const css = readFileSync(resolve(TEST_DIR, "public-editorial.css"), "utf8");
    expect(css).toContain("min-width: 44px");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("white-space: normal");
    expect(css).toContain("minmax(min(100%, 280px), 1fr)");
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("@media (max-width: 260px)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("max-height: min(70vh, calc(100dvh - 120px))");
  });
});

describe("editorial homepage reconciliation", () => {
  it("keeps the premium hero while routing every public entry through reviewed doors", async () => {
    const view = await renderPage(<Gateway />);
    expect(view.querySelectorAll("main")).toHaveLength(1);
    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.querySelector("#research-main")?.getAttribute("tabindex")).toBe("-1");
    expect(view.textContent).toContain("Research products.A clearer standard.");
    expect(view.textContent).toContain("Understand the pathways");

    const hero = view.querySelector<HTMLImageElement>('.rg-hero-image');
    expect(hero?.getAttribute("src")).toBe("/research/editorial-hero-warm-silver.jpg");
    expect(hero?.getAttribute("alt")).toBe("");
    expect(hero?.getAttribute("aria-hidden")).toBe("true");

    const links = hrefs(view);
    for (const required of [
      "/research/access-hub",
      "/research/organizations",
      "/research/partners",
      "/research/affiliates",
      "/research/how-it-works",
      "/research/about",
      "/research/faq",
      "/research/policies",
      "/research/contact",
      "/research/support",
      "/research/privacy",
      "/research/terms",
      "/care",
    ]) {
      expect(links).toContain(required);
    }
    expect(links.some((href) => /\/research\/(catalog|products|member\/products)/i.test(href))).toBe(false);
  });

  it("pins the verified warm-silver asset and its intrinsic dimensions", () => {
    const assetPath = resolve(TEST_DIR, "../../../public/research/editorial-hero-warm-silver.jpg");
    const bytes = readFileSync(assetPath);
    expect(statSync(assetPath).size).toBe(133_404);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "23ef8826a45f67652525a593cacc15f6af05168346ae6bf64db1abc523d99679",
    );
  });

  it("retains the inherited accessibility motifs and closes the footer-width defect", () => {
    const css = readFileSync(resolve(TEST_DIR, "gateway-editorial.css"), "utf8");
    expect(css).toContain(".rg-skip-link");
    expect(css).toContain(".rg-header::before");
    expect(css).toContain("rgba(18,17,15,.84)");
    expect(css).toMatch(/\.rg-header-nav a\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/);
    expect(css).toContain(".rg-current .rg-section-label { color: #3c3832; }");
    expect(css).toMatch(/\.rg-footer nav a\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/);
    expect(css).toContain("@media (max-width: 260px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("max-height: min(70vh, calc(100dvh - 120px))");
  });

  it("does not revive stale editorial claims or protected catalog routes", () => {
    const files = ["Gateway.tsx", "AboutResearch.tsx", "HowItWorks.tsx", "Faq.tsx"];
    const source = files.map((file) => readFileSync(resolve(TEST_DIR, file), "utf8")).join("\n");
    expect(source).not.toContain("/research/member/products");
    expect(source).not.toContain("/research/catalog");
    expect(source).not.toContain("Some workflows are live");
    expect(source).not.toContain("Current identity");
    expect(source).not.toContain("member catalog is the current record");
    expect(source).not.toContain("Status — Current at time of review");
    expect(source).not.toContain("A single verified Xenios identity");
    expect(source).not.toContain("people already approved");
  });
});
