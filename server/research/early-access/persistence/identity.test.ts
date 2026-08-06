import { describe, expect, it } from "vitest";

import {
  SupabaseConsumedTokenStore,
  SupabaseEarlyAccessCustomerRepository,
  SupabaseSessionBindingStore,
} from "./identity";
import { EarlyAccessPersistenceError, type EarlyAccessPersistenceCall } from "./executor";
import type { EarlyAccessCustomerRecord } from "../identity/early-access-customer";

const record = {
  id: "cust-1",
  normalizedEmail: "a@example.com",
  status: "INVITED",
} as unknown as EarlyAccessCustomerRecord;

type Script = Record<string, (call: EarlyAccessPersistenceCall) => unknown>;

function query(script: Script) {
  return async (call: EarlyAccessPersistenceCall) => {
    const handler = script[call.fn];
    if (!handler) throw new Error(`unscripted call: ${call.fn}`);
    return handler(call);
  };
}

describe("SupabaseEarlyAccessCustomerRepository", () => {
  it("insert maps ok and the duplicate-email refusal onto the port's result", async () => {
    const fresh = new SupabaseEarlyAccessCustomerRepository(
      query({ research_early_access_customer_insert: () => ({ ok: true }) }),
    );
    expect(await fresh.insert(record)).toEqual({ ok: true, value: record });

    const duplicate = new SupabaseEarlyAccessCustomerRepository(
      query({
        research_early_access_customer_insert: () => ({
          ok: false,
          code: "EMAIL_ALREADY_REGISTERED",
        }),
      }),
    );
    expect(await duplicate.insert(record)).toEqual({
      ok: false,
      code: "EMAIL_ALREADY_REGISTERED",
    });
  });

  it("an unrecognized insert refusal is an infrastructure error", async () => {
    const repo = new SupabaseEarlyAccessCustomerRepository(
      query({
        research_early_access_customer_insert: () => ({ ok: false, code: "SOMETHING_ELSE" }),
      }),
    );
    await expect(repo.insert(record)).rejects.toBeInstanceOf(EarlyAccessPersistenceError);
  });

  it("finders answer the record verbatim or null", async () => {
    const repo = new SupabaseEarlyAccessCustomerRepository(
      query({
        research_early_access_customer_by_id: (call) =>
          call.args.p_id === "cust-1" ? record : null,
        research_early_access_customer_by_email: (call) =>
          call.args.p_normalized_email === "a@example.com" ? record : null,
      }),
    );
    expect(await repo.findById("cust-1")).toEqual(record);
    expect(await repo.findById("cust-2")).toBeNull();
    expect(await repo.findByNormalizedEmail("a@example.com")).toEqual(record);
    expect(await repo.findByNormalizedEmail("b@example.com")).toBeNull();
  });

  it("update sends the record and returns it, mirroring the in-memory port", async () => {
    const sent: EarlyAccessPersistenceCall[] = [];
    const repo = new SupabaseEarlyAccessCustomerRepository(async (call) => {
      sent.push(call);
      return record;
    });
    expect(await repo.update(record)).toEqual(record);
    expect(sent[0]?.fn).toBe("research_early_access_customer_update");
    expect(sent[0]?.args.p_record).toEqual(record);
  });
});

describe("SupabaseConsumedTokenStore", () => {
  it("is true only when the database says this call burned the token", async () => {
    let first = true;
    const store = new SupabaseConsumedTokenStore(
      query({
        research_early_access_consume_token: () => {
          const answer = first;
          first = false;
          return answer;
        },
      }),
    );
    expect(await store.consume("jti-1")).toBe(true);
    expect(await store.consume("jti-1")).toBe(false);
  });

  it("anything but true from the database reads as not-consumed", async () => {
    const store = new SupabaseConsumedTokenStore(
      query({ research_early_access_consume_token: () => "yes" }),
    );
    expect(await store.consume("jti-1")).toBe(false);
  });
});

describe("SupabaseSessionBindingStore", () => {
  it("bind is true only for the call that created the binding", async () => {
    let bound = false;
    const store = new SupabaseSessionBindingStore(
      query({
        research_early_access_bind_session: () => {
          if (bound) return false;
          bound = true;
          return true;
        },
      }),
    );
    expect(await store.bind("s".repeat(64), "cust-1", "email_entry")).toBe(true);
    // Already bound, EVEN to the same customer: false, exactly like the port.
    expect(await store.bind("s".repeat(64), "cust-1", "email_entry")).toBe(false);
  });

  it("get answers the bound customer id or null", async () => {
    const store = new SupabaseSessionBindingStore(
      query({
        research_early_access_session_binding: (call) =>
          call.args.p_session_id === "known" ? "cust-1" : null,
      }),
    );
    expect(await store.get("known")).toBe("cust-1");
    expect(await store.get("unknown")).toBeNull();
  });

  it("REFUSES to record a verified binding it has no column for", async () => {
    // The durable table is (session_id, customer_id). It has no provenance
    // column, so a verified binding written here would read back as
    // "email_entry" on the very next request, and the customer would redeem a
    // valid link, be told they were verified, and find the catalogue still
    // priceless with nothing to act on.
    //
    // Refusing loudly is the same rule this package applies to every other
    // missing durable capability: do not sell, and do not pretend. It also
    // makes the missing migration impossible to miss in production.
    let called = 0;
    const store = new SupabaseSessionBindingStore(
      query({
        research_early_access_bind_session: () => {
          called += 1;
          return true;
        },
      }),
    );

    await expect(store.bind("s".repeat(64), "cust-1", "verified_link")).rejects.toThrow(
      /bound_by/,
    );
    // Nothing was written on the way to the refusal.
    expect(called).toBe(0);
  });

  it("reports every row it CAN hold as the weak provenance", async () => {
    // Not a guess: `bind` above refuses anything else, so every row this table
    // can contain is an email-entry binding. Stating it here rather than
    // relying on the directory's fallback keeps the fail-closed answer visible
    // at the store that produces it.
    const store = new SupabaseSessionBindingStore(
      query({
        research_early_access_session_binding: (call) =>
          call.args.p_session_id === "known" ? "cust-1" : null,
      }),
    );
    expect(await store.binding("known")).toEqual({
      customerId: "cust-1",
      boundBy: "email_entry",
    });
    expect(await store.binding("unknown")).toBeNull();
  });
});
