import { describe, expect, it } from "vitest";

import {
  InMemorySupplierConfirmationLedger,
  resolveSupplierConfirmation,
  supplierFulfilmentFact,
  supplierUnavailableFact,
  supplierVariantFingerprint,
  validateSupplierConfirmation,
  type SupplierConfirmation,
} from "./supplier-confirmation";

// This record is the ONLY thing that can clear FULFILLMENT_UNAVAILABLE, which is
// non-waivable. So the tests are written against the ways it could wrongly say
// "yes", not against its happy path.

const UNIT = {
  productId: "prod-pt141",
  variantId: "var-10mg",
  sku: "R360-PT141-10MG-VIAL",
  strength: "10 mg",
  presentation: "Single vial, 10 mg",
};
const FINGERPRINT = supplierVariantFingerprint(UNIT);
const CONFIRMED_AT = "2026-08-04T12:00:00.000Z";
const EXPIRES_AT = "2026-08-11T12:00:00.000Z";
const NOW = Date.parse("2026-08-05T12:00:00.000Z");

function draft(overrides: Record<string, unknown> = {}) {
  return {
    confirmationId: "supconf-0001",
    status: "confirmed",
    fulfilmentModel: "SUPPLIER_CONFIRMED_ON_DEMAND",
    productId: UNIT.productId,
    variantId: UNIT.variantId,
    variantFingerprint: FINGERPRINT,
    supplierOrganization: "Example Supplier Ltd",
    supplierContact: "ops@example-supplier.test",
    supplierSku: "SUP-PT141-10",
    strength: UNIT.strength,
    presentation: UNIT.presentation,
    maxFulfillableQuantity: 25,
    fulfilmentLocation: "Houston, TX",
    fulfilmentMethod: "Manual, shipped by the supplier partner",
    targetHandoffTime: "within 48 hours of order confirmation",
    shippingRequirements: "Standard parcel, signature not required",
    coldChainState: "not_required",
    documentationState: "COA pending",
    confirmedBy: "Samuel Boadu",
    confirmedAt: CONFIRMED_AT,
    expiresAt: EXPIRES_AT,
    evidenceReference: "supplier email 2026-08-04",
    operationalNote: "First Early Access release.",
    ...overrides,
  };
}

function confirmed(overrides: Record<string, unknown> = {}): SupplierConfirmation {
  const validated = validateSupplierConfirmation(draft(overrides));
  if (!validated.ok) throw new Error(`fixture invalid: ${validated.code}`);
  return validated.confirmation;
}

function resolve(confirmations: SupplierConfirmation[], now = NOW, fingerprint = FINGERPRINT) {
  return resolveSupplierConfirmation({
    confirmations,
    productId: UNIT.productId,
    variantId: UNIT.variantId,
    variantFingerprint: fingerprint,
    now,
  });
}

describe("a live confirmation gives one exact unit supplier cover", () => {
  it("resolves, and names the confirmation it relied on", () => {
    const result = resolve([confirmed()]);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.confirmation.confirmationId).toBe("supconf-0001");
    expect(result.confirmation.maxFulfillableQuantity).toBe(25);
  });

  it("produces a fulfilment fact the eligibility gate will accept", () => {
    // fulfillmentAvailable requires state eligible, reason null, a non-blank
    // sourceVersion, and the PROJECTION's instant, not the confirmation's.
    const evaluatedAt = "2026-08-05T12:00:00.000Z";
    const fact = supplierFulfilmentFact(confirmed(), evaluatedAt);
    expect(fact.state).toBe("eligible");
    expect(fact.reason).toBeNull();
    expect(fact.sourceVersion).toBe("supplier_confirmation:supconf-0001");
    expect(fact.evaluatedAt).toBe(evaluatedAt);
    expect(fact.evaluatedAt).not.toBe(CONFIRMED_AT);
  });

  it("a unit with no confirmation is unavailable, never silently eligible", () => {
    const result = resolve([]);
    expect(result.available).toBe(false);
    if (result.available) return;
    expect(result.hold).toBe("NO_CONFIRMATION");
    const fact = supplierUnavailableFact({ ...UNIT, hold: result.hold, evaluatedAt: "2026-08-05T12:00:00.000Z" });
    expect(fact.state).toBe("unavailable");
    expect(fact.reason).toBe("NO_CONFIRMATION");
  });
});

