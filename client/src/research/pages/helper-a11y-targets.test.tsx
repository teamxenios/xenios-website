// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import Faq from "./Faq";

// Source contracts for the accessibility defects the browser matrix
// (scripts/evidence/capture-browser-matrix.mjs) found at 77d3f69 on the
// nonprotected Research pages. Each block names the assertion id that failed.
const pagesRoot = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(resolve(pagesRoot, "../../index.css"), "utf8");
const gatewayCss = readFileSync(resolve(pagesRoot, "gateway-editorial.css"), "utf8");
const signInSource = readFileSync(resolve(pagesRoot, "SignIn.tsx"), "utf8");

describe("TARGETS_44x44 — Sign in standalone links", () => {
  it("gives every standalone Sign in link the shared 44 px documentation-link box", () => {
    // The class already exists for the Apply policy links (Lead commit 9c404d7).
    expect(indexCss).toMatch(/\.ra-documentation-link \{[^}]*min-width: 44px;[^}]*min-height: 44px;[^}]*display: inline-flex;/);
    for (const testId of ["link-forgot-password", "link-signin-gateway", "link-signin-apply", "link-signin-privacy", "link-signin-terms", "link-signin-support"]) {
      expect(signInSource, testId).toMatch(new RegExp(`className="underline ra-documentation-link" data-testid="${testId}"`));
    }
  });
});

describe("TARGETS_44x44 — Gateway skip link", () => {
  it("is at least 44 px tall when revealed by focus (measured 177x42 before)", () => {
    expect(gatewayCss).toMatch(/\.rg-skip-link \{[^}]*min-height: 44px;[^}]*display: inline-flex;[^}]*align-items: center;/);
    expect(gatewayCss).toMatch(/\.rg-skip-link:focus \{ transform: translateY\(0\); \}/);
  });
});

describe("ARIA_REFERENCES_RESOLVE — FAQ disclosure panels", () => {
  it("keeps every aria-controls target in the DOM while collapsed and reveals it on expand", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<Faq />);
    });
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>("button[aria-controls]"));
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      const panel = host.querySelector<HTMLElement>(`#${button.getAttribute("aria-controls")}`);
      expect(panel, `panel for ${button.id}`).not.toBeNull();
      expect(panel!.getAttribute("aria-labelledby")).toBe(button.id);
      expect(panel!.hidden).toBe(button.getAttribute("aria-expanded") !== "true");
    }
    const first = buttons[0];
    const wasOpen = first.getAttribute("aria-expanded") === "true";
    await act(async () => {
      first.click();
    });
    const panel = host.querySelector<HTMLElement>(`#${first.getAttribute("aria-controls")}`)!;
    expect(first.getAttribute("aria-expanded")).toBe(String(!wasOpen));
    expect(panel.hidden).toBe(wasOpen);
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
