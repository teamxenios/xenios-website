// What the receipt reconciler will and will not send.
//
// Every address here is `.invalid`, which cannot resolve, and the queue is a
// local double. Nothing in this file can reach a person.
import { describe, expect, it } from "vitest";
import {
  createReceiptRepair,
  formatUsdCents,
  receiptEventKey,
  receiptPayload,
  renderCommittedReceipt,
  renderCommerceReceiptOutboxEmail,
  ReceiptRepairMisconfigured,
  RECEIPT_EVENT_TYPE,
  RECEIPT_TEMPLATE_KEY,
  type CommittedExecutionFacts,
  type QueuedEventFacts,
  type ReceiptEnqueueOutcome,
  type ReceiptOrderFacts,
} from "./receipt-repair";

const CUTOFF = new Date("2026-09-01T00:00:00Z");
const ORDER_ID = "order-9001";
const MEMBER_ID = "member-4242";
const REFERENCE = "pi_receipt_0001";

const execution: CommittedExecutionFacts = {
  executionId: "exec-1",
  orderId: ORDER_ID,
  memberId: MEMBER_ID,
  amountCents: 41_250,
  currency: "usd",
  providerReference: REFERENCE,
  committedAt: "2026-09-09T10:00:00Z",
};

const order: ReceiptOrderFacts = {
  orderId: ORDER_ID,
  memberId: MEMBER_ID,
  state: "payment_captured",
  providerReference: REFERENCE,
  capturedAmountCents: 41_250,
  refundedCents: 0,
};

function harness(overrides: {
  executions?: CommittedExecutionFacts[];
  order?: ReceiptOrderFacts | null;
  recipient?: string | null;
  enqueue?: ReceiptEnqueueOutcome;
  queued?: Map<string, QueuedEventFacts>;
  priorEventKeys?: (orderId: string) => readonly string[];
  mode?: "preview" | "queue";
  storeSomethingElse?: boolean;
} = {}) {
  const queued = overrides.queued ?? new Map<string, QueuedEventFacts>();
  const attempts: string[] = [];
  const repair = createReceiptRepair({
    listCommitted: async () => overrides.executions ?? [execution],
    readOrder: async () => (overrides.order === undefined ? order : overrides.order),
    recipientFor: async () => (overrides.recipient === undefined ? "member@example.invalid" : overrides.recipient),
    findQueuedEvent: async (key) => queued.get(key) ?? null,
    async enqueueOnce(input) {
      attempts.push(input.eventKey);
      const outcome = overrides.enqueue ?? "inserted";
      if (outcome !== "unavailable") {
        queued.set(input.eventKey, {
          eventKey: input.eventKey,
          eventType: overrides.storeSomethingElse ? "something_else" : input.eventType,
          templateKey: input.templateKey,
          recipient: input.recipient,
          payload: input.payload,
        });
      }
      return outcome;
    },
    eligibleAfter: CUTOFF,
    priorEventKeys: overrides.priorEventKeys,
    orderUrl: (id) => `https://xenios.example.invalid/research/member/orders/${id}`,
    mode: overrides.mode ?? "queue",
  });
  return { repair, queued, attempts };
}

