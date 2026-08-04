import { describe, expect, it } from "vitest";

import {
  SupabaseSupplierConfirmationStore,
  SupabaseUnitHoldRegistry,
} from "./ops-stores";
import { EarlyAccessPersistenceError, type EarlyAccessPersistenceCall } from "./executor";
import { InMemorySupplierConfirmationStore } from "../ops/supplier-confirmation";
import type { SupplierConfirmation } from "../ops/supplier-confirmation";
import { InMemoryUnitHoldRegistry } from "../ops/unit-holds";
import type { UnitHoldRecord } from "../ops/unit-holds";

const confirmation = {
  confirmationId: "conf-1",
  supplierOrg: "apex-labs",
  supplierContact: "Apex Ops, ops@apex.example",
  productId: "prod-1",
  variantId: "var-1",
  sku: "XEN-TB-5",
  supplierSku: "APX-TB-5",
  strength: "5 mg",
  presentation: "lyophilized vial",
  maxQuantity: 10,
  fulfillmentLocation: "Houston, TX",
  fulfillmentMethod: "courier_handoff",
  targetHandoffHours: 72,
  shippingRequirements: "insulated mailer with gel pack",
  coldChainState: "cool",
  documentationState: "coa_pending",
  confirmedAt: "2026-08-03T00:00:00.000Z",
  expiresAt: "2026-08-10T00:00:00.000Z",
  confirmedBy: "Samuel Boadu",
  evidenceRef: "email thread-123",
  status: "active",
  withdrawnAt: null,
  withdrawnBy: null,
} as unknown as SupplierConfirmation;

const hold = {
  holdId: "hold-1",
  kind: "REGULATORY_HOLD",
  productId: "prod-1",
  variantId: "var-1",
  reason: "Counsel moved the compound to regulatory hold.",
  recordedBy: "Samuel Boadu",
  recordedAt: "2026-08-04T00:00:00.000Z",
  status: "active",
  withdrawnBy: null,
  withdrawnAt: null,
} as unknown as UnitHoldRecord;

type Script = Record<string, (call: EarlyAccessPersistenceCall) => unknown>;

function query(script: Script, calls?: EarlyAccessPersistenceCall[]) {
  return async (call: EarlyAccessPersistenceCall) => {
    calls?.push(call);
    const handler = script[call.fn];
    if (!handler) throw new Error(`unscripted call: ${call.fn}`);
    return handler(call);
  };
}

describe("SupabaseSupplierConfirmationStore", () => {
  it("maps the recorded/duplicate insert vocabulary onto the port's boolean", async () => {
    const store = new SupabaseSupplierConfirmationStore(
      query({
        research_early_access_record_supplier_confirmation: (() => {
          let first = true;
          return () => {
            const answer = first ? "recorded" : "duplicate";
            first = false;
            return answer;
          };
        })(),
      }),
    );
    expect(await store.insert(confirmation)).toBe(true);
    expect(await store.insert(confirmation)).toBe(false);
  });

  it("an unrecognized insert answer is an infrastructure error, never a guess", async () => {
    const store = new SupabaseSupplierConfirmationStore(
      query({ research_early_access_record_supplier_confirmation: () => "stored" }),
    );
    await expect(store.insert(confirmation)).rejects.toBeInstanceOf(
      EarlyAccessPersistenceError,
    );
  });

  it("byId and liveForUnit answer the record verbatim or null, passing the caller's clock", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const store = new SupabaseSupplierConfirmationStore(
      query(
        {
          research_early_access_supplier_confirmation_by_id: (call) =>
            call.args.p_confirmation_id === "conf-1" ? confirmation : null,
          research_early_access_supplier_confirmation_for_unit: () => confirmation,
        },
        calls,
      ),
    );
    expect(await store.byId("conf-1")).toEqual(confirmation);
    expect(await store.byId("conf-2")).toBeNull();
    expect(await store.liveForUnit("prod-1", "var-1", "2026-08-04T00:00:00.000Z")).toEqual(
      confirmation,
    );
    const live = calls.find(
      (call) => call.fn === "research_early_access_supplier_confirmation_for_unit",
    );
    expect(live?.args.p_now).toBe("2026-08-04T00:00:00.000Z");
  });

  it("withdraw carries the caller's named human and instant", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const store = new SupabaseSupplierConfirmationStore(
      query({ research_early_access_supplier_confirmation_withdraw: () => true }, calls),
    );
    expect(
      await store.withdraw("conf-1", "Samuel Boadu", "2026-08-05T00:00:00.000Z"),
    ).toBe(true);
    expect(calls[0]?.args).toEqual({
      p_confirmation_id: "conf-1",
      p_by: "Samuel Boadu",
      p_at: "2026-08-05T00:00:00.000Z",
    });
  });

  it("agrees with the in-memory store on withdraw-of-unknown semantics", async () => {
    const inMemory = new InMemorySupplierConfirmationStore();
    const durable = new SupabaseSupplierConfirmationStore(
      query({ research_early_access_supplier_confirmation_withdraw: () => false }),
    );
    expect(await inMemory.withdraw("nope", "Samuel Boadu", "2026-08-05T00:00:00.000Z")).toBe(
      false,
    );
    expect(await durable.withdraw("nope", "Samuel Boadu", "2026-08-05T00:00:00.000Z")).toBe(
      false,
    );
  });
});

