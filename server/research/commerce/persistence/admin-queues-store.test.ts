import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACKNOWLEDGEABLE_KINDS,
  COMMERCE_QUEUE_KINDS,
  createInMemoryAdminQueuesStore,
  createSupabaseAdminQueuesStore,
  deriveFraudReview,
  deriveFulfillmentFailure,
  deriveInventoryRelease,
  deriveLargeOrderReview,
  derivePayoutReview,
  deriveRecallResponse,
  deriveRefundReview,
  deriveReplacementReview,
  deriveSupplierDocumentReview,
  QueueItemAlreadyResolved,
  QueueItemInvalid,
  QueueItemNotFound,
  QueueKindNotAcknowledgeable,
  type AdminQueueItemRecord,
  type ClaimSourceRow,
  type FulfillmentSourceRow,
  type LotQualityDocRow,
  type LotSourceRow,
  type OrderReviewSourceRow,
} from "./admin-queues-store";

const T0 = "2026-07-01T00:00:00.000Z";
const NOW = new Date("2026-07-22T00:00:00.000Z");

let seq = 0;
function item(overrides: Partial<AdminQueueItemRecord> = {}): AdminQueueItemRecord {
  return {
    id: `qi_${++seq}`,
    kind: "payment_review",
    sourceRef: `payment:ref_${seq}`,
    summary: "Provider event needs human eyes.",
    status: "open",
    openedAt: T0,
    openedByActorType: "system",
    openedByActorId: null,
    resolvedAt: null,
    resolvedByActorId: null,
    resolution: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The queue kinds themselves
// ---------------------------------------------------------------------------

describe("queue kinds", () => {
  it("covers exactly the ten commerce queue kinds", () => {
    expect([...COMMERCE_QUEUE_KINDS].sort()).toEqual(
      [
        "large_order_review",
        "payment_review",
        "refund_review",
        "replacement_review",
        "supplier_document_review",
        "inventory_release",
        "fulfillment_failure",
        "payout_review",
        "fraud_review",
        "recall_response",
      ].sort(),
    );
  });

  it("allows acknowledgement only where no domain table can close the item", () => {
    expect(ACKNOWLEDGEABLE_KINDS).toEqual(["recall_response"]);
  });
});

// ---------------------------------------------------------------------------
// The persisted queue-item store
// ---------------------------------------------------------------------------

describe("in-memory queue items", () => {
  it("enqueues and lists open items by kind, oldest first", async () => {
    const store = createInMemoryAdminQueuesStore();
    await store.enqueue(item({ id: "b", openedAt: "2026-07-02T00:00:00.000Z" }));
    await store.enqueue(item({ id: "a", openedAt: "2026-07-01T00:00:00.000Z" }));
    await store.enqueue(item({ id: "other", kind: "fraud_review", sourceRef: "store_credit:x" }));

    const open = await store.listByKind("payment_review");
    expect(open.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("refuses an item enqueued as anything but a clean open row", async () => {
    const store = createInMemoryAdminQueuesStore();
    await expect(store.enqueue(item({ status: "resolved" }))).rejects.toThrow(QueueItemInvalid);
    await expect(store.enqueue(item({ resolution: "done" }))).rejects.toThrow(QueueItemInvalid);
    await expect(store.enqueue(item({ kind: "made_up" as never }))).rejects.toThrow(QueueItemInvalid);
  });

  it("resolves with actor and timestamp, keeps the row, and refuses a second resolution", async () => {
    const store = createInMemoryAdminQueuesStore();
    await store.enqueue(item({ id: "x" }));

    const resolved = await store.resolve("x", {
      status: "resolved",
      resolution: "verified with the provider",
      actorId: "samuel",
      at: NOW,
    });
    expect(resolved).toMatchObject({
      id: "x",
      status: "resolved",
      resolvedAt: NOW.toISOString(),
      resolvedByActorId: "samuel",
      resolution: "verified with the provider",
    });

    // History preserved: the row is still there, just no longer open.
    expect(await store.listByKind("payment_review")).toEqual([]);
    expect((await store.listByKind("payment_review", true)).map((i) => i.id)).toEqual(["x"]);

    await expect(
      store.resolve("x", { status: "dismissed", resolution: "again", actorId: "samuel", at: NOW }),
    ).rejects.toThrow(QueueItemAlreadyResolved);
    await expect(
      store.resolve("missing", { status: "resolved", resolution: "?", actorId: "samuel", at: NOW }),
    ).rejects.toThrow(QueueItemNotFound);
  });

  it("has no delete method: nothing in the port can remove history", () => {
    const store = createInMemoryAdminQueuesStore();
    for (const name of Object.keys(store)) {
      expect(name).not.toMatch(/delete|remove|purge|clear/i);
    }
  });

  it("acknowledges a derived recall as a NEW resolved row, and refuses every other kind", async () => {
    const store = createInMemoryAdminQueuesStore();
    const ack = await store.acknowledgeDerived("recall_response", "lot:l1", {
      id: "ack_1",
      summary: "All affected members notified.",
      status: "resolved",
      resolution: "notified 3 members, shipments traced",
      actorId: "samuel",
      at: NOW,
    });
    expect(ack).toMatchObject({ kind: "recall_response", sourceRef: "lot:l1", status: "resolved" });
    expect((await store.listByKind("recall_response", true)).map((i) => i.id)).toEqual(["ack_1"]);

    // A review queue cannot be acknowledged away; the owning domain resolves it.
    for (const kind of COMMERCE_QUEUE_KINDS.filter((k) => k !== "recall_response")) {
      await expect(
        store.acknowledgeDerived(kind, "order:o1", {
          id: `nope_${kind}`,
          summary: "s",
          status: "resolved",
          resolution: "r",
          actorId: "samuel",
          at: NOW,
        }),
      ).rejects.toThrow(QueueKindNotAcknowledgeable);
    }
  });

  it("serves all ten queues in the commerce view, with queued open items only", async () => {
    const store = createInMemoryAdminQueuesStore();
    await store.enqueue(item({ id: "open_1" }));
    await store.enqueue(item({ id: "done_1" }));
    await store.resolve("done_1", { status: "resolved", resolution: "ok", actorId: "samuel", at: NOW });

    const view = await store.commerce();
    expect(view.provisioned).toBe(true);
    expect(view.queues.map((q) => q.kind)).toEqual([...COMMERCE_QUEUE_KINDS]);
    const payments = view.queues.find((q) => q.kind === "payment_review")!;
    expect(payments.openCount).toBe(1);
    expect(payments.items[0]).toMatchObject({ source: "queued", detail: { itemId: "open_1" } });
  });
});

// ---------------------------------------------------------------------------
// Pure derivations
// ---------------------------------------------------------------------------

describe("deriveLargeOrderReview", () => {
  it("picks manual_review orders and reports the GROSS value before store credit", () => {
    const rows: OrderReviewSourceRow[] = [
      {
        id: "o1",
        state: "manual_review",
        subtotal_cents: 48000,
        shipping_cents: 2500,
        store_credit_applied_cents: 3000,
        review_triggers: ["value_threshold"],
        created_at: T0,
      },
      {
        id: "o2",
        state: "approved",
        subtotal_cents: 100,
        shipping_cents: 0,
        store_credit_applied_cents: 0,
        review_triggers: [],
        created_at: T0,
      },
    ];
    const items = deriveLargeOrderReview(rows);
    expect(items).toHaveLength(1);
    // Gross value, not the credit-reduced total: credit cannot shrink review.
    expect(items[0].detail).toMatchObject({ orderId: "o1", grossValueCents: 50500, storeCreditAppliedCents: 3000 });
  });
});

describe("claim-based queues", () => {
  const claims: ClaimSourceRow[] = [
    { id: "c1", order_id: "o1", sku: "P1", reason: "damaged", state: "approved", resolution: "refund", submitted_at: T0 },
    { id: "c2", order_id: "o2", sku: "P2", reason: "lost", state: "under_review", resolution: "partial_refund", submitted_at: T0 },
    { id: "c3", order_id: "o3", sku: "P3", reason: "incorrect", state: "approved", resolution: "replacement", submitted_at: T0 },
    { id: "c4", order_id: "o4", sku: "P4", reason: "missing", state: "resolved", resolution: "refund", submitted_at: T0 },
    { id: "c5", order_id: "o5", sku: "P5", reason: "damaged", state: "submitted", resolution: null, submitted_at: T0 },
  ];

  it("splits refund-shaped from replacement-shaped open claims and leaves triage alone", () => {
    expect(deriveRefundReview(claims).map((i) => i.sourceRef)).toEqual(["claim:c1", "claim:c2"]);
    expect(deriveReplacementReview(claims).map((i) => i.sourceRef)).toEqual(["claim:c3"]);
    // c4 is closed and c5 is undispositioned triage; neither is guessed into a queue.
  });
});

describe("lot-based queues", () => {
  const completeDoc = (lotId: string): LotQualityDocRow => ({
    lot_id: lotId,
    coa_on_file: true,
    identity_confirmed: true,
    purity_confirmed: true,
    sterility_confirmed: null,
    endotoxin_confirmed: null,
  });
  const lots: LotSourceRow[] = [
    { id: "l1", lot_id: "LOT-1", sku: "P1", disposition: "quarantined", excursion: "none", recalled: false, recalled_at: null, created_at: T0 },
    { id: "l2", lot_id: "LOT-2", sku: "P2", disposition: "quarantined", excursion: "none", recalled: false, recalled_at: null, created_at: T0 },
    { id: "l3", lot_id: "LOT-3", sku: "P3", disposition: "quality_hold", excursion: "pending_review", recalled: false, recalled_at: null, created_at: T0 },
    { id: "l4", lot_id: "LOT-4", sku: "P4", disposition: "available", excursion: "none", recalled: false, recalled_at: null, created_at: T0 },
    { id: "l5", lot_id: "LOT-5", sku: "P5", disposition: "recalled", excursion: "none", recalled: true, recalled_at: "2026-07-15T00:00:00.000Z", created_at: T0 },
  ];

  it("splits document review (docs incomplete) from release (docs complete, awaiting decision)", () => {
    const docs = [
      completeDoc("l1"),
      { ...completeDoc("l2"), purity_confirmed: false },
      completeDoc("l3"),
    ];
    // l2 lacks purity, l3 has no doc issue but its excursion blocks release,
    // l4 is already released, l5 is recalled.
    expect(deriveSupplierDocumentReview(lots, docs).map((i) => i.sourceRef)).toEqual(["lot:l2", "lot:l4"]);
    expect(deriveInventoryRelease(lots, docs).map((i) => i.sourceRef)).toEqual(["lot:l1"]);
  });

  it("treats a missing quality-document row as unconfirmed, never as fine", () => {
    const items = deriveSupplierDocumentReview([lots[0]], []);
    expect(items).toHaveLength(1);
    expect(items[0].detail.missing).toEqual(["no_quality_document_row"]);
  });

  it("derives recall response from recalled lots", () => {
    const items = deriveRecallResponse(lots);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sourceRef: "lot:l5", openedAt: "2026-07-15T00:00:00.000Z" });
  });
});

describe("deriveFulfillmentFailure", () => {
  it("picks failed states and carries no recipient identity anywhere in the item", () => {
    const rows: FulfillmentSourceRow[] = [
      { id: "f1", order_id: "o1", owner: "mitch", state: "exception", hold_reason: null, created_at: T0 },
      { id: "f2", order_id: "o2", owner: "xenios", state: "on_hold", hold_reason: "cold chain gap", created_at: T0 },
      { id: "f3", order_id: "o3", owner: "mitch", state: "shipped", hold_reason: null, created_at: T0 },
    ];
    const items = deriveFulfillmentFailure(rows);
    expect(items.map((i) => i.sourceRef)).toEqual(["fulfillment:f1", "fulfillment:f2"]);
    // The fixed allowlist: nothing name-, address-, or phone-shaped can appear.
    for (const it of items) {
      const serialized = JSON.stringify(it);
      expect(serialized).not.toMatch(/recipient|address|phone/i);
      expect(Object.keys(it.detail).sort()).toEqual(
        ["fulfillmentOrderId", "holdReason", "orderId", "owner", "state"].sort(),
      );
    }
  });
});

describe("derivePayoutReview and deriveFraudReview", () => {
  it("queues built and failed payout batches", () => {
    const items = derivePayoutReview([
      { id: "b1", partner_id: "p1", total_cents: 5000, state: "built", excluded_reasons: ["held entry"], built_at: T0 },
      { id: "b2", partner_id: "p1", total_cents: 100, state: "settled", excluded_reasons: [], built_at: T0 },
      { id: "b3", partner_id: "p2", total_cents: 900, state: "failed", excluded_reasons: null, built_at: T0 },
    ]);
    expect(items.map((i) => i.sourceRef)).toEqual(["payout_batch:b1", "payout_batch:b3"]);
    expect(items[0].detail).toMatchObject({ totalCents: 5000, excludedCount: 1 });
  });

  it("queues fraud_flagged store credit only", () => {
    const items = deriveFraudReview([
      { id: "sc1", member_id: "m1", amount_cents: 1500, state: "fraud_flagged", reason: "referral_referrer", created_at: T0 },
      { id: "sc2", member_id: "m1", amount_cents: 1000, state: "approved", reason: "referral_referrer", created_at: T0 },
    ]);
    expect(items.map((i) => i.sourceRef)).toEqual(["store_credit:sc1"]);
  });
});

// ---------------------------------------------------------------------------
// Supabase-backed store against a fake client (no network)
// ---------------------------------------------------------------------------

/**
 * A minimal fake of the supabase-js fluent client backed by named tables of
 * plain rows. It supports the exact calls the store makes: select with eq/in
 * filters, insert, and the guarded update chain used by resolve. Any table
 * absent from the map errors like a missing relation, which is how the
 * defensive reads are proven.
 */
function fakeSupabase(tables: Record<string, Array<Record<string, unknown>>>): SupabaseClient {
  function builder(table: string) {
    const filters: Array<{ col: string; val: unknown; op: "eq" | "in" }> = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: Record<string, unknown> | null = null;
    const api: Record<string, unknown> = {};
    const rows = () => tables[table];
    const matches = () =>
      (rows() ?? []).filter((r) =>
        filters.every((f) => (f.op === "eq" ? r[f.col] === f.val : (f.val as unknown[]).includes(r[f.col]))),
      );
    const result = (): { data: unknown; error: { message: string } | null } => {
      if (!rows()) return { data: null, error: { message: `relation ${table} does not exist` } };
      if (op === "insert") {
        rows().push({ ...(payload as Record<string, unknown>) });
        return { data: null, error: null };
      }
      if (op === "update") {
        const hit = matches();
        for (const r of hit) Object.assign(r, payload);
        return { data: hit, error: null };
      }
      return { data: matches(), error: null };
    };
    Object.assign(api, {
      select() { return api; },
      eq(col: string, val: unknown) { filters.push({ col, val, op: "eq" }); return api; },
      in(col: string, val: unknown[]) { filters.push({ col, val, op: "in" }); return api; },
      order() { return api; },
      insert(p: Record<string, unknown>) { op = "insert"; payload = p; return api; },
      update(p: Record<string, unknown>) { op = "update"; payload = p; return api; },
      maybeSingle() {
        const r = result();
        const data = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
        return Promise.resolve({ data, error: r.error });
      },
      then(onF: (v: { data: unknown; error: { message: string } | null }) => unknown) {
        return Promise.resolve(result()).then(onF);
      },
    });
    return api;
  }
  return { from: (table: string) => builder(table) } as unknown as SupabaseClient;
}

describe("createSupabaseAdminQueuesStore (fake client)", () => {
  it("reads a missing table as an empty queue instead of failing the whole view", async () => {
    // Only the queue-items table exists; every domain table is another wave's.
    const store = createSupabaseAdminQueuesStore(fakeSupabase({ research_admin_queue_items: [] }));
    const view = await store.commerce();
    expect(view.queues).toHaveLength(10);
    expect(view.queues.every((q) => q.openCount === 0)).toBe(true);
  });

  it("fails an enqueue loudly when the queue table is missing (admin work must not vanish)", async () => {
    const store = createSupabaseAdminQueuesStore(fakeSupabase({}));
    await expect(store.enqueue(item({ id: "loud" }))).rejects.toThrow(/does not exist/);
  });

  it("merges derived and queued items into the ten-queue commerce view", async () => {
    const client = fakeSupabase({
      research_admin_queue_items: [],
      research_orders: [
        {
          id: "o1",
          state: "manual_review",
          subtotal_cents: 48000,
          shipping_cents: 2500,
          store_credit_applied_cents: 0,
          review_triggers: ["value_threshold"],
          created_at: T0,
        },
      ],
      research_store_credit_ledger: [
        { id: "sc1", member_id: "m1", amount_cents: 1500, state: "fraud_flagged", reason: "referral_referrer", created_at: T0 },
      ],
    });
    const store = createSupabaseAdminQueuesStore(client);
    await store.enqueue(item({ id: "pay_1", openedAt: T0 }));

    const view = await store.commerce();
    const byKind = new Map(view.queues.map((q) => [q.kind, q]));
    expect(byKind.get("large_order_review")!.items[0]).toMatchObject({
      source: "derived",
      sourceRef: "order:o1",
      detail: { grossValueCents: 50500 },
    });
    expect(byKind.get("fraud_review")!.openCount).toBe(1);
    expect(byKind.get("payment_review")!.items[0]).toMatchObject({
      source: "queued",
      detail: { itemId: "pay_1" },
    });
  });

  it("resolves with a status-open guard so a settled item cannot resolve twice", async () => {
    const tables = { research_admin_queue_items: [] as Array<Record<string, unknown>> };
    const store = createSupabaseAdminQueuesStore(fakeSupabase(tables));
    await store.enqueue(item({ id: "r1" }));

    const resolved = await store.resolve("r1", {
      status: "resolved",
      resolution: "checked",
      actorId: "samuel",
      at: NOW,
    });
    expect(resolved).toMatchObject({ id: "r1", status: "resolved", resolvedByActorId: "samuel" });
    expect(tables.research_admin_queue_items).toHaveLength(1); // transitioned, never deleted

    await expect(
      store.resolve("r1", { status: "dismissed", resolution: "again", actorId: "samuel", at: NOW }),
    ).rejects.toThrow(QueueItemAlreadyResolved);
    await expect(
      store.resolve("ghost", { status: "resolved", resolution: "?", actorId: "samuel", at: NOW }),
    ).rejects.toThrow(QueueItemNotFound);
  });

  it("drops an acknowledged recall from the open view while keeping the resolution row", async () => {
    const tables = {
      research_admin_queue_items: [] as Array<Record<string, unknown>>,
      research_inventory_lots: [
        { id: "l5", lot_id: "LOT-5", sku: "P5", disposition: "recalled", excursion: "none", recalled: true, recalled_at: T0, created_at: T0 },
      ],
    };
    const store = createSupabaseAdminQueuesStore(fakeSupabase(tables));

    let view = await store.commerce();
    expect(view.queues.find((q) => q.kind === "recall_response")!.openCount).toBe(1);

    await store.acknowledgeDerived("recall_response", "lot:l5", {
      id: "ack_l5",
      summary: "Response complete.",
      status: "resolved",
      resolution: "members notified",
      actorId: "samuel",
      at: NOW,
    });

    view = await store.commerce();
    expect(view.queues.find((q) => q.kind === "recall_response")!.openCount).toBe(0);
    // The evidence row is permanent history.
    expect((await store.listByKind("recall_response", true)).map((i) => i.id)).toEqual(["ack_l5"]);

    // And a derived REVIEW queue can never be acknowledged away.
    await expect(
      store.acknowledgeDerived("large_order_review", "order:o1", {
        id: "nope",
        summary: "s",
        status: "resolved",
        resolution: "r",
        actorId: "samuel",
        at: NOW,
      }),
    ).rejects.toThrow(QueueKindNotAcknowledgeable);
  });
});
