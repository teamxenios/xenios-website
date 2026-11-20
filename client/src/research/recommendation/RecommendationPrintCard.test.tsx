// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationLink } from "@shared/research/referral-v1";
import RecommendationPrintCard, { PRINT_CHECKING, PRINT_REQUESTED } from "./RecommendationPrintCard";
import { createRecommendationQr } from "./qr-export";

const now = Date.parse("2026-09-07T12:00:00Z");
const link = (patch: Partial<RecommendationLink> = {}): RecommendationLink => ({
  id: "synthetic-link", url: `${location.origin}/r/r1_${"Ab_-".repeat(10)}ABC`, state: "ready",
  destinationPath: "/health", createdAt: "2026-09-06T12:00:00Z", expiresAt: "2026-09-08T12:00:00Z",
  revokedAt: null, opens: 0, accountsLinked: 0, ...patch,
});
let root: Root;
let host: HTMLDivElement;
let close: () => void;
let print: () => void;
const render = (value = link(), printing = false) => act(async () => root.render(
  <RecommendationPrintCard link={value} qr={createRecommendationQr(link())!} onClose={close} onPrint={print} printing={printing} />,
));
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent === label)!;
const status = () => dialog()?.querySelector('[role="status"]')?.textContent ?? null;
const afterPrint = () => act(async () => { window.dispatchEvent(new Event("afterprint")); });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(Date, "now").mockReturnValue(now);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  close = vi.fn(); print = vi.fn();
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("scoped recommendation print card", () => {
  it("prints a local QR with the exact visible URL, disclosure, expiry, and no account identity", async () => {
    await render();
    const qr = createRecommendationQr(link())!;
    expect(dialog()?.getAttribute("aria-modal")).toBe("true");
    expect(dialog()?.textContent).toContain(qr.url);
    expect(dialog()?.querySelector("path")?.getAttribute("d")).toBe(qr.path);
    expect(dialog()?.querySelector("svg")?.getAttribute("viewBox")).toBe(`0 0 ${qr.size} ${qr.size}`);
    expect(dialog()?.textContent).toContain("may receive compensation for eligible activity");
    expect(dialog()?.textContent).toContain("2026-09-08 (UTC)");
    expect(dialog()?.textContent).toContain("No medical, income, access, or commission guarantee");
    expect(dialog()?.innerHTML).not.toMatch(/synthetic-link|<img|https:\/\/.+\.png/);
    expect(print).not.toHaveBeenCalled();
  });

  it("uses explicit print intent without claiming a saved PDF or delivery", async () => {
    await render();
    await act(async () => button("Print / Save as PDF").click());
    expect(print).toHaveBeenCalledTimes(1);
    expect(dialog()?.textContent).toContain("cannot be recalled");
    expect(dialog()?.textContent).not.toContain("PDF saved");
  });

  it("close and Escape dismiss the local preview", async () => {
    await render();
    await act(async () => button("Close preview").click());
    await act(async () => dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("contains keyboard focus in the modal and restores it on unmount", async () => {
    const origin = document.createElement("button"); document.body.append(origin); origin.focus();
    await render();
    const first = button("Close preview"), last = button("Print / Save as PDF");
    expect(document.activeElement).toBe(first);
    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(last);
    await act(async () => last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(first);
    await act(async () => root.render(null));
    expect(dialog()).toBeNull(); expect(document.activeElement).toBe(origin); origin.remove();
  });

  it.each(["revoked", "expired", "partner_inactive", "unavailable"] as const)("does not create a print surface for %s", async state => {
    await render(link({ state })); expect(dialog()).toBeNull(); expect(print).not.toHaveBeenCalled();
  });

  it("blocks an expired click even before the expiry timer is serviced", async () => {
    await render();
    vi.mocked(Date.now).mockReturnValue(Date.parse(link().expiresAt));
    await act(async () => button("Print / Save as PDF").click());
    expect(print).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
  });

  it("requests preview removal at expiry and marks a pending print check busy without disabling it", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    await render(link({ expiresAt: new Date(now + 500).toISOString() }), true);
    expect(button("Checking link…").disabled).toBe(false);
    expect(button("Checking link…").getAttribute("aria-disabled")).toBe("true");
    await act(async () => vi.advanceTimersByTime(500));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps focus on Print while its recheck runs, announces the check, and ignores a second press", async () => {
    await render();
    const control = button("Print / Save as PDF");
    expect(control.getAttribute("aria-disabled")).toBeNull();
    expect(status()).toBeNull();
    control.focus();
    // jsdom does not turn Enter into activation, so this presses the focused button the way Enter would.
    await act(async () => { control.click(); });
    expect(print).toHaveBeenCalledTimes(1);
    // Links passes its export latch as `printing` while the server recheck runs.
    await render(link(), true);
    expect(button("Checking link…")).toBe(control);
    expect(control.disabled).toBe(false);
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(control);
    expect(status()).toBe(PRINT_CHECKING);
    await act(async () => { control.click(); control.click(); });
    expect(print).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
    // The busy control stays in the focus cycle.
    await act(async () => control.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(button("Close preview"));
    await act(async () => button("Close preview").dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(control);
    await render(link(), false);
    expect(control.isConnected).toBe(true);
    expect(document.activeElement).toBe(control);
    expect(control.getAttribute("aria-disabled")).toBeNull();
  });

  it("announces a print request only after the browser reports a print dialog for this press", async () => {
    await render();
    // A print the button did not start (e.g. the browser's own menu) is not claimed.
    await afterPrint();
    expect(status()).toBeNull();
    await act(async () => button("Print / Save as PDF").click());
    await render(link(), true);
    await afterPrint();
    expect(status()).toBe(PRINT_CHECKING);
    await render(link(), false);
    expect(status()).toBe(PRINT_REQUESTED);
    expect(dialog()?.textContent).not.toContain("PDF saved");
    // A new press clears the earlier outcome before its own recheck.
    await act(async () => button("Print / Save as PDF").click());
    expect(status()).toBeNull();
    expect(print).toHaveBeenCalledTimes(2);
  });

  it("does not show a refused or skipped print recheck as success", async () => {
    await render();
    await act(async () => button("Print / Save as PDF").click());
    await render(link(), true);
    // The recheck ended without the browser opening its print dialog.
    await render(link(), false);
    expect(status()).toBeNull();
    expect(document.body.textContent).not.toContain(PRINT_REQUESTED);
    // A refused recheck that reports the link revoked removes the print surface.
    await act(async () => button("Print / Save as PDF").click());
    await render(link(), true);
    await render(link({ state: "revoked" }), false);
    expect(dialog()).toBeNull();
    // A refused recheck that drops the card leaves no listener that can claim a later print.
    await render();
    await act(async () => button("Print / Save as PDF").click());
    await render(link(), true);
    await act(async () => root.render(null));
    await afterPrint();
    expect(dialog()).toBeNull();
    expect(document.body.textContent).not.toContain(PRINT_REQUESTED);
    expect(print).toHaveBeenCalledTimes(3);
  });

  it("scopes print styles to the selected card, excludes app UI, and retains a white quiet-zone background", () => {
    const css = readFileSync("client/src/research/recommendation/recommendation-print.css", "utf8");
    expect(css).toContain('@media print');
    expect(css).toContain('body:has([data-recommendation-print="true"]) > :not(.xr-recommendation-print-overlay) { display: none !important; }');
    expect(css).toContain('.xr-recommendation-print-controls { display: none !important; }');
    expect(css).toContain('width: 65mm'); expect(css).toContain('overflow-wrap: anywhere');
    expect(css).not.toContain('@import'); expect(css).not.toContain('url(');
  });
});
