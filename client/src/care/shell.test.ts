import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Care Pending shell", () => {
  const source = readFileSync(resolve(__dirname, "./section.tsx"), "utf8");

  it("is truthful and contains no clinical submission control", () => {
    expect(source).toContain("Care is being prepared");
    expect(source).toContain("No treatment, prescription, or medical advice is available here.");
    expect(source).toContain("This site is not emergency care.");
    expect(source).not.toMatch(/<(form|input|textarea|select|button)\b/i);
  });

  it("does not claim a provider, state, pharmacy, price, product, or launch date", () => {
    expect(source).not.toMatch(/\$\d/);
    expect(source).not.toMatch(/\b(available nationwide|all 50 states|launches? on)\b/i);
    expect(source).not.toMatch(/\b(our clinicians|our pharmacy|partner pharmacy)\b/i);
  });
});
