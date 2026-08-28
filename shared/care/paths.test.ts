import { describe, expect, it } from "vitest";
import { isCarePath, normalizeCarePath } from "./paths";

describe("Care path normalization", () => {
  it.each([
    ["/care", "/care"],
    ["/CARE/", "/care"],
    ["/%63are/schedule?from=nav#ignored", "/care/schedule"],
    ["/care/portal#launch", "/care/portal"],
  ])("normalizes %s", (value, expected) => {
    expect(normalizeCarePath(value)).toBe(expected);
    expect(isCarePath(value)).toBe(true);
  });

  it("does not turn encoded separators into Care route boundaries", () => {
    expect(normalizeCarePath("/care%2Fschedule")).toBe("/care%2fschedule");
    expect(isCarePath("/care%2Fschedule")).toBe(false);
  });

  it.each([
    "/careers",
    "/care-plan",
    "care",
    "https://example.com/care",
    "/care//schedule",
    "/care/../admin",
    "/care/%2e%2e/admin",
    "/care\\schedule",
    "/care/%5cschedule",
    "/care/%",
    "/care/%zz",
    "/care%252fschedule",
  ])("fails closed for non-Care or ambiguous input: %s", (value) => {
    expect(isCarePath(value)).toBe(false);
  });
});