describe("the receipt itself", () => {
  it("says a payment arrived and does not say the order shipped", () => {
    const rendered = renderCommittedReceipt(receiptPayload({ orderId: ORDER_ID, amountCents: 41_250 }, "https://x.invalid/o/1"))!;
    expect(rendered.subject).toBe(`Payment received for order ${ORDER_ID}`);
    expect(rendered.text).toContain("$412.50");
    expect(rendered.text).toContain("not a shipping confirmation");
    for (const word of ["shipped", "dispatched", "on its way", "delivered", "tracking"]) {
      expect(rendered.text.toLowerCase()).not.toContain(word);
    }
  });

  it("is pure: the same order renders the same words every time", () => {
    const payload = receiptPayload({ orderId: ORDER_ID, amountCents: 41_250 }, "https://x.invalid/o/1");
    expect(renderCommittedReceipt(payload)).toEqual(renderCommittedReceipt(payload));
  });

  it("refuses to render without the facts it needs, rather than inventing them", () => {
    expect(renderCommittedReceipt({})).toBeNull();
    expect(renderCommittedReceipt({ orderReference: ORDER_ID })).toBeNull();
  });

  it("carries no key the payload-safety rule forbids", () => {
    const payload = receiptPayload({ orderId: ORDER_ID, amountCents: 1 }, "https://x.invalid/o/1");
    // assertEmailPayloadSafe runs inside receiptPayload; this states the shape.
    expect(Object.keys(payload).sort()).toEqual(["orderReference", "orderUrl", "totalCents", "totalFormatted"]);
  });

  it("formats money without rounding it away", () => {
    expect(formatUsdCents(41_250)).toBe("$412.50");
    expect(formatUsdCents(5)).toBe("$0.05");
    expect(formatUsdCents(1_234_567)).toBe("$12,345.67");
    expect(formatUsdCents(0)).toBe("$0.00");
  });
});

describe("what it queues", () => {
  it("queues exactly one receipt for a committed order, and reads it back", async () => {
    const h = harness();
    const report = await h.repair.repair();
    expect(report).toMatchObject({ considered: 1, queued: 1, alreadyPresent: 0, refused: [] });
    const stored = h.queued.get(receiptEventKey(ORDER_ID))!;
    expect(stored).toMatchObject({
      eventType: RECEIPT_EVENT_TYPE,
      templateKey: RECEIPT_TEMPLATE_KEY,
      recipient: "member@example.invalid",
    });
    expect(stored.payload).toMatchObject({ totalCents: 41_250, orderReference: ORDER_ID });
  });

  it("does not queue a second time for the same order", async () => {
    const h = harness();
    await h.repair.repair();
    const second = await h.repair.repair();
    expect(second).toMatchObject({ queued: 0, alreadyPresent: 1 });
    expect(h.attempts).toHaveLength(1);
  });

  it("does not send a second receipt to an order another lane already notified", async () => {
    const legacy = "ea:payment-verified:order-9001";
    const queued = new Map<string, QueuedEventFacts>([
      [legacy, { eventKey: legacy, eventType: "ea_payment_verified", templateKey: "ea_payment_verified", recipient: "member@example.invalid" }],
    ]);
    const h = harness({ queued, priorEventKeys: (id) => [`ea:payment-verified:${id}`] });

    const report = await h.repair.repair();

    expect(report).toMatchObject({ queued: 0, alreadyPresent: 1 });
    // Nothing was even attempted: the new key would not have collided.
    expect(h.attempts).toEqual([]);
    expect(h.queued.has(receiptEventKey(ORDER_ID))).toBe(false);
  });

  it("writes nothing at all in preview mode", async () => {
    const h = harness({ mode: "preview" });
    const report = await h.repair.repair();
    expect(report).toMatchObject({ queued: 0, previewed: 1, refused: [] });
    expect(h.attempts).toEqual([]);
    expect(h.queued.size).toBe(0);
  });

  it("leaves orders committed before the cutoff alone", async () => {
    const old = { ...execution, committedAt: "2026-08-30T10:00:00Z" };
    const h = harness({ executions: [old] });
    const report = await h.repair.repair();
    expect(report.entries[0]!.code).toBe("before_cutoff");
    expect(h.attempts).toEqual([]);
  });
});