describe("SupabaseUnitHoldRegistry", () => {
  it("record is true once and false on a replayed hold id", async () => {
    let first = true;
    const registry = new SupabaseUnitHoldRegistry(
      query({
        research_early_access_unit_hold_record: () => {
          const answer = first;
          first = false;
          return answer;
        },
      }),
    );
    expect(await registry.record(hold)).toBe(true);
    expect(await registry.record(hold)).toBe(false);
  });

  it("withdraw is false for an unknown or already-withdrawn hold, like the in-memory registry", async () => {
    const inMemory = new InMemoryUnitHoldRegistry();
    await inMemory.record(hold);
    await inMemory.withdraw("hold-1", "Samuel Boadu", "2026-08-05T00:00:00.000Z");
    expect(
      await inMemory.withdraw("hold-1", "Samuel Boadu", "2026-08-05T00:00:00.000Z"),
    ).toBe(false);

    const durable = new SupabaseUnitHoldRegistry(
      query({ research_early_access_unit_hold_withdraw: () => false }),
    );
    expect(
      await durable.withdraw("hold-1", "Samuel Boadu", "2026-08-05T00:00:00.000Z"),
    ).toBe(false);
  });

  it("activeHoldsForUnit answers in the canonical blocker order, deduplicated", async () => {
    const registry = new SupabaseUnitHoldRegistry(
      query({
        research_early_access_active_hold_kinds_for_unit: () => [
          "SUPPLIER_QUALITY_HOLD",
          "RECALL",
          "RECALL",
        ],
      }),
    );
    expect(await registry.activeHoldsForUnit("prod-1", "var-1", "2026-08-04T00:00:00.000Z"))
      .toEqual(["RECALL", "SUPPLIER_QUALITY_HOLD"]);
  });

  it("matches the in-memory registry's answer for the same holds", async () => {
    const inMemory = new InMemoryUnitHoldRegistry();
    await inMemory.record(hold);
    await inMemory.record({ ...hold, holdId: "hold-2", kind: "STOP_SHIP" } as UnitHoldRecord);
    const expected = await inMemory.activeHoldsForUnit(
      "prod-1",
      "var-1",
      "2026-08-04T00:00:00.000Z",
    );

    const durable = new SupabaseUnitHoldRegistry(
      query({
        research_early_access_active_hold_kinds_for_unit: () => [
          "STOP_SHIP",
          "REGULATORY_HOLD",
        ],
      }),
    );
    expect(
      await durable.activeHoldsForUnit("prod-1", "var-1", "2026-08-04T00:00:00.000Z"),
    ).toEqual(expected);
  });

  it("unknown kinds from the database are dropped, never surfaced as blockers", async () => {
    const registry = new SupabaseUnitHoldRegistry(
      query({
        research_early_access_active_hold_kinds_for_unit: () => ["RECALL", "SOMETHING_NEW"],
      }),
    );
    expect(
      await registry.activeHoldsForUnit("prod-1", "var-1", "2026-08-04T00:00:00.000Z"),
    ).toEqual(["RECALL"]);
  });

  it("a driver rejection is the opaque persistence error", async () => {
    const registry = new SupabaseUnitHoldRegistry(async () => {
      throw new Error("connection string leaked here");
    });
    const failure = await registry
      .activeHoldsForUnit("prod-1", "var-1", "2026-08-04T00:00:00.000Z")
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EarlyAccessPersistenceError);
    expect(String(failure)).not.toContain("connection string");
  });
});
