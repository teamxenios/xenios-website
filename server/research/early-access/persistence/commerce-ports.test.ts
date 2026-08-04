import { describe, expect, it } from "vitest";

import {
  SupabaseEarlyAccessAgreementGate,
  SupabaseEarlyAccessReferralResolver,
  SupabaseEarlyAccessShippingPolicy,
  SupabaseEarlyAccessSupplierDirectory,
} from "./commerce-ports";
import type { EarlyAccessPersistenceCall } from "./executor";
import type { SupplierShipmentRecipient } from "../commerce/supplier-release";

const destination: SupplierShipmentRecipient = {
  recipientName: "A Researcher",
  line1: "1 Lab Way",
  line2: null,
  city: "Houston",
  region: "TX",
  postalCode: "77002",
  country: "US",
};

describe("SupabaseEarlyAccessAgreementGate", () => {
  it("with an EMPTY required list it accepts nobody and never calls the database", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const gate = new SupabaseEarlyAccessAgreementGate({
      query: async (call) => {
        calls.push(call);
        return true;
      },
      required: [],
    });
    expect(await gate.accepted("eac_" + "a".repeat(32))).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("asks the database about the exact required (kind, version) pairs", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const required = [{ kind: "early_access_terms", version: "v1" }];
    const gate = new SupabaseEarlyAccessAgreementGate({
      query: async (call) => {
        calls.push(call);
        return true;
      },
      required,
    });
    expect(await gate.accepted("eac_" + "a".repeat(32))).toBe(true);
    expect(calls[0]?.fn).toBe("research_early_access_agreements_accepted");
    expect(calls[0]?.args.p_required).toEqual(required);
  });

  it("anything but true from the database reads as not-accepted", async () => {
    const gate = new SupabaseEarlyAccessAgreementGate({
      query: async () => "true",
      required: [{ kind: "early_access_terms", version: "v1" }],
    });
    expect(await gate.accepted("eac_" + "a".repeat(32))).toBe(false);
  });
});

describe("SupabaseEarlyAccessSupplierDirectory", () => {
  it("maps a live confirmation onto the supplier assignment", async () => {
    const directory = new SupabaseEarlyAccessSupplierDirectory({
      query: async () => ({ supplierId: "apex-labs", supplierSku: "APX-BPC-10" }),
      now: () => Date.parse("2026-08-04T00:00:00.000Z"),
    });
    expect(await directory.forUnit("prod-1", "var-1")).toEqual({
      supplierId: "apex-labs",
      supplierSku: "APX-BPC-10",
    });
  });

  it("null from the database (no active, unexpired confirmation) stays null: SUPPLIER_UNAVAILABLE", async () => {
    const directory = new SupabaseEarlyAccessSupplierDirectory({
      query: async () => null,
      now: () => Date.now(),
    });
    expect(await directory.forUnit("prod-1", "var-1")).toBeNull();
  });

  it("passes ITS clock to the database so expiry is judged against injected time", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const directory = new SupabaseEarlyAccessSupplierDirectory({
      query: async (call) => {
        calls.push(call);
        return null;
      },
      now: () => Date.parse("2026-08-04T12:00:00.000Z"),
    });
    await directory.forUnit("prod-1", "var-1");
    expect(calls[0]?.args.p_now).toBe("2026-08-04T12:00:00.000Z");
  });

  it("a malformed assignment from the database is null, never a partial object", async () => {
    const directory = new SupabaseEarlyAccessSupplierDirectory({
      query: async () => ({ supplierId: "apex-labs" }),
      now: () => Date.now(),
    });
    expect(await directory.forUnit("prod-1", "var-1")).toBeNull();
  });
});

describe("SupabaseEarlyAccessShippingPolicy", () => {
  it("serves only what the database allowlist affirms", async () => {
    const policy = new SupabaseEarlyAccessShippingPolicy(async (call) => {
      return call.args.p_country === "US" && call.args.p_region === "TX";
    });
    expect(await policy.serves(destination)).toBe(true);
    expect(await policy.serves({ ...destination, region: "AK" })).toBe(false);
  });

  it("anything but true is not served (fail closed)", async () => {
    const policy = new SupabaseEarlyAccessShippingPolicy(async () => undefined);
    expect(await policy.serves(destination)).toBe(false);
  });
});

describe("SupabaseEarlyAccessReferralResolver", () => {
  it("maps a grant onto the attribution shape", async () => {
    const resolver = new SupabaseEarlyAccessReferralResolver(async () => ({
      referralCode: "FRIEND10",
      affiliateId: "aff-1",
      affiliateCustomerRef: "eac_" + "b".repeat(32),
      holdBasisPoints: 1000,
    }));
    expect(await resolver.forCustomer("eac_" + "a".repeat(32))).toEqual({
      referralCode: "FRIEND10",
      affiliateId: "aff-1",
      affiliateCustomerRef: "eac_" + "b".repeat(32),
      holdBasisPoints: 1000,
    });
  });

  it("no grant means null: no attribution, no commission", async () => {
    const resolver = new SupabaseEarlyAccessReferralResolver(async () => null);
    expect(await resolver.forCustomer("eac_" + "a".repeat(32))).toBeNull();
  });

  it("a malformed grant is null rather than a partial attribution", async () => {
    const resolver = new SupabaseEarlyAccessReferralResolver(async () => ({
      referralCode: "FRIEND10",
      holdBasisPoints: "1000",
    }));
    expect(await resolver.forCustomer("eac_" + "a".repeat(32))).toBeNull();
  });
});
