import { describe, expect, it } from "vitest";
import type {
  CommittedManualPaymentVerification,
  ManualOrderInvoice,
  ManualPaymentReport,
} from "./manual-order-payments";
import {
  InMemoryOrderWorkflowEngine,
  PACK04_ORDER_QUANTITY_MAX,
  PACK04_ORDER_QUANTITY_MIN,
  type BusinessOrderOwner,
  type OrderActor,
  type OrderCommand,
} from "./order-payment-fulfillment";

const ORDER = "order_pack04_0001";
const BUYER_ID = "buyer_pack04_0001";
const ORG_ID = "organization_pack04_0001";
const SUPPLIER_ID = "supplier_pack04_0001";

const buyer: OrderActor = { actorId: BUYER_ID, role: "buyer" };
const businessBuyer: OrderActor = {
  actorId: BUYER_ID,
  role: "buyer",
  organizationIds: [ORG_ID],
};
const admin: OrderActor = {
  actorId: "admin_pack04_0001",
  role: "admin",
  trustMode: "ask",
  trustApprovalRef: "approval_pack04_0001",
};
const finance: OrderActor = {
  actorId: "finance_pack04_0001",
  role: "finance",
  trustMode: "queue",
  trustApprovalRef: "approval_pack04_finance_0001",
};
const supplier: OrderActor = {
  actorId: "supplier_user_pack04_0001",
  role: "supplier",
  supplierId: SUPPLIER_ID,
  trustMode: "queue",
  trustApprovalRef: "approval_pack04_supplier_0001",
};

function at(second: number): string {
  return `2026-08-12T18:00:${String(second).padStart(2, "0")}.000Z`;
}

function request(
  owner: BusinessOrderOwner | { kind: "personal"; buyerId: string } = {
    kind: "personal",
    buyerId: BUYER_ID,
  },
): Extract<OrderCommand, { kind: "create_request" }> {
  return {
    kind: "create_request",
    orderId: ORDER,
    owner,
    request: {
      requestRef: "buyer_request_pack04_0001",
      lines: [{ sku: "SKU-PACK04-01", quantity: 2 }],
      note: "Please confirm availability.",
    },
    occurredAt: at(0),
  };
}

function invoice(): ManualOrderInvoice {
  return {
    invoiceVersion: 1,
    invoiceId: "invoice_pack04_0001",
    humanRef: "XRM-123456789ABC",
    orderRef: "XRO-123456789ABC",
    invoiceRef: "INV-XRM-123456789ABC",
    paymentMemo: "INV-XRM-123456789ABC",
    receiptRef: "RCPT-XRM-123456789ABC",
    memberId: BUYER_ID,
    orderId: ORDER,
    quoteHash: "a".repeat(64),
    lines: [{
      productId: "product_pack04_0001",
      variantId: "variant_pack04_0001",
      sku: "SKU-PACK04-01",
      quantity: 2,
      unitPriceCents: 2500,
      lineTotalCents: 5000,
    }],
    amountCents: 5000,
    currency: "USD",
    method: {
      method: "wire_transfer",
      configurationRef: "configuration_pack04_0001",
      instructionsRef: "instructions_pack04_0001",
      approvalRef: "method_approval_pack04_0001",
      approvedByRole: "founder_admin",
      approvedAt: "2026-08-12T17:00:00.000Z",
      verificationRef: "method_verification_pack04_0001",
      verifiedByRole: "finance_operator",
      verifiedAt: "2026-08-12T17:10:00.000Z",
      enablementRef: "method_enablement_pack04_0001",
      enabledByRole: "founder_admin",
      enabledAt: "2026-08-12T17:20:00.000Z",
    },
    state: "awaiting_payment",
    createdAt: at(2),
    dueAt: "2026-08-13T18:00:02.000Z",
  };
}

