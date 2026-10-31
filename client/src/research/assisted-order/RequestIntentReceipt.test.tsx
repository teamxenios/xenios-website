// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RequestIntentReceipt } from "./RequestIntentReceipt";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const receipt = {
  kind: "unapproved_selection_request" as const,
  requestId: "30000000-0000-4000-8000-000000000001",
  publicReference: "XRI-30000000000040008000000000000001",
  status: "pending_review" as const,
  createdAt: "2026-10-14T12:00:00.000Z",
};
let container: HTMLDivElement;
let root: Root;
let outside: HTMLButtonElement | null;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  outside = null;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  outside?.remove();
  vi.restoreAllMocks();
});

describe("confirmed receipt focus", () => {
  it("leaves focus alone by default", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} />));
    expect(document.activeElement).toBe(document.body);
    expect(focus).not.toHaveBeenCalled();
  });
  it("focuses the confirmation without requesting scroll when focus is on the body", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    expect(document.activeElement).toBe(document.body);
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} focusOnMount />));
    expect(document.activeElement).toBe(container.querySelector("h1"));
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });
  it("preserves deliberate focus outside the receipt", async () => {
    outside = document.createElement("button");
    outside.textContent = "Other action";
    document.body.append(outside);
    outside.focus();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    await act(async () => root.render(<RequestIntentReceipt receipt={receipt} focusOnMount />));
    expect(document.activeElement).toBe(outside);
    expect(focus).not.toHaveBeenCalled();
  });
});
