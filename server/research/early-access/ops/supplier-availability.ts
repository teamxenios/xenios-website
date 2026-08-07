import { isSafeIdentifier } from "../commerce/input-guards";
import { isNonwaivableBlocker } from "../release/founder-release";
import type {
  EarlyAccessCatalogProjection,
  EarlyAccessCatalogRow,
} from "../catalog/early-access-catalog";
import type { EarlyAccessCatalogSource, EarlyAccessCatalogContext } from "../release/release-routes";
import type { EarlyAccessSupplierDirectory } from "../routes/ports";

/**
 * ONE ANSWER TO "CAN THIS UNIT ACTUALLY BE SHIPPED", FOR EVERY CALLER.
 *
 * The production defect this closes is not the identifier translation, which
 * is fixed in supplier-identity.ts. It is that the catalogue and the checkout
 * were answering the supplier question from DIFFERENT SOURCES.
 *
 *   catalogue `supplierReady` <- fulfillmentOwnerForLane(product.lane), a
 *                                pure function that returns a fulfillment
 *                                owner for every research_material product
 *                                and therefore answers TRUE for all 22 rows
 *                                whether or not a supplier row exists
 *   checkout route            <- deps.suppliers.forUnit(), the mounted
 *                                directory reading live confirmations
 *
 * So the shelf could advertise a unit the checkout could not route, and did:
 * the catalogue said 18 purchasable while the order door refused every one of
 * them. `!row.supplierReady` was dead code, because it never went false.
 *
 * THE SEAM. This decorator wraps the catalogue source at the composition
 * root and re-decides `purchasable` against THE SAME directory the order
 * route and the cart use. Every consumer reads `deps.catalog`, so the
 * catalogue route, the single-order route, the cart quote and the cart
 * checkout now share one answer by construction rather than by agreement.
 *
 * IT ONLY EVER SUBTRACTS. A row the projection already held stays held; a
 * row it offered is withdrawn when no usable route exists. Nothing here can
 * make an unsellable unit sellable, so the decorator cannot manufacture the
 * 18-purchasable target, and if the authoritative confirmations lapse the
 * shelf tells the truth instead of taking money for a box nobody ships.
 */

export const SUPPLIER_UNAVAILABLE_REASONS = [
  /** The directory has no live confirmation for this exact unit. */
  "ROUTE_MISSING",
  /** A route came back but its supplier identity is not a usable identifier. */
  "SUPPLIER_ID_INVALID",
  /** A route came back but its supplier SKU is not a usable identifier. */
  "SUPPLIER_SKU_INVALID",
] as const;

export type SupplierUnavailableReason = (typeof SUPPLIER_UNAVAILABLE_REASONS)[number];

export type SupplierAvailability =
  | Readonly<{ available: true; supplierId: string; supplierSku: string }>
  | Readonly<{ available: false; reason: SupplierUnavailableReason }>;

/**
 * Can this exact unit be routed to a supplier right now?
 *
 * The directory decides liveness and expiry: an expired confirmation is not
 * returned by the RPC's `expires_at > now` filter, so an expired unit
 * arrives here as ROUTE_MISSING and fails closed, which is the behaviour the
 * 2026-09-03 expiry needs.
 */
export async function decideSupplierAvailability(
  suppliers: EarlyAccessSupplierDirectory,
  productId: string,
  variantId: string,
): Promise<SupplierAvailability> {
  const route = await suppliers.forUnit(productId, variantId);
  if (route === null) return Object.freeze({ available: false as const, reason: "ROUTE_MISSING" as const });
  if (!isSafeIdentifier(route.supplierId)) {
    return Object.freeze({ available: false as const, reason: "SUPPLIER_ID_INVALID" as const });
  }
  if (!isSafeIdentifier(route.supplierSku)) {
    return Object.freeze({ available: false as const, reason: "SUPPLIER_SKU_INVALID" as const });
  }
  return Object.freeze({
    available: true as const,
    supplierId: route.supplierId,
    supplierSku: route.supplierSku,
  });
}

export type SupplierWithdrawal = Readonly<{
  productId: string;
  variantId: string;
  sku: string;
  displayName: string;
  reason: SupplierUnavailableReason;
}>;

/**
 * The catalogue source, with supplier truth applied.
 *
 * Wraps the real source and, for every row the projection marked
 * purchasable, asks the mounted directory whether it can actually be routed.
 * A row that cannot is withdrawn: `purchasable` false, `supplierReady` false,
 * and the price removed, because an amount beside a unit nobody can ship
 * reads as an offer.
 *
 * The withdrawals are handed to an optional observer rather than swallowed,
 * so a deployment can log or alert on "the shelf just lost a unit" instead of
 * discovering it from a customer.
 */
