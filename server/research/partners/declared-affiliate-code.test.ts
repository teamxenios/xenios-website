// The customer-declared affiliate code: a claim, never an attribution.
//
// The founder rules pinned here: an unusable code never stops an order, the
// code changes nothing about price/access/payment/eligibility/ownership (it
// cannot — nothing in this module returns money or permission), an email
// address is never stored, and a manual match is somebody's named judgment
// that can be corrected by appending rather than rewriting.

import { describe, expect, it } from "vitest";
import {
  captureEventFor,
  declaredAffiliateCodeSummary,
  normalizeDeclaredAffiliateCode,
  projectDeclaredAffiliateCode,
  DECLARED_CODE_MAX_KEY_LENGTH,
  DECLARED_CODE_MAX_RAW_LENGTH,
  type DeclaredAffiliateCodeEvent,
} from "./declared-affiliate-code";

const REQUEST = "XRR-20260820-REF00001";
const AT = new Date("2026-08-20T12:00:00.000Z");

describe("normalizeDeclaredAffiliateCode", () => {
  it("treats an absent, blank, or non-string entry as not_provided", () => {
    for (const input of [undefined, null, "", "   ", "\t\n ", 42, {}, []]) {
      expect(normalizeDeclaredAffiliateCode(input)).toEqual({ state: "not_provided" });
    }
  });

  it("keeps the customer's words and derives an alphanumeric match key", () => {
    expect(normalizeDeclaredAffiliateCode("XEN101")).toEqual({
      state: "captured_unmatched",
      rawCode: "XEN101",
      matchKey: "XEN101",
    });
  });

  it("reconciles punctuation and casing variants onto one key", () => {
    const keys = ["xen-101", "XEN 101", "Xen.101", "  xen_101  ", "XEN/101"].map(
      (raw) => {
        const result = normalizeDeclaredAffiliateCode(raw);
        return result.state === "captured_unmatched" ? result.matchKey : null;
      },
    );
    expect(new Set(keys)).toEqual(new Set(["XEN101"]));
  });

  it("preserves a referrer's name, which the field explicitly invites", () => {
    const result = normalizeDeclaredAffiliateCode("  Jane   Smith ");
    expect(result).toEqual({
      state: "captured_unmatched",
      rawCode: "Jane Smith",
      matchKey: "JANESMITH",
    });
  });

  it("refuses an address-shaped entry without storing it", () => {
    const result = normalizeDeclaredAffiliateCode("jane@example.com");
    expect(result).toEqual({ state: "invalid_ignored", reason: "address_shaped" });
    // The refusal shape carries no field that could hold the address.
    expect(JSON.stringify(result)).not.toContain("example.com");
  });

  it("refuses an entry with nothing matchable in it", () => {
    for (const input of ["!!!", "---", "***", "。。。"]) {
      expect(normalizeDeclaredAffiliateCode(input)).toEqual({
        state: "invalid_ignored",
        reason: "no_matchable_characters",
      });
    }
  });

  it("strips control, zero-width, bidirectional, and BOM characters", () => {
    const hostile = "\u0009XEN\u200B1\u202E0\uFEFF1";
    expect(normalizeDeclaredAffiliateCode(hostile)).toEqual({
      state: "captured_unmatched",
      rawCode: "XEN101",
      matchKey: "XEN101",
    });
  });

  it("bounds a pasted essay rather than refusing it, and never leaves ragged whitespace", () => {
    const essay = `${"A".repeat(200)} ${"B".repeat(200)}`;
    const result = normalizeDeclaredAffiliateCode(essay);
    expect(result.state).toBe("captured_unmatched");
    if (result.state === "captured_unmatched") {
      expect(result.rawCode.length).toBeLessThanOrEqual(DECLARED_CODE_MAX_RAW_LENGTH);
      expect(result.matchKey.length).toBeLessThanOrEqual(DECLARED_CODE_MAX_KEY_LENGTH);
      expect(result.rawCode).toBe(result.rawCode.trim());
    }
  });

  it("never throws, whatever it is handed", () => {
    const nasty: unknown[] = [
      "\\", "'; drop table --", "<script>", "\uD800", "%00",
      Symbol.iterator.toString(), "𝔘𝔫𝔦𝔠𝔬𝔡𝔢", "👍",
    ];
    for (const input of nasty) {
      expect(() => normalizeDeclaredAffiliateCode(input)).not.toThrow();
    }
  });

  it("has no path that returns a price, permission, or partner id", () => {
    const result = normalizeDeclaredAffiliateCode("XEN101");
    expect(Object.keys(result).sort()).toEqual(["matchKey", "rawCode", "state"]);
  });
});

