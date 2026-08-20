import { describe, expect, it } from "vitest";

import { decodeAdminDetail } from "./supabase-repository";

/**
 * OLD ROWS AND OLD RUNTIMES, after the additive migration.
 *
 * The recommended production order applies M75 BEFORE deploying the runtime
 * that writes the new fields, which means the table deliberately spends time
 * holding rows that predate the columns, served by code that never sends them.
 * Both halves have to keep working, or the migration is not the additive change
 * it claims to be.
 */

function rowWithoutDeclaredCode(): Record<string, unknown> {
  return {
    requestId: "8f14e45f-ceea-467a-9575-1f1f1f1f1f1f",
    publicReference: "XRR-20260819-99AABBCCDD",
    status: "submitted",
    email: "prior@example.com",
    fullLegalName: "Prior Customer",
    mobilePhone: "+15125550100",
    organizationName: null,
    shippingAddress: { line1: "1 Test", city: "Austin", region: "TX", postalCode: "78704", countryCode: "US" },
    billingAddress: { line1: "1 Test", city: "Austin", region: "TX", postalCode: "78704", countryCode: "US" },
    ageConfirmed: true,
    lines: [],
    estimatedTotalCents: 10000,
    generalNotes: null,
    agreements: [],
    affiliateAttributionRef: null,
    timeline: [],
    documents: [],
    createdAt: "2026-08-19T12:00:00.000Z",
    updatedAt: "2026-08-19T12:00:00.000Z",
  };
}

describe("a request row that predates the declared-code columns", () => {
  it("still decodes rather than throwing", () => {
    const detail = decodeAdminDetail(rowWithoutDeclaredCode());
    expect(detail.publicReference).toBe("XRR-20260819-99AABBCCDD");
  });

  it("reports a usable state instead of a null an operator console must handle", () => {
    const detail = decodeAdminDetail(rowWithoutDeclaredCode());
    expect(detail.declaredAffiliateCode).toBeNull();
    expect(detail.declaredAffiliateCodeState).toBe("not_provided");
  });

  it("does not invent attribution for it", () => {
    const detail = decodeAdminDetail(rowWithoutDeclaredCode());
    expect(detail.affiliateAttributionRef).toBeNull();
  });

  it("decodes a NEW row with the code present", () => {
    const detail = decodeAdminDetail({
      ...rowWithoutDeclaredCode(),
      declaredAffiliateCode: "DANA10",
      declaredAffiliateCodeState: "captured_unmatched",
    });
    expect(detail.declaredAffiliateCode).toBe("DANA10");
    expect(detail.declaredAffiliateCodeState).toBe("captured_unmatched");
  });
});
