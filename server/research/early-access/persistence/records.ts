import type { EarlyAccessAuditEvent, EarlyAccessAuditSink } from "../routes/ports";
import {
  validateEarlyAccessRelease,
  type EarlyAccessRelease,
  type EarlyAccessReleaseAppend,
  type EarlyAccessReleaseLedger,
} from "../release/founder-release";
import {
  expectArray,
  expectObject,
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "./executor";

/**
 * The durable audit sink and the durable founder release ledger.
 *
 * The audit table is append-only by trigger, so an audit fact, once written,
 * cannot be edited by anything, including the table owner. The release
 * ledger validates a draft with the SAME domain validator the in-memory
 * ledger uses, so a hand-written database row can never smuggle in a record
 * the domain would have refused; the database adds the duplicate-id refusal
 * under concurrency.
 */

const RPC = {
  recordAudit: "research_early_access_record_audit",
  appendRelease: "research_early_access_append_release",
  releasesForUnit: "research_early_access_releases_for_unit",
  releasesAll: "research_early_access_releases_all",
} as const;

export class SupabaseEarlyAccessAuditSink implements EarlyAccessAuditSink {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async record(event: EarlyAccessAuditEvent): Promise<void> {
    await runEarlyAccessCall(this.query, {
      fn: RPC.recordAudit,
      args: { p_event: event },
    });
  }
}

export class SupabaseEarlyAccessReleaseLedger implements EarlyAccessReleaseLedger {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async append(draft: unknown): Promise<EarlyAccessReleaseAppend> {
    // The domain validator decides what a release IS; the database only
    // decides whether the id is new. Same division as the in-memory ledger.
    const validated = validateEarlyAccessRelease(draft);
    if (!validated.ok) {
      return Object.freeze({ ok: false as const, code: validated.code });
    }
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.appendRelease,
      args: { p_release: validated.release },
    });
    if (raw === "duplicate") {
      return Object.freeze({ ok: false as const, code: "DUPLICATE_RELEASE_ID" as const });
    }
    return Object.freeze({ ok: true as const, release: validated.release });
  }

  async history(
    productId: string,
    variantId: string,
  ): Promise<readonly EarlyAccessRelease[]> {
    const raw = expectArray(
      RPC.releasesForUnit,
      await runEarlyAccessCall(this.query, {
        fn: RPC.releasesForUnit,
        args: { p_product_id: productId, p_variant_id: variantId },
      }),
    );
    return Object.freeze(
      raw.map(
        (entry) =>
          Object.freeze(expectObject(RPC.releasesForUnit, entry)) as unknown as EarlyAccessRelease,
      ),
    );
  }

  async all(): Promise<readonly EarlyAccessRelease[]> {
    const raw = expectArray(
      RPC.releasesAll,
      await runEarlyAccessCall(this.query, { fn: RPC.releasesAll, args: {} }),
    );
    return Object.freeze(
      raw.map(
        (entry) =>
          Object.freeze(expectObject(RPC.releasesAll, entry)) as unknown as EarlyAccessRelease,
      ),
    );
  }
}