export class SupplierConsistentCatalogSource implements EarlyAccessCatalogSource {
  constructor(
    private readonly deps: Readonly<{
      source: EarlyAccessCatalogSource;
      suppliers: EarlyAccessSupplierDirectory;
      /**
       * The founder release ledger, used ONLY to bound how many rows are
       * asked about. The catalogue is scoped to released units, so a row with
       * no release is not on the shelf and its supplier is not a question
       * anybody is waiting on. Without this the decorator would issue a
       * supplier lookup for every row in Product Control on every page load.
       *
       * It never widens the answer: a row in scope is still only offered if
       * the release bridge releases it.
       */
      releases?: { all(): Promise<readonly { productId: string; variantId: string }[]> };
      onWithdrawn?: (withdrawals: readonly SupplierWithdrawal[]) => void;
    }>,
  ) {}

  async load(
    now: Date,
    context: EarlyAccessCatalogContext = {},
  ): Promise<EarlyAccessCatalogProjection> {
    const projection = await this.deps.source.load(now, context);
    const withdrawals: SupplierWithdrawal[] = [];
    const released = await this.releasedUnits();

    const rows = await Promise.all(
      projection.rows.map(async (row) => {
        // A row already held for a reason no release can bridge is held
        // whatever the supplier says, so asking costs a lookup and changes
        // nothing. Every row that could still reach a customer IS asked,
        // including one Product Control has not cleared on its own, because
        // a founder release is exactly what turns those into the shelf.
        if (!couldStillBeOffered(row)) return row;
        if (released !== null && !row.purchasable && !released.has(unitKey(row))) return row;

        const decision = await decideSupplierAvailability(
          this.deps.suppliers,
          row.productId,
          row.variantId,
        );
        if (decision.available) return row;

        withdrawals.push(
          Object.freeze({
            productId: row.productId,
            variantId: row.variantId,
            sku: row.sku,
            displayName: row.displayName,
            reason: decision.reason,
          }),
        );
        // SUPPLIER_NOT_ASSIGNED is already a NON-WAIVABLE blocker
        // (release/founder-release.ts): "whether a real supplier and a real
        // route to the customer exist. Automating them is operational; having
        // them at all is not." So recording it here is not merely a label. It
        // is the one statement a founder release may not bridge, which is why
        // this decorator does not have to be trusted by every downstream
        // caller: the release bridge refuses the unit on its own.
        const blockers = row.blockers.includes(SUPPLIER_NOT_ASSIGNED)
          ? row.blockers
          : Object.freeze([...row.blockers, SUPPLIER_NOT_ASSIGNED]);
        return Object.freeze({
          ...row,
          blockers,
          purchasable: false,
          supplierReady: false,
          // No price beside a unit that cannot be shipped.
          priceCents: null,
          currency: "",
          availability: "unavailable" as const,
        });
      }),
    );

    if (withdrawals.length > 0) this.deps.onWithdrawn?.(Object.freeze(withdrawals));
    return Object.freeze({ ...projection, rows: Object.freeze(rows) }) as EarlyAccessCatalogProjection;
  }

  /** The units on the shelf, or null when every offerable row must be asked. */
  private async releasedUnits(): Promise<ReadonlySet<string> | null> {
    return releasedUnitKeys(this.deps.releases);
  }
}

/**
 * The released units as comparable keys, or null when no ledger was wired or
 * the read FAILED.
 *
 * Null on failure is deliberate. An empty set would silently skip every
 * lookup and hand back the old, unchecked catalogue, which is the exact
 * failure mode this module exists to end. Asking about more rows is slower
 * and correct.
 */
async function releasedUnitKeys(
  releases: { all(): Promise<readonly { productId: string; variantId: string }[]> } | undefined,
): Promise<ReadonlySet<string> | null> {
  if (releases === undefined) return null;
  try {
    return new Set((await releases.all()).map((release) => unitKey(release)));
  } catch {
    return null;
  }
}

/** One unit, as a comparable key. */
function unitKey(unit: { readonly productId: string; readonly variantId: string }): string {
  return `${unit.productId} ${unit.variantId}`;
}

/** The existing non-waivable blocker that says no real supplier route exists. */
const SUPPLIER_NOT_ASSIGNED = "SUPPLIER_NOT_ASSIGNED";

/**
 * True when the supplier question can still change what a customer sees.
 *
 * Product Control may have cleared the row outright, or a founder release may
 * still lift it onto the shelf. Both are in scope. A row carrying a
 * non-waivable blocker about the CONTENTS (identity, strength, regulatory) is
 * held no matter what any supplier says, so it is skipped: the answer cannot
 * change, and the lookup is a round trip per row per page load.
 */
