import type {
  SupplierConfirmation,
  SupplierConfirmationStore,
  BulkSupplierConfirmationLiveReader,
} from "../ops/supplier-confirmation";
import type { UnitHoldRecord } from "../ops/unit-holds";
import {
  unitFactKey,
  type BulkUnitHoldReader,
  type UnitHoldReader,
  type UnitHoldRegistry as UnitHoldRegistryPort,
} from "../ops/unit-holds";
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
  liveForAllUnits: "research_early_access_live_supplier_confirmations",
  withdraw: "research_early_access_supplier_confirmation_withdraw",
} as const;

const HOLD_RPC = {
  record: "research_early_access_unit_hold_record",
  withdraw: "research_early_access_unit_hold_withdraw",
  byId: "research_early_access_unit_hold_by_id",
  activeKindsForUnit: "research_early_access_active_hold_kinds_for_unit",
  activeForAllUnits: "research_early_access_active_unit_holds",
  forUnit: "research_early_access_unit_holds_for_unit",
} as const;

/** The canonical blocker order the in-memory registry answers in. */
const HOLD_KIND_ORDER: readonly EarlyAccessHoldBlocker[] = [
  "REGULATORY_HOLD",
  "RECALL",
  "STOP_SHIP",
  "SUPPLIER_QUALITY_HOLD",
];

export class SupabaseSupplierConfirmationStore
  implements SupplierConfirmationStore, BulkSupplierConfirmationLiveReader
{
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

  /**
   * The newest live confirmation for EVERY unit, in one RPC
   * (migration 20260821170000). The SQL's liveness clause is the per-unit
   * function's clause verbatim, so the two reads cannot disagree about what
   * "live" means. Throws `EarlyAccessPersistenceError` when the RPC is absent
   * or the read fails; the projection falls back to per-unit reads then.
   */
  async liveForAllUnits(
    now: string,
  ): Promise<ReadonlyMap<string, SupplierConfirmation>> {
    const raw = expectArray(
      CONFIRMATION_RPC.liveForAllUnits,
      await runEarlyAccessCall(this.query, {
        fn: CONFIRMATION_RPC.liveForAllUnits,
        args: { p_now: now },
      }),
    );
    const all = new Map<string, SupplierConfirmation>();
    for (const entry of raw) {
      const confirmation = Object.freeze(
        expectObject(CONFIRMATION_RPC.liveForAllUnits, entry),
      ) as unknown as SupplierConfirmation;
      all.set(unitFactKey(confirmation.productId, confirmation.variantId), confirmation);
    }
    return all;
  }
}

/**
 * The durable unit-hold registry. Implements `UnitHoldReader` for the
 * declared-facts projection and carries the same record/withdraw surface as
 * the in-memory registry for the operator path.
 */
export class SupabaseUnitHoldRegistry implements UnitHoldReader, BulkUnitHoldReader {
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

  /**
   * Active hold kinds for EVERY unit, in one RPC (migration 20260821170000).
   * The SQL's `status = 'active'` clause is the per-unit function's clause
   * verbatim, and the kinds are re-ordered into the same canonical order the
   * per-unit read answers in. Throws `EarlyAccessPersistenceError` when the
   * RPC is absent or the read fails; the projection falls back to per-unit
   * reads then.
   */
  async activeHoldsForAllUnits(
    _evaluatedAt: string,
  ): Promise<ReadonlyMap<string, readonly EarlyAccessHoldBlocker[]>> {
    const raw = expectArray(
      HOLD_RPC.activeForAllUnits,
      await runEarlyAccessCall(this.query, {
        fn: HOLD_RPC.activeForAllUnits,
        args: {},
      }),
    );
    const kindsByUnit = new Map<string, Set<string>>();
    for (const entry of raw) {
      const row = expectObject(HOLD_RPC.activeForAllUnits, entry) as {
        productId?: unknown;
        variantId?: unknown;
        kind?: unknown;
      };
      if (
        typeof row.productId !== "string" ||
        typeof row.variantId !== "string" ||
        typeof row.kind !== "string"
      ) {
        continue;
      }
      const key = unitFactKey(row.productId, row.variantId);
      const bucket = kindsByUnit.get(key) ?? new Set<string>();
      bucket.add(row.kind);
      kindsByUnit.set(key, bucket);
    }
    const all = new Map<string, readonly EarlyAccessHoldBlocker[]>();
    for (const [key, present] of Array.from(kindsByUnit.entries())) {
      // The canonical blocker order, exactly as the per-unit read answers.
      const kinds = Object.freeze(
        HOLD_KIND_ORDER.filter((kind) => present.has(kind)),
      );
      if (kinds.length > 0) all.set(key, kinds);
    }
    return all;
  }
}

