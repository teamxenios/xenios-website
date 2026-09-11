// Queue mode over the SAME reader as the preview. Every address is .invalid and
// the queue is a local array; nothing here can reach a person.
import { describe, expect, it, vi } from "vitest";
import * as engine from "./receipt-repair";
import {
  createReceiptQueue,
  RECEIPT_IDENTITY_POLICY,
  RECEIPT_PREVIEW_ORIGIN,
  type ReceiptPreviewReadClient,
  type ReceiptPreviewReadQuery,
  type ReceiptQueueApproval,
} from "./receipt-repair-production";

const M1 = "00000000-0000-4000-8000-000000000001";
const O1 = "00000000-0000-4000-8000-000000000002";
const E1 = "00000000-0000-4000-8000-000000000003";
const M2 = "00000000-0000-4000-8000-000000000004";
const O2 = "00000000-0000-4000-8000-000000000005";
const E2 = "00000000-0000-4000-8000-000000000006";
const NOW = new Date("2026-09-11T12:00:00Z");
const exec = (id: string, member: string, order: string, at: string) => ({
  id, member_id: member, order_id: order, phase: "committed", amount_cents: 600, currency: "usd",
  provider_reference: `pi_local_${order.slice(-4)}`, committed_at: at,
});
const ord = (id: string, member: string) => ({ id, member_id: member, state: "payment_captured",
  payment_reference: `pi_local_${id.slice(-4)}`, captured_amount_cents: 600, refunded_cents: 0 });

type Row = Record<string, unknown>;
/**
 * SELECT vocabulary only, applying equality filters, the keyset cursor and the
 * limit the way PostgREST would, so pagination and read-back are real.
 */
function database(seed: { executions: Row[]; orders: Row[]; members: Row[]; outbox?: Row[] }) {
  const tables: Record<string, Row[]> = {
    research_checkout_executions: seed.executions, research_orders: seed.orders,
    research_members: seed.members, research_notification_outbox: seed.outbox ?? [],
  };
  const filters: string[] = [];
  const client: ReceiptPreviewReadClient = {
    from(table) {
      return { select() {
        const equals: Array<[string, string]> = [];
        let cursor: { at: string; id: string } | null = null;
        let limit = Infinity;
        const query: ReceiptPreviewReadQuery = {
          eq(column, value) { equals.push([column, value]); return query; },
          or(filter) {
            filters.push(filter);
            const m = /^committed_at\.gt\.([^,]+),and\(committed_at\.eq\.[^,]+,id\.gt\.([0-9a-f-]+)\)$/.exec(filter);
            if (m) cursor = { at: m[1]!, id: m[2]! };
            return query;
          },
          order() { return query; },
          limit(value) { limit = value; return query; },
          then(onfulfilled, onrejected) {
            let rows = tables[table]!.filter(row => equals.every(([c, v]) => row[c] === v));
            if (table === "research_checkout_executions") {
              rows = [...rows].sort((a, b) => String(a.committed_at).localeCompare(String(b.committed_at)) || String(a.id).localeCompare(String(b.id)));
              const c = cursor as { at: string; id: string } | null;
              if (c) rows = rows.filter(r => String(r.committed_at) > c.at || (r.committed_at === c.at && String(r.id) > c.id));
            }
            return Promise.resolve({ data: rows.slice(0, limit).map(r => ({ ...r })), error: null }).then(onfulfilled, onrejected);
          },
        };
        return query;
      } };
    },
  };
  return { client, tables, filters };
}

const approval = (overrides: Partial<ReceiptQueueApproval> = {}): ReceiptQueueApproval => ({
  approvalSha256: "a".repeat(64),
  eligibleAfter: new Date("2026-09-10T00:00:00Z"),
  expiresAt: new Date("2026-09-12T00:00:00Z"),
  audience: "all_committed_after_cutoff",
  identityPolicy: { ...RECEIPT_IDENTITY_POLICY },
  ...overrides,
});

function harness(options: { db?: ReturnType<typeof database>; approval?: ReceiptQueueApproval | null; enabled?: boolean;
  enqueue?: (input: engine.ReceiptEnqueueInput) => Promise<engine.ReceiptEnqueueOutcome>; now?: () => Date } = {}) {
  const db = options.db ?? database({
    executions: [exec(E1, M1, O1, "2026-09-10T10:00:00.123456+00:00")],
    orders: [ord(O1, M1)], members: [{ id: M1, email: "one@receipt.fixture.invalid" }],
  });
  const enqueued: engine.ReceiptEnqueueInput[] = [];
  // The canonical enqueue writes a row the reader can then read back.
  const canonical = vi.fn(options.enqueue ?? (async (input: engine.ReceiptEnqueueInput) => {
    if (db.tables.research_notification_outbox!.some(r => r.event_key === input.eventKey)) return "already_queued" as const;
    enqueued.push(input);
    db.tables.research_notification_outbox!.push({ event_key: input.eventKey, event_type: input.eventType,
      template_key: input.templateKey, recipient: input.recipient, payload: { ...input.payload } });
    return "inserted" as const;
  }));
  const queue = createReceiptQueue({
    enabled: options.enabled ?? true, client: db.client, siteOrigin: RECEIPT_PREVIEW_ORIGIN,
    approval: options.approval === undefined ? approval() : options.approval,
    enqueue: canonical, now: options.now ?? (() => NOW),
  });
  return { queue, db, canonical, enqueued };
}

