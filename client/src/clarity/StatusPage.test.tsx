// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { assistedOrderTokenKey } from "@/research/assisted-order/storage";
import { StatusPage } from "./pages";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORDER_REFERENCE = "XRR-20260926-ABCDEF1234";
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  sessionStorage.clear();
  window.history.replaceState({}, "", "/status");
});

async function renderPage(): Promise<HTMLDivElement> {
  window.history.replaceState({}, "", "/status");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<StatusPage />));
  return host;
}

async function submitReference(view: HTMLElement, reference: string): Promise<void> {
  const input = view.querySelector<HTMLInputElement>('input[name="reference"]')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, reference);
  await act(async () => {
    view.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("public status credential boundary", () => {
  it("never opens private order details from a reference alone", async () => {
    const view = await renderPage();
    await submitReference(view, ORDER_REFERENCE.toLowerCase());

    expect(window.location.pathname).toBe("/status");
    expect(view.querySelector('[role="status"]')?.textContent).toContain("does not have the secure status credential");
    expect(view.textContent).toContain("A reference by itself never unlocks private order details");
  });

  it("opens the order route only when this browser has its status credential", async () => {
    sessionStorage.setItem(assistedOrderTokenKey(ORDER_REFERENCE), "status-secret");
    const view = await renderPage();
    await submitReference(view, `  ${ORDER_REFERENCE.toLowerCase()}  `);

    expect(window.location.pathname).toBe(`/research/early-access/order-request/${ORDER_REFERENCE}`);
  });

  it.each([
    ["CARE-123E4567", "Care requests are updated directly", "/care/support"],
    ["INQ-ABC12345", "Business inquiries do not have a public status page", "/support"],
  ] as const)("routes %s to its bounded support message", async (reference, message, supportHref) => {
    const view = await renderPage();
    await submitReference(view, reference);

    expect(window.location.pathname).toBe("/status");
    expect(view.querySelector('[role="status"]')?.textContent).toContain(message);
    expect(view.querySelector(`a[href="${supportHref}"]`)).not.toBeNull();
  });

  it("routes XEA, XEC, and XO order references to secure-account guidance instead of invalid", async () => {
    const view = await renderPage();
    for (const reference of ["XEA-ABC12345", "XEC-ABC12345", "XO-ABC12345"]) {
      await submitReference(view, reference);
      expect(window.location.pathname).toBe("/status");
      expect(view.querySelector('[role="status"]')?.textContent).toContain("belongs in your secure account");
      expect(view.querySelector('[role="alert"]')).toBeNull();
    }
    expect(view.querySelector('a[href="/sign-in"]')).not.toBeNull();
  });

  it("announces malformed references without navigating", async () => {
    const view = await renderPage();
    await submitReference(view, "../private");

    expect(window.location.pathname).toBe("/status");
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("not recognized");
  });
});
