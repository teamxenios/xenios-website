import { describe, expect, it, vi } from "vitest";
import type {
  AdminCrmActionRecommendation,
  AdminCrmSupplierOperationsSnapshot,
  AdminOperationsCollectionMap,
  AdminOperationsSourceKey,
  AdminOperationsSources,
  TrustDialMode,
} from "@shared/research/admin-crm-supplier-operations";
import { ADMIN_OPERATIONS_SOURCE_KEYS } from "@shared/research/admin-crm-supplier-operations";
import {
  AdminCrmRefusal,
  createAdminCrmSupplierOperationsService,
  type AdminCrmRecommendationRecord,
  type AdminCrmSupplierOperationsRepository,
} from "./service";

const at = "2026-08-12T12:00:00.000Z";

function available<Key extends AdminOperationsSourceKey>(
  key: Key,
  items: Array<AdminOperationsCollectionMap[Key]> = [],
) {
  return {
    availability: "available" as const,
    code: null,
    message: `${key} source is available.`,
    provenance: `admin_ops.${key}`,
    checkedAt: at,
    items,
  };
}

function sources(): AdminOperationsSources {
  const result = Object.fromEntries(ADMIN_OPERATIONS_SOURCE_KEYS.map((key) => [key, key === "controls" ? {
    availability: "unavailable" as const,
    code: "source_not_configured",
    message: "controls source is unavailable in this environment.",
    provenance: "admin_ops.controls",
    checkedAt: at,
    items: null,
  } : available(key)])) as AdminOperationsSources;
  result.supplierAssignments = available("supplierAssignments", [{
    assignmentId: "assignment_1001",
    orderId: "order_1001",
    orderReference: "XRO-EXAMPLE-1001",
    supplierId: "supplier_1001",
    supplierLabel: "Example Supplier",
    state: "proposed",
    lineCount: 1,
    targetShipAt: null,
    updatedAt: at,
  }]);
  return result;
}

const emptySnapshot: AdminCrmSupplierOperationsSnapshot = {
  generatedAt: at,
  trustDial: "queue",
  sources: sources(),
};

function repository(mode: TrustDialMode = "queue", snapshot: unknown = emptySnapshot) {
  const writes: AdminCrmRecommendationRecord[] = [];
  const repo: AdminCrmSupplierOperationsRepository = {
    readSnapshot: vi.fn(async () => snapshot as AdminCrmSupplierOperationsSnapshot),
    readTrustDial: vi.fn(async () => mode),
    recordRecommendationWithAudit: vi.fn(async (record) => {
      writes.push(record);
      return {
        recordId: "recommendation_001",
        action: record.input.action,
        targetType: record.input.targetType,
        targetId: record.input.targetId,
        recordState: record.recordState,
        executionState: "not_executed",
        externalEffect: false,
        executor: null,
        requiresHumanApproval: true,
        configuredTrustDial: record.configuredTrustDial,
        evidenceSource: record.evidenceSource,
        evidenceCheckedAt: record.evidenceCheckedAt,
        createdAt: record.createdAt,
        idempotentReplay: false,
      } satisfies AdminCrmActionRecommendation;
    }),
  };
  return { repo, writes };
}

const input = {
  action: "supplier_assignment" as const,
  targetType: "supplier_assignment",
  targetId: "assignment_1001",
  reason: "Record a review after a human checks inventory evidence.",
  idempotencyKey: "admin-crm:assignment_1001:supplier:v1",
};

