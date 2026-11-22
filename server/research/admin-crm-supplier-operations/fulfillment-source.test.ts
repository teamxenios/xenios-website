import { describe, expect, it, vi } from "vitest";
import type { FulfillmentActor, FulfillmentAssignmentView, TransitionFulfillmentInput } from "@shared/research/fulfillment/contracts";
import type { FulfillmentOrderLineagePort } from "@shared/research/supplier/fulfillment-lineage";
import { createInMemoryFulfillmentStore } from "../fulfillment/in-memory";
import { createFulfillmentOperationsService } from "../fulfillment/service";
import { createPaidOrderReleaseGate } from "../fulfillment/release-gate";
import { createCompositeAdminCrmSupplierOperationsRepository } from "./composite-repository";
import { createCanonicalFulfillmentSources, type CanonicalFulfillmentSourceDependencies } from "./fulfillment-source";

const ADMIN = { actorId: "11111111-1111-4111-8111-111111111111", kind: "internal", role: "operations_admin" } as const;
const OTHER_ADMIN = { ...ADMIN, actorId: "91111111-1111-4111-8111-111111111111" };
const SUPPLIER_ID = "33333333-3333-4333-8333-333333333333";
const SUPPLIER = { actorId: "22222222-2222-4222-8222-222222222222", kind: "supplier", role: "supplier_operator", supplierId: SUPPLIER_ID } as const;
const FULFILLMENT_ID = "55555555-5555-4555-8555-555555555555";
const ORDER_ID = "95555555-5555-4555-8555-555555555555";
const REFERENCE = "XRO-SYNTHETIC-1001";
const AT = "2026-11-18T12:00:00.000Z";

function fixture(paid = true) {
  const store = createInMemoryFulfillmentStore();
  store.seedSupplier({ supplierId: SUPPLIER_ID, supplierLabel: "Synthetic Supplier" });
  store.seedFulfillmentOrder({
    fulfillmentOrderId: FULFILLMENT_ID, orderReference: REFERENCE,
    memberId: "99999999-9999-4999-8999-999999999999", paid,
    recipient: { name: "NEVER-EXPOSE-RECIPIENT", addressLine1: "NEVER-EXPOSE-ADDRESS", addressLine2: null,
      city: "Austin", state: "TX", postalCode: "78701", country: "US", phone: "NEVER-EXPOSE-PHONE" },
    shippingService: "ground", handlingProfile: "ambient",
    lines: [{ lineId: "66666666-6666-4666-8666-666666666666", sku: "SYNTHETIC-SKU", quantity: 2,
      lotId: "77777777-7777-4777-8777-777777777777", lotCode: "SYNTHETIC-LOT" }],
  });
  const service = createFulfillmentOperationsService(store, {
    paidOrderRelease: createPaidOrderReleaseGate(id => store.isOrderPaid(id)),
  });
  const lineage: FulfillmentOrderLineagePort = {
    read: vi.fn(async actor => ({ actorId: actor.actorId,
      rows: [{ fulfillmentOrderId: FULFILLMENT_ID, orderId: ORDER_ID, orderReference: REFERENCE }] })),
  };
  const reads = vi.fn(query => service.listAssignments(query));
  const dependencies: CanonicalFulfillmentSourceDependencies = {
    fulfillment: { listAssignments: reads }, lineage,
    resolveActor: vi.fn(() => ADMIN), now: () => AT,
  };
  const assign = () => service.assign({
    actor: ADMIN, supplierId: SUPPLIER_ID, supplierOfferId: "44444444-4444-4444-8444-444444444444",
    fulfillmentOrderId: FULFILLMENT_ID, allocations: [{ fulfillmentLineId: "66666666-6666-4666-8666-666666666666",
      reservationId: "77777777-7777-4777-8777-777777777777", reservationAllocationId: "88888888-8888-4888-8888-888888888888" }],
    expectedVersion: 0, idempotencyKey: "assign:synthetic:1", at: AT,
  });
  return { store, service, dependencies, reads, lineage, assign };
}