describe("what it refuses, one reason at a time", () => {
  const refusals: Array<[string, Parameters<typeof harness>[0], string]> = [
    ["the order cannot be read", { order: null }, "order_missing"],
    ["the order is another member's", { order: { ...order, memberId: "someone-else" } }, "order_not_the_members"],
    ["no payment has been recorded", { order: { ...order, state: "checkout_pending" } }, "order_not_captured"],
    ["the payments disagree", { order: { ...order, providerReference: "pi_other" } }, "payment_reference_disagrees"],
    ["the amounts disagree", { order: { ...order, capturedAmountCents: 100 } }, "amount_disagrees"],
    ["the order was refunded", { order: { ...order, refundedCents: 500 } }, "order_refunded"],
    ["no address is on file", { recipient: null }, "recipient_unknown"],
  ];

  for (const [name, overrides, code] of refusals) {
    it(`refuses when ${name}`, async () => {
      const h = harness(overrides);
      const report = await h.repair.repair();
      expect(report.queued).toBe(0);
      expect(report.refused).toHaveLength(1);
      expect(report.refused[0]!.code).toBe(code);
      expect(report.refused[0]!.reason).toBeTruthy();
      expect(h.attempts).toEqual([]);
      expect(h.queued.size).toBe(0);
    });
  }

  it("treats an unreachable queue as a failure, never as a clean pass", async () => {
    const h = harness({ enqueue: "unavailable" });
    const report = await h.repair.repair();
    expect(report.queued).toBe(0);
    expect(report.refused[0]!.code).toBe("queue_unavailable");
    expect(report.refused[0]!.reason).toContain("still owes a receipt");
    expect(h.queued.size).toBe(0);
  });

  it("refuses when the row that was stored is not the row that was asked for", async () => {
    const h = harness({ storeSomethingElse: true });
    const report = await h.repair.repair();
    expect(report.queued).toBe(0);
    expect(report.refused[0]!.code).toBe("queued_event_disagrees");
  });

  it("reports an execution the provider never referenced rather than guessing", async () => {
    const h = harness({ executions: [{ ...execution, providerReference: null }] });
    const report = await h.repair.repair();
    expect(report.refused[0]!.code).toBe("payment_reference_disagrees");
  });
});

describe("the renderer the dispatch chain will call", () => {
  it("claims its own template key and no other", () => {
    const payload = receiptPayload({ orderId: ORDER_ID, amountCents: 41_250 }, "https://x.invalid/o/1");
    expect(renderCommerceReceiptOutboxEmail(RECEIPT_TEMPLATE_KEY, payload)).toMatchObject({
      subject: `Payment received for order ${ORDER_ID}`,
    });
    // Passing on a key it does not own is what lets the chain reach the next
    // renderer. Claiming everything would break every other template.
    for (const other of ["ea_payment_verified", "fm_payment_verified_receipt", "buyer_request_received", ""]) {
      expect(renderCommerceReceiptOutboxEmail(other, payload)).toBeNull();
    }
  });

  it("returns null rather than a half-written email when the payload is incomplete", () => {
    expect(renderCommerceReceiptOutboxEmail(RECEIPT_TEMPLATE_KEY, { orderReference: ORDER_ID })).toBeNull();
  });
});

