import { describe, expect, it, vi } from "vitest";
import type {
  AdminCrmSupplierOperationsSnapshot,
  QueuedAdminCrmAction,
  TrustDialMode,
} from "@shared/research/admin-crm-supplier-operations";
import {
  AdminCrmRefusal,
  createAdminCrmSupplierOperationsService,
  type AdminCrmSupplierOperationsRepository,
  type QueueActionRecord,
} from "./service";

const emptySnapshot: AdminCrmSupplierOperationsSnapshot = {
  generatedAt: "2026-08-12T12:00:00.000Z",
  trustDial: "queue",
  buyerQueue: [], organizations: [], customers: [], availabilityReviews: [], priceReviews: [], invoices: [],
  supplierAssignments: [], fulfillment: [], exceptions: [], audit: [], intake: [],
};

function repository(mode: TrustDialMode = "queue", snapshot: unknown = emptySnapshot) {
  const writes: QueueActionRecord[] = [];
  const repo: AdminCrmSupplierOperationsRepository = {
    readSnapshot: vi.fn(async () => snapshot as AdminCrmSupplierOperationsSnapshot),
    readTrustDial: vi.fn(async () => mode),
    queueActionWithAudit: vi.fn(async (record) => {
      writes.push(record);
      return {
        queueId: "queue_001",
        action: record.input.action,
        targetType: record.input.targetType,
        targetId: record.input.targetId,
        state: record.state,
        trustDial: record.trustDial,
        createdAt: record.createdAt,
        idempotentReplay: false,
      } satisfies QueuedAdminCrmAction;
    }),
  };
  return { repo, writes };
}

const input = {
  action: "supplier_assignment" as const,
  targetType: "order",
  targetId: "order_1001",
  reason: "Assign after a human checks inventory evidence.",
  idempotencyKey: "pack05:order_1001:supplier:v1",
};

describe("Admin CRM supplier operations service", () => {
  it("queues consequential actions and writes audit atomically through one repository method", async () => {
    const { repo, writes } = repository("queue");
    const service = createAdminCrmSupplierOperationsService(repo, () => "2026-08-12T13:00:00.000Z");
    const result = await service.queueAction("admin_001", input);

    expect(result.state).toBe("queued");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ actorId: "admin_001", trustDial: "queue", state: "queued" });
  });

  it("turns ask into awaiting approval and still does not execute", async () => {
    const { repo } = repository("ask");
    const service = createAdminCrmSupplierOperationsService(repo);
    await expect(service.queueAction("admin_001", input)).resolves.toMatchObject({ state: "awaiting_approval" });
  });

  it("refuses never without creating a queue or audit write", async () => {
    const { repo, writes } = repository("never");
    const service = createAdminCrmSupplierOperationsService(repo);
    await expect(service.queueAction("admin_001", input)).rejects.toMatchObject({ code: "trust_dial_never" });
    expect(writes).toHaveLength(0);
  });

  it("refuses restricted health or clinical fields in the operational projection", async () => {
    const { repo } = repository("queue", { ...emptySnapshot, customerHealth: "must not render" });
    const service = createAdminCrmSupplierOperationsService(repo);
    await expect(service.readSnapshot("admin_001")).rejects.toBeInstanceOf(AdminCrmRefusal);
    await expect(service.readSnapshot("admin_001")).rejects.toMatchObject({ code: "unsafe_projection" });
  });

  it("requires meaningful reasons and idempotency keys", async () => {
    const { repo } = repository();
    const service = createAdminCrmSupplierOperationsService(repo);
    await expect(service.queueAction("admin_001", { ...input, reason: "short" })).rejects.toMatchObject({
      code: "invalid_request",
    });
    await expect(service.queueAction("admin_001", { ...input, idempotencyKey: "bad" })).rejects.toMatchObject({
      code: "invalid_request",
    });
  });
});
