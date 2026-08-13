import { describe, expect, it } from "vitest";
import type {
  CommittedManualPaymentVerification,
  ManualOrderInvoice,
  ManualPaymentReport,
} from "./manual-order-payments";
import {
  InMemoryOrderWorkflowAtomicStore,
  OrderWorkflowConcurrencyError,
  OrderWorkflowPersistenceCorruptionError,
  PersistentOrderWorkflowService,
  type OrderWorkflowAtomicStore,
} from "./order-payment-fulfillment-persistence";
import type { OrderActor, OrderCommand } from "./order-payment-fulfillment";

const ORDER = "order_pack04_persistence_0001";
const BUYER_ID = "buyer_pack04_persistence_0001";
const SUPPLIER_ID = "supplier_pack04_persistence_0001";
const buyer: OrderActor = { actorId: BUYER_ID, role: "buyer" };
const admin: OrderActor = {
  actorId: "admin_pack04_persistence_0001",
  role: "admin",
  trustMode: "ask",
  trustApprovalRef: "approval_pack04_persistence_0001",
};
const finance: OrderActor = {
  actorId: "finance_pack04_persistence_0001",
  role: "finance",
  trustMode: "queue",
  trustApprovalRef: "approval_pack04_persistence_finance",
};
const supplier: OrderActor = {
  actorId: "supplier_user_pack04_persistence",
  role: "supplier",
  supplierId: SUPPLIER_ID,
  trustMode: "queue",
  trustApprovalRef: "approval_pack04_persistence_supplier",
};

function at(second: number): string {
  return `2026-08-12T20:00:${String(second).padStart(2, "0")}.000Z`;
}

function key(name: string): string {
  return `pack04:persistence:${name}:0001`;
}

function request(quantity = 2): Extract<OrderCommand, { kind: "create_request" }> {
  return {
    kind: "create_request",
    orderId: ORDER,
    owner: { kind: "personal", buyerId: BUYER_ID },
    request: {
      requestRef: "request_pack04_persistence_0001",
      lines: [{ sku: "SKU-PACK04-PERSIST", quantity }],
    },
    occurredAt: at(0),
  };
}

function invoice(): ManualOrderInvoice {
  return {
    invoiceVersion: 1,
    invoiceId: "invoice_pack04_persistence_0001",
    humanRef: "XRM-ABCDEF123456",
    orderRef: "XRO-ABCDEF123456",
    invoiceRef: "INV-XRM-ABCDEF123456",
    paymentMemo: "INV-XRM-ABCDEF123456",
    receiptRef: "RCPT-XRM-ABCDEF123456",
    memberId: BUYER_ID,
    orderId: ORDER,
    quoteHash: "1".repeat(64),
    lines: [{
      productId: "product_pack04_persist",
      variantId: "variant_pack04_persist",
      sku: "SKU-PACK04-PERSIST",
      quantity: 2,
      unitPriceCents: 2500,
      lineTotalCents: 5000,
    }],
    amountCents: 5000,
    currency: "USD",
    method: {
      method: "wire_transfer",
      configurationRef: "configuration_pack04_persist",
      instructionsRef: "instructions_pack04_persist",
      approvalRef: "method_approval_pack04_persist",
      approvedByRole: "founder_admin",
      approvedAt: "2026-08-12T19:00:00.000Z",
      verificationRef: "method_verification_pack04_persist",
      verifiedByRole: "finance_operator",
      verifiedAt: "2026-08-12T19:10:00.000Z",
      enablementRef: "method_enablement_pack04_persist",
      enabledByRole: "founder_admin",
      enabledAt: "2026-08-12T19:20:00.000Z",
    },
    state: "awaiting_payment",
    createdAt: at(2),
    dueAt: "2026-08-13T20:00:02.000Z",
  };
}

function report(): ManualPaymentReport {
  return {
    memberId: BUYER_ID,
    orderId: ORDER,
    orderRef: "XRO-ABCDEF123456",
    invoiceRef: "INV-XRM-ABCDEF123456",
    method: "wire_transfer",
    currency: "USD",
    amountCents: 5000,
    proof: {
      storageObjectRef: `private/manual-payment-proofs/${BUYER_ID}/${ORDER}/proof.pdf`,
      sha256: "2".repeat(64),
      mimeType: "application/pdf",
      sizeBytes: 1024,
      uploadedAt: at(3),
    },
    reportedAt: at(4),
    reportFingerprint: "3".repeat(64),
    state: "reported_unverified",
  };
}

function verification(): CommittedManualPaymentVerification {
  return {
    memberId: BUYER_ID,
    orderId: ORDER,
    externalTransactionRef: "external_transaction_pack04_persist",
    verifiedAmountCents: 5000,
    currency: "USD",
    verifiedAt: at(5),
    verifiedByActorId: finance.actorId,
    verifiedByRole: "finance_operator",
    verificationFingerprint: "4".repeat(64),
    commitRef: "settlement_pack04_persist",
    state: "verified_committed",
  };
}