// ---------------------------------------------------------------------------
// Deployment compatibility: the hold READ, when migration 54 is not applied
// ---------------------------------------------------------------------------

/**
 * The durable hold registry, with ONE read made survivable on a deployment
 * where the hold RPC does not exist yet.
 *
 * WHY THIS EXISTS
 *
 * `activeHoldsForUnit` is called once per unit during every catalogue
 * projection. If `research_early_access_active_hold_kinds_for_unit` is absent
 * (migration 54 not applied), that call throws, the throw escapes the
 * projection, and the catalogue route's own catch turns the whole page into
 * 503 unavailable. A missing prohibition registry would therefore take down
 * the catalogue rather than merely leave it unfiltered, which is the wrong
 * failure: the release ledger, the strength disputes and the supplier
 * confirmations are all still perfectly able to hold a unit.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not fabricate a hold, and it does not remove one. An absent registry
 * resolves to "this registry contributes no blockers", which is the truthful
 * answer when there are no rows to read. Every OTHER reason a unit is held is
 * untouched: a founder release is still required, a strength dispute still
 * blocks, an unconfirmed supply still blocks. This softens exactly one input
 * and leaves the rest of the floor intact.
 *
 * It also degrades ONLY the read. `record` and `withdraw` still throw, because
 * an operator recording a prohibition must never be told it worked when the
 * table could not take it.
 *
 * AN HONEST LIMIT. `runEarlyAccessCall` collapses every driver failure into
 * one opaque error and discards the cause on purpose, because a driver error
 * can carry a connection string. So this class cannot distinguish "the
 * function is not there" from "the read failed for another reason", and it
 * treats both alike. That is acceptable only because the warning below makes
 * the degradation loud: a genuine fault surfaces as the same line an operator
 * is already watching for, rather than as silence.
 *
 * WHEN MIGRATION 54 IS APPLIED this class is a pass-through with a latch that
 * never trips, so it can stay wired permanently rather than being removed in a
 * later hurry.
 */
export class MigrationTolerantUnitHoldRegistry implements UnitHoldRegistryPort {
  /** One warning per process, not one per unit per request. */
  private warned = false;

  constructor(
    private readonly inner: SupabaseUnitHoldRegistry,
    private readonly warn: (message: string) => void = (message) => console.warn(message),
  ) {}

  async activeHoldsForUnit(
    productId: string,
    variantId: string,
    evaluatedAt: string,
  ): Promise<readonly EarlyAccessHoldBlocker[]> {
    try {
      return await this.inner.activeHoldsForUnit(productId, variantId, evaluatedAt);
    } catch (cause) {
      if (!(cause instanceof EarlyAccessPersistenceError)) throw cause;
      if (!this.warned) {
        this.warned = true;
        // Names the RPC and the migration, and nothing else. No product, no
        // customer, no session, no connection detail: an operator needs the
        // one fact that identifies the gap, and a log line is the wrong place
        // for anything more.
        this.warn(
          "[early-access] the durable unit-hold registry is unavailable " +
            `(${HOLD_RPC.activeKindsForUnit} is missing, migration 54 is not applied). ` +
            "The catalogue is serving WITHOUT durable unit holds. Founder releases, " +
            "strength disputes and supplier confirmations still hold units normally. " +
            "Apply migration 54 to restore recorded prohibitions.",
        );
      }
      return Object.freeze([]);
    }
  }

  /**
   * The bulk read, delegated unchanged. A failure PROPAGATES rather than
   * degrading here: the declared-facts projection catches it and falls back to
   * the per-unit read — which this wrapper then degrades to "no durable
   * blockers" only if the per-unit RPC is also unavailable. Degrading the bulk
   * read directly would skip the per-unit rung of that ladder and silently
   * drop real holds on a deployment where only the NEW bulk RPC is missing.
   */
  async activeHoldsForAllUnits(
    evaluatedAt: string,
  ): Promise<ReadonlyMap<string, readonly EarlyAccessHoldBlocker[]>> {
    return this.inner.activeHoldsForAllUnits(evaluatedAt);
  }

  /** Unchanged, and deliberately still throwing. */
  async record(hold: UnitHoldRecord): Promise<boolean> {
    return this.inner.record(hold);
  }

  async withdraw(holdId: string, by: string, at: string): Promise<boolean> {
    return this.inner.withdraw(holdId, by, at);
  }

  async byId(holdId: string): Promise<UnitHoldRecord | null> {
    return this.inner.byId(holdId);
  }

  async holdsForUnit(
    productId: string,
    variantId: string,
  ): Promise<readonly UnitHoldRecord[]> {
    return this.inner.holdsForUnit(productId, variantId);
  }
}
