import { describe, expect, it } from "vitest";

import { SupabaseEarlyAccessReferralGrantWriter } from "./commerce-ports";
import { EarlyAccessPersistenceError, type EarlyAccessPersistenceCall } from "./executor";

const input = Object.freeze({
  customerRef: "eac_0123456789abcdef0123456789abcdef",
  referralCode: "XEN-PARTNER-7",
  affiliateId: "aff_partner_7",
  affiliateCustomerRef: "eac_ffffffffffffffffffffffffffffffff",
  holdBasisPoints: 750,
});

describe("SupabaseEarlyAccessReferralGrantWriter", () => {
  it("drives the EXACT deployed RPC: name, argument names, argument values", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const writer = new SupabaseEarlyAccessReferralGrantWriter(async (call) => {
      calls.push(call);
      return true;
    });

    await expect(writer.grant(input)).resolves.toBe("granted");
    expect(calls).toHaveLength(1);
    // Pinned byte for byte. The RPC exists in migration 20260804120000 with
    // exactly these parameter names; a drifted name here would not error, it
    // would 404 in production while every unit test stayed green.
    expect(calls[0].fn).toBe("research_early_access_grant_referral");
    expect(calls[0].args).toEqual({
      p_customer_ref: "eac_0123456789abcdef0123456789abcdef",
      p_referral_code: "XEN-PARTNER-7",
      p_affiliate_id: "aff_partner_7",
      p_affiliate_customer_ref: "eac_ffffffffffffffffffffffffffffffff",
      p_hold_basis_points: 750,
    });
  });

  it("is idempotent by contract: the same grant twice is one grant, twice acknowledged", async () => {
    // The RPC upserts on customer_ref and returns true both times. The writer
    // must report both as granted rather than inventing a distinction the
    // database does not make.
    const calls: EarlyAccessPersistenceCall[] = [];
    const writer = new SupabaseEarlyAccessReferralGrantWriter(async (call) => {
      calls.push(call);
      return true;
    });
    await expect(writer.grant(input)).resolves.toBe("granted");
    await expect(writer.grant(input)).resolves.toBe("granted");
    expect(calls[1]).toEqual(calls[0]);
  });

  it.each([
    ["customer handle", { ...input, customerRef: "not-a-handle" }],
    ["affiliate handle", { ...input, affiliateCustomerRef: "eac_short" }],
    ["referral code", { ...input, referralCode: "has spaces" }],
    ["affiliate id", { ...input, affiliateId: "" }],
    ["zero rate", { ...input, holdBasisPoints: 0 }],
    ["over-cap rate", { ...input, holdBasisPoints: 5_001 }],
    ["fractional rate", { ...input, holdBasisPoints: 7.5 }],
    ["self referral", { ...input, affiliateCustomerRef: input.customerRef }],
  ])("refuses a malformed %s by name, before the database sees it", async (_field, bad) => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const writer = new SupabaseEarlyAccessReferralGrantWriter(async (call) => {
      calls.push(call);
      return true;
    });
    await expect(writer.grant(bad)).resolves.toBe("input_invalid");
    expect(calls).toHaveLength(0);
  });

  it("maps a driver failure to the opaque named persistence error", async () => {
    const writer = new SupabaseEarlyAccessReferralGrantWriter(async () => {
      throw new Error("connection string and argument values that must not leak");
    });
    await expect(writer.grant(input)).rejects.toThrow(EarlyAccessPersistenceError);
    await expect(writer.grant(input)).rejects.toThrow(
      "early-access persistence call failed: research_early_access_grant_referral",
    );
  });

  it("treats any answer other than literal true as a failure, never as a grant", async () => {
    for (const answer of [false, null, undefined, 1, "true", {}]) {
      const writer = new SupabaseEarlyAccessReferralGrantWriter(async () => answer);
      await expect(writer.grant(input)).rejects.toThrow(EarlyAccessPersistenceError);
    }
  });
});