function couldStillBeOffered(row: EarlyAccessCatalogRow): boolean {
  if (row.purchasable) return true;
  return row.blockers.every(
    (blocker) =>
      // The supply pair is precisely the question being asked here, so a row
      // blocked ONLY on those is still in scope.
      blocker === SUPPLIER_NOT_ASSIGNED ||
      blocker === "FULFILLMENT_UNAVAILABLE" ||
      !isNonwaivableBlocker(blocker),
  );
}

// ---------------------------------------------------------------------------
// Readiness: what is about to stop being sellable
// ---------------------------------------------------------------------------

export type SupplierExpiryWarning = Readonly<{
  productId: string;
  variantId: string;
  sku: string;
  expiresAt: string;
  daysRemaining: number;
}>;

export type SupplierReadinessReport = Readonly<{
  checkedAt: string;
  /**
   * Units that could reach a customer AND resolve a usable supplier route.
   *
   * Deliberately not "purchasable": that is decided downstream by the founder
   * release bridge, and a readiness probe that needed the release ledger to
   * answer "can we still ship" would be measuring the wrong thing. This is the
   * supply question alone.
   */
  routableCount: number;
  withdrawn: readonly SupplierWithdrawal[];
  expiringSoon: readonly SupplierExpiryWarning[];
}>;

/** A confirmation inside this many days of lapsing is worth telling someone about. */
export const SUPPLIER_EXPIRY_WARNING_DAYS = 30;

/**
 * The operational readiness answer, for a boot check or a scheduled probe.
 *
 * It exists because the 22 opening-set confirmations all expire on the same
 * day (2026-09-03T23:30Z). When they lapse, the directory stops returning a
 * route and every unit fails closed to held, which is correct but is a
 * catastrophe to discover from a customer. This reports the cliff BEFORE it
 * arrives, and reports anything already withdrawn.
 */
export async function earlyAccessSupplierReadiness(input: {
  readonly source: EarlyAccessCatalogSource;
  readonly suppliers: EarlyAccessSupplierDirectory;
  /** The shelf scope, so the probe measures the units actually on sale. */
  readonly releases?: { all(): Promise<readonly { productId: string; variantId: string }[]> };
  /** Live confirmation lookup, for expiry. Absent means expiry is not reported. */
  readonly confirmations?: {
    liveForUnit(
      productId: string,
      variantId: string,
      now: string,
    ): Promise<{ expiresAt?: string | null } | null>;
  };
  readonly now: Date;
  readonly warningDays?: number;
  /** The audience the shelf is projected under. Defaults to anonymous. */
  readonly context?: EarlyAccessCatalogContext;
}): Promise<SupplierReadinessReport> {
  const withdrawn: SupplierWithdrawal[] = [];
  const wrapped = new SupplierConsistentCatalogSource({
    source: input.source,
    suppliers: input.suppliers,
    ...(input.releases === undefined ? {} : { releases: input.releases }),
    onWithdrawn: (rows) => withdrawn.push(...rows),
  });
  // The same customer audience the shelf is projected under, so the probe
  // measures the catalogue a customer would actually be served.
  const projection = await wrapped.load(input.now, input.context ?? {});
  // The shelf, after supplier truth was applied: rows the founder released
  // (or Product Control cleared outright) that still resolve a route.
  //
  // `supplierReady` is the load-bearing term. A withdrawn row still satisfies
  // `couldStillBeOffered` on purpose, because the supply pair is exactly the
  // question this module re-asks on every load, so filtering on the blocker
  // list alone would count every withdrawn row as ready.
  const onTheShelf = await releasedUnitKeys(input.releases);
  const routable = projection.rows.filter(
    (row) =>
      row.supplierReady &&
      couldStillBeOffered(row) &&
      (onTheShelf === null || row.purchasable || onTheShelf.has(unitKey(row))),
  );

  const expiringSoon: SupplierExpiryWarning[] = [];
  if (input.confirmations !== undefined) {
    const nowIso = input.now.toISOString();
    const warningDays = input.warningDays ?? SUPPLIER_EXPIRY_WARNING_DAYS;
    for (const row of routable) {
      const live = await input.confirmations.liveForUnit(row.productId, row.variantId, nowIso);
      const expiresAt = live?.expiresAt ?? null;
      if (typeof expiresAt !== "string") continue;
      const remainingMs = Date.parse(expiresAt) - input.now.getTime();
      if (!Number.isFinite(remainingMs)) continue;
      const daysRemaining = Math.floor(remainingMs / 86_400_000);
      if (daysRemaining <= warningDays) {
        expiringSoon.push(
          Object.freeze({
            productId: row.productId,
            variantId: row.variantId,
            sku: row.sku,
            expiresAt,
            daysRemaining,
          }),
        );
      }
    }
  }

  return Object.freeze({
    checkedAt: input.now.toISOString(),
    routableCount: routable.length,
    withdrawn: Object.freeze(withdrawn),
    expiringSoon: Object.freeze(expiringSoon),
  });
}
