import { describe, expect, it } from "vitest";

import {
  sanitizeMarketingAttributionPath,
  sanitizeMarketingAttributionValue,
} from "./marketing-attribution";

describe("controlled public marketing attribution vocabulary", () => {
  it("normalizes finite approved source and medium values", () => {
    expect(sanitizeMarketingAttributionValue("utm_source", " Partner ")).toBe(
      "partner",
    );
    expect(sanitizeMarketingAttributionValue("utm_medium", "ORGANIC")).toBe(
      "organic",
    );
  });

  it.each([
    ["utm_source", "5551234567"],
    ["utm_campaign", "Jane Doe"],
    ["utm_content", "jane-doe"],
    ["utm_term", "312-555-0199"],
    ["utm_source", "invented-source"],
  ] as const)("rejects uncontrolled %s value %s", (field, value) => {
    expect(sanitizeMarketingAttributionValue(field, value)).toBeNull();
  });

  it("accepts only exact static paths or privacy-preserving route buckets", () => {
    expect(sanitizeMarketingAttributionPath(" /WAITLIST ")).toBe("/waitlist");
    expect(sanitizeMarketingAttributionPath("/for/:slug")).toBe("/for/:slug");
    expect(sanitizeMarketingAttributionPath("/careers/:slug")).toBe(
      "/careers/:slug",
    );
    expect(sanitizeMarketingAttributionPath("/for/Jane-Doe")).toBeNull();
    expect(sanitizeMarketingAttributionPath("/unknown/312-555-0199")).toBeNull();
    expect(sanitizeMarketingAttributionPath("/research/member")).toBeNull();
    expect(sanitizeMarketingAttributionPath("/admin")).toBeNull();
  });
});
