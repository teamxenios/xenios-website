// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationLink } from "@shared/research/referral-v1";
import RecommendationPrintCard from "./RecommendationPrintCard";
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

  it("requests preview removal at expiry and disables duplicate print checks", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    await render(link({ expiresAt: new Date(now + 500).toISOString() }), true);
    expect(button("Checking link…").disabled).toBe(true);
    await act(async () => vi.advanceTimersByTime(500));
    expect(close).toHaveBeenCalledTimes(1);
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
