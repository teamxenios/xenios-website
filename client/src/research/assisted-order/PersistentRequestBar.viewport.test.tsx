// @vitest-environment jsdom
import { StrictMode, act } from "react";
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
let host: HTMLDivElement, root: Root, dockTop: number, frames: Map<number, FrameRequestCallback>, frameId: number;
function createCallbacks() {
  return {
    onContinue: vi.fn((): void => {}),
    onSubmit: vi.fn((): void => {}),
    focusContactHeading: vi.fn((): void => {}),
  };
}
let callbacks: ReturnType<typeof createCallbacks>;
let oldPadding: string, oldPriority: string;
let oldInnerHeight: PropertyDescriptor | undefined;
const padding = () => document.documentElement.style.getPropertyValue("scroll-padding-bottom");
const primary = () => document.querySelector<HTMLButtonElement>('[data-testid="request-action-bar-primary"]')!;
beforeEach(() => {
  oldPadding = padding(); oldPriority = document.documentElement.style.getPropertyPriority("scroll-padding-bottom");
  document.documentElement.style.removeProperty("scroll-padding-bottom");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  callbacks = createCallbacks();
  dockTop = 600; frames = new Map(); frameId = 0;
  oldInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.set(++frameId, callback); return frameId; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("data-testid") === "request-action-bar"
      ? { top: dockTop, bottom: 844, left: 0, right: 390, width: 390, height: 844 - dockTop, x: 0, y: dockTop, toJSON: () => ({}) }
      : { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
  });
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks();
  if (oldInnerHeight) Object.defineProperty(window, "innerHeight", oldInnerHeight);
  if (oldPadding) document.documentElement.style.setProperty("scroll-padding-bottom", oldPadding, oldPriority);
  else document.documentElement.style.removeProperty("scroll-padding-bottom");
});
async function mount(overrides: Partial<RequestBarState> = {}, strict = false) {
  const component = <PersistentRequestBar state={{ ...state, ...overrides }} lines={lines}
    contactFormId="test-contact-form" {...callbacks} />;
  await act(async () => root.render(strict ? <StrictMode>{component}</StrictMode> : component));
}
async function flush() {
  await act(async () => { const current = [...frames.values()]; frames.clear(); current.forEach((fn) => fn(0)); });
}
describe("actual request dock viewport integration", () => {
  it("installs measured clearance without sending or continuing", async () => {
    await mount(); expect(padding()).toContain("256px");
    expect(callbacks.onContinue).not.toHaveBeenCalled(); expect(callbacks.onSubmit).not.toHaveBeenCalled();
  });
  it("keeps the document-end spacer based on the measured dock height", async () => {
    await mount(); expect(document.querySelector<HTMLElement>('[data-testid="request-action-bar-spacer"]')!.style.height).toBe("260px");
  });
  it("updates clearance when the window resizes", async () => {
    await mount(); dockTop = 450; window.dispatchEvent(new Event("resize")); await flush();
    expect(padding()).toContain("406px"); expect(callbacks.onSubmit).not.toHaveBeenCalled();
  });
  it("does not move deliberate navigation focus on resize", async () => {
    await mount(); const link = document.createElement("a"); link.href = "#navigation"; document.body.prepend(link); link.focus();
    dockTop = 470; window.dispatchEvent(new Event("resize")); await flush();
    expect(document.activeElement).toBe(link); link.remove();
  });
  it("restores the original inline padding and priority on unmount", async () => {
    document.documentElement.style.setProperty("scroll-padding-bottom", "300px", "important");
    await mount(); await act(async () => root.render(null));
    expect(padding()).toBe("300px"); expect(document.documentElement.style.getPropertyPriority("scroll-padding-bottom")).toBe("important");
  });
  it("removes its padding when no original value existed", async () => {
    await mount(); await act(async () => root.render(null)); expect(padding()).toBe("");
  });
  it("does not overwrite a later root style owner", async () => {
    await mount(); document.documentElement.style.setProperty("scroll-padding-bottom", "333px", "important");
    dockTop = 400; window.dispatchEvent(new Event("resize")); await flush();
    await act(async () => root.render(null)); expect(padding()).toBe("333px");
  });
  it("cleans up through StrictMode setup/cleanup/setup", async () => {
    await mount({}, true); expect(padding()).toContain("256px");
    await act(async () => root.render(null)); expect(padding()).toBe("");
  });
  it("cannot reinstall padding through a queued resize after unmount", async () => {
    await mount(); window.dispatchEvent(new Event("resize")); await act(async () => root.render(null)); await flush(); expect(padding()).toBe("");
  });
  it("keeps continuation disabled before agreement acceptance", async () => {
    await mount({ continuationEnabled: false }); expect(primary().disabled).toBe(true);
    await act(async () => primary().click()); expect(callbacks.onContinue).not.toHaveBeenCalled();
  });
  it("preserves native contact-form association", async () => {
    await mount({ step: "contact", contactReady: false }); expect(primary().type).toBe("submit");
    expect(primary().getAttribute("form")).toBe("test-contact-form"); expect(callbacks.onSubmit).not.toHaveBeenCalled();
  });
  it("keeps final acknowledgments mandatory", async () => {
    await mount({ step: "review", allAcknowledged: false }); expect(primary().disabled).toBe(true);
    await act(async () => primary().click()); expect(callbacks.onSubmit).not.toHaveBeenCalled();
  });
  it("preserves the explicit same-request retry", async () => {
    await mount({ step: "review", frozen: true }); expect(primary().textContent).toBe("Retry same request");
    await act(async () => primary().click()); expect(callbacks.onSubmit).toHaveBeenCalledTimes(1);
  });
  it("keeps the action blocked during an in-flight request", async () => {
    await mount({ step: "review", busy: true }); expect(primary().disabled).toBe(true);
    await act(async () => primary().click()); expect(callbacks.onSubmit).not.toHaveBeenCalled();
  });
  it("uses the original enabled submit handler only after an explicit click", async () => {
    await mount({ step: "review" }); expect(callbacks.onSubmit).not.toHaveBeenCalled();
    await act(async () => primary().click()); expect(callbacks.onSubmit).toHaveBeenCalledTimes(1);
    expect(callbacks.onContinue).not.toHaveBeenCalled();
  });
  it("preserves the selection summary and removes its portal on unmount", async () => {
    await mount(); expect(document.querySelector('[data-testid="request-action-bar"]')!.textContent).toContain("2 requested units");
    await act(async () => root.render(null)); expect(document.querySelector('[data-testid="request-action-bar"]')).toBeNull();
  });
});
