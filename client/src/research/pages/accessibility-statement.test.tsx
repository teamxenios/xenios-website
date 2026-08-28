// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import AccessibilityStatement, { ACCESSIBILITY_KNOWN_LIMITATIONS, ACCESSIBILITY_STATEMENT_PATH } from "./AccessibilityStatement";

const pagesRoot = dirname(fileURLToPath(import.meta.url));

describe("Accessibility Statement (unmounted source)", () => {
  it("stays unmounted until the Lead registers it: section.tsx and routes.ts do not reference it", () => {
    const section = readFileSync(resolve(pagesRoot, "../section.tsx"), "utf8");
    const routes = readFileSync(resolve(pagesRoot, "../lib/routes.ts"), "utf8");
    expect(section).not.toContain("AccessibilityStatement");
    expect(routes).not.toContain(ACCESSIBILITY_STATEMENT_PATH);
  });

  it("renders one h1, labelled sections, the known-limitations list and a 44 px report link", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<AccessibilityStatement />);
    });
    expect(host.querySelectorAll("h1")).toHaveLength(1);
    expect(host.querySelector("h1")?.textContent).toBe("Accessibility statement");
    for (const section of Array.from(host.querySelectorAll("section[aria-labelledby]"))) {
      expect(host.querySelector(`#${section.getAttribute("aria-labelledby")}`), section.getAttribute("aria-labelledby") ?? undefined).not.toBeNull();
    }
    expect(host.querySelectorAll('[data-testid="list-a11y-limitations"] li')).toHaveLength(ACCESSIBILITY_KNOWN_LIMITATIONS.length);
    const report = host.querySelector<HTMLAnchorElement>('[data-testid="link-a11y-report"]');
    expect(report?.getAttribute("href")).toMatch(/^mailto:research@xeniostechnology\.com\?subject=Accessibility/);
    expect(report?.className).toContain("ra-documentation-link");
    expect(host.textContent).not.toMatch(/fully (conformant|compliant)/i);
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
