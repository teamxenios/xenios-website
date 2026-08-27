import { describe, expect, it } from "vitest";
import { formatAccountDate } from "./format";

describe("account portal date presentation", () => {
  it("preserves date-only and midnight-UTC calendar dates", () => {
    expect(formatAccountDate("2026-07-01")).toBe("Jul 1, 2026");
    expect(formatAccountDate("2026-07-01T00:00:00.000Z")).toBe("Jul 1, 2026");
  });

  it("fails closed for absent or malformed dates", () => {
    expect(formatAccountDate(null)).toBe("Not scheduled");
    expect(formatAccountDate("not-a-date")).toBe("Not available");
  });
});