describe("off unless everything is approved", () => {
  it("is disabled by default and reads nothing", async () => {
    const db = database({ executions: [], orders: [], members: [] });
    const spy = vi.spyOn(db.client, "from");
    const queue = createReceiptQueue({ client: db.client, siteOrigin: RECEIPT_PREVIEW_ORIGIN, approval: approval(),
      enqueue: vi.fn(), now: () => NOW });
    expect(await queue.run()).toEqual({ mode: "queue", status: "disabled" });
    expect(spy).not.toHaveBeenCalled();
  });

  const refusals: Array<[string, Parameters<typeof harness>[0], string]> = [
    ["there is no approval", { approval: null }, "approval_missing"],
    ["the approval digest is not a digest", { approval: approval({ approvalSha256: "approved" }) }, "approval_invalid"],
    ["the approval has expired", { approval: approval({ expiresAt: new Date("2026-09-11T11:00:00Z") }) }, "approval_expired"],
    ["the identity policy was never reviewed", { approval: approval({ identityPolicy: { version: "commerce-receipt-identity-v1", priorAliases: "unchecked" } as never }) }, "identity_policy_unreviewed"],
    ["the identity policy is a different version", { approval: approval({ identityPolicy: { version: "v0", priorAliases: "reviewed_none" } as never }) }, "identity_policy_unreviewed"],
    ["the audience is empty", { approval: approval({ audience: { memberIds: [] } }) }, "audience_invalid"],
    ["the audience names something that is not a member id", { approval: approval({ audience: { memberIds: ["everyone"] } }) }, "audience_invalid"],
  ];
  for (const [name, options, code] of refusals) {
    it(`refuses when ${name}, before any read or write`, async () => {
      const h = harness(options);
      const spy = vi.spyOn(h.db.client, "from");
      expect(await h.queue.run()).toEqual({ mode: "queue", status: "unavailable", code });
      expect(spy).not.toHaveBeenCalled();
      expect(h.canonical).not.toHaveBeenCalled();
    });
  }
});

describe("what it queues", () => {
  it("queues one receipt through the canonical enqueue and verifies the stored row", async () => {
    const h = harness();
    const report = await h.queue.run();
    expect(report).toMatchObject({ status: "ran", considered: 1, queued: 1, refused: 0 });
    expect(h.enqueued).toHaveLength(1);
    expect(h.enqueued[0]).toMatchObject({ eventKey: engine.receiptEventKey(O1), eventType: engine.RECEIPT_EVENT_TYPE,
      templateKey: engine.RECEIPT_TEMPLATE_KEY, recipient: "one@receipt.fixture.invalid" });
  });

  it("says payment received and never says shipped", async () => {
    const h = harness();
    await h.queue.run();
    const rendered = engine.renderCommerceReceiptOutboxEmail(engine.RECEIPT_TEMPLATE_KEY, h.enqueued[0]!.payload)!;
    expect(rendered.subject).toContain("Payment received");
    expect(rendered.text).toContain("not a shipping confirmation");
    for (const word of ["shipped", "dispatched", "delivered", "on its way"]) expect(rendered.text.toLowerCase()).not.toContain(word);
  });

  it("suppresses a duplicate: a second run finds the verified row and writes nothing", async () => {
    const h = harness();
    await h.queue.run();
    const second = await h.queue.run();
    expect(second).toMatchObject({ queued: 0, alreadyPresent: 1 });
    expect(h.canonical).toHaveBeenCalledTimes(1);
  });

  it("refuses a pre-existing row under the key that does not match, and does not overwrite it", async () => {
    const db = database({
      executions: [exec(E1, M1, O1, "2026-09-10T10:00:00.123456+00:00")], orders: [ord(O1, M1)],
      members: [{ id: M1, email: "one@receipt.fixture.invalid" }],
      outbox: [{ event_key: engine.receiptEventKey(O1), event_type: engine.RECEIPT_EVENT_TYPE, template_key: engine.RECEIPT_TEMPLATE_KEY,
        recipient: "someone.else@receipt.fixture.invalid",
        payload: engine.receiptPayload({ orderId: O1, amountCents: 600 }, `${RECEIPT_PREVIEW_ORIGIN}/research/member/orders/${O1}`) }],
    });
    const h = harness({ db });
    const report = await h.queue.run();
    expect(report).toMatchObject({ queued: 0, alreadyPresent: 0, refused: 1 });
    expect(h.canonical).not.toHaveBeenCalled();
  });

  it("refuses a member with no address on file", async () => {
    const db = database({ executions: [exec(E1, M1, O1, "2026-09-10T10:00:00.123456+00:00")], orders: [ord(O1, M1)], members: [] });
    const h = harness({ db });
    expect(await h.queue.run()).toMatchObject({ queued: 0, refused: 1 });
    expect(h.canonical).not.toHaveBeenCalled();
  });

  it("leaves orders committed before the approved cutoff alone", async () => {
    const db = database({ executions: [exec(E1, M1, O1, "2026-09-09T10:00:00.123456+00:00")], orders: [ord(O1, M1)],
      members: [{ id: M1, email: "one@receipt.fixture.invalid" }] });
    const h = harness({ db });
    expect(await h.queue.run()).toMatchObject({ queued: 0, beforeCutoff: 1, refused: 0 });
    expect(h.canonical).not.toHaveBeenCalled();
  });
});

