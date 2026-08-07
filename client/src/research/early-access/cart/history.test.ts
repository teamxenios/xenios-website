// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readEarlyAccessHistoryState, replaceEarlyAccessStep } from "./history";

describe("Early Access history", () => {
  it("accepts only safe navigation fields", () => {
    expect(readEarlyAccessHistoryState({ earlyAccess: true, step: "review" })).toEqual({ earlyAccess: true, step: "review" });
    expect(readEarlyAccessHistoryState({ earlyAccess: true, step: "review", email: "a@b.com" })).toBeNull();
    expect(readEarlyAccessHistoryState({ earlyAccess: true, step: "review", idempotencyKey: "x" })).toBeNull();
  });
  it("keeps the current path and writes no PII", () => {
    history.replaceState(null, "", "/research/early-access");
    replaceEarlyAccessStep("cart");
    expect(location.pathname).toBe("/research/early-access");
    expect(history.state).toEqual({ earlyAccess: true, step: "cart" });
  });
});
