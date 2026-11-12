// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersistentRequestBar } from "./PersistentRequestBar";
import type { RequestBarState } from "./persistent-request-bar-model";
vi.mock("./persistent-request-bar.css", () => ({}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const state: RequestBarState = { step: "products", selectedCount: 1, continuationEnabled: true,
  configReady: true, storageReady: true, contactReady: true, requirementsNeedRefresh: false,
  requirementsCount: 2, allAcknowledged: true, busy: false, frozen: false };
const lines = [{ key: "synthetic:variant", name: "Synthetic exact product", specification: "Synthetic variant", quantity: 2 }];
let host: HTMLDivElement, root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
const primary = () => document.querySelector<HTMLButtonElement>('[data-testid="request-action-bar-primary"]')!;
async function mount(overrides: Partial<RequestBarState> = {}) {
  const onContinue = vi.fn(), onSubmit = vi.fn();
  await act(async () => root.render(<PersistentRequestBar state={{ ...state, ...overrides }}
    lines={lines} contactFormId="test-contact-form" onContinue={onContinue}
    focusContactHeading={() => {}} onSubmit={onSubmit} />));
  return { onContinue, onSubmit };
}
describe("persistent request bar (real React and shared Dialog)", () => {
  it("reserves dock clearance after content that follows the form", async () => {
    const footer = document.createElement("footer");
    document.body.append(footer);
    try {
      await mount();
      const dock = document.querySelector('[data-testid="request-action-bar"]');
      const spacer = document.querySelector('[data-testid="request-action-bar-spacer"]')!;
      expect(dock?.parentElement).toBe(document.body);
      expect(spacer.parentElement).toBe(document.body);
      expect(footer.compareDocumentPosition(spacer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    } finally {
      footer.remove();
    }
  });
  it("does not execute a transaction on mount", async () => {
    const callbacks = await mount(); expect(callbacks.onSubmit).not.toHaveBeenCalled(); expect(callbacks.onContinue).not.toHaveBeenCalled();
  });
  it("continues through the supplied existing callback only", async () => {
    const callbacks = await mount(); await act(async () => primary().click());
    expect(callbacks.onContinue).toHaveBeenCalledTimes(1); expect(callbacks.onSubmit).not.toHaveBeenCalled();
  });
  it("keeps both continuation actions disabled before policy acceptance", async () => {
    const callbacks = await mount({ continuationEnabled: false });
    expect(primary().disabled).toBe(true);
    await act(async () => primary().click());
    const trigger = document.querySelector<HTMLButtonElement>('[data-testid="request-action-bar-summary"]')!;
    await act(async () => trigger.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    const next = [...dialog.querySelectorAll("button")].find(button => button.textContent === "Continue to details")!;
    expect(next.disabled).toBe(true);
    await act(async () => next.click());
    expect(document.querySelector('[role="dialog"]')).toBe(dialog);
    expect(callbacks.onContinue).not.toHaveBeenCalled();
  });
  it("uses the native contact form association, not the request submit callback", async () => {
    const c = await mount({ step: "contact", contactReady: false });
    expect(primary().type).toBe("submit"); expect(primary().getAttribute("form")).toBe("test-contact-form");
    expect(c.onSubmit).not.toHaveBeenCalled();
  });
  it("requires all final acknowledgments", async () => {
    const c = await mount({ step: "review", allAcknowledged: false }); expect(primary().disabled).toBe(true);
    await act(async () => primary().click()); expect(c.onSubmit).not.toHaveBeenCalled();
  });
  it("submits only on an explicit enabled review action", async () => {
    const c = await mount({ step: "review" }); await act(async () => primary().click());
    expect(c.onSubmit).toHaveBeenCalledTimes(1); expect(c.onContinue).not.toHaveBeenCalled();
  });
  it("keeps uncertain retries explicitly the same request", async () => {
    const c = await mount({ step: "review", frozen: true }); expect(primary().textContent).toBe("Retry same request");
    await act(async () => primary().click()); expect(c.onSubmit).toHaveBeenCalledTimes(1);
  });
  it("disables duplicate actions during in-flight work", async () => {
    const c = await mount({ step: "review", busy: true }); expect(primary().disabled).toBe(true);
    await act(async () => primary().click()); expect(c.onSubmit).not.toHaveBeenCalled();
  });
  it("opens a read-only selection dialog without a request callback", async () => {
    const c = await mount(); const trigger = document.querySelector<HTMLButtonElement>('[data-testid="request-action-bar-summary"]')!;
    await act(async () => trigger.click()); const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Synthetic exact product"); expect(dialog?.textContent).toContain("Requested quantity: 2");
    expect(dialog?.textContent).toContain("not an approved order");
    expect(c.onSubmit).not.toHaveBeenCalled(); expect(c.onContinue).not.toHaveBeenCalled();
    const close = [...dialog!.querySelectorAll("button")].find(b => b.textContent === "Return to request")!;
    await act(async () => close.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("does not render a price or a payment promise", async () => {
    await mount(); const dock = document.querySelector('[data-testid="request-action-bar"]')!;
    expect(dock.textContent).not.toContain("$"); expect(dock.textContent).toContain("No payment");
  });
  it("removes its portal and spacer when unmounted", async () => {
    await mount(); await act(async () => root.render(null));
    expect(document.querySelector('[data-testid="request-action-bar"]')).toBeNull();
    expect(document.querySelector('[data-testid="request-action-bar-spacer"]')).toBeNull();
  });
});