describe("failure and retry", () => {
  it("reports a failed enqueue as owed, and the next cycle retries it", async () => {
    let fail = true;
    const h = harness({ enqueue: async () => (fail ? "unavailable" : "inserted") });
    // Returning "inserted" without storing the row is exactly what the read-back
    // is for; use a real write on the retry instead.
    const first = await h.queue.run();
    expect(first).toMatchObject({ queued: 0, refused: 1, cursor: null });
    fail = false;
    h.canonical.mockImplementation(async (input) => {
      h.db.tables.research_notification_outbox!.push({ event_key: input.eventKey, event_type: input.eventType,
        template_key: input.templateKey, recipient: input.recipient, payload: { ...input.payload } });
      return "inserted";
    });
    const retry = await h.queue.run();
    expect(retry).toMatchObject({ queued: 1, refused: 0 });
  });

  it("treats a thrown enqueue as unavailable, never as sent", async () => {
    const h = harness({ enqueue: async () => { throw new Error("outbox went away"); } });
    expect(await h.queue.run()).toMatchObject({ queued: 0, refused: 1 });
  });

  it("stops writing the moment the approval expires mid-pass", async () => {
    let clock = NOW;
    const h = harness({ now: () => clock });
    h.canonical.mockImplementation(async () => "inserted");
    clock = new Date("2026-09-12T00:00:00Z");
    // Expired before the run: refused up front.
    expect(await h.queue.run()).toMatchObject({ status: "unavailable", code: "approval_expired" });
    expect(h.canonical).not.toHaveBeenCalled();
  });
});

describe("pagination and audience", () => {
  const twoMembers = () => database({
    executions: [exec(E1, M1, O1, "2026-09-10T10:00:00.123456+00:00"), exec(E2, M2, O2, "2026-09-10T11:00:00.654321+00:00")],
    orders: [ord(O1, M1), ord(O2, M2)],
    members: [{ id: M1, email: "one@receipt.fixture.invalid" }, { id: M2, email: "two@receipt.fixture.invalid" }],
  });

  it("reaches the second page through the exact cursor, not by re-reading the first", async () => {
    const h = harness({ db: twoMembers() });
    const first = await h.queue.run({ limit: 1 });
    expect(first).toMatchObject({ considered: 1, queued: 1 });
    expect(first.status === "ran" && first.cursor).toEqual({ committedAt: "2026-09-10T10:00:00.123456+00:00", executionId: E1 });
    const second = await h.queue.run({ limit: 1, cursor: first.status === "ran" ? first.cursor : null });
    expect(second).toMatchObject({ considered: 1, queued: 1 });
    expect(h.enqueued.map(e => e.eventKey)).toEqual([engine.receiptEventKey(O1), engine.receiptEventKey(O2)]);
    // The microsecond literal went to the database unrounded.
    expect(h.db.filters.at(-1)).toContain("2026-09-10T10:00:00.123456+00:00");
  });

  it("never queues outside the approved audience, and still pages past those rows", async () => {
    const h = harness({ db: twoMembers(), approval: approval({ audience: { memberIds: [M2] } }) });
    const report = await h.queue.run();
    expect(report).toMatchObject({ considered: 2, queued: 1, outOfAudience: 1, refused: 0 });
    expect(h.enqueued.map(e => e.recipient)).toEqual(["two@receipt.fixture.invalid"]);
  });

  it("reports counts only: no address, order, member or payment reference", async () => {
    const h = harness({ db: twoMembers() });
    const serialized = JSON.stringify(await h.queue.run());
    for (const value of ["receipt.fixture.invalid", O1, O2, M1, M2, "pi_local", "payload"]) expect(serialized).not.toContain(value);
  });
});
