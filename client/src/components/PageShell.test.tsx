// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import PageShell from "./PageShell";

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return {
    host,
    unmount: () => act(() => root.unmount()),
  };
}

describe("PageShell skip link", () => {
  it("renders a skip link as the first element, targeting the main content landmark", () => {
    const view = render(
      <PageShell>
        <p data-testid="page-content">page content</p>
      </PageShell>,
    );
    const root = view.host.firstElementChild as HTMLElement;
    const firstChild = root.firstElementChild as HTMLElement;

    expect(firstChild.tagName).toBe("A");
    expect(firstChild.classList.contains("skip-link")).toBe(true);
    expect(firstChild.getAttribute("href")).toBe("#site-main");
    expect(firstChild.textContent).toContain("Skip to content");

    const main = view.host.querySelector("main");
    expect(main).not.toBeNull();
    expect(main?.id).toBe("site-main");
    expect(main?.querySelector('[data-testid="page-content"]')).not.toBeNull();

    view.unmount();
  });

  it("is reachable by keyboard focus (not removed from the tab order)", () => {
    const view = render(
      <PageShell>
        <p>content</p>
      </PageShell>,
    );
    const link = view.host.querySelector("a.skip-link") as HTMLAnchorElement;
    expect(link).not.toBeNull();
    // No tabindex="-1": a real link is focusable and in the tab order by default.
    expect(link.getAttribute("tabindex")).not.toBe("-1");
    link.focus();
    expect(document.activeElement).toBe(link);
    view.unmount();
  });

  it("index.css hides the skip link off-screen until it is focused, and gives it a visible focus style", () => {
    const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
    expect(css).toMatch(/\.skip-link\s*\{[^}]*position:\s*absolute/);
    expect(css).toMatch(/\.skip-link\s*\{[^}]*top:\s*-9999px/);
    expect(css).toMatch(/\.skip-link:focus\s*\{[^}]*top:\s*0/);
  });

  it("index.css keeps a visible keyboard focus outline on the shared input classes (not outline: none with no replacement)", () => {
    const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
    expect(css).toMatch(/\.input-field:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--pulse\)/);
    expect(css).toMatch(/\.cs-fld-input:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--pulse\)/);
  });
});
