import { describe, expect, it } from "vitest";
import { createAgreementRefreshFence } from "./agreement-refresh-fence";

describe("per-route agreement callback generation", () => {
  it("starts at zero without asserting an acceptance", () => {
    const fence = createAgreementRefreshFence();
    expect(fence.current()).toBe(0);
    expect(fence.isCurrent(0)).toBe(true);
    expect(Object.keys(fence).sort()).toEqual(["current", "invalidate", "isCurrent"]);
  });
  it("invalidates every earlier view synchronously", () => {
    const fence = createAgreementRefreshFence();
    expect(fence.invalidate()).toBe(1);
    expect(fence.isCurrent(0)).toBe(false);
    expect(fence.isCurrent(1)).toBe(true);
    expect(fence.invalidate()).toBe(2);
    expect(fence.isCurrent(1)).toBe(false);
  });
  it("keeps two routes independent", () => {
    const a = createAgreementRefreshFence();
    const b = createAgreementRefreshFence();
    a.invalidate();
    expect(b.current()).toBe(0);
    expect(b.isCurrent(0)).toBe(true);
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid revision %s", (value) => {
    expect(createAgreementRefreshFence().isCurrent(value)).toBe(false);
  });
});