describe("it fails closed on the things that would cause a mass email", () => {
  it("refuses to run at all without a usable cutoff", async () => {
    const h = harness();
    const broken = createReceiptRepair({
      listCommitted: async () => [execution],
      readOrder: async () => order,
      recipientFor: async () => "member@example.invalid",
      findQueuedEvent: async () => null,
      enqueueOnce: async () => "inserted",
      eligibleAfter: new Date("not a date"),
      orderUrl: (id) => `https://x.invalid/o/${id}`,
      mode: "queue",
    });
    // An unusable cutoff compares false against every timestamp, so without
    // this the pass would mail the entire history.
    await expect(broken.repair()).rejects.toThrow(ReceiptRepairMisconfigured);
    expect(h.attempts).toEqual([]);
  });

  it("writes nothing for any mode that is not exactly queue", async () => {
    // Built directly, so the harness default cannot stand in for the module.
    for (const mode of ["preview", undefined, "Queue", "QUEUE", "yes", ""]) {
      const attempts: string[] = [];
      const repair = createReceiptRepair({
        listCommitted: async () => [execution],
        readOrder: async () => order,
        recipientFor: async () => "member@example.invalid",
        findQueuedEvent: async () => null,
        async enqueueOnce(input) {
          attempts.push(input.eventKey);
          return "inserted";
        },
        eligibleAfter: CUTOFF,
        orderUrl: (id) => `https://x.invalid/o/${id}`,
        mode: mode as never,
      });
      const report = await repair.repair();
      expect(report.queued).toBe(0);
      expect(report.previewed).toBe(1);
      expect(attempts).toEqual([]);
    }
  });

  it("treats an order that does not report a refunded amount as unknown, not as zero", async () => {
    const { refundedCents: _dropped, ...withoutRefunds } = order;
    const h = harness({ order: withoutRefunds as typeof order });
    const report = await h.repair.repair();
    expect(report.queued).toBe(0);
    expect(report.refused[0]!.code).toBe("refund_state_unknown");
    expect(h.attempts).toEqual([]);
  });

  it("refuses a payment that is not in dollars, because it renders a dollar sign", async () => {
    const h = harness({ executions: [{ ...execution, currency: "cad" }] });
    const report = await h.repair.repair();
    expect(report.refused[0]!.code).toBe("currency_not_supported");
    expect(h.attempts).toEqual([]);
  });

  it("reports a committed execution with no usable commit time instead of filing it as old", async () => {
    for (const committedAt of [null, "", "whenever"]) {
      const h = harness({ executions: [{ ...execution, committedAt }] });
      const report = await h.repair.repair();
      expect(report.refused[0]!.code).toBe("commit_time_unusable");
    }
  });

  it("keeps the receipts it already queued when one order cannot be read", async () => {
    const second = { ...execution, executionId: "exec-2", orderId: "order-9002" };
    let calls = 0;
    const queued = new Map<string, QueuedEventFacts>();
    const repair = createReceiptRepair({
      listCommitted: async () => [execution, second],
      async readOrder(orderId) {
        calls += 1;
        if (orderId === second.orderId) throw new Error("the database went away");
        return order;
      },
      recipientFor: async () => "member@example.invalid",
      findQueuedEvent: async (key) => queued.get(key) ?? null,
      async enqueueOnce(input) {
        queued.set(input.eventKey, { ...input });
        return "inserted";
      },
      eligibleAfter: CUTOFF,
      orderUrl: (id) => `https://x.invalid/o/${id}`,
      mode: "queue",
    });

    const report = await repair.repair();

    expect(calls).toBe(2);
    expect(report.queued).toBe(1);
    expect(report.refused.map((r) => r.code)).toEqual(["read_failed"]);
  });

  it("refuses when the stored row would render different words from the ones intended", async () => {
    const queued = new Map<string, QueuedEventFacts>();
    const repair = createReceiptRepair({
      listCommitted: async () => [execution],
      readOrder: async () => order,
      recipientFor: async () => "member@example.invalid",
      findQueuedEvent: async (key) => queued.get(key) ?? null,
      async enqueueOnce(input) {
        // The right number, the wrong words: a template that renders the
        // formatted total would show the customer something else.
        queued.set(input.eventKey, { ...input, payload: { ...input.payload, totalFormatted: "$1.00" } });
        return "inserted";
      },
      eligibleAfter: CUTOFF,
      orderUrl: (id) => `https://x.invalid/o/${id}`,
      mode: "queue",
    });

    const report = await repair.repair();

    expect(report.queued).toBe(0);
    expect(report.refused[0]!.code).toBe("queued_event_disagrees");
  });
});

describe("the event identity", () => {
  it("is stable for an order and carries a version", () => {
    expect(receiptEventKey(ORDER_ID)).toBe(`commerce:payment-received:v1:${ORDER_ID}`);
    expect(receiptEventKey(ORDER_ID)).toBe(receiptEventKey(ORDER_ID));
  });

  it("differs per order, so one order's receipt cannot suppress another's", () => {
    expect(receiptEventKey("a")).not.toBe(receiptEventKey("b"));
  });
});
