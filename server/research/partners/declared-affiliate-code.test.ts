import { describe, expect, it } from "vitest";

import {
  DECLARED_AFFILIATE_CODE_MAX_LENGTH,
  describeDeclaredAffiliateCode,
  normalizeDeclaredAffiliateCode,
} from "./declared-affiliate-code";

/**
 * A typed affiliate code is a claim, not attribution.
 *
 * The rule that shapes every test here: an unknown or malformed code must never
 * cost a customer their order. The worst thing junk input may do is be dropped.
 */
describe("normalizing a customer-typed affiliate code", () => {
  it("treats an untouched optional field as not provided, never as invalid", () => {
    // The most common case by far. Calling it "invalid" would put a scary word
    // in an operator's console for someone who did nothing wrong.
    for (const empty of [undefined, null, "", "   ", "\t\n", 42, {}, []]) {
      expect(normalizeDeclaredAffiliateCode(empty as unknown).state).toBe("not_provided");
    }
  });

  it("captures a well-formed code, normalized to one canonical form", () => {
    // Three spellings of one code must not become three affiliates to match.
    for (const raw of ["dana10", "DANA10", " Dana10 ", "\tdAnA10\n"]) {
      expect(normalizeDeclaredAffiliateCode(raw)).toEqual({
        state: "captured_unmatched",
        code: "DANA10",
      });
    }
  });

  it("allows the joiners a real code uses, and nothing that reads as markup or a path", () => {
    for (const good of ["A1", "PARTNER-7", "SPRING_2026", "DR.SMITH", "X9-Z_1.A"]) {
      expect(normalizeDeclaredAffiliateCode(good).state).toBe("captured_unmatched");
    }
    for (const bad of [
      "has space",
      "<script>",
      "a@b.com",
      "http://x.test/ref",
      "../../etc",
      "code;drop",
      "emoji😀",
      "-LEADING",
      "50%OFF",
    ]) {
      expect(normalizeDeclaredAffiliateCode(bad).state, bad).toBe("invalid_ignored");
    }
  });

  it("bounds the length in both directions", () => {
    expect(normalizeDeclaredAffiliateCode("A").state).toBe("invalid_ignored");
    const atMax = "A".repeat(DECLARED_AFFILIATE_CODE_MAX_LENGTH);
    expect(normalizeDeclaredAffiliateCode(atMax).state).toBe("captured_unmatched");
    expect(normalizeDeclaredAffiliateCode(atMax + "A").state).toBe("invalid_ignored");
  });

  it("never stores the raw input for anything it rejected", () => {
    // Whatever was typed, an invalid result carries no code at all, so nothing
    // unvetted can reach an operator console or an email body.
    const nasty = normalizeDeclaredAffiliateCode("<img src=x onerror=alert(1)>");
    expect(nasty.state).toBe("invalid_ignored");
    expect(nasty.code).toBeNull();
  });

  it("never throws, whatever it is handed", () => {
    const hostile: unknown[] = [
      Symbol("x"),
      () => "code",
      { toString() { throw new Error("boom"); } },
      new Proxy({}, { get() { throw new Error("boom"); } }),
      "\u0000\u0000",
      "A".repeat(100_000),
    ];
    for (const value of hostile) {
      expect(() => normalizeDeclaredAffiliateCode(value)).not.toThrow();
    }
  });

  it("cannot be talked into claiming a match", () => {
    // matched_manual is an ADMIN act. No customer input may produce it, or a
    // typed string would be presenting itself as a verified relationship.
    for (const raw of ["MATCHED", "matched_manual", "OWNER-123", "TRUE", "ADMIN"]) {
      expect(normalizeDeclaredAffiliateCode(raw).state).not.toBe("matched_manual");
    }
  });
});

describe("describing it for an operator", () => {
  it("always says whether a code is matched", () => {
    expect(describeDeclaredAffiliateCode({ state: "not_provided", code: null }))
      .toBe("None provided");
    expect(describeDeclaredAffiliateCode({ state: "captured_unmatched", code: "DANA10" }))
      .toBe("DANA10 (unmatched)");
    expect(describeDeclaredAffiliateCode({ state: "matched_manual", code: "DANA10" }))
      .toBe("DANA10 (matched)");
    expect(describeDeclaredAffiliateCode({ state: "invalid_ignored", code: null }))
      .toBe("Ignored (not a usable code)");
  });
});
