// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss, { type Rule } from "postcss";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./assisted-order.css", () => ({}));
vi.mock("../core", () => ({
  useResearch: () => ({ memberToken: null, memberChecking: false }),
}));

import { AssistedOrderPage } from "./AssistedOrderPage";
import { AssistedOrderConfirmationPage } from "./AssistedOrderConfirmationPage";
import { AssistedOrderStatusPage } from "./AssistedOrderStatusPage";
import { assistedOrderReceiptKey } from "./storage";

const root = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(root, "assisted-order.css"), "utf8");
const stylesheet = postcss.parse(css);
const customer = ".xenios-order-page--customer";
const reference = "XRR-20261003-ABCDEF1234";

function declarations(selector: string): Record<string, string> {
  const result: Record<string, string> = {};
  stylesheet.walkRules((rule) => {
    if (!rule.selectors.includes(selector) || rule.parent?.type !== "root") return;
    rule.walkDecls((declaration) => {
      result[declaration.prop] = declaration.value + (declaration.important ? " !important" : "");
    });
  });
  return result;
}

function markup(element: ReactElement): HTMLDivElement {
  const host = document.createElement("div");
  // Static rendering intentionally does not run effects, fetch, or submit.
  // These are markup/source guards; browser evidence proves the CSS cascade,
  // control geometry, zoom, and keyboard/forced-color rendering separately.
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState({}, "", `/research/early-access/order-request/${reference}`);
});

