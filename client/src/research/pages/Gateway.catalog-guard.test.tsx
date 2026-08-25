// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Gateway from "./Gateway";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const SOURCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "Gateway.tsx");
const STYLE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "gateway-editorial.css");
const PROTECTED_CATALOG = "/research/member/products";
const ALLOWED_HREFS = new Set([
  "#research-main",
  "#offering",
  "#current-offerings",
  "#quality",
  "#how-it-works",
  "#organizations",
  "/research",
  "/research/apply",
  "/research/sign-in",
  PROTECTED_CATALOG,
  "/research/support",
  "/research/privacy",
  "/research/terms",
  "/about",
  "/contact",
]);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function renderGateway() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<Gateway />));
  return container;
}

function hrefs(view: HTMLElement) {
  return Array.from(view.querySelectorAll<HTMLAnchorElement>("a"), (anchor) => anchor.getAttribute("href") ?? "");
}

describe("Gateway catalog boundary", () => {
  it("renders a semantic editorial page without public product commerce", async () => {
    const view = await renderGateway();
    expect(view.querySelectorAll("main")).toHaveLength(1);
    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.querySelectorAll("section").length).toBeGreaterThanOrEqual(9);
    expect(view.querySelectorAll(".rg-category-card")).toHaveLength(6);
    expect(view.textContent).toContain("For research use only. Not for human or veterinary use.");
    expect(view.textContent).not.toMatch(/add to cart|buy now|subscribe now|\$\d/i);

    for (const section of Array.from(view.querySelectorAll("section"))) {
      expect(section.hasAttribute("aria-labelledby"), section.className).toBe(true);
    }
    for (const link of Array.from(view.querySelectorAll<HTMLAnchorElement>("a"))) {
      expect((link.getAttribute("aria-label") || link.textContent || "").trim()).not.toBe("");
    }

    const heroImage = view.querySelector<HTMLImageElement>(".rg-hero-image");
    expect(heroImage?.getAttribute("src")).toBe("/research/editorial-hero-warm-silver.jpg");
    expect(heroImage?.getAttribute("alt")).toBe("");
  });

  it("offers only the approved protected catalog route", async () => {
    const view = await renderGateway();
    const catalogLinks = Array.from(view.querySelectorAll<HTMLAnchorElement>('[data-testid="link-gateway-catalog"]'));
    expect(catalogLinks.length).toBeGreaterThan(0);
    expect(catalogLinks.every((link) => link.getAttribute("href") === PROTECTED_CATALOG)).toBe(true);

    const unsafeCommerceLinks = hrefs(view).filter((href) =>
      /\/api\/|\/checkout|\/cart|\/research\/(products|catalog|shop|supplements)(\/|$|\?)/i.test(href),
    );
    expect(unsafeCommerceLinks).toEqual([]);
  });

  it("keeps a closed allowlist of public-page destinations", async () => {
    const view = await renderGateway();
    const unexpected = hrefs(view).filter((href) => !ALLOWED_HREFS.has(href));
    expect(unexpected).toEqual([]);
    expect(view.querySelectorAll("button")).toHaveLength(0);
  });

  it("does not fetch, embed external assets, or branch around the access boundary", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    for (const forbidden of ["fetch(", "/api/research", "http://", "https://", "localStorage", "sessionStorage", "import.meta.env"]) {
      expect(source, `Gateway source must not contain ${forbidden}`).not.toContain(forbidden);
    }
    expect(source).toContain('const MEMBER_CATALOG_PATH = "/research/member/products"');
  });

  it("keeps the route-level responsive and accessibility safeguards", () => {
    const styles = readFileSync(STYLE_PATH, "utf8");
    expect(styles).toContain("overflow-x: clip");
    expect(styles).toContain("@media (max-width: 900px)");
    expect(styles).toContain("@media (max-width: 620px)");
    expect(styles).toContain("@media (max-width: 360px)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("@media (forced-colors: active)");
    expect(styles).toContain("env(safe-area-inset-bottom)");
    expect(styles).toContain(":focus-visible");
    expect(styles).not.toContain("100vw");
  });

  for (const width of [320, 375, 390, 430, 768, 1440]) {
    it(`preserves the same protected destination at ${width}px`, async () => {
      const original = window.innerWidth;
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      window.dispatchEvent(new Event("resize"));
      try {
        const view = await renderGateway();
        const catalogHrefs = Array.from(
          view.querySelectorAll<HTMLAnchorElement>('[data-testid="link-gateway-catalog"]'),
          (link) => link.getAttribute("href"),
        );
        expect(catalogHrefs.length).toBeGreaterThan(0);
        expect(new Set(catalogHrefs)).toEqual(new Set([PROTECTED_CATALOG]));
      } finally {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: original });
      }
    });
  }
});
