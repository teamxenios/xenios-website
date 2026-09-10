import { describe, expect, it } from "vitest";
import type { CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import { createDurableCheckoutExecutor, type IdempotentCheckoutPaymentPort } from "../durable-checkout-executor";
import { createProviderVerifiedPaymentPort } from "../durable-payment-port";
import { stripeModel } from "../stripe-model.test-helper";
import { createInMemoryWebhookExecutionInbox, createWebhookExecutionProcessor } from "../webhook-execution-processor";
import {
  CheckoutExecutionConflict,
  CheckoutCreditReservationRefused,
  createInMemoryCheckoutExecutionStore,
  createSupabaseCheckoutExecutionStore,
  createSupabaseWebhookExecutionInbox,
  executionToInsertRow,
  requestBodySha256,
  rowToExecution,
  type CheckoutExecutionClient,
  type CheckoutExecutionCreate,
  type CheckoutExecutionRow,
  EXECUTION_COLUMNS,
} from "./checkout-executions-store";

const base: CheckoutExecutionCreate = {
  executionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  requestKey: "req_store_0001",
  requestBodySha256: requestBodySha256({ lines: [{ sku: "SKU-1", quantity: 2 }], total: 33_999 }),
  priceVersion: "price-2026-09",
  phase: "reserved",
  version: 1,
  providerReference: null,
  orderId: "11111111-1111-4111-8111-111111111111",
  memberId: "22222222-2222-4222-8222-222222222222",
  amountCents: 33_999,
  currency: "usd",
  paymentMethodReference: "pm_fixture_card",
  quoteFingerprint: "quote-1",
  authorizationKey: "xr-auth-key-0001",
  captureKey: "xr-capture-key-0001",
  cancelKey: "xr-cancel-key-0001",
  reservationIds: ["res-1"],
  createdAt: "2026-09-09T00:00:00Z",
  authorizationAttemptedAt: null,
  settledAt: null,
};

/** Complete SQL projection, not the deliberately partial legacy insert shape. */
function managedRow(overrides: Record<string, unknown> = {}): CheckoutExecutionRow {
  return {
    ...executionToInsertRow(base),
    last_provider_result: null,
    local_commit_failure: null,
    updated_at: "2026-09-09T00:00:00.123456+00:00",
    committed_at: null,
    ...overrides,
  } as CheckoutExecutionRow;
}

describe("row mapping", () => {
  it("round-trips the coordinator record through the insert row and back, binding body digest and price version", () => {
    const row = executionToInsertRow(base);
    expect(row).toMatchObject({ id: base.executionId, member_id: base.memberId, request_key: base.requestKey, request_body_sha256: base.requestBodySha256, price_version: "price-2026-09", authorization_key: base.authorizationKey, reservation_ids: ["res-1"], authorization_first_attempted_at: null, settled_at: null });
    expect(rowToExecution({ ...row, last_provider_result: null, authorization_first_attempted_at: "2026-09-09T12:00:00+00:00", settled_at: "2026-09-09T13:00:00+00:00" } as CheckoutExecutionRow)).toMatchObject({ authorizationAttemptedAt: "2026-09-09T12:00:00+00:00", settledAt: "2026-09-09T13:00:00+00:00" });
    const back = rowToExecution({ ...row, last_provider_result: null } as CheckoutExecutionRow);
    const { requestBodySha256: _d, priceVersion: _p, ...record } = base;
    // The row also carries the last provider evidence, which the cancellation
    // settlement reads to know WHY nothing was charged.
    // The record also carries the two fields an operations view needs: why a
    // local commit failed, and when the commit completed.
    expect(back).toEqual({ ...record, lastProviderResult: null, localCommitFailure: null, committedAt: null, updatedAt: null });
    const cancelled = rowToExecution({ ...row, last_provider_result: { kind: "cancelled", providerReference: "pi_1", capturedAmountCents: 0, reason: "declined" } } as unknown as CheckoutExecutionRow);
    expect(cancelled?.lastProviderResult).toEqual({ kind: "cancelled", providerReference: "pi_1", capturedAmountCents: 0, reason: "declined" });
  });
  it("projects every column rowToExecution reads, so the retention guard is not silently disabled", () => {
    // PostgREST answers only what is projected. A column missing from the
    // select reads as null, and a null first-attempt stamp tells the payment
    // port that no authorization was ever attempted, which permits a creation
    // replay outside the provider's retention window. Every field the mapper
    // reads must therefore be requested.
    const row = { ...executionToInsertRow(base), last_provider_result: null, local_commit_failure: null, updated_at: base.createdAt, committed_at: null } as unknown as Record<string, unknown>;
    const projected = EXECUTION_COLUMNS.split(",").map((c) => c.trim());
    for (const column of Object.keys(row)) {
      expect(projected, `EXECUTION_COLUMNS must request ${column}`).toContain(column);
    }
    expect(projected).toContain("authorization_first_attempted_at");
  });
  it("refuses a row with an unknown phase or currency", () => {
    const row = { ...executionToInsertRow(base), last_provider_result: null } as CheckoutExecutionRow;
    expect(rowToExecution({ ...row, phase: "paid" })).toBeNull();
    expect(rowToExecution({ ...row, currency: "eur" })).toBeNull();
  });
  it("digests the exact request body deterministically", () => {
    expect(requestBodySha256({ a: 1, b: [1, 2] })).toBe(requestBodySha256({ a: 1, b: [1, 2] }));
    expect(requestBodySha256({ a: 1, b: [1, 2] })).not.toBe(requestBodySha256({ a: 1, b: [2, 1] }));
  });
});

describe("in-memory execution store", () => {
  it("creates once per (member, request key), replays the identical request, and conflicts on a changed body", async () => {
    const store = createInMemoryCheckoutExecutionStore();
    const created = await store.create(base);
    expect(created.phase).toBe("reserved");
    expect(await store.create(base)).toEqual(created);
    await expect(store.create({ ...base, executionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", requestBodySha256: requestBodySha256({ total: 1 }) })).rejects.toBeInstanceOf(CheckoutExecutionConflict);
    await expect(store.create({ ...base, executionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", amountCents: 1 })).rejects.toMatchObject({ code: "request_key_reused" });
    expect(store.snapshot()).toHaveLength(1);
  });
  it("compare-and-swaps every transition and learns a provider reference exactly once", async () => {
    const store = createInMemoryCheckoutExecutionStore();
    const created = await store.create(base);
    const [a, b] = await Promise.all([store.claim(created.executionId, created.version, "authorizing"), store.claim(created.executionId, created.version, "authorizing")]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const claimed = (a ?? b)!;
    const proof = { kind: "authorized" as const, providerReference: "pi_0001", amountCents: 33_999, currency: "usd" as const, memberId: base.memberId, orderId: base.orderId };
    const authorized = await store.recordProvider(claimed.executionId, claimed.version, proof);
    expect(authorized).toMatchObject({ phase: "authorized", providerReference: "pi_0001", version: 3 });
    expect(await store.recordProvider(claimed.executionId, claimed.version, proof)).toBeNull(); // stale version
    expect(await store.recordProvider(authorized!.executionId, authorized!.version, { ...proof, providerReference: "pi_0002" })).toBeNull(); // reference can never change
    expect(await store.findByProviderReference("pi_0001")).toMatchObject({ executionId: base.executionId });
    expect(await store.findByOrder(base.orderId)).toMatchObject({ executionId: base.executionId });
    expect(await store.getForMember("33333333-3333-4333-8333-333333333333", base.requestKey)).toBeNull();
  });
  it("stamps the first authorizing claim once and settles a cancellation exactly once", async () => {
    let clock = Date.parse("2026-09-09T12:00:00Z");
    const store = createInMemoryCheckoutExecutionStore({ now: () => new Date(clock) });
    const created = await store.create(base);
    const first = (await store.claim(created.executionId, created.version, "authorizing"))!;
    expect(first.authorizationAttemptedAt).toBe("2026-09-09T12:00:00.000Z");
    clock += 60_000;
    const back = (await store.recordProvider(first.executionId, first.version, { kind: "unknown" }))!;
    const again = (await store.claim(back.executionId, back.version, "authorizing"))!;
    expect(again.authorizationAttemptedAt).toBe("2026-09-09T12:00:00.000Z");
    const cancelled = (await store.recordProvider(again.executionId, again.version, { kind: "cancelled", providerReference: null, capturedAmountCents: 0 }))!;
    expect(cancelled).toMatchObject({ phase: "cancelled", providerReference: null, settledAt: null });
    await expect(store.commitCaptured(cancelled.executionId, cancelled.version)).rejects.toThrow(/without capture evidence/);
    const settled = (await store.commitCancelled(cancelled.executionId, cancelled.version))!;
    expect(settled.settledAt).toBe("2026-09-09T12:01:00.000Z");
    expect(await store.commitCancelled(settled.executionId, settled.version)).toMatchObject({ settledAt: "2026-09-09T12:01:00.000Z", version: settled.version });
    expect(await store.commitCancelled(settled.executionId, settled.version - 1)).toBeNull();
  });
  it("commits only from captured with a reference, idempotently", async () => {
    const store = createInMemoryCheckoutExecutionStore();
    const created = await store.create(base);
    await expect(store.commitCaptured(created.executionId, created.version)).rejects.toThrow(/without capture evidence/);
    const claimed = (await store.claim(created.executionId, created.version, "capturing"))!;
    const captured = (await store.recordProvider(claimed.executionId, claimed.version, { kind: "captured", providerReference: "pi_0001", amountCents: 33_999, currency: "usd", memberId: base.memberId, orderId: base.orderId }))!;
    const committed = (await store.commitCaptured(captured.executionId, captured.version))!;
    expect(committed.phase).toBe("committed");
    expect(await store.commitCaptured(committed.executionId, committed.version)).toMatchObject({ phase: "committed" });
    expect(await store.commitCaptured(committed.executionId, committed.version - 1)).toBeNull();
  });
});

describe("in-memory store with the real coordinator, port, adapter and webhook processor", () => {
  it("runs the connected path end to end: create -> authorize -> capture -> commit, one intent, one capture", async () => {
    const model = stripeModel();
    const store = createInMemoryCheckoutExecutionStore();
    await store.create(base);
    const executor = createDurableCheckoutExecutor(store, createProviderVerifiedPaymentPort(model.adapter));
    expect(await executor.run(base.memberId, base.requestKey)).toEqual({ kind: "committed", orderId: base.orderId, executionId: base.executionId });
    expect(model.creates()).toHaveLength(1);
    expect(model.captures()).toHaveLength(1);
    expect(store.snapshot()[0]).toMatchObject({ phase: "committed", providerReference: "pi_0001" });
  });
  it("lets a bound webhook resolve an execution that lost its create response, then the coordinator commits without re-authorizing", async () => {
    const model = stripeModel();
    const store = createInMemoryCheckoutExecutionStore();
    await store.create(base);
    model.faults.lostResponses = 1;
    const executor = createDurableCheckoutExecutor(store, createProviderVerifiedPaymentPort(model.adapter));
    expect((await executor.run(base.memberId, base.requestKey)).kind).toBe("reconciliation_required");
    const inbox = createInMemoryWebhookExecutionInbox();
    const processor = createWebhookExecutionProcessor({ providerName: "stripe", inbox, executions: store, expectedProviderAccountId: null });
    const evidence = await processor.process({ eventId: "evt_1", eventType: "payment.authorized", providerReference: "pi_0001", orderId: base.orderId, memberId: base.memberId, amountCents: 33_999, currency: "usd", verified: true }, "a".repeat(64), new Date());
    expect(evidence).toMatchObject({ outcome: "applied", reason: "authorized" });
    expect(await executor.run(base.memberId, base.requestKey)).toMatchObject({ kind: "committed" });
    expect(model.creates()).toHaveLength(1);
    expect(model.captures()).toHaveLength(1);
  });
  it("cancels before capture through the provider, settles locally once, and resumes settlement after a crash", async () => {
    const model = stripeModel();
    const store = createInMemoryCheckoutExecutionStore();
    await store.create(base);
    const executor = createDurableCheckoutExecutor(store, createProviderVerifiedPaymentPort(model.adapter));
    // Authorize, then stop before capture by driving only the first claim through a one-step run.
    const claimed = (await store.claim(base.executionId, 1, "authorizing"))!;
    const port = createProviderVerifiedPaymentPort(model.adapter);
    const proof = await port.authorize(claimed);
    await store.recordProvider(claimed.executionId, claimed.version, proof);
    expect((await store.getForMember(base.memberId, base.requestKey))!.phase).toBe("authorized");
    // Crash between provider cancellation and local settlement: emulate by settling through a store whose commitCancelled fails once.
    let failOnce = true;
    const flaky = { ...store, commitCancelled: async (id: string, v: number) => { if (failOnce) { failOnce = false; throw new Error("db down"); } return store.commitCancelled(id, v); } };
    const flakyExecutor = createDurableCheckoutExecutor(flaky, port);
    await expect(flakyExecutor.cancel(base.memberId, base.requestKey)).rejects.toThrow(/db down/);
    expect(model.intents.get("pi_0001")!.status).toBe("canceled");
    expect((await store.getForMember(base.memberId, base.requestKey))!).toMatchObject({ phase: "cancelled", settledAt: null });
    // The next run settles exactly once and reports cancelled.
    expect(await executor.run(base.memberId, base.requestKey)).toEqual({ kind: "cancelled", orderId: base.orderId, executionId: base.executionId });
    const settled = (await store.getForMember(base.memberId, base.requestKey))!;
    expect(settled.settledAt).not.toBeNull();
    expect(await executor.run(base.memberId, base.requestKey)).toMatchObject({ kind: "cancelled" });
    expect((await store.getForMember(base.memberId, base.requestKey))!.version).toBe(settled.version);
    expect(model.captures()).toHaveLength(0);
  });
  it("a cancel racing a concurrent run over the real store never captures the payment being released", async () => {
    const model = stripeModel();
    const store = createInMemoryCheckoutExecutionStore();
    await store.create(base);
    const executor = createDurableCheckoutExecutor(store, createProviderVerifiedPaymentPort(model.adapter));
    // Authorize first so a live payment exists, then race a cancel against a run.
    const port = createProviderVerifiedPaymentPort(model.adapter);
    const authorized = await port.authorize((await store.getForMember(base.memberId, base.requestKey))!);
    await store.recordProvider(base.executionId, 1, authorized);
    const [cancelled, ran] = await Promise.all([
      executor.cancel(base.memberId, base.requestKey),
      executor.run(base.memberId, base.requestKey),
    ]);
    const final = (await store.getForMember(base.memberId, base.requestKey))!;
    // Exactly one of them owned the execution; whichever did, the money is
    // consistent with the phase and nothing was captured behind a cancellation.
    if (final.phase === "cancelled") {
      expect(model.captures()).toHaveLength(0);
      expect(model.intents.get("pi_0001")!.amount_received).toBe(0);
    } else {
      expect(final.phase === "committed" || final.phase === "reconciliation_required").toBe(true);
    }
    expect([cancelled.kind, ran.kind].every((k) => k !== "missing")).toBe(true);
    expect(model.creates()).toHaveLength(1);
  });
  it("cancels an execution that never reached the provider without any provider call", async () => {
    const model = stripeModel();
    const store = createInMemoryCheckoutExecutionStore();
    await store.create(base);
    const executor = createDurableCheckoutExecutor(store, createProviderVerifiedPaymentPort(model.adapter));
    expect(await executor.cancel(base.memberId, base.requestKey)).toEqual({ kind: "cancelled", orderId: base.orderId, executionId: base.executionId });
    expect(model.requests).toHaveLength(0);
    expect((await store.getForMember(base.memberId, base.requestKey))!).toMatchObject({ phase: "cancelled", providerReference: null });
    expect((await store.getForMember(base.memberId, base.requestKey))!.settledAt).not.toBeNull();
  });
  it("a cancel request after the provider already captured records the capture and commits instead", async () => {
    const model = stripeModel();
    const store = createInMemoryCheckoutExecutionStore();
    await store.create(base);
    const port = createProviderVerifiedPaymentPort(model.adapter);
    const claimed = (await store.claim(base.executionId, 1, "authorizing"))!;
    await store.recordProvider(claimed.executionId, claimed.version, await port.authorize(claimed));
    // Money moved at the provider (for example a capture whose response was lost).
    model.intents.get("pi_0001")!.status = "succeeded";
    model.intents.get("pi_0001")!.amount_received = base.amountCents;
    model.intents.get("pi_0001")!.amount_capturable = 0;
    const executor = createDurableCheckoutExecutor(store, port);
    expect(await executor.cancel(base.memberId, base.requestKey)).toEqual({ kind: "committed", orderId: base.orderId, executionId: base.executionId });
    expect((await store.getForMember(base.memberId, base.requestKey))!.phase).toBe("committed");
  });
  it("never authorizes twice under concurrent runs over the shared store", async () => {
    const model = stripeModel();
    const store = createInMemoryCheckoutExecutionStore();
    await store.create(base);
    const port: IdempotentCheckoutPaymentPort = createProviderVerifiedPaymentPort(model.adapter);
    const executor = createDurableCheckoutExecutor(store, port);
    const outcomes = await Promise.all([executor.run(base.memberId, base.requestKey), executor.run(base.memberId, base.requestKey), executor.run(base.memberId, base.requestKey)]);
    expect(outcomes.filter((o) => o.kind === "committed")).toHaveLength(1);
    expect(model.creates()).toHaveLength(1);
    expect(model.captures()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Supabase adapter over a fake client: the exact RPC names and arguments, the
// create conflict path, and the inbox claim semantics. No network.
// ---------------------------------------------------------------------------
function fakeClient(options: { existing?: CheckoutExecutionRow | null; rpc?: (fn: string, args: Record<string, unknown>) => Record<string, unknown>[] | null; inboxExisting?: { payload_sha256: string; state: string; outcome: string | null } | null } = {}) {
  const calls: { kind: string; table?: string; fn?: string; args?: Record<string, unknown>; row?: Record<string, unknown>; filters?: [string, unknown][] }[] = [];
  const client: CheckoutExecutionClient = {
    from(table) {
      return {
        select(_columns) {
          const filters: [string, unknown][] = [];
          // PostgREST returns ONLY the projected columns. Projecting here the
          // same way makes an omission in EXECUTION_COLUMNS fail a test instead
          // of silently answering null in production.
          const project = (row: Record<string, unknown> | null) => {
            if (!row) return null;
            const wanted = String(_columns).split(",").map((c) => c.trim());
            return Object.fromEntries(Object.entries(row).filter(([key]) => wanted.includes(key)));
          };
          const answer = async () => {
            calls.push({ kind: "select", table, filters: [...filters] });
            if (table === "research_payment_webhook_inbox") return { data: project((options.inboxExisting ?? null) as Record<string, unknown> | null), error: null };
            return { data: project((options.existing ?? null) as Record<string, unknown> | null), error: null };
          };
          const chain = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return chain;
            },
            maybeSingle: answer,
            order() {
              return { limit: async () => { const one = await answer(); return { data: one.data ? [one.data] : [], error: null }; } };
            },
          };
          return chain as never;
        },
        async insert(row) {
          calls.push({ kind: "insert", table, row });
          const duplicate = table === "research_payment_webhook_inbox" ? options.inboxExisting : options.existing;
          return { error: duplicate ? { message: "duplicate key value violates unique constraint", code: "23505" } : null };
        },
        update(patch) {
          const filters: [string, unknown][] = [];
          const chain = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              if (filters.length === 2) {
                calls.push({ kind: "update", table, row: patch, filters: [...filters] });
                return Promise.resolve({ error: null }) as never;
              }
              return chain as never;
            },
          };
          return chain as never;
        },
      };
    },
    async rpc(fn, args) {
      calls.push({ kind: "rpc", fn, args });
      return { data: options.rpc ? options.rpc(fn, args) : null, error: null };
    },
  };
  return { client, calls };
}

describe("Supabase execution store adapter", () => {
  it.each([null, undefined, {}, [null], [undefined], [{ order_id: "wrong" }]])(
    "does not use an unavailable order projection as proof of absence (%#)", async data => {
      const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({
        limit: async () => ({ data, error: null }),
      }) }) }) }) } as unknown as CheckoutExecutionClient;
      await expect(createSupabaseCheckoutExecutionStore(() => client).findByOrder(base.orderId)).rejects.toThrow();
    });

  it("uses only an explicit empty order result as proof of absence", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({
      limit: async () => ({ data: [], error: null }),
    }) }) }) }) } as unknown as CheckoutExecutionClient;
    expect(await createSupabaseCheckoutExecutionStore(() => client).findByOrder(base.orderId)).toBeNull();
  });
  it.each(["credit_reservation_insufficient", "credit_expiry_allocation_not_qualified"] as const)(
    "classifies only the exact transactional credit refusal: %s", async message => {
      const client = { from: () => ({ insert: async () => ({ error: { code: "P0001", message } }) }) } as unknown as CheckoutExecutionClient;
      await expect(createSupabaseCheckoutExecutionStore(() => client).create(base))
        .rejects.toBeInstanceOf(CheckoutCreditReservationRefused);
    });
  it.each([
    { code: "57014", message: "credit_reservation_insufficient" },
    { code: "P0001", message: "credit_reservation_insufficient extra" },
    { code: "P0001", message: "connection outcome unknown" },
  ])("retains an unrecognized create error as uncertain", async error => {
    const client = { from: () => ({ insert: async () => ({ error }) }) } as unknown as CheckoutExecutionClient;
    const result = createSupabaseCheckoutExecutionStore(() => client).create(base);
    await expect(result).rejects.not.toBeInstanceOf(CheckoutCreditReservationRefused);
  });
  const insertedRow = (): CheckoutExecutionRow => managedRow();
  it("creates by insert and returns the record; a duplicate of the identical request replays", async () => {
    const fresh = fakeClient();
    expect(await createSupabaseCheckoutExecutionStore(() => fresh.client).create(base)).toMatchObject({ executionId: base.executionId, phase: "reserved" });
    expect(fresh.calls[0]).toMatchObject({ kind: "insert", table: "research_checkout_executions", row: { request_body_sha256: base.requestBodySha256 } });
    const replay = fakeClient({ existing: insertedRow() });
    expect(await createSupabaseCheckoutExecutionStore(() => replay.client).create(base)).toMatchObject({ executionId: base.executionId });
    const reused = fakeClient({ existing: { ...insertedRow(), request_body_sha256: "b".repeat(64) } });
    await expect(createSupabaseCheckoutExecutionStore(() => reused.client).create(base)).rejects.toMatchObject({ code: "request_key_reused" });
  });
  it("delegates every transition to the database function with the expected version, and maps zero rows to null", async () => {
    const answered = fakeClient({ rpc: (fn, args) => (fn.endsWith("claim") ? [{ ...insertedRow(), phase: args.p_phase, version: 2 }] : null) });
    const store = createSupabaseCheckoutExecutionStore(() => answered.client);
    const claimed = await store.claim(base.executionId, 1, "authorizing");
    expect(claimed).toMatchObject({ phase: "authorizing", version: 2 });
    expect(await store.recordProvider(base.executionId, 2, { kind: "unknown" })).toBeNull();
    expect(await store.commitCaptured(base.executionId, 3)).toBeNull();
    expect(await store.commitCancelled(base.executionId, 3)).toBeNull();
    expect(answered.calls.filter((c) => c.kind === "rpc").map((c) => [c.fn, c.args?.p_expected_version])).toEqual([
      ["research_checkout_execution_claim", 1],
      ["research_checkout_execution_record_provider", 2],
      ["research_checkout_execution_commit_captured", 3],
      ["research_checkout_execution_commit_cancelled", 3],
    ]);
    const recorded = answered.calls.find((c) => c.fn === "research_checkout_execution_record_provider");
    expect(recorded?.args?.p_result).toEqual({ kind: "unknown" });
  });
  it("looks executions up by member+key, provider reference and order", async () => {
    const found = fakeClient({ existing: { ...insertedRow(), provider_reference: "pi_0001", phase: "authorized" } });
    const store = createSupabaseCheckoutExecutionStore(() => found.client);
    expect(await store.getForMember(base.memberId, base.requestKey)).toMatchObject({ providerReference: "pi_0001" });
    expect(await store.findByProviderReference("pi_0001")).toMatchObject({ phase: "authorized" });
    expect(await store.findByOrder(base.orderId)).toMatchObject({ orderId: base.orderId });
    expect(found.calls.map((c) => c.filters)).toEqual([
      [["member_id", base.memberId], ["request_key", base.requestKey]],
      [["provider_reference", "pi_0001"]],
      [["order_id", base.orderId]],
    ]);
  });
});

