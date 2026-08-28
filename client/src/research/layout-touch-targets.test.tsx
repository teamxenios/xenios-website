// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: "unlocked",
  navigate: vi.fn(),
  signOutMember: vi.fn(async () => undefined),
}));

vi.mock("wouter", () => ({
  useLocation: () => [window.location.pathname, mocks.navigate],
  Link: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("./core", () => ({
  useResearch: () => ({
    gate: mocks.gate,
    member: { firstName: "A-very-long-member-name-that-must-wrap" },
    submitPassword: vi.fn(),
    signOutMember: mocks.signOutMember,
  }),
}));

vi.mock("./pages/PublicEditorialNav", () => ({
  PublicEditorialNav: () => <nav aria-label="Research information" />,
  PublicEditorialFooter: () => <footer data-testid="public-footer" />,
}));

import ResearchLayout from "./layout";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "layout-touch-targets.css"), "utf8");
const layoutSource = readFileSync(resolve(here, "layout.tsx"), "utf8");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  mocks.navigate.mockReset();
  mocks.signOutMember.mockClear();
});

function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(
    <ResearchLayout>
      <div data-testid="page-content" />
    </ResearchLayout>,
  ));
  return container;
}

describe("protected Research chrome pointer targets", () => {
  it("gives both minimal-chrome links the shared target and a wrapping row", () => {
    const view = renderAt("/research/about");
    const row = view.querySelector(".research-minimal-header-row");
    const home = view.querySelector<HTMLAnchorElement>('[data-testid="link-research-home"]');
    const back = Array.from(view.querySelectorAll<HTMLAnchorElement>('header a[href="/research"]'))
      .find((link) => link.textContent?.includes("Back to gateway"));

    expect(row).not.toBeNull();
    expect(home?.classList.contains("research-chrome-target")).toBe(true);
    expect(home?.classList.contains("research-chrome-wordmark")).toBe(true);
    expect(back?.classList.contains("research-chrome-target")).toBe(true);
  });

  it("pins both member navigation families, current-page semantics, and wrap-safe sign-out", () => {
    const view = renderAt("/research/member/products");
    const navs = Array.from(view.querySelectorAll<HTMLElement>('nav[aria-label^="Member navigation"]'));
    expect(navs).toHaveLength(2);

    for (const nav of navs) {
      expect(nav.classList.contains("overflow-x-auto")).toBe(true);
      expect(nav.classList.contains("research-member-nav-scroll")).toBe(true);
      const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>("a"));
      expect(links).toHaveLength(10);
      expect(links.every((link) => link.classList.contains("research-member-nav-target"))).toBe(true);
      const current = links.filter((link) => link.getAttribute("aria-current") === "page");
      expect(current).toHaveLength(1);
      expect(current[0]?.getAttribute("href")).toBe("/research/member/products");
    }

    const signOut = view.querySelector<HTMLButtonElement>('[data-testid="button-member-signout"]');
    expect(signOut?.classList.contains("research-member-signout")).toBe(true);
    expect(signOut?.style.minHeight).toBe("44px");
    expect(signOut?.style.height).toBe("");
    expect(signOut?.textContent).toContain("A-very-long-member-name-that-must-wrap");
    expect(view.querySelector(".research-member-header-row")).not.toBeNull();
  });

  it("covers every member footer policy, Support, and linked wordmark target", () => {
    const view = renderAt("/research/member");
    const footer = view.querySelector("footer");
    const policyAndSupport = Array.from(
      footer?.querySelectorAll<HTMLAnchorElement>('a[href^="/research/policies/"], a[href^="mailto:"]') ?? [],
    );

    // Five policy documents plus the Accessibility Statement, plus Support.
    expect(policyAndSupport).toHaveLength(7);
    expect(policyAndSupport.every((link) => link.classList.contains("research-member-footer-target"))).toBe(true);
    expect(footer?.querySelector(".research-member-footer-wordmark > a")).not.toBeNull();
  });

  it("pins geometry, focus, scroll insets, narrow reflow, motion, and forced colors", () => {
    expect(css).toMatch(
      /\.research-chrome-target,[\s\S]*?\.research-member-footer-wordmark > a \{[^}]*min-width: 44px;[^}]*min-height: 44px;[^}]*display: inline-flex;[^}]*align-items: center;/,
    );
    expect(css).toMatch(
      /\.research-member-nav-scroll \{[^}]*padding-inline: 4px;[^}]*padding-top: 4px;[^}]*scroll-padding-inline: 4px;/,
    );
    expect(css).toMatch(/\.research-member-nav-target \{[^}]*flex: none;[^}]*justify-content: center;/);
    expect(css).toMatch(
      /\.btn\.research-member-signout \{[^}]*min-width: 44px;[^}]*min-height: 44px;[^}]*height: auto;[^}]*max-width: 100%;[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/,
    );
    expect(css).toMatch(/\.research-chrome-target:focus-visible,[\s\S]*?outline: 2px solid var\(--pulse\);[\s\S]*?outline-offset: 2px;/);
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("@media (max-width: 320px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain('research-member-nav-target[aria-current="page"]');
    expect(layoutSource).not.toContain("height: 40");
  });
});
