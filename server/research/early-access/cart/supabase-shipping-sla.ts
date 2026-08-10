/**
 * THE DURABLE WORK LIST FOR THE 72-HOUR SHIPPING SLA MONITOR.
 *
 * `runEarlyAccessShippingSlaSweep` was library code with no production caller
 * because nothing could answer its one port. `ship_by_at` lives only on an M62
 * table that M62 deliberately revokes from `service_role`, and the only reader
 * M62 grants is keyed by a single checkout number. M64 adds the one read-only
 * routine that closes that gap, and this adapter is the whole of the
 * application half.
 *
 * IT READS. IT DOES NOT DECIDE.
 *
 * The routine reports what the database durably knows: which commitments have
 * come due, and what stage each one's shipments are at. Whether a due
 * commitment is OVERDUE stays with `earlyAccessIsOverdue`, which the sweep
 * calls, so the rule "a shipped order is never overdue" lives in exactly one
 * place. This adapter therefore has no clock of its own and no notion of a
 * deadline: it forwards the caller's instant and validates the answer.
 *
 * A malformed row is a REFUSAL, not a skip. The sweep decides whether to alert
 * a human about a late order, and quietly dropping a commitment it could not
 * parse would take an order out of supervision with nobody told. The opaque
 * `EarlyAccessPersistenceError` propagates instead, and the caller records a
 * failure.
 */

import {
  EarlyAccessPersistenceError,
  expectArray,
  expectObject,
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "../persistence/executor";
import type {
  EarlyAccessShippingCommitment,
  EarlyAccessShippingSlaStore,
} from "./shipping-sla-monitor";

const RPC = "research_early_access_cart_shipping_commitments_due";

/** The three stages a SETTLED checkout can be at. `checkout_reserved` is
 * unreachable here: every row in this list has a settlement hardening record,
 * so payment is verified by construction. */
const STAGES = Object.freeze(["processing", "partially_shipped", "shipped"] as const);

function isStage(value: unknown): value is EarlyAccessShippingCommitment["stage"] {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value);
}

/**
 * Normalize the database's timestamp to the exact ISO-8601 UTC shape the
 * shared overdue rule parses. Postgres renders `timestamptz` as
 * `2026-08-10 12:00:00+00`, which `Date.parse` handles, but every other
 * `shipByAt` in this system is an ISO string and the two must be comparable by
 * eye in a log as well as by a parser.
 */
function isoInstant(value: unknown): string {
  if (typeof value !== "string") throw new EarlyAccessPersistenceError(RPC);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new EarlyAccessPersistenceError(RPC);
  return new Date(parsed).toISOString();
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new EarlyAccessPersistenceError(RPC);
  }
  return value;
}

/** Production `EarlyAccessShippingSlaStore` over the M64 read-only routine. */
export class SupabaseEarlyAccessShippingSlaStore implements EarlyAccessShippingSlaStore {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async dueBy(nowIso: string): Promise<readonly EarlyAccessShippingCommitment[]> {
    const rows = expectArray(
      RPC,
      await runEarlyAccessCall(this.query, {
        fn: RPC,
        args: { p_now: nowIso },
      }),
    );
    return Object.freeze(
      rows.map((row) => {
        const record = expectObject(RPC, row);
        if (!isStage(record.stage)) throw new EarlyAccessPersistenceError(RPC);
        return Object.freeze({
          cartCheckoutNumber: requiredString(record.cartCheckoutNumber),
          shipByAt: isoInstant(record.shipByAt),
          stage: record.stage,
        });
      }),
    );
  }
}
