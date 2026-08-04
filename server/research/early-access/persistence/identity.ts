import type { CommerceResult } from "../commerce/input-guards";
import type {
  EarlyAccessCustomerRecord,
  EarlyAccessCustomerRepository,
} from "../identity/early-access-customer";
import type {
  ConsumedTokenStore,
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

export class SupabaseSessionBindingStore implements SessionBindingStore {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async get(sessionId: string): Promise<string | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.sessionBinding,
      args: { p_session_id: sessionId },
    });
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  }

  async bind(sessionId: string, customerId: string): Promise<boolean> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.bindSession,
      args: { p_session_id: sessionId, p_customer_id: customerId },
    });
    return raw === true;
  }
}
