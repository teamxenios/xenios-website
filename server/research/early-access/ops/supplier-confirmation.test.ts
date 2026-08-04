import { describe, expect, it } from "vitest";

import {
  InMemorySupplierConfirmationStore,
  createSupplierConfirmation,
  resolveSupplierConfirmationForReservation,
  supplierConfirmationHoldsAt,
  supplierConfirmationSourceVersion,
  supplierConfirmedFulfillmentFact,
  type CreateSupplierConfirmationInput,
} from "./supplier-confirmation";

const CONFIRMED_AT = "2026-08-04T12:00:00.000Z";
const EXPIRES_AT = "2026-08-05T12:00:00.000Z";
const LIVE_AT = "2026-08-04T18:00:00.000Z";
const DEAD_AT = "2026-08-05T12:00:00.001Z";

function input(
  overrides: Partial<CreateSupplierConfirmationInput> = {},
): CreateSupplierConfirmationInput {
  return {
    confirmationId: "supconf-0001",
    supplierOrg: "Apex Research Supply",
    supplierContact: "Mitch (supplier line, recorded)",
    productId: "prod-clean",
    variantId: "var-10mg",
    sku: "R360-CLEAN-10MG-VIAL",
    supplierSku: "APX-CLN-10",
    strength: "10 mg",
    presentation: "Single vial, 10 mg",
    maxQuantity: 12,
    fulfillmentLocation: "Houston TX",
    fulfillmentMethod: "courier_handoff",
    targetHandoffHours: 72,
    shippingRequirements: "Insulated mailer, signature on delivery",
    coldChainState: "ambient_ok",
    documentationState: "supplier_states_coa_available",
    confirmedAt: CONFIRMED_AT,
    expiresAt: EXPIRES_AT,
    confirmedBy: "Samuel Boadu",
    evidenceRef: "telegram:supplier-thread/8841",
    ...overrides,
  };
}

function confirmation(overrides: Partial<CreateSupplierConfirmationInput> = {}) {
  const created = createSupplierConfirmation(input(overrides));
  if (!created.ok) throw new Error(`fixture invalid: ${created.code}`);
  return created.value;
}

describe("createSupplierConfirmation", () => {
  it("accepts a complete named-human confirmation", () => {
    const created = createSupplierConfirmation(input());
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.value.status).toBe("active");
      expect(created.value.withdrawnAt).toBeNull();
    }
  });

  it.each([
    ["system"],
    ["  The System  "],
    ["automation"],
    ["admin"],
  ])("refuses %s as the confirming human", (confirmedBy) => {
    const created = createSupplierConfirmation(input({ confirmedBy }));
    expect(created).toEqual({ ok: false, code: "named_human_required" });
  });

  it("requires the expiry to follow the confirmation instant", () => {
    expect(createSupplierConfirmation(input({ expiresAt: CONFIRMED_AT }))).toEqual({
      ok: false,
      code: "window_invalid",
    });
  });

  it("refuses a non-positive committed quantity", () => {
    expect(createSupplierConfirmation(input({ maxQuantity: 0 }))).toEqual({
      ok: false,
      code: "quantity_invalid",
    });
  });

  it("refuses a handoff target outside 1 to 720 hours", () => {
    expect(createSupplierConfirmation(input({ targetHandoffHours: 0 }))).toEqual({
      ok: false,
      code: "window_invalid",
    });
    expect(createSupplierConfirmation(input({ targetHandoffHours: 721 }))).toEqual({
      ok: false,
      code: "window_invalid",
    });
  });

  it("refuses a blank unit field", () => {
    expect(createSupplierConfirmation(input({ variantId: " " }))).toEqual({
      ok: false,
      code: "unit_invalid",
    });
  });
});

describe("liveness is derived from the clock", () => {
  it("holds while active and unexpired, and stops at expiry with no process running", () => {
    const live = confirmation();
    expect(supplierConfirmationHoldsAt(live, LIVE_AT)).toBe(true);
    expect(supplierConfirmationHoldsAt(live, DEAD_AT)).toBe(false);
  });

  it("never holds after withdrawal", async () => {
    const store = new InMemorySupplierConfirmationStore();
    await store.insert(confirmation());
    await store.withdraw("supconf-0001", "Samuel Boadu", LIVE_AT);
    const withdrawn = await store.byId("supconf-0001");
    expect(withdrawn?.status).toBe("withdrawn");
    expect(supplierConfirmationHoldsAt(withdrawn!, LIVE_AT)).toBe(false);
  });
});