describe("captureEventFor", () => {
  it("writes no event at all for an empty field", () => {
    expect(captureEventFor(REQUEST, "", AT)).toBeNull();
    expect(captureEventFor(REQUEST, undefined, AT)).toBeNull();
  });

  it("carries the usable claim", () => {
    expect(captureEventFor(REQUEST, "xen-101", AT)).toEqual({
      kind: "captured",
      requestRef: REQUEST,
      rawCode: "xen-101",
      matchKey: "XEN101",
      invalidReason: null,
      occurredAt: AT.toISOString(),
    });
  });

  it("records that something unusable arrived, without storing it", () => {
    const event = captureEventFor(REQUEST, "jane@example.com", AT);
    expect(event).toEqual({
      kind: "captured",
      requestRef: REQUEST,
      rawCode: null,
      matchKey: null,
      invalidReason: "address_shaped",
      occurredAt: AT.toISOString(),
    });
  });
});

describe("projectDeclaredAffiliateCode", () => {
  const captured: DeclaredAffiliateCodeEvent = {
    kind: "captured",
    requestRef: REQUEST,
    rawCode: "xen-101",
    matchKey: "XEN101",
    invalidReason: null,
    occurredAt: "2026-08-20T12:00:00.000Z",
  };

  const matched: DeclaredAffiliateCodeEvent = {
    kind: "matched",
    requestRef: REQUEST,
    partnerId: "partner-1",
    matchedByAdminId: "admin-7",
    note: "Confirmed with the affiliate by phone",
    occurredAt: "2026-08-21T09:00:00.000Z",
  };

  it("is not_provided with no events", () => {
    expect(projectDeclaredAffiliateCode([])).toMatchObject({
      state: "not_provided",
      rawCode: null,
    });
  });

  it("reports a usable claim as captured_unmatched", () => {
    expect(projectDeclaredAffiliateCode([captured])).toMatchObject({
      state: "captured_unmatched",
      rawCode: "xen-101",
      matchKey: "XEN101",
      matchedPartnerId: null,
    });
  });

  it("reports a refused entry as invalid_ignored, carrying no value", () => {
    const invalid: DeclaredAffiliateCodeEvent = {
      ...captured,
      rawCode: null,
      matchKey: null,
      invalidReason: "address_shaped",
    };
    expect(projectDeclaredAffiliateCode([invalid])).toMatchObject({
      state: "invalid_ignored",
      rawCode: null,
      invalidReason: "address_shaped",
    });
  });

  it("applies a manual match, naming the admin", () => {
    expect(projectDeclaredAffiliateCode([captured, matched])).toMatchObject({
      state: "matched_manual",
      matchedPartnerId: "partner-1",
      matchedByAdminId: "admin-7",
      matchedAt: "2026-08-21T09:00:00.000Z",
      // The customer's claim is still visible after matching.
      rawCode: "xen-101",
    });
  });

  it("corrects a mistaken match by appending, never by rewriting", () => {
    const cleared: DeclaredAffiliateCodeEvent = {
      kind: "match_cleared",
      requestRef: REQUEST,
      clearedByAdminId: "admin-9",
      note: "Matched the wrong partner",
      occurredAt: "2026-08-22T09:00:00.000Z",
    };
    expect(projectDeclaredAffiliateCode([captured, matched, cleared])).toMatchObject({
      state: "captured_unmatched",
      matchedPartnerId: null,
      matchedByAdminId: null,
      matchedAt: null,
    });
  });

  it("takes the latest match when an operator re-matches", () => {
    const rematched: DeclaredAffiliateCodeEvent = {
      ...matched,
      partnerId: "partner-2",
      matchedByAdminId: "admin-9",
      occurredAt: "2026-08-23T09:00:00.000Z",
    };
    expect(
      projectDeclaredAffiliateCode([captured, matched, rematched]),
    ).toMatchObject({ state: "matched_manual", matchedPartnerId: "partner-2" });
  });

  it("does not depend on the order rows arrive in", () => {
    const forwards = projectDeclaredAffiliateCode([captured, matched]);
    const backwards = projectDeclaredAffiliateCode([matched, captured]);
    expect(backwards).toEqual(forwards);
  });

  it("ignores a match for a request whose claim was refused or absent", () => {
    // No capture at all: a match cannot invent a claim the customer never made.
    expect(projectDeclaredAffiliateCode([matched])).toMatchObject({
      state: "not_provided",
      matchedPartnerId: null,
    });
    const invalid: DeclaredAffiliateCodeEvent = {
      ...captured,
      rawCode: null,
      matchKey: null,
      invalidReason: "no_matchable_characters",
    };
    expect(projectDeclaredAffiliateCode([invalid, matched])).toMatchObject({
      state: "invalid_ignored",
      matchedPartnerId: null,
    });
  });

  it("treats a second capture as a replay, not a re-typing", () => {
    const later: DeclaredAffiliateCodeEvent = {
      ...captured,
      rawCode: "someone-else",
      matchKey: "SOMEONEELSE",
      occurredAt: "2026-08-25T09:00:00.000Z",
    };
    expect(projectDeclaredAffiliateCode([captured, later])).toMatchObject({
      rawCode: "xen-101",
      matchKey: "XEN101",
    });
  });
});

