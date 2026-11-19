// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationLink } from "@shared/research/referral-v1";
import { DashboardShareCard } from "./DashboardShareCard";

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