describe("strict managed execution projections", () => {
  it.each([[null], [undefined], [managedRow(), managedRow()], [managedRow({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })]])(
    "refuses invalid, ambiguous or foreign transition rows (%#)", async (...rows) => {
      const fake = fakeClient({ rpc: () => rows as Record<string, unknown>[] });
      await expect(createSupabaseCheckoutExecutionStore(() => fake.client).claim(base.executionId, 1, "authorizing"))
        .rejects.toThrow();
    });
  type Store = ReturnType<typeof createSupabaseCheckoutExecutionStore>;
  const readBoundaries: Array<[string, (store: Store) => Promise<unknown>]> = [
    ["member lookup", store => store.getForMember(base.memberId, base.requestKey)],
    ["order lookup", store => store.findByOrder(base.orderId)],
    ["claim transition", store => store.claim(base.executionId, 1, "authorizing")],
    ["creation replay", store => store.create(base)],
  ];
  const projectedColumns = EXECUTION_COLUMNS.split(",").map(column => column.trim());

  function withRow(row: CheckoutExecutionRow) {
    const fake = fakeClient({ existing: row, rpc: () => [row as unknown as Record<string, unknown>] });
    return { ...fake, store: createSupabaseCheckoutExecutionStore(() => fake.client) };
  }

  for (const [name, read] of readBoundaries) {
    it.each(projectedColumns)(`${name} refuses a missing projected column: %s`, async column => {
      const row = managedRow();
      delete (row as unknown as Record<string, unknown>)[column];
      await expect(read(withRow(row).store)).rejects.toThrow();
    });
    it(`${name} accepts a complete row without weakening the legacy mapper`, async () => {
      expect(await read(withRow(managedRow()).store)).toMatchObject({
        executionId: base.executionId, memberId: base.memberId, orderId: base.orderId,
        amountCents: base.amountCents, updatedAt: "2026-09-09T00:00:00.123456+00:00",
      });
    });
  }

  const invalidFields: Array<[string, unknown]> = [
    ["id", "not-a-uuid"], ["id", null], ["member_id", "member-fixture"], ["order_id", "order-fixture"],
    ["request_key", "short"], ["request_key", "x".repeat(121)], ["request_key", null],
    ["request_body_sha256", "A".repeat(64)], ["request_body_sha256", "a".repeat(63)], ["request_body_sha256", null],
    ["version", 0], ["version", -1], ["version", 1.2], ["version", "1"], ["version", null],
    ["version", Number.MAX_SAFE_INTEGER + 1], ["version", NaN], ["version", Infinity],
    ["amount_cents", 0], ["amount_cents", -1], ["amount_cents", 0.5], ["amount_cents", null],
    ["amount_cents", Number.MAX_SAFE_INTEGER + 1], ["amount_cents", NaN], ["amount_cents", Infinity],
    ["amount_cents", "0"], ["amount_cents", "-1"], ["amount_cents", "+1"], ["amount_cents", "01"],
    ["amount_cents", " 1"], ["amount_cents", "1 "], ["amount_cents", "1e3"], ["amount_cents", "1.0"],
    ["amount_cents", "9007199254740992"], ["amount_cents", ""],
    ["currency", "eur"], ["currency", "USD"], ["phase", "paid"],
    ["authorization_key", "short"], ["capture_key", "short"], ["cancel_key", "short"],
    ["authorization_key", "x".repeat(201)], ["capture_key", null], ["cancel_key", 1],
    ["payment_method_reference", "card-fixture"], ["payment_method_reference", "pm_"],
    ["payment_method_reference", "pm_with space"], ["payment_method_reference", null],
    ["quote_fingerprint", ""], ["quote_fingerprint", "x".repeat(201)], ["quote_fingerprint", null],
    ["provider_reference", 1], ["provider_reference", {}], ["provider_reference", ""],
    ["price_version", 1], ["local_commit_failure", false],
    ["reservation_ids", null], ["reservation_ids", "res-1"], ["reservation_ids", [""]],
    ["reservation_ids", [null]], ["reservation_ids", [1]],
  ];
  it.each(invalidFields)("refuses invalid %s (%#) without numeric coercion or invented defaults", async (column, value) => {
    await expect(withRow(managedRow({ [column]: value })).store.getForMember(base.memberId, base.requestKey))
      .rejects.toThrow();
  });

  it.each([
    ["positive numeric bigint", 1, 1],
    ["positive decimal bigint", "33999", 33999],
    ["largest safe numeric bigint", Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    ["largest safe decimal bigint", "9007199254740991", Number.MAX_SAFE_INTEGER],
  ])("maps %s to a safe number", async (_label, amount, expected) => {
    expect(await withRow(managedRow({ amount_cents: amount })).store.getForMember(base.memberId, base.requestKey))
      .toMatchObject({ amountCents: expected });
  });
  it("accepts SQL-compatible boundary lengths, non-UUID reservations and additive RPC fields", async () => {
    const row = managedRow({
      request_key: "x".repeat(120), authorization_key: "a".repeat(8), capture_key: "c".repeat(200),
      cancel_key: "d".repeat(200), quote_fingerprint: "q".repeat(200), payment_method_reference: "pm_fixture_1",
      price_version: "", local_commit_failure: "", reservation_ids: ["res-1"],
      credit_reserved_cents: 0,
    });
    expect(await withRow(row).store.getForMember(base.memberId, row.request_key)).toMatchObject({
      requestKey: row.request_key, reservationIds: ["res-1"], localCommitFailure: "",
    });
  });
  it("accepts an empty reservation set when the canonical execution has none", async () => {
    expect(await withRow(managedRow({ reservation_ids: [] })).store.getForMember(base.memberId, base.requestKey))
      .toMatchObject({ reservationIds: [] });
  });

  const timestampColumns = ["created_at", "updated_at", "authorization_first_attempted_at", "committed_at", "settled_at"];
  const invalidTimestamps: unknown[] = [
    "2026-09-09", "2026-09-09T00:00:00", "2026-09-09T00:00:00.1234567Z", "2026-02-30T00:00:00Z",
    "2026-02-29T00:00:00Z", "2026-13-01T00:00:00Z", "2026-09-09T24:00:00Z", "2026-09-09T00:00:00+25:00",
    "2026-09-09T00:00:60Z", "not-a-date", "", 0, undefined,
  ];
  for (const column of timestampColumns) {
    it.each(invalidTimestamps)(`refuses malformed ${column} (%#)`, async value => {
      await expect(withRow(managedRow({ [column]: value })).store.getForMember(base.memberId, base.requestKey))
        .rejects.toThrow();
    });
  }
  it.each(["created_at", "updated_at"])("refuses null required timestamp %s", async column => {
    await expect(withRow(managedRow({ [column]: null })).store.getForMember(base.memberId, base.requestKey)).rejects.toThrow();
  });
  it("preserves offset timestamps and all six fractional digits without Date round-trip", async () => {
    const time = "2026-09-09T01:00:00.123456+01:00";
    expect(await withRow(managedRow({
      created_at: time, updated_at: time, authorization_first_attempted_at: time, committed_at: time, settled_at: time,
    })).store.getForMember(base.memberId, base.requestKey)).toMatchObject({
      createdAt: time, updatedAt: time, authorizationAttemptedAt: time, committedAt: time, settledAt: time,
    });
  });
  it.each([
    { member_id: "33333333-3333-4333-8333-333333333333" },
    { request_key: "another_request_key" },
  ])("binds member lookup to the exact requested principal and request (%#)", async mismatch => {
    await expect(withRow(managedRow(mismatch)).store.getForMember(base.memberId, base.requestKey)).rejects.toThrow();
  });
  it("retains legitimate missing-member semantics", async () => {
    const fake = fakeClient();
    expect(await createSupabaseCheckoutExecutionStore(() => fake.client).getForMember(base.memberId, base.requestKey)).toBeNull();
  });

  const otherMappedBoundaries: Array<[string, (store: Store) => Promise<unknown>]> = [
    ["provider lookup", store => store.findByProviderReference("provider-fixture")],
    ["record provider", store => store.recordProvider(base.executionId, 1, { kind: "unknown" })],
    ["commit captured", store => store.commitCaptured(base.executionId, 1)],
    ["commit cancelled", store => store.commitCancelled(base.executionId, 1)],
  ];
  it.each(otherMappedBoundaries)("%s applies the same managed validation", async (_name, read) => {
    const row = managedRow();
    delete (row as unknown as Record<string, unknown>).authorization_first_attempted_at;
    await expect(read(withRow(row).store)).rejects.toThrow();
  });

  const moneyProof = { providerReference: "provider-fixture", amountCents: base.amountCents, currency: "usd", memberId: base.memberId, orderId: base.orderId };
  const validProofs: unknown[] = [
    null, { kind: "authorized", ...moneyProof }, { kind: "captured", ...moneyProof },
    { kind: "action_required", providerReference: "provider-fixture" },
    { kind: "cancelled", providerReference: null, capturedAmountCents: 0 },
    ...["declined", "customer", "provider", "abandoned"].map(reason => ({ kind: "cancelled", providerReference: "provider-fixture", capturedAmountCents: 0, reason })),
    { kind: "refused", definitiveNoEffect: false }, { kind: "refused", definitiveNoEffect: true },
    { kind: "unknown" }, { kind: "unknown", providerReference: "provider-fixture" },
  ];
  it.each(validProofs)("preserves a valid provider union without assuming a provider prefix (%#)", async proof => {
    expect(await withRow(managedRow({ last_provider_result: proof })).store.getForMember(base.memberId, base.requestKey))
      .toMatchObject({ lastProviderResult: proof });
  });
  const invalidProofs: unknown[] = [
    undefined, {}, [], "captured", { kind: "unexpected" },
    { kind: "authorized", ...moneyProof, amountCents: 0 },
    { kind: "captured", ...moneyProof, amountCents: Number.MAX_SAFE_INTEGER + 1 },
    { kind: "captured", ...moneyProof, amountCents: "33999" },
    { kind: "captured", ...moneyProof, amountCents: 1.5 },
    { kind: "authorized", ...moneyProof, amountCents: NaN },
    { kind: "authorized", ...moneyProof, currency: "eur" },
    { kind: "captured", ...moneyProof, memberId: "member-fixture" },
    { kind: "captured", ...moneyProof, orderId: "order-fixture" },
    { kind: "authorized", ...moneyProof, providerReference: "" },
    { kind: "authorized", providerReference: "provider-fixture" },
    { kind: "action_required" }, { kind: "action_required", providerReference: "" },
    { kind: "action_required", providerReference: 1 },
    { kind: "cancelled", capturedAmountCents: 0 },
    { kind: "cancelled", providerReference: null, capturedAmountCents: 1 },
    { kind: "cancelled", providerReference: null, capturedAmountCents: "0" },
    { kind: "cancelled", providerReference: 1, capturedAmountCents: 0 },
    { kind: "cancelled", providerReference: null, capturedAmountCents: 0, reason: "arbitrary" },
    { kind: "refused" }, { kind: "refused", definitiveNoEffect: "false" },
    { kind: "unknown", providerReference: null }, { kind: "unknown", providerReference: "" },
  ];
  it.each(invalidProofs)("refuses malformed provider evidence (%#)", async proof => {
    await expect(withRow(managedRow({ last_provider_result: proof })).store.getForMember(base.memberId, base.requestKey))
      .rejects.toThrow();
  });
});

describe("strict managed recovery discovery", () => {
  const before = new Date("2026-09-10T00:00:00.000Z");
  const firstId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const secondId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
  const firstTime = "2026-09-09T00:00:00.123456+00:00";
  const secondTime = "2026-09-09T00:00:00.123457+00:00";
  const first = () => managedRow({ id: firstId, updated_at: firstTime });
  const second = () => managedRow({ id: secondId, updated_at: secondTime });

  function discovery(data: unknown) {
    // Deliberately permits a malformed response at the untrusted wire boundary.
    const fake = fakeClient({ rpc: () => data as Record<string, unknown>[] | null });
    const store = createSupabaseCheckoutExecutionStore(() => fake.client);
    return { ...fake, list: store.listRecoverable! };
  }
  it.each([null, undefined, {}, false, 0, "", first(), [null], [undefined]])(
    "refuses unavailable/non-array discovery; only [] means empty (%#)", async data => {
      await expect(discovery(data).list({ before, limit: 2 })).rejects.toThrow();
    },
  );
  it("accepts an explicit empty successful page", async () => {
    expect(await discovery([]).list({ before, limit: 2 })).toEqual([]);
  });
  it("preserves exact RPC vocabulary, microsecond cursor and returned timestamps", async () => {
    const after = { updatedAt: firstTime, executionId: firstId };
    const fake = discovery([second()]);
    expect(await fake.list({ before, limit: 2, after })).toMatchObject([
      { executionId: secondId, updatedAt: secondTime },
    ]);
    expect(fake.calls).toEqual([{ kind: "rpc", fn: "research_checkout_executions_list_recoverable", args: {
      p_before: "2026-09-10T00:00:00.000Z", p_limit: 2,
      p_after_updated_at: firstTime, p_after_id: firstId,
    } }]);
  });
  it.each([[0, 1], [-2, 1], [201, 200], [Number.MAX_SAFE_INTEGER, 200]])(
    "preserves finite integer limit clamp %s -> %s", async (limit, expected) => {
      const fake = discovery([]);
      await fake.list({ before, limit });
      expect(fake.calls[0].args?.p_limit).toBe(expected);
    },
  );
  it.each([NaN, Infinity, -Infinity, 1.5, "2", null, undefined])(
    "refuses malformed numeric limit before the RPC (%#)", async limit => {
      const fake = discovery([]);
      await expect(fake.list({ before, limit: limit as number })).rejects.toThrow();
      expect(fake.calls).toHaveLength(0);
    },
  );
  it.each([new Date(NaN), "2026-09-10T00:00:00Z", null, undefined])(
    "refuses invalid horizon before the RPC (%#)", async horizon => {
      const fake = discovery([]);
      await expect(fake.list({ before: horizon as Date, limit: 2 })).rejects.toThrow();
      expect(fake.calls).toHaveLength(0);
    },
  );
  const badCursors: unknown[] = [
    {}, { updatedAt: firstTime }, { executionId: firstId },
    { updatedAt: "not-a-date", executionId: firstId },
    { updatedAt: "2026-09-09T00:00:00", executionId: firstId },
    { updatedAt: "2026-09-09T00:00:00.1234567Z", executionId: firstId },
    { updatedAt: firstTime, executionId: "bad-id" },
    { updatedAt: firstTime, executionId: "" },
    { updatedAt: before.toISOString(), executionId: firstId },
    { updatedAt: "2026-09-11T00:00:00Z", executionId: firstId },
    "cursor", [], false,
  ];
  it.each(badCursors)("refuses malformed/out-of-horizon cursor before RPC (%#)", async after => {
    const fake = discovery([]);
    await expect(fake.list({ before, limit: 2, after: after as { updatedAt: string; executionId: string } })).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });
  it.each([
    { phase: "unknown" }, { currency: "eur" }, { amount_cents: NaN }, { id: "invalid" },
    { updated_at: null }, { authorization_first_attempted_at: undefined },
    { last_provider_result: { kind: "captured" } },
  ])("rejects the entire mixed page instead of dropping malformed row (%#)", async invalid => {
    await expect(discovery([first(), managedRow({ id: secondId, updated_at: secondTime, ...invalid })])
      .list({ before, limit: 2 })).rejects.toThrow();
  });
  it.each([
    { phase: "committed", committed_at: firstTime },
    { phase: "cancelled", settled_at: firstTime },
  ])("refuses terminal discovery rows (%#)", async terminal => {
    await expect(discovery([managedRow(terminal)]).list({ before, limit: 2 })).rejects.toThrow();
  });
  it("keeps an unsettled cancellation discoverable", async () => {
    expect(await discovery([managedRow({ phase: "cancelled", settled_at: null })]).list({ before, limit: 2 }))
      .toMatchObject([{ phase: "cancelled", settledAt: null }]);
  });
  it.each([
    [second(), first()],
    [first(), first()],
    [first(), managedRow({ id: firstId, updated_at: secondTime })],
    [managedRow({ id: secondId, updated_at: firstTime }), first()],
    [managedRow({ updated_at: before.toISOString() })],
    [managedRow({ updated_at: "2026-09-11T00:00:00Z" })],
  ])("refuses unordered, duplicate or beyond-horizon page (%#)", async (...rows) => {
    await expect(discovery(rows).list({ before, limit: 2 })).rejects.toThrow();
  });
  it("refuses more returned rows than the requested bounded page", async () => {
    await expect(discovery([first(), second()]).list({ before, limit: 1 })).rejects.toThrow();
  });
  it("refuses a row equal to or earlier than the exact cursor", async () => {
    for (const updatedAt of [firstTime, secondTime]) {
      await expect(discovery([first()]).list({ before, limit: 2, after: { updatedAt, executionId: firstId } }))
        .rejects.toThrow();
    }
  });
  it("orders by real microseconds and UUID rather than raw timestamp spelling", async () => {
    const earlier = "2026-09-09T01:00:00.123456+01:00";
    const later = "2026-09-09T00:00:00.123457Z";
    expect(await discovery([
      managedRow({ id: firstId, updated_at: earlier }),
      managedRow({ id: secondId, updated_at: later }),
    ]).list({ before, limit: 2 })).toMatchObject([{ updatedAt: earlier }, { updatedAt: later }]);
    // Equal instants use the UUID tie-breaker, even with different offset text.
    expect(await discovery([managedRow({ id: secondId, updated_at: earlier })]).list({
      before, limit: 2, after: { updatedAt: firstTime, executionId: firstId },
    })).toMatchObject([{ executionId: secondId, updatedAt: earlier }]);
    await expect(discovery([managedRow({ id: firstId, updated_at: earlier })]).list({
      before, limit: 2, after: { updatedAt: firstTime, executionId: secondId },
    })).rejects.toThrow();
  });
  it("propagates RPC errors instead of reporting an empty exhausted page", async () => {
    const fake = discovery([]);
    fake.client.rpc = async () => ({ data: [], error: { message: "fixture read unavailable" } });
    await expect(fake.list({ before, limit: 2 })).rejects.toThrow();
  });
});

describe("Supabase webhook inbox adapter", () => {
  const event = { providerName: "stripe", eventId: "evt_1", eventType: "payment.authorized", payloadSha256: "a".repeat(64), receivedAt: new Date("2026-09-09T12:00:00Z") };
  it("claims by primary-key insert in processing state, then completes or isolates by terminal update", async () => {
    const fresh = fakeClient();
    const inbox = createSupabaseWebhookExecutionInbox(() => fresh.client);
    expect(await inbox.claim(event)).toEqual({ state: "new" });
    expect(fresh.calls[0]).toMatchObject({ kind: "insert", table: "research_payment_webhook_inbox", row: { state: "processing", payload_sha256: event.payloadSha256 } });
    await inbox.complete("stripe", "evt_1", "applied", base.executionId);
    await inbox.isolate("stripe", "evt_2", "amount_mismatch", null);
    expect(fresh.calls.filter((c) => c.kind === "update").map((c) => [c.row?.state, c.row?.outcome, c.row?.reason ?? null])).toEqual([
      ["processed", "applied", null],
      ["isolated", "isolated", "amount_mismatch"],
    ]);
  });
  it("reports an existing claim as processing, processed or conflict by the signed-bytes digest", async () => {
    const processing = fakeClient({ inboxExisting: { payload_sha256: event.payloadSha256, state: "processing", outcome: null } });
    expect(await createSupabaseWebhookExecutionInbox(() => processing.client).claim(event)).toEqual({ state: "processing" });
    const processed = fakeClient({ inboxExisting: { payload_sha256: event.payloadSha256, state: "processed", outcome: "applied" } });
    expect(await createSupabaseWebhookExecutionInbox(() => processed.client).claim(event)).toEqual({ state: "processed", outcome: "applied" });
    const conflict = fakeClient({ inboxExisting: { payload_sha256: "b".repeat(64), state: "processed", outcome: "applied" } });
    expect(await createSupabaseWebhookExecutionInbox(() => conflict.client).claim(event)).toEqual({ state: "conflict" });
  });
});