describe("declaredAffiliateCodeSummary", () => {
  it("labels a typed claim unverified everywhere it appears", () => {
    const captured = projectDeclaredAffiliateCode([
      {
        kind: "captured",
        requestRef: REQUEST,
        rawCode: "xen-101",
        matchKey: "XEN101",
        invalidReason: null,
        occurredAt: AT.toISOString(),
      },
    ]);
    expect(declaredAffiliateCodeSummary(captured)).toContain("unverified");
    expect(declaredAffiliateCodeSummary(captured)).toContain("xen-101");
  });

  it("says nothing was entered, explicitly rather than by silence", () => {
    expect(declaredAffiliateCodeSummary(projectDeclaredAffiliateCode([]))).toBe(
      "No affiliate code entered",
    );
  });

  it("still labels a manually matched claim unverified", () => {
    const matchedProjection = projectDeclaredAffiliateCode([
      {
        kind: "captured",
        requestRef: REQUEST,
        rawCode: "xen-101",
        matchKey: "XEN101",
        invalidReason: null,
        occurredAt: AT.toISOString(),
      },
      {
        kind: "matched",
        requestRef: REQUEST,
        partnerId: "partner-1",
        matchedByAdminId: "admin-7",
        note: null,
        occurredAt: "2026-08-21T09:00:00.000Z",
      },
    ]);
    const summary = declaredAffiliateCodeSummary(matchedProjection);
    expect(summary).toContain("unverified");
    expect(summary).toContain("partner-1");
  });

  it("never reveals a refused address in any summary", () => {
    const invalid = projectDeclaredAffiliateCode([
      {
        kind: "captured",
        requestRef: REQUEST,
        rawCode: null,
        matchKey: null,
        invalidReason: "address_shaped",
        occurredAt: AT.toISOString(),
      },
    ]);
    expect(declaredAffiliateCodeSummary(invalid)).toBe(
      "An email address was entered instead of a code; not stored",
    );
  });
});
