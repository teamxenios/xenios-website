// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusPage } from "./pages";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "Content-Type": "application/json" } }));
  window.history.replaceState({}, "", "/status");
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  sessionStorage.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function renderPage(url = "/status"): Promise<HTMLDivElement> {
  window.history.replaceState({}, "", url);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<StatusPage />));
  return host;
}

function setInput(view: HTMLElement, name: string, value: string): void {
  const input = view.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function submit(view: HTMLElement): Promise<void> {
  await act(async () => {
    view.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("public status recovery", () => {
  it("requests reference plus email and shows the same neutral result", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 202 }));
    const view = await renderPage();
    setInput(view, "reference", "xrr-20260927-abcdef1234");
    setInput(view, "email", "owner@example.invalid");
    await submit(view);

    expect(fetchMock).toHaveBeenLastCalledWith("/api/research/status-recovery/request", expect.objectContaining({ method: "POST", cache: "no-store" }));
    expect(view.querySelector('[role="status"]')?.textContent).toContain("If the details match an eligible order");
    expect(view.textContent).not.toMatch(/order found|email matched|reference invalid/iu);
  });

  it("keeps network failure and a Care-shaped reference on the same non-enumerating result", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockRejectedValueOnce(new Error("offline"));
    const view = await renderPage();
    setInput(view, "reference", "CARE-ABC12345");
    setInput(view, "email", "owner@example.invalid");
    await submit(view);
    expect(view.querySelector('[role="status"]')?.textContent).toContain("For privacy, we cannot confirm whether a matching order exists");
  });

  it("removes a fragment credential immediately and waits for explicit View status", async () => {
    const token = "T".repeat(43);
    const view = await renderPage(`/status#recovery=${token}`);
    expect(window.location.hash).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);

    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        subjectType: "assisted_order",
        reference: "XRR-20260927-ABCDEF1234",
        status: "reviewing",
        statusLabel: "In review",
        whatHappened: "Xenios is reviewing your request.",
        nextStep: "Wait for the review update from Xenios.",
        nextStepOwner: "xenios",
        returnPath: "/status",
        supportPath: "/support",
        updatedAt: "2026-09-27T20:00:00.000Z",
        timeline: [],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const viewStatus = Array.from(view.querySelectorAll("button")).find((button) => button.textContent === "View status");
    await act(async () => viewStatus?.click());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/research/status-recovery/exchange");
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain(token);
    expect(view.textContent).toContain("In review");
    expect(view.textContent).toContain("Who owns the next step");
  });

  it("restores an exact-order view from the HttpOnly session and can end it", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      subjectType: "assisted_order",
      reference: "XRR-20260927-ABCDEF1234",
      status: "submitted",
      statusLabel: "Received",
      whatHappened: "Xenios received your request.",
      nextStep: "Xenios will review the request and contact you.",
      nextStepOwner: "xenios",
      returnPath: "/status",
      supportPath: "/support",
      updatedAt: "2026-09-27T20:00:00.000Z",
      timeline: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const view = await renderPage();
    expect(view.textContent).toContain("XRR-20260927-ABCDEF1234");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const end = Array.from(view.querySelectorAll("button")).find((button) => button.textContent?.includes("End secure"));
    await act(async () => end?.click());
    expect(fetchMock).toHaveBeenLastCalledWith("/api/research/status/end", expect.objectContaining({ method: "POST" }));
    expect(view.querySelector('input[name="email"]')).not.toBeNull();
  });
});