describe("customer assisted-order premium presentation boundary", () => {
  it.each([false, true])("marks the wizard and its embedded=%s variant as customer presentation", (embedded) => {
    const host = markup(<AssistedOrderPage embedded={embedded} />);
    const page = host.querySelector(".xenios-order-page");
    expect(page?.classList.contains("xenios-order-page--customer")).toBe(true);
    expect(page?.classList.contains("xenios-order-page--embedded")).toBe(embedded);
    expect(host.querySelector('[data-testid="order-continue-contact"]')?.getAttribute("disabled")).not.toBeNull();
  });

  it.each([false, true])("marks confirmation with stored receipt=%s without changing the return/status actions", (hasReceipt) => {
    window.history.replaceState({}, "", `/research/early-access/order-request/confirmation/${reference}`);
    if (hasReceipt) {
      window.sessionStorage.setItem(assistedOrderReceiptKey(reference), JSON.stringify({
        requestId: "synthetic-presentation-request",
        publicReference: reference,
        status: "submitted",
        createdAt: "2026-10-03T12:00:00.000Z",
        estimatedTotalCents: null,
        currency: "USD",
        lines: [],
        nextSteps: ["Synthetic request received", "Synthetic availability review pending"],
      }));
    }
    const host = markup(<AssistedOrderConfirmationPage />);
    expect(host.querySelector(`section.xenios-order-page${customer}`)).not.toBeNull();
    expect(host.querySelector('a.xenios-order-return-link[href="/research/early-access"]')?.textContent).toBe("Explore Products");
    const status = host.querySelector("a.xenios-order-button");
    expect(status?.getAttribute("href")).toBe(`/research/early-access/order-request/${reference}`);
    expect(status?.textContent).toBe(hasReceipt ? "Check Status" : "Check request status");
    expect(host.querySelector('[data-testid="order-confirmation-unavailable"]') !== null).toBe(!hasReceipt);
    expect(host.querySelectorAll(`${customer} .xenios-order-timeline li`)).toHaveLength(hasReceipt ? 2 : 0);
  });

  it("includes the neutral status view so later quote and document controls inherit the customer boundary", () => {
    const host = markup(<AssistedOrderStatusPage />);
    expect(host.querySelector(`.xenios-order-page${customer}`)).not.toBeNull();
    expect(host.querySelector('a.xenios-order-return-link[href="/research/early-access"]')?.textContent).toBe("Explore Products");
    expect(host.textContent).toContain("We verify this link before showing any request details.");
  });

  it("keeps every successor selector outside admin controls and adds no customer !important rules", () => {
    for (const file of ["AdminAssistedOrderQueue.tsx", "AdminAssistedOrderDetail.tsx", "AdminAssistedOrderSession.tsx"]) {
      expect(readFileSync(resolve(root, file), "utf8"), file).not.toContain("xenios-order-page--customer");
    }
    const customerRules: Rule[] = [];
    stylesheet.walkRules((rule) => {
      if (rule.selectors.some((selector) => selector.startsWith(customer))) customerRules.push(rule);
    });
    expect(customerRules.length).toBeGreaterThan(10);
    for (const rule of customerRules) {
      expect(rule.selectors.every((selector) => selector.startsWith(customer)), rule.selector).toBe(true);
      rule.walkDecls((declaration) => expect(declaration.important, rule.selector).toBeFalsy());
    }
    expect(declarations(".xenios-order-page")["--accent"]).toBe("#183d2d");
    expect(declarations(".xenios-order-button")["border-radius"]).toBe("999px");
    expect(declarations(".xenios-order-pagination button")["border-radius"]).toBe("999px");
    expect(declarations(".xenios-order-page:not(.xenios-order-page--customer) .xenios-order-button")).toEqual({
      border: "0 !important",
      background: "var(--accent) !important",
      color: "var(--accent-ink) !important",
    });
  });

  it("keeps the customer timeline neutral, not purple, without changing the admin timeline", () => {
    const override = declarations(`${customer} .xenios-order-timeline li`);
    expect(override).toEqual({ "border-left-color": "var(--rule)" });

    // Resolve the actual root/customer tokens rather than relying on jsdom's
    // incomplete computed-style resolution of CSS custom properties.
    const tokens: Record<string, string> = {};
    postcss.parse(readFileSync(resolve(root, "../../index.css"), "utf8")).walkRules((rule) => {
      if (rule.selector === ":root") rule.walkDecls((declaration) => {
        if (declaration.prop.startsWith("--")) tokens[declaration.prop] = declaration.value;
      });
    });
    Object.assign(tokens, declarations(".xenios-order-page"), declarations(customer));
    const resolveToken = (value: string): string => value.replace(/var\((--[\w-]+)\)/gu,
      (_, token: string) => resolveToken(tokens[token] ?? `unresolved:${token}`));
    const borderColor = resolveToken(override["border-left-color"]);
    expect(borderColor).toBe("rgba(14, 14, 14, 0.10)");
    expect(resolveToken("var(--pulse)")).toBe("#7C3AED");
    expect(borderColor.toLowerCase()).not.toBe(resolveToken("var(--pulse)").toLowerCase());
    expect(borderColor.toLowerCase()).not.toBe("rgb(124, 58, 237)");

    expect(declarations(".xenios-order-timeline li")).toEqual({
      "border-left": "3px solid var(--accent)", "padding-left": "15px", display: "grid", gap: "3px",
    });
    expect(declarations(".xenios-order-page")["--accent"]).toBe("#183d2d");
    expect(declarations(customer)["--accent"]).toBe("var(--pulse)");
  });

  it("gives standalone and action-row primaries the same black, wrapping 44px geometry", () => {
    const primary = declarations(`${customer} .xenios-order-button`);
    expect(primary).toEqual(declarations(`${customer} .xenios-order-actions .xenios-order-button`));
    expect(primary).toMatchObject({
      background: "#0E0E0E", color: "#fff", border: "1px solid #0E0E0E",
      "border-radius": "4px", "min-height": "var(--order-control-height)",
      "max-width": "100%", "white-space": "normal", "overflow-wrap": "anywhere",
      "line-height": "20px", padding: "11px 20px",
    });
    expect(declarations(customer)["--order-control-height"]).toBe("44px");
    expect(declarations(`${customer} .xenios-order-button:not(:disabled):hover`).background).toBe("#1a1a17");
    expect(declarations(`${customer} .xenios-order-skeleton--button`)).toMatchObject({
      height: "var(--order-control-height)", "border-radius": "4px",
    });
  });

  it("provides outlined secondary and underlined tertiary actions without hiding disabled states", () => {
    for (const selector of [".xenios-order-actions button", ".xenios-order-pagination button", ".xenios-order-retry", ".xenios-order-filter-actions button", ".xenios-order-empty button", ".xenios-order-error--catalog button"]) {
      expect(declarations(`${customer} ${selector}`), selector).toMatchObject({
        border: "1px solid var(--ink)", "border-radius": "4px", background: "var(--surface)",
        "min-height": "var(--order-control-height)", "white-space": "normal",
      });
    }
    for (const selector of [".xenios-order-link", ".xenios-order-return-link", ".xenios-order-panel > p > a"]) {
      expect(declarations(`${customer} ${selector}`), selector).toMatchObject({
        color: "var(--ink)", "text-decoration": "underline", "min-height": "var(--order-control-height)",
      });
    }
    expect(declarations(`${customer} .xenios-order-retry:disabled`)).toEqual({ opacity: ".55", cursor: "not-allowed" });
  });

  it("uses solid purple focus and selected emphasis with a system-color focus fallback", () => {
    for (const selector of ["input:focus", "select:focus", "textarea:focus", "button:focus-visible", "a:focus-visible", ".xenios-order-details > summary:focus-visible"]) {
      expect(declarations(`${customer} ${selector}`), selector).toMatchObject({
        outline: "3px solid var(--pulse)", "outline-offset": "3px",
      });
    }
    expect(declarations(`${customer} .xenios-order-steps button.is-active`)["border-color"]).toBe("var(--pulse)");
    expect(declarations(`${customer} .xenios-order-steps button.is-active span`).background).toBe("var(--pulse)");
    const forced = stylesheet.nodes.find((node) => node.type === "atrule" && node.name === "media" && node.params === "(forced-colors: active)");
    expect(forced?.toString()).toContain("outline-color: Highlight");
    expect(forced?.toString()).toContain(`${customer} button:focus-visible`);
  });
});