describe("Admin CRM supplier operations service", () => {
  it.each(["auto", "queue", "ask"] as const)(
    "records %s recommendations as explicitly non-executing through one atomic port",
    async (mode) => {
      const { repo, writes } = repository(mode);
      const service = createAdminCrmSupplierOperationsService(repo, () => "2026-08-12T13:00:00.000Z");
      const result = await service.recordRecommendation("admin_001", input);

      expect(result).toMatchObject({
        recordState: mode === "ask" ? "awaiting_human_review" : "recorded",
        executionState: "not_executed",
        externalEffect: false,
        evidenceSource: "supplierAssignments",
        evidenceCheckedAt: at,
        executor: null,
        requiresHumanApproval: true,
        configuredTrustDial: mode,
      });
      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({
        actorId: "admin_001",
        configuredTrustDial: mode,
        executionState: "not_executed",
        externalEffect: false,
      });
    },
  );

  it("refuses never without writing a recommendation or audit", async () => {
    const { repo, writes } = repository("never");
    const service = createAdminCrmSupplierOperationsService(repo);
    await expect(service.recordRecommendation("admin_001", input)).rejects.toMatchObject({ code: "trust_dial_never" });
    expect(writes).toHaveLength(0);
  });

  it("enforces workspace-level never even when the action dial is permissive", async () => {
    const snapshot = { ...emptySnapshot, trustDial: "never" as const };
    const { repo, writes } = repository("queue", snapshot);
    const service = createAdminCrmSupplierOperationsService(repo);

    await expect(service.recordRecommendation("admin_001", input)).rejects.toMatchObject({
      code: "trust_dial_never",
    });
    expect(writes).toHaveLength(0);
  });

  it("binds each action to its one allowed target type", async () => {
    const { repo, writes } = repository();
    const service = createAdminCrmSupplierOperationsService(repo);
    await expect(service.recordRecommendation("admin_001", { ...input, targetType: "order" }))
      .rejects.toMatchObject({ code: "invalid_request" });
    expect(writes).toHaveLength(0);
  });

  it("refuses recommendations without visible authoritative target evidence", async () => {
    const disconnected: AdminCrmSupplierOperationsSnapshot = {
      ...emptySnapshot,
      sources: {
        ...emptySnapshot.sources,
        supplierAssignments: {
          availability: "unavailable",
          code: "source_not_configured",
          message: "supplierAssignments source is unavailable in this environment.",
          provenance: "admin_ops.supplierAssignments",
          checkedAt: at,
          items: null,
        },
      },
    };
    const { repo: disconnectedRepo, writes: disconnectedWrites } = repository("queue", disconnected);
    await expect(createAdminCrmSupplierOperationsService(disconnectedRepo).recordRecommendation("admin_001", input))
      .rejects.toMatchObject({ code: "operation_unavailable" });
    expect(disconnectedWrites).toHaveLength(0);

    const absent: AdminCrmSupplierOperationsSnapshot = {
      ...emptySnapshot,
      sources: { ...emptySnapshot.sources, supplierAssignments: available("supplierAssignments") },
    };
    const { repo: absentRepo, writes: absentWrites } = repository("queue", absent);
    await expect(createAdminCrmSupplierOperationsService(absentRepo).recordRecommendation("admin_001", input))
      .rejects.toMatchObject({ code: "operation_unavailable" });
    expect(absentWrites).toHaveLength(0);
  });

  it("grounds a recommendation in a visible partial-source record without claiming a total", async () => {
    const supplierSource = emptySnapshot.sources.supplierAssignments;
    if (supplierSource.availability === "unavailable") throw new Error("fixture");
    const partial: AdminCrmSupplierOperationsSnapshot = {
      ...emptySnapshot,
      sources: {
        ...emptySnapshot.sources,
        supplierAssignments: {
          ...supplierSource,
          availability: "partial",
          code: "source_partial",
          message: "supplierAssignments source returned partial evidence.",
        },
      },
    };
    const { repo } = repository("ask", partial);
    await expect(createAdminCrmSupplierOperationsService(repo).recordRecommendation("admin_001", input))
      .resolves.toMatchObject({
        recordState: "awaiting_human_review",
        evidenceSource: "supplierAssignments",
        evidenceCheckedAt: at,
        executionState: "not_executed",
      });
  });

  it("preserves the original non-executing receipt on an idempotent replay", async () => {
    const { repo } = repository("queue");
    vi.mocked(repo.recordRecommendationWithAudit).mockResolvedValueOnce({
      recordId: "recommendation_original",
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      recordState: "awaiting_human_review",
      executionState: "not_executed",
      externalEffect: false,
      executor: null,
      requiresHumanApproval: true,
      configuredTrustDial: "ask",
      evidenceSource: "supplierAssignments",
      evidenceCheckedAt: at,
      createdAt: "2026-08-12T11:00:00.000Z",
      idempotentReplay: true,
    });
    const result = await createAdminCrmSupplierOperationsService(repo, () => at)
      .recordRecommendation("admin_001", input);
    expect(result).toMatchObject({
      recordState: "awaiting_human_review",
      configuredTrustDial: "ask",
      idempotentReplay: true,
      executionState: "not_executed",
      evidenceSource: "supplierAssignments",
    });
  });

  it("refuses missing or contradictory source envelopes instead of projecting a false zero", async () => {
    const missing = { ...emptySnapshot, sources: { ...emptySnapshot.sources } } as any;
    delete missing.sources.fulfillment;
    const { repo: missingRepo } = repository("queue", missing);
    await expect(createAdminCrmSupplierOperationsService(missingRepo).readSnapshot("admin_001"))
      .rejects.toMatchObject({ code: "source_evidence_invalid" });

    const contradictory = {
      ...emptySnapshot,
      sources: {
        ...emptySnapshot.sources,
        exceptions: {
          availability: "unavailable",
          code: "exception_source_offline",
          message: "exceptions source is unavailable in this environment.",
          provenance: "admin_ops.exceptions",
          checkedAt: at,
          items: [],
        },
      },
    } as unknown as AdminCrmSupplierOperationsSnapshot;
    const { repo: contradictoryRepo } = repository("queue", contradictory);
    await expect(createAdminCrmSupplierOperationsService(contradictoryRepo).readSnapshot("admin_001"))
      .rejects.toMatchObject({ code: "source_evidence_invalid" });
  });

  it("refuses malformed records and non-static source messages", async () => {
    const malformed = {
      ...emptySnapshot,
      sources: {
        ...emptySnapshot.sources,
        invoices: { ...emptySnapshot.sources.invoices, items: [{ invoiceId: "only_one_field" }] },
      },
    } as unknown as AdminCrmSupplierOperationsSnapshot;
    const { repo: malformedRepo } = repository("queue", malformed);
    await expect(createAdminCrmSupplierOperationsService(malformedRepo).readSnapshot("admin_001"))
      .rejects.toMatchObject({ code: "source_evidence_invalid" });

    const rawMessage = {
      ...emptySnapshot,
      sources: {
        ...emptySnapshot.sources,
        customers: { ...emptySnapshot.sources.customers, message: "database host credential failure" },
      },
    };
    const { repo: rawMessageRepo } = repository("queue", rawMessage);
    await expect(createAdminCrmSupplierOperationsService(rawMessageRepo).readSnapshot("admin_001"))
      .rejects.toMatchObject({ code: "source_evidence_invalid" });
  });

  it("refuses restricted projection fields", async () => {
    const { repo } = repository("queue", { ...emptySnapshot, accessToken: "must-not-cross" });
    const service = createAdminCrmSupplierOperationsService(repo);
    await expect(service.readSnapshot("admin_001")).rejects.toBeInstanceOf(AdminCrmRefusal);
    await expect(service.readSnapshot("admin_001")).rejects.toMatchObject({ code: "unsafe_projection" });

    const restrictedText: AdminCrmSupplierOperationsSnapshot = {
      ...emptySnapshot,
      sources: {
        ...emptySnapshot.sources,
        exceptions: available("exceptions", [{
          exceptionId: "exception_001",
          domain: "support",
          referenceId: "case_001",
          title: "Patient diagnosis detail",
          severity: "high",
          state: "open",
          ownerLabel: null,
          openedAt: at,
          dueAt: null,
        }]),
      },
    };
    const { repo: restrictedTextRepo } = repository("queue", restrictedText);
    await expect(createAdminCrmSupplierOperationsService(restrictedTextRepo).readSnapshot("admin_001"))
      .rejects.toMatchObject({ code: "unsafe_projection" });
  });

  it("does not reject legitimate words merely containing a sensitive substring", async () => {
    const legitimate: AdminCrmSupplierOperationsSnapshot = {
      ...emptySnapshot,
      sources: {
        ...emptySnapshot.sources,
        organizations: available("organizations", [{
          organizationId: "org_001",
          legalName: "Health Partners Example LLC",
          accountState: "active",
          buyerCount: 1,
          ownerLabel: "Secretary Team",
          paymentTermsLabel: null,
          openInvoiceCents: 0,
          currency: "USD",
          updatedAt: at,
        }]),
      },
    };
    const { repo } = repository("queue", legitimate);
    await expect(createAdminCrmSupplierOperationsService(repo).readSnapshot("admin_001"))
      .resolves.toEqual(legitimate);
    await expect(createAdminCrmSupplierOperationsService(repo).recordRecommendation("admin_001", {
      ...input,
      reason: "Secretary reviewed the inventory evidence.",
    })).resolves.toMatchObject({ executionState: "not_executed" });
  });

  it("requires meaningful reasons and idempotency keys", async () => {
    const { repo } = repository();
    const service = createAdminCrmSupplierOperationsService(repo);
    await expect(service.recordRecommendation("admin_001", { ...input, reason: "short" }))
      .rejects.toMatchObject({ code: "invalid_request" });
    await expect(service.recordRecommendation("admin_001", { ...input, idempotencyKey: "bad" }))
      .rejects.toMatchObject({ code: "invalid_request" });
    await expect(service.recordRecommendation("admin_001", { ...input, reason: "Include patient diagnosis details." }))
      .rejects.toMatchObject({ code: "unsafe_request" });
  });
});
