import { describe, expect, it } from "vitest";

import { SupabaseEarlyAccessCommerceStore } from "./commerce-store";
import { EarlyAccessPersistenceError, type EarlyAccessPersistenceCall } from "./executor";
import type { EarlyAccessPlacement, EarlyAccessSettlement } from "../routes/store";

/**
 * Adapter-mapping tests: the store speaks a fixed RPC vocabulary and maps
 * each answer onto the exact commit-result unions the port defines. The
 * executor is scripted, so these run with no database; the SQL semantics
 * themselves are proven by the real-Postgres suite
 * (early-access-commerce.pg.test.ts) and the migration verifier script.
 */

type Script = Record<string, (call: EarlyAccessPersistenceCall) => unknown>;

function storeWith(script: Script, calls?: EarlyAccessPersistenceCall[]) {
  return new SupabaseEarlyAccessCommerceStore({
    query: async (call) => {
      calls?.push(call);
      const handler = script[call.fn];
      if (!handler) throw new Error(`unscripted call: ${call.fn}`);
      return handler(call);
    },
  });
}

const placement = { orderNumber: "XEA-1", idempotencyKey: "key-1" } as unknown as EarlyAccessPlacement;
const incumbent = { orderNumber: "XEA-0", idempotencyKey: "key-1" };

