import { describe, expect, it } from "vitest";

import { formatStrength, parseStrength, strengthsMatch, variantCarriesStrength } from "./strength";

describe("parseStrength", () => {
  it("parses a single component", () => {
    expect(parseStrength("10 mg")).toEqual([{ amount: 10, unit: "mg" }]);
    expect(parseStrength("10mg")).toEqual([{ amount: 10, unit: "mg" }]);
    expect(parseStrength(" 2.5 MG ")).toEqual([{ amount: 2.5, unit: "mg" }]);
  });

  it("parses a blend in order", () => {
    expect(parseStrength("10 mg / 10 mg / 50 mg")).toEqual([
      { amount: 10, unit: "mg" },
      { amount: 10, unit: "mg" },
      { amount: 50, unit: "mg" },
    ]);
  });

  it("returns null for anything that is not a strength", () => {
    expect(parseStrength(null)).toBeNull();
    expect(parseStrength(undefined)).toBeNull();
    expect(parseStrength("")).toBeNull();
    expect(parseStrength("Capsules")).toBeNull();
    expect(parseStrength("Add-on Testing Panel")).toBeNull();
    expect(parseStrength("10 furlongs")).toBeNull();
    expect(parseStrength("10 mg / Capsules")).toBeNull();
  });
});

describe("strengthsMatch", () => {
  it("matches identical strengths regardless of spacing and case", () => {
    expect(strengthsMatch("10 mg", "10MG")).toBe(true);
    expect(strengthsMatch("15 mg / 15 mg", "15mg/15mg")).toBe(true);
  });

  it("does not match a different amount, unit, count, or order", () => {
    expect(strengthsMatch("10 mg", "5 mg")).toBe(false);
    expect(strengthsMatch("10 mg", "10 mcg")).toBe(false);
    expect(strengthsMatch("10 mg", "10 mg / 10 mg")).toBe(false);
    expect(strengthsMatch("10 mg / 50 mg", "50 mg / 10 mg")).toBe(false);
  });

  it("does not convert units, because the label prints what it prints", () => {
    expect(strengthsMatch("1 mg", "1000 mcg")).toBe(false);
  });

  it("never matches when either side is missing or unparsed", () => {
    expect(strengthsMatch(null, "10 mg")).toBe(false);
    expect(strengthsMatch("10 mg", null)).toBe(false);
    expect(strengthsMatch(null, null)).toBe(false);
    expect(strengthsMatch("10 mg", "Capsules")).toBe(false);
  });
});

describe("variantCarriesStrength", () => {
  it("is true for a strength and false for a format", () => {
    expect(variantCarriesStrength("10 mg")).toBe(true);
    expect(variantCarriesStrength("5 mg / 5 mg / 10 mg / 5 mg")).toBe(true);
    expect(variantCarriesStrength("Capsules")).toBe(false);
    expect(variantCarriesStrength("Panel")).toBe(false);
    expect(variantCarriesStrength(null)).toBe(false);
  });
});

describe("formatStrength", () => {
  it("renders a canonical form for messages", () => {
    expect(formatStrength("10mg")).toBe("10 mg");
    expect(formatStrength("15 mg / 15 mg")).toBe("15 mg / 15 mg");
    expect(formatStrength(null)).toBe("none declared");
    expect(formatStrength("Capsules")).toBe("Capsules");
  });
});
