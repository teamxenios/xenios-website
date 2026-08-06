import type { CommerceResult } from "../commerce/input-guards";
import type {
  EarlyAccessCustomerRecord,
  EarlyAccessCustomerRepository,
} from "../identity/early-access-customer";
import type {
  ConsumedTokenStore,
  SessionBinding,
  SessionBindingProvenance,
  SessionBindingStore,
} from "../identity/identity-verification";
import {
  EarlyAccessPersistenceError,
  expectObject,
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "./executor";

/**
 * Durable identity stores: the customer roster, the single-use token record,
 * and the session-to-customer bindings.
 *
 * Uniqueness lives in the database (unique normalized email, primary-keyed
 * token ids and session ids), so two instances of the server agree about who
 * exists, which tokens are burned, and which session belongs to whom. The
 * in-memory semantics are mirrored exactly, including the deliberately
 * awkward ones: `bind` is false when the session is already bound even to
 * the same customer, and `consume` is true only the very first time.
 */

const RPC = {
  customerInsert: "research_early_access_customer_insert",
  customerUpdate: "research_early_access_customer_update",
  customerById: "research_early_access_customer_by_id",
  customerByEmail: "research_early_access_customer_by_email",
  consumeToken: "research_early_access_consume_token",
  bindSession: "research_early_access_bind_session",
  sessionBinding: "research_early_access_session_binding",
} as const;

export class SupabaseEarlyAccessCustomerRepository implements EarlyAccessCustomerRepository {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async findById(id: string): Promise<EarlyAccessCustomerRecord | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.customerById,
      args: { p_id: id },
    });
    return raw === null || raw === undefined
      ? null
      : (Object.freeze(expectObject(RPC.customerById, raw)) as EarlyAccessCustomerRecord);
  }

  async findByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<EarlyAccessCustomerRecord | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.customerByEmail,
      args: { p_normalized_email: normalizedEmail },
    });
    return raw === null || raw === undefined
      ? null
      : (Object.freeze(expectObject(RPC.customerByEmail, raw)) as EarlyAccessCustomerRecord);
  }

  async insert(
    record: EarlyAccessCustomerRecord,
  ): Promise<CommerceResult<EarlyAccessCustomerRecord, "EMAIL_ALREADY_REGISTERED">> {
    const raw = expectObject(
      RPC.customerInsert,
      await runEarlyAccessCall(this.query, {
        fn: RPC.customerInsert,
        args: { p_record: record },
      }),
    );
    if (raw.ok === true) {
      return Object.freeze({ ok: true as const, value: record });
    }
    if (raw.code !== "EMAIL_ALREADY_REGISTERED") {
      throw new EarlyAccessPersistenceError(RPC.customerInsert);
    }
    return Object.freeze({ ok: false as const, code: "EMAIL_ALREADY_REGISTERED" as const });
  }

  async update(record: EarlyAccessCustomerRecord): Promise<EarlyAccessCustomerRecord> {
    await runEarlyAccessCall(this.query, {
      fn: RPC.customerUpdate,
      args: { p_record: record },
    });
    return record;
  }
}

export class SupabaseConsumedTokenStore implements ConsumedTokenStore {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async consume(tokenId: string): Promise<boolean> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.consumeToken,
      args: { p_token_id: tokenId },
    });
    return raw === true;
  }
}

/**
 * The durable bindings, and the ONE thing they cannot yet record.
 *
 * `research_early_access_session_bindings` (migration 20260804120000) holds
 * `(session_id, customer_id)` and nothing else, and both RPCs are shaped to
 * match. There is no column for the binding provenance, so this store can
 * represent an "email_entry" binding faithfully and CANNOT represent a
 * "verified_link" one at all.
 *
 * Since the verified-link gate that distinction decides who may see a price,
 * accept the agreement and place an order, so the gap is not cosmetic. It is
 * handled the way this package handles every other missing durable
 * capability: refuse loudly rather than pretend. Writing a verified binding
 * into a row that cannot say so would read back as "email_entry" on the very
 * next request, and the customer would redeem a valid link, be told they were
 * verified, and find the catalogue still priceless with nothing to act on.
 *
 * Closing it needs a schema change (a `bound_by` column plus the two RPCs
 * carrying it), which is a separate, approvable piece of work.
 */
export class SupabaseSessionBindingStore implements SessionBindingStore {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async get(sessionId: string): Promise<string | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.sessionBinding,
      args: { p_session_id: sessionId },
    });
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  }

  /**
   * Stated rather than left to the directory's fallback. Every row this table
   * can hold is an email-entry binding, because `bind` refuses to write any
   * other kind, so answering the weak provenance is accurate here and not a
   * guess.
   */
  async binding(sessionId: string): Promise<SessionBinding | null> {
    const customerId = await this.get(sessionId);
    return customerId === null
      ? null
      : Object.freeze({ customerId, boundBy: "email_entry" as const });
  }

  async bind(
    sessionId: string,
    customerId: string,
    boundBy: SessionBindingProvenance,
  ): Promise<boolean> {
    if (boundBy !== "email_entry") {
      // Not a false return. False means "the session is already bound", which
      // a caller handles by carrying on; this is a deployment that cannot
      // record the fact at all, and the only safe answer to that is to stop.
      throw new EarlyAccessPersistenceError(
        `${RPC.bindSession} cannot record the "${boundBy}" binding provenance: ` +
          "research_early_access_session_bindings has no bound_by column in this " +
          "deployment, so a verified identity would read back as an unverified one",
      );
    }
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.bindSession,
      args: { p_session_id: sessionId, p_customer_id: customerId },
    });
    return raw === true;
  }
}
