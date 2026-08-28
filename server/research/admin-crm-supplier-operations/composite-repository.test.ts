import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_OPERATIONAL_CONTROL_AREAS,
  ADMIN_OPERATIONS_SOURCE_KEYS,
  type AdminOperationalControlStatus,
} from "@shared/research/admin-crm-supplier-operations";
import { FULFILLMENT_STATES } from "@shared/research/fulfillment/contracts";
import {
  createCompositeAdminCrmSupplierOperationsRepository,
  createUnavailableAdminCrmSupplierOperationsRepository,
} from "./composite-repository";

const at = "2026-08-28T03:30:00.000Z";

function control(area: (typeof ADMIN_OPERATIONAL_CONTROL_AREAS)[number]): AdminOperationalControlStatus {
  return {
    area,
    label: area.replaceAll("_", " "),
    state: "unknown",
    summary: "Evidence has not been connected.",
    ownerLabel: null,
    dueAt: null,
    nextAction: "Connect an authoritative source.",
    evidenceUpdatedAt: null,
  };
}

describe("composite Admin CRM supplier operations repository", () => {
  it("mounts safely with every absent reader explicit and actions disabled", async () => {
    const repository = createUnavailableAdminCrmSupplierOperationsRepository(() => at);
    const snapshot = await repository.readSnapshot("admin_001");

    expect(snapshot.trustDial).toBe("never");
    expect(Object.keys(snapshot.sources).sort()).toEqual([...ADMIN_OPERATIONS_SOURCE_KEYS].sort());
    for (const key of ADMIN_OPERATIONS_SOURCE_KEYS) {
      expect(snapshot.sources[key]).toMatchObject({
        availability: "unavailable",
        code: "source_not_configured",
        provenance: `admin_ops.${key}`,
        checkedAt: at,
        items: null,
      });
    }
  });

  it("preserves the distinction between authoritative empty, partial, and unavailable", async () => {
    const readBuyerQueue = vi.fn(async () => ({ availability: "available" as const, items: [], checkedAt: at }));
    const repository = createCompositeAdminCrmSupplierOperationsRepository({
      sources: {
        buyerQueue: { read: readBuyerQueue },
        organizations: {
          read: async () => ({
            availability: "partial",
            checkedAt: at,
            items: [{
              organizationId: "org_001",
              legalName: "Synthetic Research Group",
              accountState: "diligence",
              buyerCount: 1,
              ownerLabel: null,
              paymentTermsLabel: null,
              openInvoiceCents: 0,
              currency: "USD",
              updatedAt: at,
            }],
          }),
        },
        customers: {
          read: async () => {
            throw new Error("raw database host and credential detail must not cross the boundary");
          },
        },
      },
    }, () => at);

    const snapshot = await repository.readSnapshot("admin_001");
    expect(snapshot.sources.buyerQueue.availability).toBe("available");
    expect(snapshot.sources.buyerQueue.items).toEqual([]);
    expect(snapshot.sources.organizations).toMatchObject({ availability: "partial", code: "source_partial" });
    expect(snapshot.sources.organizations.items).toHaveLength(1);
    expect(snapshot.sources.customers).toMatchObject({
      availability: "unavailable",
      code: "source_read_failed",
      message: "customers source is unavailable in this environment.",
      items: null,
    });
    expect(JSON.stringify(snapshot)).not.toContain("database host");
    expect(snapshot.sources.customers.items).toBeNull();
    expect(readBuyerQueue).toHaveBeenCalledWith("admin_001");
  });

  it("drops contradictory records from a reader that declares itself unavailable", async () => {
    const repository = createCompositeAdminCrmSupplierOperationsRepository({
      sources: {
        exceptions: {
          read: async () => ({
            availability: "unavailable",
            checkedAt: at,
            items: [{
              exceptionId: "should_not_cross",
              domain: "inventory",
              referenceId: "lot_1",
              title: "Contradictory stale record",
              severity: "high",
              state: "open",
              ownerLabel: null,
              openedAt: at,
              dueAt: null,
            }],
          } as any),
        },
      },
    }, () => at);

    const snapshot = await repository.readSnapshot("admin_001");
    expect(snapshot.sources.exceptions).toMatchObject({
      availability: "unavailable",
      code: "source_unavailable",
      items: null,
    });
  });

  it("fails one malformed reader closed without erasing healthy source evidence", async () => {
    const repository = createCompositeAdminCrmSupplierOperationsRepository({
      sources: {
        buyerQueue: { read: async () => ({ availability: "available", items: [], checkedAt: at }) },
        invoices: {
          read: async () => ({
            availability: "available",
            items: [{ invoiceId: "missing_required_evidence" }],
            checkedAt: at,
          } as any),
        },
      },
    }, () => at);

    const snapshot = await repository.readSnapshot("admin_001");
    expect(snapshot.sources.buyerQueue).toMatchObject({ availability: "available", items: [] });
    expect(snapshot.sources.invoices).toMatchObject({
      availability: "unavailable",
      code: "source_contract_invalid",
      items: null,
    });
  });

  it("does not synthesize freshness for configured readers with invalid timestamps", async () => {
    const repository = createCompositeAdminCrmSupplierOperationsRepository({
      sources: {
        reports: {
          read: async () => ({ availability: "available", items: [] } as any),
        },
      },
    }, () => at);
    const snapshot = await repository.readSnapshot("admin_001");
    expect(snapshot.sources.reports).toMatchObject({
      availability: "unavailable",
      code: "source_contract_invalid",
      checkedAt: at,
      items: null,
    });
  });

  it("accepts every canonical fulfillment state through the read-only projection", async () => {
    const repository = createCompositeAdminCrmSupplierOperationsRepository({
      sources: {
        fulfillment: {
          read: async () => ({
            availability: "available",
            checkedAt: at,
            items: FULFILLMENT_STATES.map((state, index) => ({
              fulfillmentId: `fulfillment_${index}`,
              orderId: `order_${index}`,
              orderReference: `XRO-EXAMPLE-${index}`,
              supplierLabel: "Example Supplier",
              state,
              carrier: "Example Carrier",
              trackingNumber: "SYNTHETIC-TRACKING",
              lastTrackingAt: at,
              targetShipAt: at,
            })),
          }),
        },
      },
    }, () => at);
    const snapshot = await repository.readSnapshot("admin_001");
    expect(snapshot.sources.fulfillment).toMatchObject({ availability: "available" });
    expect(snapshot.sources.fulfillment.items?.map((item) => item.state)).toEqual(FULFILLMENT_STATES);
  });

  it("downgrades incomplete control-plane evidence and rejects ambiguous duplicates", async () => {
    const partialRepository = createCompositeAdminCrmSupplierOperationsRepository({
      sources: {
        controls: {
          read: async () => ({ availability: "available", items: [control("inventory")], checkedAt: at }),
        },
      },
    }, () => at);
    const partial = await partialRepository.readSnapshot("admin_001");
    expect(partial.sources.controls).toMatchObject({
      availability: "partial",
      code: "controls_evidence_partial",
    });
    expect(partial.sources.controls.items).toHaveLength(1);

    const ambiguousRepository = createCompositeAdminCrmSupplierOperationsRepository({
      sources: {
        controls: {
          read: async () => ({
            availability: "partial",
            items: [control("inventory"), control("inventory")],
            checkedAt: at,
          }),
        },
      },
    }, () => at);
    const ambiguous = await ambiguousRepository.readSnapshot("admin_001");
    expect(ambiguous.sources.controls).toMatchObject({
      availability: "unavailable",
      code: "controls_evidence_ambiguous",
      items: null,
    });
  });

  it("passes review records only through the durable atomic recommendation store", async () => {
    const recordRecommendationWithAudit = vi.fn(async (record: any) => ({
      recordId: "recommendation_001",
      action: record.input.action,
      targetType: record.input.targetType,
      targetId: record.input.targetId,
      recordState: record.recordState,
      executionState: "not_executed" as const,
      externalEffect: false as const,
      executor: null,
      requiresHumanApproval: true as const,
      configuredTrustDial: record.configuredTrustDial,
      evidenceSource: record.evidenceSource,
      evidenceCheckedAt: record.evidenceCheckedAt,
      createdAt: record.createdAt,
      idempotentReplay: false,
    }));
    const repository = createCompositeAdminCrmSupplierOperationsRepository({
      trustDial: {
        readWorkspaceMode: async () => "queue",
        readActionMode: async () => "ask",
      },
      recommendationStore: { recordRecommendationWithAudit },
    }, () => at);

    expect((await repository.readSnapshot("admin_001")).trustDial).toBe("queue");
    expect(await repository.readTrustDial("admin_001", "supplier_assignment")).toBe("ask");
    await repository.recordRecommendationWithAudit({
      actorId: "admin_001",
      configuredTrustDial: "ask",
      input: {
        action: "supplier_assignment",
        targetType: "supplier_assignment",
        targetId: "assignment_001",
        reason: "Queue a human review of supplier readiness evidence.",
        idempotencyKey: "ops:assignment_001:review:v1",
      },
      recordState: "awaiting_human_review",
      executionState: "not_executed",
      externalEffect: false,
      executor: null,
      requiresHumanApproval: true,
      evidenceSource: "supplierAssignments",
      evidenceCheckedAt: at,
      createdAt: at,
    });
    expect(recordRecommendationWithAudit).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the recommendation store or snapshot clock is unavailable", async () => {
    const repository = createUnavailableAdminCrmSupplierOperationsRepository(() => at);
    await expect(repository.recordRecommendationWithAudit({} as any)).rejects.toMatchObject({
      code: "operation_unavailable",
    });

    const invalidClock = createUnavailableAdminCrmSupplierOperationsRepository(() => "not-a-timestamp");
    await expect(invalidClock.readSnapshot("admin_001")).rejects.toMatchObject({
      code: "source_evidence_invalid",
    });
  });
});