describe("the promise has a shelf life", () => {
  it("covers the unit before expiry and stops covering it after, with NOTHING else changed", () => {
    const record = confirmed();
    const before = resolve([record], Date.parse("2026-08-11T11:59:59.000Z"));
    const after = resolve([record], Date.parse("2026-08-11T12:00:01.000Z"));
    expect(before.available).toBe(true);
    expect(after.available).toBe(false);
    if (!after.available) expect(after.hold).toBe("CONFIRMATION_EXPIRED");
  });

  it("treats the exact expiry instant as expired, not as covered", () => {
    const result = resolve([confirmed()], Date.parse(EXPIRES_AT));
    expect(result.available).toBe(false);
  });

  it("REFUSES to record a confirmation that expires before it was made", () => {
    for (const bad of [
      { expiresAt: "2026-08-03T12:00:00.000Z" },
      { expiresAt: CONFIRMED_AT },
    ]) {
      const validated = validateSupplierConfirmation(draft(bad));
      expect(validated.ok).toBe(false);
      if (!validated.ok) expect(validated.code).toBe("EXPIRY_NOT_AFTER_CONFIRMATION");
    }
  });

  it("requires an expiry at all", () => {
    const validated = validateSupplierConfirmation(draft({ expiresAt: undefined }));
    expect(validated.ok).toBe(false);
    if (!validated.ok) expect(validated.code).toBe("EXPIRY_INVALID");
  });
});

describe("the confirmation is bound to the exact variant, not the product", () => {
  it.each([
    ["strength", { strength: "5 mg" }],
    ["presentation", { presentation: "Single vial, 10 mg, amber" }],
    ["sku", { sku: "R360-PT141-10MG-VIAL-B" }],
    ["variant", { variantId: "var-5mg" }],
  ])("goes STALE when the %s changes", (_label, change) => {
    const moved = supplierVariantFingerprint({ ...UNIT, ...change });
    const result = resolve([confirmed()], NOW, moved);
    expect(result.available).toBe(false);
    if (!result.available) expect(result.hold).toBe("CONFIRMATION_STALE");
  });

  it("does not cover a different variant of the same product", () => {
    const result = resolveSupplierConfirmation({
      confirmations: [confirmed()],
      productId: UNIT.productId,
      variantId: "var-20mg",
      variantFingerprint: FINGERPRINT,
      now: NOW,
    });
    expect(result.available).toBe(false);
    if (!result.available) expect(result.hold).toBe("NO_CONFIRMATION");
  });

  it("the fingerprint separates units that differ only at a field boundary", () => {
    const a = supplierVariantFingerprint({ ...UNIT, strength: "10 mg", presentation: "vial" });
    const b = supplierVariantFingerprint({ ...UNIT, strength: "10", presentation: "mg vial" });
    expect(a).not.toBe(b);
  });
});