describe("SupabaseEarlyAccessCommerceStore: commits", () => {
  it("a committed placement echoes the caller's own placement", async () => {
    const store = storeWith({
      research_early_access_commit_placement: () => ({ committed: true, placement }),
    });
    const result = await store.commitPlacement(placement);
    expect(result).toEqual({ committed: true, placement });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("an idempotency refusal carries the INCUMBENT record so the loser can answer with it", async () => {
    const store = storeWith({
      research_early_access_commit_placement: () => ({
        committed: false,
        reason: "idempotency_key_taken",
        placement: incumbent,
      }),
    });
    const result = await store.commitPlacement(placement);
    expect(result.committed).toBe(false);
    if (!result.committed) {
      expect(result.reason).toBe("idempotency_key_taken");
      expect(result.placement).toEqual(incumbent);
    }
  });

  it("an unknown placement refusal reason is an infrastructure error, never guessed at", async () => {
    const store = storeWith({
      research_early_access_commit_placement: () => ({ committed: false, reason: "surprise" }),
    });
    await expect(store.commitPlacement(placement)).rejects.toBeInstanceOf(
      EarlyAccessPersistenceError,
    );
  });

  it("proof commits map every port reason", async () => {
    for (const reason of ["chain_moved", "proof_id_taken", "order_unknown"] as const) {
      const store = storeWith({
        research_early_access_commit_proof: () => ({ committed: false, reason }),
      });
      const result = await store.commitProof({ orderNumber: "XEA-1" } as never);
      expect(result).toEqual({ committed: false, reason });
    }
  });

  it("a settlement refusal for already_settled returns the STORED settlement to both callers", async () => {
    const stored = { orderNumber: "XEA-1", settledAt: "2026-08-04T00:00:00.000Z" };
    const store = storeWith({
      research_early_access_commit_settlement: () => ({
        committed: false,
        reason: "already_settled",
        settlement: stored,
      }),
    });
    const result = await store.commitSettlement({ orderNumber: "XEA-1" } as never);
    expect(result.committed).toBe(false);
    if (!result.committed && result.reason === "already_settled") {
      expect(result.settlement).toEqual(stored);
    } else {
      throw new Error("expected already_settled");
    }
  });

  it("transaction_id_used and order_unknown settle to a null settlement", async () => {
    for (const reason of ["transaction_id_used", "order_unknown"] as const) {
      const store = storeWith({
        research_early_access_commit_settlement: () => ({ committed: false, reason }),
      });
      const result = await store.commitSettlement({ orderNumber: "XEA-1" } as never);
      expect(result).toEqual({ committed: false, reason, settlement: null });
    }
  });

  it("dispatch, tracking, and fulfillment commits share the dispatch reason vocabulary", async () => {
    const store = storeWith({
      research_early_access_commit_dispatch_event: () => ({ committed: true }),
      research_early_access_commit_tracking: () => ({ committed: false, reason: "sequence_moved" }),
      research_early_access_commit_fulfillment: () => ({
        committed: false,
        reason: "already_fulfilled",
      }),
    });
    expect(await store.commitDispatchEvent({} as never)).toEqual({ committed: true });
    expect(await store.commitTracking({} as never)).toEqual({
      committed: false,
      reason: "sequence_moved",
    });
    expect(await store.commitFulfillment({} as never)).toEqual({
      committed: false,
      reason: "already_fulfilled",
    });
  });

  it("the reservation TTL is forwarded to the placement commit, null when unset", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const bare = storeWith(
      { research_early_access_commit_placement: () => ({ committed: true }) },
      calls,
    );
    await bare.commitPlacement(placement);
    expect(calls[0]?.args.p_reservation_ttl_minutes).toBeNull();

    const withTtl = new SupabaseEarlyAccessCommerceStore({
      query: async (call) => {
        calls.push(call);
        return { committed: true };
      },
      reservationTtlMinutes: 4320,
    });
    await withTtl.commitPlacement(placement);
    expect(calls[1]?.args.p_reservation_ttl_minutes).toBe(4320);
  });
});

describe("SupabaseEarlyAccessCommerceStore: reads", () => {
  it("placement lookups answer null for a missing record and the record verbatim otherwise", async () => {
    const store = storeWith({
      research_early_access_placement_by_key: () => null,
      research_early_access_placement: () => placement,
    });
    expect(await store.placementByIdempotencyKey("nope")).toBeNull();
    expect(await store.placementByOrderNumber("XEA-1")).toEqual(placement);
  });

  it("awaitingReview, proofs, and verifications map arrays and freeze them", async () => {
    const store = storeWith({
      research_early_access_awaiting_review: () => [placement],
      research_early_access_proofs: () => [{ orderNumber: "XEA-1", sha256: "ab" }],
      research_early_access_verifications: () => [],
    });
    const review = await store.awaitingReview();
    expect(review).toHaveLength(1);
    expect(Object.isFrozen(review)).toBe(true);
    expect(Object.isFrozen(review[0])).toBe(true);
    expect(await store.proofs("XEA-1")).toHaveLength(1);
    expect(await store.verifications("XEA-1")).toEqual([]);
  });

  it("dispatch for a never-settled order is the same empty record the in-memory store answers", async () => {
    const store = storeWith({ research_early_access_dispatch: () => null });
    expect(await store.dispatch("XEA-9")).toEqual({
      events: [],
      tracking: [],
      fulfillment: null,
    });
  });

  it("dispatch composes events, tracking, and the fulfillment", async () => {
    const store = storeWith({
      research_early_access_dispatch: () => ({
        events: [{ orderNumber: "XEA-1", sequence: 1 }],
        tracking: [{ orderId: "XEA-1", sequence: 1 }],
        fulfillment: { orderId: "XEA-1" },
      }),
    });
    const dispatch = await store.dispatch("XEA-1");
    expect(dispatch.events).toHaveLength(1);
    expect(dispatch.tracking).toHaveLength(1);
    expect(dispatch.fulfillment).toEqual({ orderId: "XEA-1" });
  });

  it("settledTransactionRefs answers the whole cross-order list, frozen, dropping non-strings", async () => {
    const store = storeWith({
      research_early_access_settled_transaction_refs: () => ["BANK-1", "BANK-2", 3, null],
    });
    const refs = await store.settledTransactionRefs();
    expect(refs).toEqual(["BANK-1", "BANK-2"]);
    expect(Object.isFrozen(refs)).toBe(true);
  });

  it("settlement reads answer null or the record", async () => {
    const stored = { orderNumber: "XEA-1" } as unknown as EarlyAccessSettlement;
    const store = storeWith({
      research_early_access_settlement: (call) =>
        call.args.p_order_number === "XEA-1" ? stored : null,
    });
    expect(await store.settlement("XEA-1")).toEqual(stored);
    expect(await store.settlement("XEA-2")).toBeNull();
  });
});

describe("SupabaseEarlyAccessCommerceStore: failure opacity", () => {
  it("a driver rejection surfaces as the opaque persistence error naming only the function", async () => {
    const store = new SupabaseEarlyAccessCommerceStore({
      query: async () => {
        throw new Error("connection to db.example.supabase.co failed with key sb_secret_...");
      },
    });
    const failure = await store.awaitingReview().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EarlyAccessPersistenceError);
    expect(String(failure)).not.toContain("sb_secret");
    expect(String(failure)).toContain("research_early_access_awaiting_review");
  });

  it("a malformed RPC answer is an error, never coerced into a commit result", async () => {
    const store = storeWith({
      research_early_access_commit_settlement: () => "ok",
    });
    await expect(store.commitSettlement({} as never)).rejects.toBeInstanceOf(
      EarlyAccessPersistenceError,
    );
  });
});
