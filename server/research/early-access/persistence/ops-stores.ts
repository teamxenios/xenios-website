import type {
  SupplierConfirmation,
  SupplierConfirmationStore,
} from "../ops/supplier-confirmation";
import type { UnitHoldRecord } from "../ops/unit-holds";
import type { UnitHoldReader } from "../ops/unit-holds";
import type { EarlyAccessHoldBlocker } from "../catalog/eligibility";
import {
  EarlyAccessPersistenceError,
  expectArray,
  expectObject,
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "./executor";

/**
 * Durable ops stores: supplier confirmations (SUPPLIER_CONFIRMED_ON_DEMAND)
 * and the unit hold registry (QA R4's durable half).
 *
 * The supplier-confirmation adapter completes the migration-52 table behind
 * the `SupplierConfirmationStore` port: liveness stays clock-derived (the
 * database filters active, unexpired rows against the instant the CALLER
 * supplies), and withdrawal records the caller's named human and instant in
 * the canonical record itself.
 *
 * The unit-hold registry is the reason a recorded prohibition survives a
 * restart. Its rows are never deleted, by trigger; withdrawal is a recorded
 * state change, and the reader answers only from rows still recorded active.
 */

const CONFIRMATION_RPC = {
  insert: "research_early_access_record_supplier_confirmation",
  byId: "research_early_access_supplier_confirmation_by_id",
  liveForUnit: "research_early_access_supplier_confirmation_for_unit",
  withdraw: "research_early_access_supplier_confirmation_withdraw",
} as const;

const HOLD_RPC = {
  record: "research_early_access_unit_hold_record",
  withdraw: "research_early_access_unit_hold_withdraw",
  byId: "research_early_access_unit_hold_by_id",
  activeKindsForUnit: "research_early_access_active_hold_kinds_for_unit",
  forUnit: "research_early_access_unit_holds_for_unit",
} as const;

/** The canonical blocker order the in-memory registry answers in. */
const HOLD_KIND_ORDER: readonly EarlyAccessHoldBlocker[] = [
  "REGULATORY_HOLD",
  "RECALL",
  "STOP_SHIP",
  "SUPPLIER_QUALITY_HOLD",
];

export class SupabaseSupplierConfirmationStore implements SupplierConfirmationStore {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async insert(confirmation: SupplierConfirmation): Promise<boolean> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: CONFIRMATION_RPC.insert,
      args: { p_record: confirmation },
    });
    if (raw === "recorded") return true;
    if (raw === "duplicate") return false;
    throw new EarlyAccessPersistenceError(CONFIRMATION_RPC.insert);
  }

  async byId(confirmationId: string): Promise<SupplierConfirmation | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: CONFIRMATION_RPC.byId,
      args: { p_confirmation_id: confirmationId },
    });
    return raw === null || raw === undefined
      ? null
      : (Object.freeze(
          expectObject(CONFIRMATION_RPC.byId, raw),
        ) as unknown as SupplierConfirmation);
  }

  async liveForUnit(
    productId: string,
    variantId: string,
    now: string,
  ): Promise<SupplierConfirmation | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: CONFIRMATION_RPC.liveForUnit,
      args: { p_product_id: productId, p_variant_id: variantId, p_now: now },
    });
    return raw === null || raw === undefined
      ? null
      : (Object.freeze(
          expectObject(CONFIRMATION_RPC.liveForUnit, raw),
        ) as unknown as SupplierConfirmation);
  }

  async withdraw(confirmationId: string, by: string, at: string): Promise<boolean> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: CONFIRMATION_RPC.withdraw,
      args: { p_confirmation_id: confirmationId, p_by: by, p_at: at },
    });
    return raw === true;
  }
}

/**
 * The durable unit-hold registry. Implements `UnitHoldReader` for the
 * declared-facts projection and carries the same record/withdraw surface as
 * the in-memory registry for the operator path.
 */
export class SupabaseUnitHoldRegistry implements UnitHoldReader {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async record(hold: UnitHoldRecord): Promise<boolean> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: HOLD_RPC.record,
      args: { p_record: hold },
    });
    return raw === true;
  }

  /** False when the id is unknown OR the hold is no longer active. */
  async withdraw(holdId: string, by: string, at: string): Promise<boolean> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: HOLD_RPC.withdraw,
      args: { p_hold_id: holdId, p_by: by, p_at: at },
    });
    return raw === true;
  }

  async byId(holdId: string): Promise<UnitHoldRecord | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: HOLD_RPC.byId,
      args: { p_hold_id: holdId },
    });
    return raw === null || raw === undefined
      ? null
      : (Object.freeze(expectObject(HOLD_RPC.byId, raw)) as unknown as UnitHoldRecord);
  }

  async activeHoldsForUnit(
    productId: string,
    variantId: string,
    _evaluatedAt: string,
  ): Promise<readonly EarlyAccessHoldBlocker[]> {
    const raw = expectArray(
      HOLD_RPC.activeKindsForUnit,
      await runEarlyAccessCall(this.query, {
        fn: HOLD_RPC.activeKindsForUnit,
        args: { p_product_id: productId, p_variant_id: variantId },
      }),
    );
    const present = new Set(raw.filter((kind): kind is string => typeof kind === "string"));
    // The canonical blocker order, exactly as the in-memory registry answers.
    return Object.freeze(HOLD_KIND_ORDER.filter((kind) => present.has(kind)));
  }

  async holdsForUnit(
    productId: string,
    variantId: string,
  ): Promise<readonly UnitHoldRecord[]> {
    const raw = expectArray(
      HOLD_RPC.forUnit,
      await runEarlyAccessCall(this.query, {
        fn: HOLD_RPC.forUnit,
        args: { p_product_id: productId, p_variant_id: variantId },
      }),
    );
    return Object.freeze(
      raw.map(
        (entry) =>
          Object.freeze(expectObject(HOLD_RPC.forUnit, entry)) as unknown as UnitHoldRecord,
      ),
    );
  }
}