describe("what a confirmation may never assert", () => {
  it("REFUSES a confirmed record whose cold chain is required and unavailable", () => {
    // A unit that needs a cold chain nobody has is not fulfillable, whatever
    // else the supplier said. Refuse the claim rather than record and filter it.
    const validated = validateSupplierConfirmation(
      draft({ coldChainState: "required_and_unavailable" }),
    );
    expect(validated.ok).toBe(false);
    if (!validated.ok) expect(validated.code).toBe("COLD_CHAIN_INVALID");
  });

  it("allows required_and_available", () => {
    expect(validateSupplierConfirmation(draft({ coldChainState: "required_and_available" })).ok).toBe(true);
  });

  it.each([
    ["no supplier organization", { supplierOrganization: "" }, "SUPPLIER_INVALID"],
    ["no supplier contact", { supplierContact: "   " }, "SUPPLIER_INVALID"],
    ["no supplier sku", { supplierSku: "" }, "SUPPLIER_SKU_INVALID"],
    ["no named human", { confirmedBy: "" }, "CONFIRMED_BY_INVALID"],
    ["no evidence", { evidenceReference: "" }, "EVIDENCE_INVALID"],
    ["no fulfilment location", { fulfilmentLocation: "" }, "FULFILMENT_INVALID"],
    ["no handoff time", { targetHandoffTime: "" }, "FULFILMENT_INVALID"],
    ["unlimited quantity", { maxFulfillableQuantity: 0 }, "QUANTITY_INVALID"],
    ["absurd quantity", { maxFulfillableQuantity: 99_999 }, "QUANTITY_INVALID"],
    ["fractional quantity", { maxFulfillableQuantity: 2.5 }, "QUANTITY_INVALID"],
    ["a product-level fingerprint", { variantFingerprint: "not-a-hash" }, "FINGERPRINT_INVALID"],
    ["an unknown fulfilment model", { fulfilmentModel: "TRUST_ME" }, "FULFILMENT_MODEL_INVALID"],
    ["an unknown cold chain state", { coldChainState: "probably_fine" }, "COLD_CHAIN_INVALID"],
  ])("refuses %s", (_label, override, code) => {
    const validated = validateSupplierConfirmation(draft(override));
    expect(validated.ok).toBe(false);
    if (!validated.ok) expect(validated.code).toBe(code);
  });

  it("refuses control characters in any recorded field", () => {
    for (const field of ["supplierOrganization", "supplierSku", "evidenceReference", "fulfilmentLocation"]) {
      const validated = validateSupplierConfirmation(draft({ [field]: "ok injected" }));
      expect(validated.ok).toBe(false);
    }
  });

  it("refuses a non-object entirely", () => {
    for (const bad of [null, undefined, "confirmation", 42, []]) {
      expect(validateSupplierConfirmation(bad).ok).toBe(false);
    }
  });
});

describe("the ledger is append only", () => {
  it("a withdrawal is a NEW record and the unit loses cover", async () => {
    const ledger = new InMemorySupplierConfirmationLedger();
    await ledger.append(draft());
    await ledger.append(
      draft({
        confirmationId: "supconf-0002",
        status: "withdrawn",
        confirmedAt: "2026-08-04T18:00:00.000Z",
        expiresAt: "2026-08-12T12:00:00.000Z",
      }),
    );
    const all = await ledger.all();
    expect(all).toHaveLength(2);
    // The original is still on the record. History is not rewritten.
    expect(all[0]?.status).toBe("confirmed");

    const result = resolve([...all]);
    expect(result.available).toBe(false);
    if (!result.available) expect(result.hold).toBe("CONFIRMATION_WITHDRAWN");
  });

  it("a later re-confirmation restores cover without erasing the withdrawal", async () => {
    const ledger = new InMemorySupplierConfirmationLedger();
    await ledger.append(draft());
    await ledger.append(draft({ confirmationId: "supconf-0002", status: "withdrawn", confirmedAt: "2026-08-04T18:00:00.000Z" }));
    await ledger.append(draft({ confirmationId: "supconf-0003", confirmedAt: "2026-08-04T20:00:00.000Z" }));
    const all = await ledger.all();
    expect(all).toHaveLength(3);
    const result = resolve([...all]);
    expect(result.available).toBe(true);
    if (result.available) expect(result.confirmation.confirmationId).toBe("supconf-0003");
  });

  it("refuses a duplicate id rather than overwriting", async () => {
    const ledger = new InMemorySupplierConfirmationLedger();
    expect((await ledger.append(draft())).ok).toBe(true);
    const second = await ledger.append(draft({ supplierOrganization: "Someone Else Ltd" }));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("DUPLICATE_CONFIRMATION_ID");
    expect(await ledger.all()).toHaveLength(1);
  });

  it("never appends an invalid record", async () => {
    const ledger = new InMemorySupplierConfirmationLedger();
    expect((await ledger.append(draft({ confirmedBy: "" }))).ok).toBe(false);
    expect(await ledger.all()).toHaveLength(0);
  });

  it("resolves deterministically when two records share a timestamp", () => {
    const a = confirmed({ confirmationId: "supconf-aaa" });
    const b = confirmed({ confirmationId: "supconf-bbb", status: "withdrawn" });
    expect(resolve([a, b]).available).toBe(resolve([b, a]).available);
  });
});
