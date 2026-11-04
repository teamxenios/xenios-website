// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("wouter", () => ({
  useLocation: () => [window.location.pathname, vi.fn()],
  Link: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("@/components/Wordmark", () => ({ default: () => <span>xenios</span> }));
vi.mock("./core", () => ({
  useResearch: () => ({
    gate: "open",
    member: { firstName: "Synthetic", status: "active" },
    submitPassword: vi.fn(),
    signOutMember: vi.fn(async () => undefined),
  }),
}));

import ResearchLayout from "./layout";

/**
 * The phone header is one compact row (KAN-225/10657).
 *
 * Public pages: the brand, Back to gateway and the Explore Xenios menu share
 * the first row; the full link row is a separate desktop-only row. Below
 * 640px Back to gateway moves into the menu, because the wordmark already
 * links to the gateway and three controls do not fit one 320px row.
 *
 * Member pages: the sticky member header publishes its own height as
 * --research-sticky-chrome-height, so the catalog toolbar can stick below it
 * instead of adding a second top:0 bar underneath.
 */

const here = dirname(fileURLToPath(import.meta.url));
const chromeCss = readFileSync(resolve(here, "layout-touch-targets.css"), "utf8");
const editorialCss = readFileSync(resolve(here, "pages/public-editorial.css"), "utf8");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<ResearchLayout><div data-testid="page-content" /></ResearchLayout>));
  return container;
}

function mediaBlock(css: string, query: string): string {
  const start = css.indexOf(`@media (${query}) {`);
  if (start < 0) return "";
  let depth = 0;
  for (let index = css.indexOf("{", start); index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, index + 1);
    }
  }
  return "";
}

describe("compact public header", () => {
  it("puts the brand, Back to gateway and the menu in the first row, and the full links in their own row", () => {
    const view = renderAt("/research/about");
    const header = view.querySelector("header");
    const row = header?.querySelector(".research-minimal-header-row");
    const menus = header?.querySelectorAll("details.public-editorial-menu");
    const links = header?.querySelectorAll('nav[aria-label="Research information"]');

    expect(menus).toHaveLength(1);
    expect(links).toHaveLength(1);
    expect(row?.contains(menus?.[0] ?? null)).toBe(true);
    expect(row?.querySelector('[data-testid="link-research-home"]')).not.toBeNull();
    expect(row?.querySelector("a.research-minimal-back")?.textContent).toBe("Back to gateway");
    expect(row?.contains(links?.[0] ?? null)).toBe(false);
    expect(links?.[0]?.closest(".research-public-links-row")).not.toBeNull();
  });

  it("offers Back to gateway as the first menu item for phones", () => {
    const view = renderAt("/research/faq");
    const menuLinks = Array.from(view.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Research information mobile"] a'));
    expect(menuLinks[0]?.getAttribute("href")).toBe("/research");
    expect(menuLinks[0]?.textContent).toBe("Back to gateway");
    expect(menuLinks[0]?.classList.contains("public-editorial-menu-gateway")).toBe(true);
    // The rest of the menu is the unchanged public link list.
    expect(menuLinks.slice(1).map((link) => link.getAttribute("href"))).toContain("/research/sign-in");
    expect(view.querySelectorAll(".public-editorial-menu-gateway")).toHaveLength(1);
  });

  it("pins the phone CSS: one row, the gateway swap below 640px, and the links row only above 900px", () => {
    const phone = mediaBlock(chromeCss, "max-width: 640px");
    expect(phone).toMatch(/\.research-minimal-back \{[^}]*display: none;/);
    expect(phone).toMatch(/\.research-minimal-header-row,\s*\.research-member-header-row \{[^}]*min-height: 52px;/);
    expect(chromeCss).toMatch(/\.research-minimal-header-row,\s*\.research-member-header-row \{[^}]*min-height: 60px;/);
    expect(editorialCss).toMatch(/\.public-editorial-menu-links \.public-editorial-menu-gateway \{[^}]*display: none;/);
    expect(mediaBlock(editorialCss, "max-width: 640px")).toMatch(/\.public-editorial-menu-links \.public-editorial-menu-gateway \{[^}]*display: inline-flex;/);
    expect(mediaBlock(editorialCss, "max-width: 900px")).toMatch(/\.research-public-links-row \{[^}]*display: none;/);
  });
});

describe("member header height for sticky page toolbars", () => {
  it("publishes the sticky member header height on the member chrome", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const height = this.tagName === "HEADER" ? 118 : 0;
      return { x: 0, y: 0, top: 0, left: 0, right: 390, bottom: height, width: 390, height, toJSON: () => ({}) } as DOMRect;
    });
    const view = renderAt("/research/member/products");
    const chrome = view.querySelector<HTMLElement>('[data-testid="research-member-chrome"]');
    expect(chrome?.querySelector("header")?.className).toContain("sticky");
    expect(chrome?.style.getPropertyValue("--research-sticky-chrome-height")).toBe("118px");
  });

  it("leaves public chrome without a sticky offset, because its header scrolls away", () => {
    const view = renderAt("/research/about");
    expect(view.querySelector('[data-testid="research-member-chrome"]')).toBeNull();
    expect(view.innerHTML).not.toContain("--research-sticky-chrome-height");
  });
});
