// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/Turnstile", () => ({ default: () => null }));

import PublicShell from "./PublicShell";
import { PartnersPage, PracticesPage, SuppliersPage } from "./pages";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.style.overflow = "";
  window.history.replaceState({}, "", "/");
});

async function render(node: React.ReactNode, path = "/"): Promise<HTMLDivElement> {
  window.history.replaceState({}, "", path);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
  return host;
}

describe("approved public relationship boundaries", () => {
  it("states the exact practice/client authority boundary without public economics", async () => {
    const view = await render(<PracticesPage />, "/practices");
    expect(view.textContent).toContain("Clients create and own their own accounts.");
    expect(view.textContent).toContain("A practice account doesn't place orders for clients, edit client accounts or approve treatment. Each client accepts the research-use terms themselves.");
    expect(view.textContent).toContain("In-clinic inventory is under review.");
    expect(view.textContent).not.toMatch(/\b20%\b|\b7\.5%\b|\$50 minimum/i);
  });

  it.each([
    ["/practices", <PracticesPage />],
    ["/partners", <PartnersPage />],
    ["/suppliers", <SuppliersPage />],
  ] as const)("keeps the %s inquiry CTA attached to a real hash target", async (path, page) => {
    const view = await render(page, path);
    const link = view.querySelector<HTMLAnchorElement>(`a[href="${path}#inquiry"]`)!;
    expect(link).not.toBeNull();
    expect(view.querySelector("#inquiry")).not.toBeNull();

    await act(async () => link.click());
    expect(window.location.pathname).toBe(path);
    expect(window.location.hash).toBe("#inquiry");
  });
});

describe("shared public chrome", () => {
  it("provides one skip target, canonical account actions, and grouped footer links", async () => {
    const view = await render(<PublicShell><h1>Example page</h1></PublicShell>, "/about");
    expect(view.querySelectorAll("main")).toHaveLength(1);
    expect(view.querySelector('a[href="#site-main"]')?.textContent).toBe("Skip to content");
    expect(view.querySelector("#site-main")?.getAttribute("tabindex")).toBe("-1");
    expect(view.querySelector('[data-testid="nav-main"] a[href="/sign-in"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="nav-main"] a[href="/care/schedule"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="footer-main"] nav[aria-label="Legal footer links"]')).not.toBeNull();
  });

  it("locks scroll, focuses the modal, and returns focus after Escape", async () => {
    const view = await render(<PublicShell><h1>Example page</h1></PublicShell>);
    const trigger = view.querySelector<HTMLButtonElement>('button[aria-label="Open site menu"]')!;
    await act(async () => trigger.click());
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));

    const close = view.querySelector<HTMLButtonElement>('button[aria-label="Close menu"]')!;
    expect(view.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(close);

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(view.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });
});