async function assignedFixture() {
  const f = fixture();
  const assigned = await f.assign();
  let version = assigned.version;
  const step = async (action: TransitionFulfillmentInput["action"], extra: Partial<TransitionFulfillmentInput> = {}) => {
    const result = await f.service.transition({ actor: SUPPLIER, assignmentId: assigned.assignmentId,
      action, expectedVersion: version, idempotencyKey: `step:${version}:${action}`, at: AT, ...extra });
    version = result.version;
    return result;
  };
  return { ...f, assigned, step };
}

describe("canonical fulfillment source adapters", () => {
  it("feeds the existing CRM contract from paid canonical assignments with real order lineage", async () => {
    const f = await assignedFixture();
    const sources = createCanonicalFulfillmentSources(f.dependencies);
    const repository = createCompositeAdminCrmSupplierOperationsRepository({ sources }, () => AT);
    const snapshot = await repository.readSnapshot(ADMIN.actorId);
    expect(snapshot.sources.supplierAssignments).toMatchObject({ availability: "partial", code: "source_partial", checkedAt: AT });
    expect(snapshot.sources.supplierAssignments.items).toEqual([{
      assignmentId: f.assigned.assignmentId, orderId: ORDER_ID, orderReference: REFERENCE,
      supplierId: SUPPLIER_ID, supplierLabel: "Synthetic Supplier", state: "assigned", lineCount: 1,
      targetShipAt: null, updatedAt: AT,
    }]);
    expect(snapshot.sources.fulfillment.items).toEqual([{
      fulfillmentId: FULFILLMENT_ID, orderId: ORDER_ID, orderReference: REFERENCE,
      supplierLabel: "Synthetic Supplier", state: "assigned", carrier: null, trackingNumber: null,
      lastTrackingAt: null, targetShipAt: null,
    }]);
    expect(FULFILLMENT_ID).not.toBe(ORDER_ID);
    expect(f.reads).toHaveBeenCalledTimes(1);
    expect(f.reads).toHaveBeenCalledWith({ actor: ADMIN, limit: 100 });
    expect(f.lineage.read).toHaveBeenCalledWith(ADMIN, [FULFILLMENT_ID]);
    expect(snapshot.trustDial).toBe("never");
    expect(snapshot.sources.priceReviews.availability).toBe("unavailable");
    expect(snapshot.sources.controls.availability).toBe("unavailable");
    expect(JSON.stringify(snapshot)).not.toContain("NEVER-EXPOSE");
  });

  it("never bypasses the canonical paid-order gate or turns a bounded empty read into zero-total evidence", async () => {
    const f = fixture(false);
    await expect(f.assign()).rejects.toThrow(/ORDER_NOT_PAID/u);
    f.dependencies.lineage = { read: async actor => ({ actorId: actor.actorId, rows: [] }) };
    const sources = createCanonicalFulfillmentSources(f.dependencies);
    expect(await sources.fulfillment.read(ADMIN.actorId)).toEqual({ availability: "partial", checkedAt: AT, items: [] });
    expect(await f.service.listAssignments({ actor: ADMIN })).toEqual([]);
  });

  it("keeps tracking-created distinct from shipped and does not invent tracking-event timestamps", async () => {
    const f = await assignedFixture();
    await f.step("acknowledge"); await f.step("start_picking"); await f.step("pack", { labelReference: "SYNTHETIC-LABEL" });
    await f.step("record_tracking", { labelReference: "SYNTHETIC-LABEL", carrier: "Synthetic Carrier", service: "ground", trackingReference: "SYNTHETIC-TRACKING" });
    const sources = createCanonicalFulfillmentSources(f.dependencies);
    expect(await sources.fulfillment.read(ADMIN.actorId)).toMatchObject({ items: [{ state: "tracking_created", trackingNumber: "SYNTHETIC-TRACKING", lastTrackingAt: null }] });
    await f.step("ship");
    expect(await sources.fulfillment.read(ADMIN.actorId)).toMatchObject({ items: [{ state: "shipped", lastTrackingAt: null }] });
    expect(f.reads).toHaveBeenCalledTimes(2);
  });

  it("keeps terminal fulfillment history out of the current supplier-assignment queue", async () => {
    const f = await assignedFixture();
    await f.service.transition({ actor: ADMIN, assignmentId: f.assigned.assignmentId, action: "cancel",
      expectedVersion: 1, idempotencyKey: "cancel:synthetic:1", reason: "Synthetic cancellation", at: AT });
    const sources = createCanonicalFulfillmentSources(f.dependencies);
    const [assignments, fulfillment] = await Promise.all([sources.supplierAssignments.read(ADMIN.actorId), sources.fulfillment.read(ADMIN.actorId)]);
    expect(assignments).toMatchObject({ availability: "partial", items: [] });
    expect(fulfillment).toMatchObject({ availability: "partial", items: [{ state: "cancelled" }] });
  });

  it.each(["fulfillment", "lineage", "resolveActor"] as const)("does not query when %s is not connected", async missing => {
    const f = await assignedFixture();
    delete f.dependencies[missing];
    expect(await createCanonicalFulfillmentSources(f.dependencies).fulfillment.read(ADMIN.actorId))
      .toEqual({ availability: "unavailable", checkedAt: AT, items: null });
    expect(f.reads).not.toHaveBeenCalled();
  });

  it.each([null, SUPPLIER, OTHER_ADMIN, { ...ADMIN, role: "customer" }] as const)("refuses absent, supplier, wrong-subject or unsupported actors", async actor => {
    const f = await assignedFixture();
    f.dependencies.resolveActor = () => actor as FulfillmentActor | null;
    expect(await createCanonicalFulfillmentSources(f.dependencies).fulfillment.read(ADMIN.actorId))
      .toEqual({ availability: "unavailable", checkedAt: AT, items: null });
    expect(f.reads).not.toHaveBeenCalled();
  });

  it("refuses a malformed actor id before any authority/source lookup", async () => {
    const f = await assignedFixture();
    expect(await createCanonicalFulfillmentSources(f.dependencies).fulfillment.read("not-an-actor"))
      .toMatchObject({ availability: "unavailable", items: null });
    expect(f.dependencies.resolveActor).not.toHaveBeenCalled();
    expect(f.reads).not.toHaveBeenCalled();
  });

  it("discards an in-flight snapshot when current actor access is revoked during lineage resolution", async () => {
    const f = await assignedFixture();
    let current: FulfillmentActor | null = ADMIN;
    let finish!: (value: Awaited<ReturnType<FulfillmentOrderLineagePort["read"]>>) => void;
    let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    f.dependencies.resolveActor = () => current;
    f.dependencies.lineage = { read: () => { entered(); return new Promise(resolve => { finish = resolve; }); } };
    const result = createCanonicalFulfillmentSources(f.dependencies).fulfillment.read(ADMIN.actorId);
    await ready;
    current = null;
    finish({ actorId: ADMIN.actorId, rows: [{ fulfillmentOrderId: FULFILLMENT_ID, orderId: ORDER_ID, orderReference: REFERENCE }] });
    expect(await result).toEqual({ availability: "unavailable", checkedAt: AT, items: null });
  });

  it.each(["missing", "duplicate", "unknown", "wrong_reference", "wrong_actor", "malformed_order", "extra_field"] as const)("refuses %s canonical lineage instead of guessing an order", async shape => {
    const f = await assignedFixture();
    const row = { fulfillmentOrderId: FULFILLMENT_ID, orderId: ORDER_ID, orderReference: REFERENCE };
    const response: Record<string, unknown> = { actorId: ADMIN.actorId, rows: [row] };
    if (shape === "missing") response.rows = [];
    if (shape === "duplicate") response.rows = [row, row];
    if (shape === "unknown") response.rows = [{ ...row, fulfillmentOrderId: ORDER_ID }];
    if (shape === "wrong_reference") response.rows = [{ ...row, orderReference: "XRO-UNRELATED" }];
    if (shape === "wrong_actor") response.actorId = OTHER_ADMIN.actorId;
    if (shape === "malformed_order") response.rows = [{ ...row, orderId: "not-a-canonical-order" }];
    if (shape === "extra_field") response.privateContact = "NEVER-EXPOSE-LINEAGE";
    f.dependencies.lineage = { read: async () => response as unknown as Awaited<ReturnType<FulfillmentOrderLineagePort["read"]>> };
    const result = await createCanonicalFulfillmentSources(f.dependencies).fulfillment.read(ADMIN.actorId);
    expect(result).toEqual({ availability: "unavailable", checkedAt: AT, items: null });
    expect(JSON.stringify(result)).not.toContain("NEVER-EXPOSE");
  });

  it("strips private and unsupported fields from overwide canonical queue records", async () => {
    const f = await assignedFixture();
    const [row] = await f.service.listAssignments({ actor: ADMIN });
    f.dependencies.fulfillment = { listAssignments: async () => [{ ...row, customerEmail: "NEVER-EXPOSE-EMAIL",
      supplierCostCents: 12345, affiliate: { token: "NEVER-EXPOSE-AFFILIATE" }, clinical: "NEVER-EXPOSE-CLINICAL",
      lines: row.lines.map(line => ({ ...line, cost: "NEVER-EXPOSE-COST" })) }] };
    const sources = createCanonicalFulfillmentSources(f.dependencies);
    const result = await sources.fulfillment.read(ADMIN.actorId);
    expect(result).toMatchObject({ availability: "partial", items: [{ orderId: ORDER_ID }] });
    const output = JSON.stringify(result);
    for (const field of ["NEVER-EXPOSE", "recipient", "address", "phone", "clinical", "affiliate", "supplierCost", "lotCode", "sku"]) expect(output).not.toContain(field);
  });

  it.each(["duplicate_assignment", "duplicate_fulfillment", "duplicate_line", "malformed_state", "too_many", "bad_timestamp"] as const)("rejects %s queue evidence", async shape => {
    const f = await assignedFixture();
    const [row] = await f.service.listAssignments({ actor: ADMIN });
    let rows: unknown[] = [row];
    if (shape === "duplicate_assignment") rows = [row, { ...row, fulfillmentOrderId: ORDER_ID }];
    if (shape === "duplicate_fulfillment") rows = [row, { ...row, assignmentId: ORDER_ID }];
    if (shape === "duplicate_line") rows = [{ ...row, lines: [row.lines[0], row.lines[0]] }];
    if (shape === "malformed_state") rows = [{ ...row, state: "invented_ready" }];
    if (shape === "too_many") { rows = [row, row]; f.dependencies.limit = 1; }
    if (shape === "bad_timestamp") rows = [{ ...row, updatedAt: "yesterday" }];
    f.dependencies.fulfillment = { listAssignments: async () => rows as FulfillmentAssignmentView[] };
    expect(await createCanonicalFulfillmentSources(f.dependencies).fulfillment.read(ADMIN.actorId))
      .toEqual({ availability: "unavailable", checkedAt: AT, items: null });
  });

  it("does not expose thrown upstream errors or replace failed reads with empty arrays", async () => {
    const f = await assignedFixture();
    f.dependencies.fulfillment = { listAssignments: async () => { throw new Error("NEVER-EXPOSE-DATABASE-DETAIL"); } };
    expect(await createCanonicalFulfillmentSources(f.dependencies).fulfillment.read(ADMIN.actorId))
      .toEqual({ availability: "unavailable", checkedAt: AT, items: null });
  });

  it.each([0, 201, 1.5, Number.NaN])("refuses an invalid bounded limit %s", limit => {
    expect(() => createCanonicalFulfillmentSources({ limit })).toThrow(/between 1 and 200/u);
  });
});