function report(): ManualPaymentReport {
  return {
    memberId: BUYER_ID,
    orderId: ORDER,
    orderRef: "XRO-123456789ABC",
    invoiceRef: "INV-XRM-123456789ABC",
    method: "wire_transfer",
    currency: "USD",
    amountCents: 5000,
    proof: {
      storageObjectRef: `private/manual-payment-proofs/${BUYER_ID}/${ORDER}/proof.png`,
      sha256: "b".repeat(64),
      mimeType: "image/png",
      sizeBytes: 4096,
      uploadedAt: at(3),
    },
    reportedAt: at(4),
    reportFingerprint: "c".repeat(64),
    state: "reported_unverified",
  };
}

function verification(): CommittedManualPaymentVerification {
  return {
    memberId: BUYER_ID,
    orderId: ORDER,
    externalTransactionRef: "external_transaction_pack04_0001",
    verifiedAmountCents: 5000,
    currency: "USD",
    verifiedAt: at(5),
    verifiedByActorId: finance.actorId,
    verifiedByRole: "finance_operator",
    verificationFingerprint: "d".repeat(64),
    commitRef: "commit_pack04_0001",
    state: "verified_committed",
  };
}

function run(
  engine: InMemoryOrderWorkflowEngine,
  actor: OrderActor,
  key: string,
  command: OrderCommand,
) {
  return engine.execute(actor, `pack04:${key}:00000001`, command);
}

function throughPaymentVerification(engine: InMemoryOrderWorkflowEngine): void {
  expect(run(engine, buyer, "request", request()).ok).toBe(true);
  expect(run(engine, admin, "approve", {
    kind: "approve_request",
    orderId: ORDER,
    occurredAt: at(1),
  }).ok).toBe(true);
  expect(run(engine, finance, "invoice", {
    kind: "issue_invoice",
    orderId: ORDER,
    invoice: invoice(),
    occurredAt: at(2),
  }).ok).toBe(true);
  expect(run(engine, buyer, "evidence", {
    kind: "submit_payment_evidence",
    orderId: ORDER,
    report: report(),
    occurredAt: at(4),
  }).ok).toBe(true);
  expect(run(engine, finance, "verify", {
    kind: "verify_payment",
    orderId: ORDER,
    verification: verification(),
    occurredAt: at(5),
  }).ok).toBe(true);
}

