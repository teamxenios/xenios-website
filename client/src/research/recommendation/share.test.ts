// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyRecommendation, safeRecommendationUrl, shareOutcomeMessage, shareRecommendation } from "./share";

const url = () => `${window.location.origin}/r/r1_${"A".repeat(43)}`;
let copy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
});
afterEach(() => vi.restoreAllMocks());
describe("recommendation sharing", () => {
  it("accepts only the exact same-origin opaque public link", () => {
    expect(safeRecommendationUrl(url())).toBe(url());
    for (const bad of [null, "/r/r1_abc", "https://outside.example.invalid/r/r1_" + "A".repeat(43), `${url()}?token=secret`, `${url()}#token=secret`, `${url()}/`, "javascript:alert(1)", "http://person:secret@localhost:3000/r/r1_" + "A".repeat(43)]) expect(safeRecommendationUrl(bad)).toBeNull();
  });
  it("uses native sharing and does not claim delivery", async () => {
    const native = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: native });
    expect(await shareRecommendation(url())).toBe("shared");
    expect(native).toHaveBeenCalledWith(expect.objectContaining({ url: url() }));
    expect(copy).not.toHaveBeenCalled();
    expect(shareOutcomeMessage("shared")).toContain("does not know whether a message was delivered");
  });
  it("does not unexpectedly copy when a person cancels native sharing", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockRejectedValue({ name: "AbortError" }) });
    expect(await shareRecommendation(url())).toBe("cancelled");
    expect(copy).not.toHaveBeenCalled();
  });
  it("falls back to clipboard when native sharing is absent or fails", async () => {
    expect(await shareRecommendation(url())).toBe("copied");
    Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockRejectedValue(new Error("Unavailable")) });
    expect(await shareRecommendation(url())).toBe("copied");
    expect(copy).toHaveBeenCalledTimes(2);
  });
  it("makes a failed clipboard explicit and never copies an unsafe link", async () => {
    copy.mockRejectedValue(new Error("Denied"));
    expect(await copyRecommendation(url())).toBe("copy_unavailable");
    expect(shareOutcomeMessage("copy_unavailable")).toContain("manually");
    copy.mockClear();
    expect(await shareRecommendation(`${url()}?email=private`)).toBe("invalid_link");
    expect(copy).not.toHaveBeenCalled();
  });
});
