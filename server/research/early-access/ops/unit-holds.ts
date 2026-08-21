/**
 * The unit hold registry: recorded prohibitions for exact units.
 *
 * A hold is a NAMED HUMAN's record that one exact unit must not ship:
 * REGULATORY_HOLD, RECALL, STOP_SHIP, or SUPPLIER_QUALITY_HOLD. Every one is
 * non-waivable, and the declared-facts reader loads ACTIVE holds at every
 * projection, so a hold recorded after a founder release immediately makes
 * the row TEMPORARILY_HELD, the release fingerprint stale, and order
 * creation refused. An older release never outruns a newer hold (QA R4).
 *
 * Withdrawal is recorded, never deleted: the history of a prohibition is
 * part of the prohibition.
 */

import type { EarlyAccessHoldBlocker } from "../catalog/eligibility";

const HOLD_KINDS: readonly EarlyAccessHoldBlocker[] = [
  "REGULATORY_HOLD",
  "RECALL",
  "STOP_SHIP",
  "SUPPLIER_QUALITY_HOLD",
];

const FORBIDDEN_ACTORS = new Set([
  "system",
  "the system",
  "automation",
  "robot",
  "bot",
  "service",
  "admin",
]);

export type UnitHoldRecord = Readonly<{
  holdId: string;
  kind: EarlyAccessHoldBlocker;
  productId: string;
  variantId: string;
  reason: string;
  recordedBy: string;
  recordedAt: string;
  status: "active" | "withdrawn";
  withdrawnBy: string | null;
  withdrawnAt: string | null;
}>;

export type RecordUnitHoldInput = Readonly<{
  holdId: string;
  kind: EarlyAccessHoldBlocker;
  productId: string;
  variantId: string;
  reason: string;
  recordedBy: string;
  recordedAt: string;
}>;

export type UnitHoldFailureCode =
  | "hold_invalid"
  | "kind_invalid"
  | "named_human_required";

export type RecordUnitHoldResult =
  | Readonly<{ ok: true; value: UnitHoldRecord }>
  | Readonly<{ ok: false; code: UnitHoldFailureCode }>;

function isSafeText(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

export function recordUnitHold(input: RecordUnitHoldInput): RecordUnitHoldResult {
  if (!HOLD_KINDS.includes(input.kind)) {
    return Object.freeze({ ok: false as const, code: "kind_invalid" as const });
  }
  if (
    !isSafeText(input.holdId, 128) ||
    !isSafeText(input.productId, 128) ||
    !isSafeText(input.variantId, 128) ||
    !isSafeText(input.reason, 2000) ||
    typeof input.recordedAt !== "string" ||
    Number.isNaN(Date.parse(input.recordedAt))
  ) {
    return Object.freeze({ ok: false as const, code: "hold_invalid" as const });
  }
  if (
    !isSafeText(input.recordedBy, 200) ||
    FORBIDDEN_ACTORS.has(input.recordedBy.trim().toLowerCase())
  ) {
    return Object.freeze({ ok: false as const, code: "named_human_required" as const });
  }
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      holdId: input.holdId,
      kind: input.kind,
      productId: input.productId,
      variantId: input.variantId,
      reason: input.reason,
      recordedBy: input.recordedBy,
      recordedAt: input.recordedAt,
      status: "active" as const,
      withdrawnBy: null,
      withdrawnAt: null,
    }),
  });
}

/** The one question the projection asks. Satisfied by the registry below. */
export interface UnitHoldReader {
  activeHoldsForUnit(
    productId: string,
    variantId: string,
    evaluatedAt: string,
  ): Promise<readonly EarlyAccessHoldBlocker[]>;
}

/**
 * The key a bulk unit-fact map is indexed by. One function, used by every
 * producer and every consumer of such a map, so a key built on one side always
 * matches a key built on the other. The separator cannot appear in an id that
 * passes `isSafeText`.
 */
export function unitFactKey(productId: string, variantId: string): string {
  return `${productId}\n${variantId}`;
}

/**
 * The set-valued form of `UnitHoldReader`: active holds for EVERY unit, in one
 * read, keyed by `unitFactKey`. A unit with no active hold has no entry, which
 * a consumer reads as "no recorded prohibition" — exactly what the per-unit
 * read answers with an empty array.
 *
 * OPTIONAL on any given registry. The declared-facts projection uses it when
 * present and falls back to per-unit reads when absent or failing, so a
 * registry (or a deployment whose bulk RPC is not yet applied) is never worse
 * off than today's per-unit path.
 */
export interface BulkUnitHoldReader {
  activeHoldsForAllUnits(
    evaluatedAt: string,
  ): Promise<ReadonlyMap<string, readonly EarlyAccessHoldBlocker[]>>;
}

/** The full registry: the reader plus the two recorded state changes. */
export interface UnitHoldRegistry extends UnitHoldReader {
  record(hold: UnitHoldRecord): Promise<boolean>;
  withdraw(holdId: string, by: string, at: string): Promise<boolean>;
}

/** Test and labeled-local-development registry. The durable table backs production. */
export class InMemoryUnitHoldRegistry implements UnitHoldRegistry {
  private readonly holds = new Map<string, UnitHoldRecord>();

  async record(hold: UnitHoldRecord): Promise<boolean> {
    if (this.holds.has(hold.holdId)) return false;
    this.holds.set(hold.holdId, hold);
    return true;
  }

  /** Withdrawal is a recorded state change; the row never disappears. */
  async withdraw(holdId: string, by: string, at: string): Promise<boolean> {
    const existing = this.holds.get(holdId);
    if (existing === undefined || existing.status !== "active") return false;
    this.holds.set(holdId, {
      ...existing,
      status: "withdrawn",
      withdrawnBy: by,
      withdrawnAt: at,
    });
    return true;
  }

  async activeHoldsForUnit(
    productId: string,
    variantId: string,
  ): Promise<readonly EarlyAccessHoldBlocker[]> {
    const kinds = new Set<EarlyAccessHoldBlocker>();
    for (const hold of Array.from(this.holds.values())) {
      if (
        hold.status === "active" &&
        hold.productId === productId &&
        hold.variantId === variantId
      ) {
        kinds.add(hold.kind);
      }
    }
    return HOLD_KINDS.filter((kind) => kinds.has(kind));
  }

  /**
   * The bulk read, answered BY the per-unit read for every unit that has any
   * record. One derivation: this cannot drift from `activeHoldsForUnit`
   * because it is `activeHoldsForUnit`, applied per known unit.
   */
  async activeHoldsForAllUnits(
    _evaluatedAt: string,
  ): Promise<ReadonlyMap<string, readonly EarlyAccessHoldBlocker[]>> {
    const units = new Map<string, { productId: string; variantId: string }>();
    for (const hold of Array.from(this.holds.values())) {
      units.set(unitFactKey(hold.productId, hold.variantId), {
        productId: hold.productId,
        variantId: hold.variantId,
      });
    }
    const all = new Map<string, readonly EarlyAccessHoldBlocker[]>();
    for (const [key, unit] of Array.from(units.entries())) {
      const kinds = await this.activeHoldsForUnit(unit.productId, unit.variantId);
      if (kinds.length > 0) all.set(key, kinds);
    }
    return all;
  }
}