describe("Pack 04 order/payment/fulfillment workflow", () => {
  it("runs the personal buyer journey only through explicit approval, verification, handoff and fulfillment", () => {
    const engine = new InMemoryOrderWorkflowEngine();
    throughPaymentVerification(engine);

    const paid = engine.getForActor(buyer, ORDER);
    expect(paid?.stage).toBe("payment_verified");
    expect(paid?.settlement).toEqual({
      settlementRef: "commit_pack04_0001",
      externalTransactionRef: "external_transaction_pack04_0001",
      amountCents: 5000,
      currency: "USD",
      settledAt: at(5),
    });
    expect(paid?.supplierHandoff).toBeNull();

    expect(run(engine, admin, "handoff-queue", {
      kind: "queue_supplier_handoff",
      orderId: ORDER,
      handoffRef: "handoff_pack04_0001",
      supplierId: SUPPLIER_ID,
      occurredAt: at(6),
    }).ok).toBe(true);
    expect(run(engine, admin, "handoff-release", {
      kind: "release_supplier_handoff",
      orderId: ORDER,
      occurredAt: at(7),
    }).ok).toBe(true);
    expect(run(engine, supplier, "fulfillment-start", {
      kind: "start_fulfillment",
      orderId: ORDER,
      occurredAt: at(8),
    }).ok).toBe(true);
    expect(run(engine, supplier, "tracking", {
      kind: "add_tracking",
      orderId: ORDER,
      trackingRef: "tracking_pack04_0001",
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
      occurredAt: at(9),
    }).ok).toBe(true);
    expect(run(engine, supplier, "shipped", {
      kind: "mark_shipped",
      orderId: ORDER,
      occurredAt: at(10),
    }).ok).toBe(true);
    expect(run(engine, supplier, "delivered", {
      kind: "mark_delivered",
      orderId: ORDER,
      occurredAt: at(11),
    }).ok).toBe(true);

    const timeline = engine.customerTimeline(buyer, ORDER);
    expect(timeline?.stage).toBe("delivered");
    expect(timeline?.tracking).toEqual([{
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
      recordedAt: at(9),
    }]);
    expect(timeline?.events.map((entry) => entry.kind)).toEqual([
      "buyer_request_created",
      "request_approved",
      "invoice_issued",
      "payment_evidence_submitted",
      "payment_verified",
      "supplier_handoff_queued",
      "supplier_handoff_released",
      "fulfillment_started",
      "tracking_added",
      "order_shipped",
      "order_delivered",
    ]);
    const serialized = JSON.stringify(timeline);
    expect(serialized).not.toContain("external_transaction_pack04_0001");
    expect(serialized).not.toContain("commit_pack04_0001");
    expect(serialized).not.toContain("supplier_pack04_0001");
    expect(serialized).not.toContain("private/manual-payment-proofs");

    const history = engine.customerOrderHistory(buyer);
    expect(history).toMatchObject({
      nextCursor: null,
      orders: [{
        orderId: ORDER,
        requestRef: "buyer_request_pack04_0001",
        stage: "delivered",
        paymentStatus: "verified",
        fulfillmentStatus: "delivered",
        amountCents: 5000,
        latestTracking: {
          carrier: "UPS",
          trackingNumber: "1Z999AA10123456784",
          recordedAt: at(9),
        },
      }],
    });
    expect(JSON.stringify(history)).not.toContain("external_transaction_pack04_0001");
    expect(JSON.stringify(history)).not.toContain("private/manual-payment-proofs");
  });

  it("binds business orders to both the organization and its authenticated buyer", () => {
    const engine = new InMemoryOrderWorkflowEngine();
    const owner: BusinessOrderOwner = {
      kind: "business",
      organizationId: ORG_ID,
      buyerId: BUYER_ID,
    };
    const outsider: OrderActor = {
      actorId: BUYER_ID,
      role: "buyer",
      organizationIds: ["organization_other_0001"],
    };
    const refused = run(engine, outsider, "business-request-refused", request(owner));
    expect(refused).toMatchObject({ ok: false, code: "ownership_mismatch" });

    expect(run(engine, businessBuyer, "business-request", request(owner)).ok).toBe(true);
    expect(engine.customerTimeline(outsider, ORDER)).toBeNull();
    expect(engine.customerTimeline({ actorId: "buyer_other_0001", role: "buyer", organizationIds: [ORG_ID] }, ORDER))
      .toBeNull();
    expect(engine.customerTimeline(businessBuyer, ORDER)?.ownerKind).toBe("business");
  });

  it("paginates customer order history stably while isolating buyers and organizations", () => {
    const engine = new InMemoryOrderWorkflowEngine();
    const create = (
      actor: OrderActor,
      orderId: string,
      owner: BusinessOrderOwner | { kind: "personal"; buyerId: string },
      second: number,
    ) => engine.execute(actor, `pack04:history:${orderId}`, {
      kind: "create_request",
      orderId,
      owner,
      request: {
        requestRef: `request_${orderId}`,
        lines: [{ sku: "SKU-PACK04-HISTORY", quantity: 50 }],
      },
      occurredAt: at(second),
    });
    const personal = { kind: "personal" as const, buyerId: BUYER_ID };
    const business: BusinessOrderOwner = {
      kind: "business", buyerId: BUYER_ID, organizationId: ORG_ID,
    };
    const otherBuyer: OrderActor = { actorId: "buyer_pack04_other", role: "buyer" };

    expect(create(buyer, "order_history_personal_01", personal, 20).ok).toBe(true);
    expect(create(businessBuyer, "order_history_business_01", business, 21).ok).toBe(true);
    expect(create(buyer, "order_history_personal_02", personal, 22).ok).toBe(true);
    expect(create(otherBuyer, "order_history_other_01", {
      kind: "personal", buyerId: otherBuyer.actorId,
    }, 23).ok).toBe(true);

    const first = engine.customerOrderHistory(businessBuyer, { limit: 2 });
    expect(first.orders.map((order) => order.orderId)).toEqual([
      "order_history_personal_02", "order_history_business_01",
    ]);
    expect(first.orders.every((order) => order.lines[0]?.quantity === 50)).toBe(true);
    expect(first.nextCursor).toEqual({
      updatedAt: at(21), orderId: "order_history_business_01",
    });
    const second = engine.customerOrderHistory(businessBuyer, {
      limit: 2,
      before: first.nextCursor,
    });
    expect(second.orders.map((order) => order.orderId)).toEqual(["order_history_personal_01"]);
    expect(second.nextCursor).toBeNull();

    const noBusinessAuthority: OrderActor = { actorId: BUYER_ID, role: "buyer", organizationIds: [] };
    expect(engine.customerOrderHistory(noBusinessAuthority).orders.map((order) => order.orderId))
      .toEqual(["order_history_personal_02", "order_history_personal_01"]);
    expect(engine.customerOrderHistory(otherBuyer).orders.map((order) => order.orderId))
      .toEqual(["order_history_other_01"]);
    expect(engine.customerOrderHistory(admin).orders).toEqual([]);
    expect(() => engine.customerOrderHistory(buyer, { limit: 101 })).toThrow(TypeError);
    expect(() => engine.customerOrderHistory(buyer, {
      before: { updatedAt: "not-a-time", orderId: "order_history_personal_01" },
    })).toThrow(TypeError);
  });

  it("treats every normal quantity from 1 through 50 identically and never adds a quantity review threshold", () => {
    expect(PACK04_ORDER_QUANTITY_MIN).toBe(1);
    expect(PACK04_ORDER_QUANTITY_MAX).toBe(50);
    const engine = new InMemoryOrderWorkflowEngine();

    for (const quantity of [1, 20, 21, 50]) {
      const orderId = `order_pack04_quantity_${quantity}`;
      const command = request();
      const result = engine.execute(buyer, `pack04:quantity:${quantity}:00000001`, {
        ...command,
        orderId,
        request: {
          ...command.request,
          requestRef: `buyer_request_pack04_quantity_${quantity}`,
          lines: [{ sku: "SKU-PACK04-01", quantity }],
        },
      });
      expect(result).toMatchObject({
        ok: true,
        replayed: false,
        order: { stage: "request_pending", approvedAt: null, approvedBy: null },
      });
    }

    for (const [label, quantity] of [["zero", 0], ["fraction", 1.5], ["above", 51]] as const) {
      const orderId = `order_pack04_quantity_${label}`;
      const command = request();
      expect(engine.execute(buyer, `pack04:quantity:${label}:00000001`, {
        ...command,
        orderId,
        request: {
          ...command.request,
          requestRef: `buyer_request_pack04_quantity_${label}`,
          lines: [{ sku: "SKU-PACK04-01", quantity }],
        },
      })).toMatchObject({ ok: false, code: "validation_failed" });
      expect(engine.getForActor(buyer, orderId)).toBeNull();
    }
  });

  it("refuses an invoice outside 1 through 50 or with a changed requested quantity after approval", () => {
    const engine = new InMemoryOrderWorkflowEngine();
    const command = request();
    expect(run(engine, buyer, "request-50", {
      ...command,
      request: { ...command.request, lines: [{ sku: "SKU-PACK04-01", quantity: 50 }] },
    }).ok).toBe(true);
    expect(run(engine, admin, "approve-50", {
      kind: "approve_request", orderId: ORDER, occurredAt: at(1),
    }).ok).toBe(true);
    const overLimitInvoice = invoice();
    expect(run(engine, finance, "invoice-51", {
      kind: "issue_invoice",
      orderId: ORDER,
      invoice: {
        ...overLimitInvoice,
        lines: [{ ...overLimitInvoice.lines[0]!, quantity: 51, lineTotalCents: 127500 }],
        amountCents: 127500,
      },
      occurredAt: at(2),
    })).toMatchObject({ ok: false, code: "validation_failed" });
    expect(run(engine, finance, "invoice-quantity-changed", {
      kind: "issue_invoice",
      orderId: ORDER,
      invoice: {
        ...overLimitInvoice,
        lines: [{ ...overLimitInvoice.lines[0]!, quantity: 49, lineTotalCents: 122500 }],
        amountCents: 122500,
      },
      occurredAt: at(2),
    })).toMatchObject({ ok: false, code: "validation_failed" });
    expect(engine.getForActor(buyer, ORDER)?.stage).toBe("approved");
  });

  it("cannot invoice, verify, hand off or fulfill an unapproved buyer request", () => {
    const engine = new InMemoryOrderWorkflowEngine();
    expect(run(engine, buyer, "request", request()).ok).toBe(true);

    expect(run(engine, finance, "premature-invoice", {
      kind: "issue_invoice",
      orderId: ORDER,
      invoice: invoice(),
      occurredAt: at(2),
    })).toMatchObject({ ok: false, code: "approval_required" });
    expect(run(engine, admin, "premature-handoff", {
      kind: "queue_supplier_handoff",
      orderId: ORDER,
      handoffRef: "handoff_pack04_0001",
      supplierId: SUPPLIER_ID,
      occurredAt: at(3),
    })).toMatchObject({ ok: false, code: "approval_required" });
    expect(run(engine, supplier, "premature-fulfillment", {
      kind: "start_fulfillment",
      orderId: ORDER,
      occurredAt: at(4),
    })).toMatchObject({ ok: false, code: "not_permitted" });

    expect(engine.getForActor(buyer, ORDER)?.stage).toBe("request_pending");
    expect(engine.getForActor(buyer, ORDER)?.supplierHandoff).toBeNull();
  });

  it("requires committed verification and an explicit supplier release before fulfillment", () => {
    const engine = new InMemoryOrderWorkflowEngine();
    expect(run(engine, buyer, "request", request()).ok).toBe(true);
    expect(run(engine, admin, "approve", {
      kind: "approve_request", orderId: ORDER, occurredAt: at(1),
    }).ok).toBe(true);
    expect(run(engine, finance, "invoice", {
      kind: "issue_invoice", orderId: ORDER, invoice: invoice(), occurredAt: at(2),
    }).ok).toBe(true);

    expect(run(engine, admin, "handoff-before-payment", {
      kind: "queue_supplier_handoff",
      orderId: ORDER,
      handoffRef: "handoff_pack04_0001",
      supplierId: SUPPLIER_ID,
      occurredAt: at(3),
    })).toMatchObject({ ok: false, code: "payment_verification_required" });

    expect(run(engine, buyer, "evidence", {
      kind: "submit_payment_evidence", orderId: ORDER, report: report(), occurredAt: at(4),
    }).ok).toBe(true);
    expect(run(engine, admin, "handoff-with-proof-only", {
      kind: "queue_supplier_handoff",
      orderId: ORDER,
      handoffRef: "handoff_pack04_0001",
      supplierId: SUPPLIER_ID,
      occurredAt: at(5),
    })).toMatchObject({ ok: false, code: "payment_verification_required" });
  });

  it("absorbs identical retries, refuses changed payloads, and audits every attempt", () => {
    const engine = new InMemoryOrderWorkflowEngine();
    const command = request();
    const first = run(engine, buyer, "request", command);
    const replay = run(engine, buyer, "request", command);
    const conflict = run(engine, buyer, "request", {
      ...command,
      request: { ...command.request, lines: [{ sku: "SKU-PACK04-01", quantity: 3 }] },
    });

    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(replay).toMatchObject({ ok: true, replayed: true });
    expect(conflict).toMatchObject({ ok: false, code: "idempotency_conflict" });
    expect(engine.getForActor(buyer, ORDER)?.version).toBe(1);
    expect(engine.audits().map((entry) => entry.outcome)).toEqual([
      "accepted", "replayed", "refused",
    ]);
  });

  it("keeps colon-bearing scopes and idempotency keys structurally distinct", () => {
    const engine = new InMemoryOrderWorkflowEngine();
    const segmentedBuyer: OrderActor = { actorId: "buyer_pack04:segment", role: "buyer" };
    const plainBuyer: OrderActor = { actorId: "buyer_pack04", role: "buyer" };
    const first = request({ kind: "personal", buyerId: segmentedBuyer.actorId });
    const second = request({ kind: "personal", buyerId: plainBuyer.actorId });

    expect(engine.execute(segmentedBuyer, "shared_key_0000001", {
      ...first,
      orderId: "order_scope_collision_0001",
      request: { ...first.request, requestRef: "request_scope_collision_0001" },
    })).toMatchObject({ ok: true, replayed: false });
    expect(engine.execute(plainBuyer, "segment:shared_key_0000001", {
      ...second,
      orderId: "order_scope_collision_0002",
      request: { ...second.request, requestRef: "request_scope_collision_0002" },
    })).toMatchObject({ ok: true, replayed: false });
    expect(engine.audits()).toHaveLength(2);
  });

  it("enforces the Trust Dial and supplier-scoped authority", () => {
    const engine = new InMemoryOrderWorkflowEngine();
    expect(run(engine, buyer, "request", request()).ok).toBe(true);
    const noApproval: OrderActor = { actorId: admin.actorId, role: "admin", trustMode: "ask" };
    expect(run(engine, noApproval, "approve-no-human", {
      kind: "approve_request", orderId: ORDER, occurredAt: at(1),
    })).toMatchObject({ ok: false, code: "trust_approval_required" });
    const never: OrderActor = { ...admin, trustMode: "never" };
    expect(run(engine, never, "approve-never", {
      kind: "approve_request", orderId: ORDER, occurredAt: at(1),
    })).toMatchObject({ ok: false, code: "trust_dial_refused" });

    const complete = new InMemoryOrderWorkflowEngine();
    throughPaymentVerification(complete);
    expect(run(complete, admin, "handoff-queue", {
      kind: "queue_supplier_handoff",
      orderId: ORDER,
      handoffRef: "handoff_pack04_0001",
      supplierId: SUPPLIER_ID,
      occurredAt: at(6),
    }).ok).toBe(true);
    expect(run(complete, admin, "handoff-release", {
      kind: "release_supplier_handoff", orderId: ORDER, occurredAt: at(7),
    }).ok).toBe(true);
    const wrongSupplier: OrderActor = {
      ...supplier,
      actorId: "supplier_user_other_0001",
      supplierId: "supplier_other_0001",
    };
    expect(run(complete, wrongSupplier, "wrong-supplier", {
      kind: "start_fulfillment", orderId: ORDER, occurredAt: at(8),
    })).toMatchObject({ ok: false, code: "not_permitted" });
    expect(run(complete, supplier, "right-supplier", {
      kind: "start_fulfillment", orderId: ORDER, occurredAt: at(8),
    }).ok).toBe(true);
    expect(run(complete, supplier, "ship-without-tracking", {
      kind: "mark_shipped", orderId: ORDER, occurredAt: at(9),
    })).toMatchObject({ ok: false, code: "tracking_required" });
  });

  it("rejects mismatched payment evidence without changing the order", () => {
    const engine = new InMemoryOrderWorkflowEngine();
    expect(run(engine, buyer, "request", request()).ok).toBe(true);
    expect(run(engine, admin, "approve", {
      kind: "approve_request", orderId: ORDER, occurredAt: at(1),
    }).ok).toBe(true);
    expect(run(engine, finance, "invoice", {
      kind: "issue_invoice", orderId: ORDER, invoice: invoice(), occurredAt: at(2),
    }).ok).toBe(true);

    expect(run(engine, buyer, "bad-evidence", {
      kind: "submit_payment_evidence",
      orderId: ORDER,
      report: { ...report(), amountCents: 1 },
      occurredAt: at(4),
    })).toMatchObject({ ok: false, code: "validation_failed" });
    expect(engine.getForActor(buyer, ORDER)?.stage).toBe("invoiced");
    expect(engine.getForActor(buyer, ORDER)?.paymentEvidence).toEqual([]);
  });
});
