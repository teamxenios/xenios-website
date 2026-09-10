import { describe, expect, it } from "vitest";
import type { CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import { createDurableCheckoutExecutor, type IdempotentCheckoutPaymentPort } from "../durable-checkout-executor";
import { createProviderVerifiedPaymentPort } from "../durable-payment-port";
import { stripeModel } from "../stripe-model.test-helper";
import { createInMemoryWebhookExecutionInbox, createWebhookExecutionProcessor } from "../webhook-execution-processor";
import {
  CheckoutExecutionConflict,
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
  const insertedRow = (): CheckoutExecutionRow => ({ ...executionToInsertRow(base), last_provider_result: null });
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