async function throughVerification(service: PersistentOrderWorkflowService): Promise<void> {
  expect((await service.execute(buyer, key("request"), request())).ok).toBe(true);
  expect((await service.execute(admin, key("approve"), {
    kind: "approve_request", orderId: ORDER, occurredAt: at(1),
  })).ok).toBe(true);
  expect((await service.execute(finance, key("invoice"), {
    kind: "issue_invoice", orderId: ORDER, invoice: invoice(), occurredAt: at(2),
  })).ok).toBe(true);
  expect((await service.execute(buyer, key("evidence"), {
    kind: "submit_payment_evidence", orderId: ORDER, report: report(), occurredAt: at(4),
  })).ok).toBe(true);
  expect((await service.execute(finance, key("verification"), {
    kind: "verify_payment", orderId: ORDER, verification: verification(), occurredAt: at(5),
  })).ok).toBe(true);
}

describe("Pack 04 atomic persistence adapter", () => {
  it("survives service restart and replays from minimized scoped receipts", async () => {
    const store = new InMemoryOrderWorkflowAtomicStore();
    const firstService = new PersistentOrderWorkflowService(store);
    const first = await firstService.execute(buyer, key("restart"), request());
    expect(first).toMatchObject({ ok: true, replayed: false });

    const restartedService = new PersistentOrderWorkflowService(store);
    expect((await restartedService.execute(admin, key("restart-approve"), {
      kind: "approve_request", orderId: ORDER, occurredAt: at(1),
    })).ok).toBe(true);
    const replay = await restartedService.execute(buyer, key("restart"), request());
    expect(replay).toMatchObject({ ok: true, replayed: true, order: { stage: "approved" } });

    const state = await store.load();
    expect(state.revision).toBe(3);
    expect(state.snapshot.orders).toHaveLength(1);
    expect(state.snapshot.receipts).toHaveLength(2);
    expect(state.snapshot.receipts.find((receipt) => receipt.key === key("restart")))
      .toMatchObject({ orderId: ORDER, resultVersion: 1 });
    expect(state.snapshot.receipts.every((receipt) => !("order" in receipt))).toBe(true);
    expect(state.snapshot.auditTrail.map((entry) => entry.outcome)).toEqual([
      "accepted", "accepted", "replayed",
    ]);
    expect(store.commits()[2]).toMatchObject({
      outcome: "replayed",
      orderAfter: null,
      commandReceipt: null,
      timelineEvents: [],
    });
  });

  it("serializes concurrent identical requests into one acceptance and one replay", async () => {
    let arrivals = 0;
    let release!: () => void;
    const bothArrived = new Promise<void>((resolve) => { release = resolve; });
    const store = new InMemoryOrderWorkflowAtomicStore({
      beforeCommit: async ({ expectedRevision }) => {
        if (expectedRevision !== 0) return;
        arrivals += 1;
        if (arrivals === 2) release();
        await bothArrived;
      },
    });
    const one = new PersistentOrderWorkflowService(store);
    const two = new PersistentOrderWorkflowService(store);
    const results = await Promise.all([
      one.execute(buyer, key("concurrent"), request()),
      two.execute(buyer, key("concurrent"), request()),
    ]);

    expect(results.filter((result) => result.ok && !result.replayed)).toHaveLength(1);
    expect(results.filter((result) => result.ok && result.replayed)).toHaveLength(1);
    expect((await store.load()).snapshot.orders).toHaveLength(1);
    expect((await store.load()).snapshot.receipts).toHaveLength(1);
  });

  it("refuses a changed payload racing under the same idempotency key", async () => {
    let arrivals = 0;
    let release!: () => void;
    const bothArrived = new Promise<void>((resolve) => { release = resolve; });
    const store = new InMemoryOrderWorkflowAtomicStore({
      beforeCommit: async ({ expectedRevision }) => {
        if (expectedRevision !== 0) return;
        arrivals += 1;
        if (arrivals === 2) release();
        await bothArrived;
      },
    });
    const one = new PersistentOrderWorkflowService(store);
    const two = new PersistentOrderWorkflowService(store);
    const results = await Promise.all([
      one.execute(buyer, key("collision"), request(2)),
      two.execute(buyer, key("collision"), request(3)),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.code === "idempotency_conflict"))
      .toHaveLength(1);
    expect((await store.load()).snapshot.orders[0]?.request.lines[0]?.quantity).toBeOneOf([2, 3]);
    expect((await store.load()).snapshot.auditTrail.map((entry) => entry.outcome).sort())
      .toEqual(["accepted", "refused"]);
  });

  it("commits normalized invoice, evidence, settlement and supplier facts with their projection", async () => {
    const store = new InMemoryOrderWorkflowAtomicStore();
    const service = new PersistentOrderWorkflowService(store);
    await throughVerification(service);
    expect((await service.execute(admin, key("handoff"), {
      kind: "queue_supplier_handoff",
      orderId: ORDER,
      handoffRef: "handoff_pack04_persist",
      supplierId: SUPPLIER_ID,
      occurredAt: at(6),
    })).ok).toBe(true);
    expect((await service.execute(admin, key("release"), {
      kind: "release_supplier_handoff", orderId: ORDER, occurredAt: at(7),
    })).ok).toBe(true);
    expect((await service.execute(supplier, key("fulfill"), {
      kind: "start_fulfillment", orderId: ORDER, occurredAt: at(8),
    })).ok).toBe(true);
    expect((await service.execute(supplier, key("tracking"), {
      kind: "add_tracking",
      orderId: ORDER,
      trackingRef: "tracking_pack04_persist",
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
      occurredAt: at(9),
    })).ok).toBe(true);
    expect((await service.execute(supplier, key("shipped"), {
      kind: "mark_shipped", orderId: ORDER, occurredAt: at(10),
    })).ok).toBe(true);
    expect((await service.execute(supplier, key("delivered"), {
      kind: "mark_delivered", orderId: ORDER, occurredAt: at(11),
    })).ok).toBe(true);

    const commits = store.commits();
    expect(commits.find((entry) => entry.command === "issue_invoice")?.invoice?.invoiceRef)
      .toBe("INV-XRM-ABCDEF123456");
    expect(commits.find((entry) => entry.command === "submit_payment_evidence")?.paymentEvidence?.state)
      .toBe("reported_unverified");
    expect(commits.find((entry) => entry.command === "verify_payment")).toMatchObject({
      verification: { state: "verified_committed" },
      settlement: { settlementRef: "settlement_pack04_persist", amountCents: 5000 },
    });
    expect(commits.find((entry) => entry.command === "queue_supplier_handoff")?.supplierHandoff)
      .toMatchObject({ handoffRef: "handoff_pack04_persist", releasedAt: null });
    expect(commits.find((entry) => entry.command === "release_supplier_handoff")?.supplierHandoff)
      .toMatchObject({ handoffRef: "handoff_pack04_persist", releasedAt: at(7) });
    expect(commits.find((entry) => entry.command === "start_fulfillment")?.fulfillmentStage)
      .toBe("fulfilling");
    expect(commits.find((entry) => entry.command === "add_tracking")?.tracking)
      .toMatchObject({ trackingRef: "tracking_pack04_persist", trackingNumber: "1Z999AA10123456784" });
    expect(commits.find((entry) => entry.command === "mark_shipped")?.fulfillmentStage).toBe("shipped");
    expect(commits.find((entry) => entry.command === "mark_delivered")?.fulfillmentStage).toBe("delivered");
    expect((await service.customerTimeline(buyer, ORDER))?.stage).toBe("delivered");
    expect(commits.every((entry) => entry.auditEntries.length === 1)).toBe(true);
    expect(commits.every((entry) => entry.nextRevision === entry.expectedRevision + 1)).toBe(true);
  });

  it("durably audits a refused consequential command without mutating the order projection", async () => {
    const store = new InMemoryOrderWorkflowAtomicStore();
    const service = new PersistentOrderWorkflowService(store);
    expect((await service.execute(buyer, key("request"), request())).ok).toBe(true);
    const refused = await service.execute(admin, key("handoff-too-soon"), {
      kind: "queue_supplier_handoff",
      orderId: ORDER,
      handoffRef: "handoff_pack04_too_soon",
      supplierId: SUPPLIER_ID,
      occurredAt: at(1),
    });
    expect(refused).toMatchObject({ ok: false, code: "approval_required" });
    expect((await service.getForActor(buyer, ORDER))?.stage).toBe("request_pending");
    expect(store.commits().at(-1)).toMatchObject({
      outcome: "refused",
      orderAfter: null,
      commandReceipt: null,
      timelineEvents: [],
      auditEntries: [{ reason: "approval_required" }],
    });
  });

  it("fails closed after bounded revision conflicts and persists no partial state", async () => {
    const empty = new InMemoryOrderWorkflowAtomicStore();
    const conflicting: OrderWorkflowAtomicStore = {
      load: () => empty.load(),
      commit: async () => ({ committed: false, reason: "revision_moved", currentRevision: 1 }),
    };
    const service = new PersistentOrderWorkflowService(conflicting, 2);
    await expect(service.execute(buyer, key("never-commits"), request()))
      .rejects.toBeInstanceOf(OrderWorkflowConcurrencyError);
    expect((await empty.load()).revision).toBe(0);
    expect((await empty.load()).snapshot.orders).toEqual([]);
    expect((await empty.load()).snapshot.auditTrail).toEqual([]);
  });

  it("refuses malformed durable state before executing or exposing an order", async () => {
    const malformed: OrderWorkflowAtomicStore = {
      load: async () => ({
        revision: 7,
        snapshot: {
          orders: [{ orderId: ORDER, version: 1, events: [] }],
          receipts: [],
          auditTrail: [],
        } as never,
      }),
      commit: async () => { throw new Error("commit must not run"); },
    };
    const service = new PersistentOrderWorkflowService(malformed);
    await expect(service.execute(buyer, key("corrupt"), request()))
      .rejects.toBeInstanceOf(OrderWorkflowPersistenceCorruptionError);
    await expect(service.getForActor(buyer, ORDER))
      .rejects.toBeInstanceOf(OrderWorkflowPersistenceCorruptionError);
  });
});
