// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import Documents from "./ResearchDocuments";
import Quality from "./Quality";
import Testing from "./Testing";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

async function mount(node: React.ReactNode): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

function unmount(): void {
  act(() => root!.unmount());
  root = null;
  host!.remove();
  host = null;
}

function assertSurface(view: HTMLElement): void {
  expect(view.querySelectorAll("h1")).toHaveLength(1);
  expect(view.querySelectorAll("main")).toHaveLength(0);
  for (const action of view.querySelectorAll<HTMLElement>("a, button, input")) {
    expect(action.getAttribute("tabindex")).not.toBe("-1");
  }
}

describe("public quality editorial surfaces", () => {
  it("explains the full lot control flow without unsupported universal testing claims", async () => {
    const view = await mount(<Quality />);
    assertSurface(view);
    for (const phrase of [
      "Receive", "Inspect", "Identify the lot", "Quarantine", "Review evidence",
      "Decide", "Publish approved records", "Store and fulfill",
    ]) expect(view.textContent).toContain(phrase);
    expect(view.textContent).toContain("where applicable");
    expect(view.textContent).toContain("does not, by itself, establish identity, potency, sterility, safety, stability, or suitability");
    expect(view.textContent).not.toMatch(/every lot is independently tested|pharmaceutical grade|clinically proven/i);
    expect(view.querySelector('a[href="/research/testing"]')).not.toBeNull();
    expect(view.querySelector('a[href="/research/documents"]')).not.toBeNull();
  });

  it("separates test categories and states their limits", async () => {
    const view = await mount(<Testing />);
    assertSurface(view);
    for (const phrase of ["Identity", "Purity", "Assay or content", "Microbial, sterility, or endotoxin", "Contaminant panels", "Stability and handling"]) {
      expect(view.textContent).toContain(phrase);
    }
    expect(view.textContent).toContain("where applicable");
    expect(view.textContent).toContain("A COA is not a universal guarantee");
    expect(view.textContent).toContain("does not provide dosing, clinical, or personal-use guidance");
  });

  it("keeps public and secure document lanes distinct with a labeled lot form", async () => {
    const view = await mount(<Documents />);
    assertSurface(view);
    expect(view.textContent).toContain("Approved public lot records");
    expect(view.textContent).toContain("Secure account documents");
    expect(view.textContent).toContain("Version-aware records");
    expect(view.querySelector('a[href="/research/member/documents"]')).not.toBeNull();
    const input = view.querySelector<HTMLInputElement>('input[name="lotCode"]')!;
    expect(input).not.toBeNull();
    expect(view.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    expect(input.getAttribute("autocomplete")).toBe("off");
  });

  it("validates malformed lot input locally without requesting or navigating", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const view = await mount(<Documents />);
    const input = view.querySelector<HTMLInputElement>('input[name="lotCode"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "../private");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("3–64 letters");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(fetcher).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/");
  });

  it("remains structurally narrow-safe and reduced-motion-safe", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(here, "../quality/quality.css"), "utf8");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(/\.quality-loading-spinner\s*\{\s*animation:\s*none\s*!important;/);
    expect(css).toContain("minmax(0, 1fr)");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).not.toMatch(/^\s*width:\s*(?:[4-9]\d\d|\d{4,})px/m);
  });
});
