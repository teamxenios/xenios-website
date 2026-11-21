// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationLink } from "@shared/research/referral-v1";
import { DashboardShareCard } from "./DashboardShareCard";
import * as qrPng from "./qr-png";

let host: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn>;
let writeText: ReturnType<typeof vi.fn>;
const link = (): RecommendationLink => ({
  id: "synthetic-link-one", url: `${location.origin}/r/r1_${"A".repeat(43)}`, destinationPath: "/health", state: "ready",
  createdAt: "2026-09-04T12:00:00Z", expiresAt: "2026-12-04T12:00:00Z", revokedAt: null, opens: 2, accountsLinked: 1,
});
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const list = () => response({ ok: true, eligible: true, links: [link()] });
const button = (label: string) => Array.from(host.querySelectorAll("button")).find(item => item.textContent === label)!;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-07T12:00:00Z"));
  fetcher = vi.fn().mockResolvedValue(list()); vi.stubGlobal("fetch", fetcher);
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("partner share card actions", () => {
  it("clears a retired Copy check on Refresh and keeps refreshed content valid when the old reply arrives late", async () => {
    const png = vi.spyOn(qrPng, "recommendationPng"), save = vi.spyOn(qrPng, "saveLocalFile");
    await act(async () => { root.render(<DashboardShareCard token="synthetic-member-one" />); });
    await act(async () => { await Promise.resolve(); });
    let finishOld!: (value: unknown) => void, finishRefresh!: (value: unknown) => void;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    await act(async () => { button("Copy link").click(); });
    expect(host.textContent).toContain("Checking the link…");
    expect(fetcher).toHaveBeenCalledTimes(2); expect(writeText).not.toHaveBeenCalled();
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    await act(async () => { button("Refresh").click(); });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(host.textContent).not.toContain("Checking the link…");
    expect(host.textContent).toContain("Checking your referral access…");
    const refreshedLink: RecommendationLink = { ...link(), id: "synthetic-link-two", url: `${location.origin}/r/r1_${"B".repeat(43)}` };
    const refreshed = () => response({ ok: true, eligible: true, links: [refreshedLink] });
    await act(async () => { finishRefresh(refreshed()); });
    const visibleLink = () => (host.querySelector('[aria-label="Your referral link"]') as HTMLInputElement).value;
    expect(visibleLink()).toBe(refreshedLink.url); expect(host.textContent).not.toContain("Checking the link…");
    fetcher.mockResolvedValueOnce(refreshed());
    await act(async () => { button("Copy link").click(); });
    expect(fetcher).toHaveBeenCalledTimes(4); expect(writeText).toHaveBeenCalledTimes(1); expect(writeText).toHaveBeenCalledWith(refreshedLink.url);
    expect(host.textContent).toContain("Link copied.");
    await act(async () => { finishOld(list()); });
    expect(writeText).toHaveBeenCalledTimes(1); expect(writeText).toHaveBeenCalledWith(refreshedLink.url);
    expect(png).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
    expect(visibleLink()).toBe(refreshedLink.url); expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain("Link copied."); expect(host.textContent).not.toContain("Checking the link…");
  });
  it("keep keyboard focus on the pressed control while the link is re-checked, and ignore a second press", async () => {
    await act(async () => { root.render(<DashboardShareCard token="synthetic-member-one" />); });
    await act(async () => { await Promise.resolve(); });
    const copy = button("Copy link"); expect(copy).toBeDefined();
    let finish!: (value: unknown) => void;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    copy.focus();
    await act(async () => { copy.click(); });
    expect(copy.disabled).toBe(false); expect(copy.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(copy); expect(host.textContent).toContain("Checking the link…");
    const calls = fetcher.mock.calls.length;
    await act(async () => { copy.click(); });
    expect(fetcher.mock.calls.length).toBe(calls);
    await act(async () => { finish(list()); });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Link copied."); expect(host.textContent).not.toContain("Checking the link…");
    expect(document.activeElement).toBe(copy); expect(copy.hasAttribute("aria-disabled")).toBe(false);
  });
});

describe("enlarged referral QR keyboard boundary", () => {
  async function openQr() {
    await act(async () => { root.render(<DashboardShareCard token="synthetic-member-one" />); });
    await act(async () => { await Promise.resolve(); });
    const modal = host.querySelector<HTMLDialogElement>('dialog[aria-label="Enlarged referral QR"]')!;
    const opener = button("Enlarge QR"), close = button("Close QR");
    // jsdom has no native modal navigation or focus return. These methods model
    // only open/close state and the close event; actual native proof stays in CI.
    Object.defineProperty(modal, "showModal", { configurable: true, value() { modal.setAttribute("open", ""); } });
    Object.defineProperty(modal, "close", { configurable: true, value() {
      modal.removeAttribute("open"); modal.dispatchEvent(new Event("close"));
    } });
    opener.focus();
    await act(async () => { opener.click(); });
    expect(modal.open).toBe(true);
    expect(modal.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")).toHaveLength(1);
    close.focus();
    expect(document.activeElement).toBe(close); expect(modal.contains(close)).toBe(true);
    return { modal, opener, close };
  }

  it.each([false, true])("contains the sole focused dialog control for Tab with shift=%s", async shiftKey => {
    const { modal, close } = await openQr();
    const key = new KeyboardEvent("keydown", { key: "Tab", code: "Tab", shiftKey, bubbles: true, cancelable: true });
    expect(close.dispatchEvent(key)).toBe(false);
    expect(key.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close); expect(modal.contains(document.activeElement)).toBe(true);
    expect(modal.open).toBe(true); expect(writeText).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not intercept unrelated keys or browser-modified Tab", async () => {
    const { modal, close } = await openQr();
    for (const init of [{ key: "Escape" }, { key: "Enter" }, { key: "ArrowLeft" },
      { key: "Tab", altKey: true }, { key: "Tab", ctrlKey: true }, { key: "Tab", metaKey: true }]) {
      const key = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
      expect(close.dispatchEvent(key)).toBe(true); expect(key.defaultPrevented).toBe(false);
      expect(modal.open).toBe(true); expect(document.activeElement).toBe(close);
    }
  });

  it("does not capture background, unfocused, or closed-dialog Tab events", async () => {
    const { modal, close } = await openQr();
    const refresh = button("Refresh"); refresh.focus();
    for (const target of [refresh, close]) {
      const key = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      expect(target.dispatchEvent(key)).toBe(true); expect(key.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(refresh);
    }
    close.focus();
    await act(async () => { close.click(); });
    expect(modal.open).toBe(false);
    const closedTab = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    expect(close.dispatchEvent(closedTab)).toBe(true); expect(closedTab.defaultPrevented).toBe(false);
  });

  it("leaves Escape uncancelled and responds to native cancel through the existing close lifecycle", async () => {
    const { modal, close, opener } = await openQr();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    expect(close.dispatchEvent(escape)).toBe(true); expect(escape.defaultPrevented).toBe(false);
    const cancel = new Event("cancel", { cancelable: true });
    await act(async () => { modal.dispatchEvent(cancel); });
    expect(cancel.defaultPrevented).toBe(false); expect(modal.open).toBe(false);
    expect(opener.isConnected).toBe(true); expect(opener.disabled).toBe(false);
    await act(async () => { opener.click(); });
    expect(modal.open).toBe(true);
  });

  it("preserves an opener focus return already supplied by native close and does not reopen", async () => {
    const { modal, opener } = await openQr();
    // Supply the UA's close/return result as input, rather than pretending jsdom
    // implements Escape, native focus traversal, or the browser's return policy.
    await act(async () => {
      modal.removeAttribute("open"); opener.focus(); modal.dispatchEvent(new Event("close"));
    });
    expect(modal.open).toBe(false); expect(document.activeElement).toBe(opener);
    await act(async () => { root.render(<DashboardShareCard token="synthetic-member-one" />); });
    expect(modal.open).toBe(false); expect(document.activeElement).toBe(opener);
    expect(writeText).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
