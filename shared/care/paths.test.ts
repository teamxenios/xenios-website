import { describe, expect, it } from "vitest";
import { isCarePath, isHealthGatewayPath, normalizeCarePath } from "./paths";

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

  it.each([
    "/health",
    "/HEALTH/",
    "/%68ealth?from=nav#ignored",
  ])("recognizes the exact normalized Health gateway: %s", (value) => {
    expect(isHealthGatewayPath(value)).toBe(true);
  });

  it.each([
    "/health/care",
    "/healthcare",
    "/health%2Fcare",
    "/health//care",
    "https://example.com/health",
  ])("does not broaden the Health gateway boundary: %s", (value) => {
    expect(isHealthGatewayPath(value)).toBe(false);
  });
});