describe("the projected fulfillment fact", () => {
  it("projects eligible with this confirmation's provenance for the exact unit", () => {
    const fact = supplierConfirmedFulfillmentFact(confirmation(), {
      productId: "prod-clean",
      variantId: "var-10mg",
      evaluatedAt: LIVE_AT,
    });
    expect(fact).not.toBeNull();
    expect(fact?.state).toBe("eligible");
    expect(fact?.reason).toBeNull();
    expect(fact?.sourceVersion).toContain("SUPPLIER_CONFIRMED_ON_DEMAND");
    expect(fact?.evaluatedAt).toBe(LIVE_AT);
  });

  it("projects nothing for a different variant of the same product", () => {
    expect(
      supplierConfirmedFulfillmentFact(confirmation(), {
        productId: "prod-clean",
        variantId: "var-5mg",
        evaluatedAt: LIVE_AT,
      }),
    ).toBeNull();
  });

  it("projects nothing once expired, so the unit returns to held automatically", () => {
    expect(
      supplierConfirmedFulfillmentFact(confirmation(), {
        productId: "prod-clean",
        variantId: "var-10mg",
        evaluatedAt: DEAD_AT,
      }),
    ).toBeNull();
  });

  it("changes provenance when the commitment changes", () => {
    const a = supplierConfirmationSourceVersion(confirmation());
    const b = supplierConfirmationSourceVersion(confirmation({ maxQuantity: 6 }));
    expect(a).not.toBe(b);
  });
});

describe("InMemorySupplierConfirmationStore", () => {
  it("inserts idempotently and answers live-for-unit from live rows only", async () => {
    const store = new InMemorySupplierConfirmationStore();
    expect(await store.insert(confirmation())).toBe(true);
    expect(await store.insert(confirmation())).toBe(false);
    expect(await store.liveForUnit("prod-clean", "var-10mg", LIVE_AT)).not.toBeNull();
    expect(await store.liveForUnit("prod-clean", "var-10mg", DEAD_AT)).toBeNull();
    expect(await store.liveForUnit("prod-clean", "var-5mg", LIVE_AT)).toBeNull();
  });

  it("prefers the newest live confirmation for a unit", async () => {
    const store = new InMemorySupplierConfirmationStore();
    await store.insert(confirmation());
    await store.insert(
      confirmation({ confirmationId: "supconf-0002", confirmedAt: LIVE_AT, maxQuantity: 3 }),
    );
    const live = await store.liveForUnit("prod-clean", "var-10mg", "2026-08-04T19:00:00.000Z");
    expect(live?.confirmationId).toBe("supconf-0002");
  });
});

describe("resolveSupplierConfirmationForReservation", () => {
  async function storeWith(): Promise<InMemorySupplierConfirmationStore> {
    const store = new InMemorySupplierConfirmationStore();
    await store.insert(confirmation());
    return store;
  }

  it("resolves a live confirmation for the exact unit within the committed quantity", async () => {
    const resolved = await resolveSupplierConfirmationForReservation(await storeWith(), {
      confirmationId: "supconf-0001",
      productId: "prod-clean",
      variantId: "var-10mg",
      quantity: 3,
      now: LIVE_AT,
    });
    expect(resolved.ok).toBe(true);
  });

  it("refuses an unknown id, so a reservation can never hold against a string", async () => {
    const resolved = await resolveSupplierConfirmationForReservation(await storeWith(), {
      confirmationId: "supconf-none",
      productId: "prod-clean",
      variantId: "var-10mg",
      quantity: 1,
      now: LIVE_AT,
    });
    expect(resolved).toEqual({ ok: false, code: "confirmation_unknown" });
  });

  it("refuses a unit mismatch even when the id is real", async () => {
    const resolved = await resolveSupplierConfirmationForReservation(await storeWith(), {
      confirmationId: "supconf-0001",
      productId: "prod-clean",
      variantId: "var-5mg",
      quantity: 1,
      now: LIVE_AT,
    });
    expect(resolved).toEqual({ ok: false, code: "confirmation_unit_mismatch" });
  });

  it("refuses an expired confirmation", async () => {
    const resolved = await resolveSupplierConfirmationForReservation(await storeWith(), {
      confirmationId: "supconf-0001",
      productId: "prod-clean",
      variantId: "var-10mg",
      quantity: 1,
      now: DEAD_AT,
    });
    expect(resolved).toEqual({ ok: false, code: "confirmation_not_live" });
  });

  it("refuses more units than the supplier committed to", async () => {
    const resolved = await resolveSupplierConfirmationForReservation(await storeWith(), {
      confirmationId: "supconf-0001",
      productId: "prod-clean",
      variantId: "var-10mg",
      quantity: 13,
      now: LIVE_AT,
    });
    expect(resolved).toEqual({ ok: false, code: "confirmation_quantity_exceeded" });
  });
});
