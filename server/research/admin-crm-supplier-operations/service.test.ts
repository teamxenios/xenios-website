import { describe, expect, it, vi } from "vitest";
import type {
  AdminCrmActionRecommendation,
  AdminCrmSupplierOperationsSnapshot,
  AdminOperationsCollectionMap,
  AdminOperationsSourceKey,
  AdminOperationsSources,
} from "@shared/research/admin-crm-supplier-operations";
import { ADMIN_OPERATIONS_SOURCE_KEYS } from "@shared/research/admin-crm-supplier-operations";
import {
  AdminCrmRefusal,
  createAdminCrmSupplierOperationsService,
  resolveAdminCrmEffectiveTrustDial,
  type AdminCrmRecommendationAtomicResult,
  type AdminCrmRecommendationCandidate,
  type AdminCrmSupplierOperationsRepository,
  type AdminCrmTrustDialModes,
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

function repository(
  modes: AdminCrmTrustDialModes = { workspaceMode: "queue", actionMode: "queue" },
  snapshot: unknown = { ...emptySnapshot, trustDial: modes.workspaceMode },
) {
  const writes: AdminCrmRecommendationCandidate[] = [];
  const repo: AdminCrmSupplierOperationsRepository = {
    readSnapshot: vi.fn(async () => snapshot as AdminCrmSupplierOperationsSnapshot),
    adjudicateTrustDialAndRecordRecommendation: vi.fn(async (candidate) => {
      const configuredTrustDial = resolveAdminCrmEffectiveTrustDial(modes);
      if (configuredTrustDial === "never") {
        const reason = modes.workspaceMode === "never" && modes.actionMode === "never"
          ? "workspace_and_action_never"
          : modes.workspaceMode === "never"
            ? "workspace_never"
            : "action_never";
        return {
          outcome: "refused",
          currentModes: modes,
          reason,
        } as AdminCrmRecommendationAtomicResult;
      }
      writes.push(candidate);
      const permittedModes = modes as RecordedAtomicResult["currentModes"];
      return {
        outcome: "recorded",
        currentModes: permittedModes,
        recordedModes: permittedModes,
        requestBinding: { actorId: candidate.actorId, input: candidate.input },
        recommendation: {
          recordId: "recommendation_001",
          action: candidate.input.action,
          targetType: candidate.input.targetType,
          targetId: candidate.input.targetId,
          recordState: configuredTrustDial === "ask" ? "awaiting_human_review" : "recorded",
          executionState: "not_executed",
          externalEffect: false,
          executor: null,
          requiresHumanApproval: true,
          configuredTrustDial,
          evidenceSource: candidate.evidenceSource,
          evidenceCheckedAt: candidate.evidenceCheckedAt,
          createdAt: candidate.createdAt,
          idempotentReplay: false,
        } satisfies AdminCrmActionRecommendation,
      } satisfies AdminCrmRecommendationAtomicResult;
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

type RecordedAtomicResult = Extract<AdminCrmRecommendationAtomicResult, { outcome: "recorded" }>;

function recordedAtomicResult(options: {
  currentModes?: RecordedAtomicResult["currentModes"];
  recordedModes?: RecordedAtomicResult["recordedModes"];
  idempotentReplay?: boolean;
  recommendation?: Partial<AdminCrmActionRecommendation>;
} = {}): RecordedAtomicResult {
  const currentModes = options.currentModes ?? { workspaceMode: "queue", actionMode: "queue" };
  const recordedModes = options.recordedModes ?? currentModes;
  const configuredTrustDial = resolveAdminCrmEffectiveTrustDial(recordedModes);
  if (configuredTrustDial === "never") throw new Error("Invalid recorded fixture modes.");
  return {
    outcome: "recorded",
    currentModes,
    recordedModes,
    requestBinding: { actorId: "admin_001", input },
    recommendation: {
      recordId: "recommendation_001",
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      recordState: configuredTrustDial === "ask" ? "awaiting_human_review" : "recorded",
      executionState: "not_executed",
      externalEffect: false,
      executor: null,
      requiresHumanApproval: true,
      configuredTrustDial,
      evidenceSource: "supplierAssignments",
      evidenceCheckedAt: at,
      createdAt: at,
      idempotentReplay: options.idempotentReplay ?? false,
      ...options.recommendation,
    },
  };
}

const invalidAtomicReceipts: Array<[string, () => unknown]> = [
  ["recorded after the current action became never", () => ({
    ...recordedAtomicResult(),
    currentModes: { workspaceMode: "queue", actionMode: "never" },
  })],
  ["recorded after the current workspace became never", () => ({
    ...recordedAtomicResult(),
    currentModes: { workspaceMode: "never", actionMode: "queue" },
  })],
  ["recorded with a contradictory effective mode", () => recordedAtomicResult({
    recommendation: { configuredTrustDial: "ask", recordState: "awaiting_human_review" },
  })],
  ["newly recorded with historical modes", () => recordedAtomicResult({
    currentModes: { workspaceMode: "queue", actionMode: "queue" },
    recordedModes: { workspaceMode: "ask", actionMode: "ask" },
    idempotentReplay: false,
  })],
  ["replayed for a different idempotent request", () => ({
    ...recordedAtomicResult({ idempotentReplay: true }),
    requestBinding: {
      actorId: "admin_001",
      input: { ...input, reason: "A different request reused the same key." },
    },
  })],
  ["bound to a different actor", () => ({
    ...recordedAtomicResult(),
    requestBinding: { actorId: "admin_002", input },
  })],
  ["bound to a different idempotency key", () => ({
    ...recordedAtomicResult(),
    requestBinding: {
      actorId: "admin_001",
      input: { ...input, idempotencyKey: "admin-crm:assignment_1001:supplier:v2" },
    },
  })],
  ["refused while neither current mode is never", () => ({
    outcome: "refused",
    currentModes: { workspaceMode: "queue", actionMode: "ask" },
    reason: "action_never",
  })],
  ["refused for the wrong current mode", () => ({
    outcome: "refused",
    currentModes: { workspaceMode: "never", actionMode: "queue" },
    reason: "action_never",
  })],
  ["refused while also claiming a recommendation", () => ({
    outcome: "refused",
    currentModes: { workspaceMode: "never", actionMode: "queue" },
    reason: "workspace_never",
    recommendation: recordedAtomicResult().recommendation,
  })],
];

describe("Admin CRM supplier operations service", () => {
  it.each(["auto", "queue", "ask"] as const)(
    "records %s recommendations as explicitly non-executing through one atomic port",
    async (mode) => {
      const { repo, writes } = repository({ workspaceMode: mode, actionMode: mode });
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
        executionState: "not_executed",
        externalEffect: false,
      });
      expect(writes[0]).not.toHaveProperty("configuredTrustDial");
      expect(writes[0]).not.toHaveProperty("recordState");
    },
  );

  it("refuses an action-to-never race after a permissive workspace projection", async () => {
    const { repo, writes } = repository(
      { workspaceMode: "queue", actionMode: "never" },
      { ...emptySnapshot, trustDial: "queue" },
    );
    const service = createAdminCrmSupplierOperationsService(repo);
    await expect(service.recordRecommendation("admin_001", input)).rejects.toMatchObject({ code: "trust_dial_never" });
    expect(repo.adjudicateTrustDialAndRecordRecommendation).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(0);
  });

  it("refuses a workspace-to-never race after permissive action evidence", async () => {
    const { repo, writes } = repository(
      { workspaceMode: "never", actionMode: "queue" },
      { ...emptySnapshot, trustDial: "queue" },
    );
    const service = createAdminCrmSupplierOperationsService(repo);

    await expect(service.recordRecommendation("admin_001", input)).rejects.toMatchObject({
      code: "trust_dial_never",
    });
    expect(repo.adjudicateTrustDialAndRecordRecommendation).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(0);
  });

  it("treats snapshot Trust Dial evidence as display-only and lets the atomic authority adjudicate current modes", async () => {
    const { repo, writes } = repository(
      { workspaceMode: "queue", actionMode: "ask" },
      { ...emptySnapshot, trustDial: "never" },
    );

    await expect(createAdminCrmSupplierOperationsService(repo, () => at)
      .recordRecommendation("admin_001", input)).resolves.toMatchObject({
        configuredTrustDial: "ask",
        recordState: "awaiting_human_review",
        executionState: "not_executed",
      });
    expect(writes).toHaveLength(1);
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
    const { repo: disconnectedRepo, writes: disconnectedWrites } = repository(undefined, disconnected);
    await expect(createAdminCrmSupplierOperationsService(disconnectedRepo).recordRecommendation("admin_001", input))
      .rejects.toMatchObject({ code: "operation_unavailable" });
    expect(disconnectedWrites).toHaveLength(0);

    const absent: AdminCrmSupplierOperationsSnapshot = {
      ...emptySnapshot,
      sources: { ...emptySnapshot.sources, supplierAssignments: available("supplierAssignments") },
    };
    const { repo: absentRepo, writes: absentWrites } = repository(undefined, absent);
    await expect(createAdminCrmSupplierOperationsService(absentRepo).recordRecommendation("admin_001", input))
      .rejects.toMatchObject({ code: "operation_unavailable" });
    expect(absentWrites).toHaveLength(0);
  });

  it.each(["available", "partial"] as const)(
    "refuses an ambiguous duplicate target in %s source evidence before calling the atomic authority",
    async (availability) => {
      const supplierSource = emptySnapshot.sources.supplierAssignments;
      if (supplierSource.availability === "unavailable") throw new Error("fixture");
      const target = supplierSource.items[0];
      if (!target) throw new Error("fixture");
      const duplicateItems = [
        target,
        {
          ...target,
          supplierId: "supplier_conflict",
          supplierLabel: "Conflicting Example Supplier",
        },
      ];
      const ambiguousSupplierSource = availability === "available"
        ? {
            ...supplierSource,
            availability: "available" as const,
            code: null,
            message: "supplierAssignments source is available.",
            items: duplicateItems,
          }
        : {
            ...supplierSource,
            availability: "partial" as const,
            code: "source_partial",
            message: "supplierAssignments source returned partial evidence.",
            items: duplicateItems,
          };
      const ambiguous: AdminCrmSupplierOperationsSnapshot = {
        ...emptySnapshot,
        sources: {
          ...emptySnapshot.sources,
          supplierAssignments: ambiguousSupplierSource,
        },
      };
      const { repo, writes } = repository(undefined, ambiguous);

      await expect(createAdminCrmSupplierOperationsService(repo).recordRecommendation("admin_001", input))
        .rejects.toMatchObject({
          code: "operation_unavailable",
          message: "The target is ambiguous in the visible source evidence.",
        });
      expect(repo.adjudicateTrustDialAndRecordRecommendation).not.toHaveBeenCalled();
      expect(writes).toHaveLength(0);
    },
  );

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
    const { repo } = repository({ workspaceMode: "ask", actionMode: "ask" }, partial);
    await expect(createAdminCrmSupplierOperationsService(repo).recordRecommendation("admin_001", input))
      .resolves.toMatchObject({
        recordState: "awaiting_human_review",
        evidenceSource: "supplierAssignments",
        evidenceCheckedAt: at,
        executionState: "not_executed",
      });
  });

  it("preserves the original non-executing receipt on an idempotent replay", async () => {
    const { repo } = repository();
    vi.mocked(repo.adjudicateTrustDialAndRecordRecommendation).mockResolvedValueOnce({
      outcome: "recorded",
      currentModes: { workspaceMode: "queue", actionMode: "queue" },
      recordedModes: { workspaceMode: "ask", actionMode: "ask" },
      requestBinding: { actorId: "admin_001", input },
      recommendation: {
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
      },
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

  it.each(invalidAtomicReceipts)("rejects an atomic authority receipt that was %s", async (_label, receipt) => {
    const { repo } = repository();
    vi.mocked(repo.adjudicateTrustDialAndRecordRecommendation).mockResolvedValueOnce(receipt() as any);

    await expect(createAdminCrmSupplierOperationsService(repo, () => at)
      .recordRecommendation("admin_001", input)).rejects.toMatchObject({
        code: "operation_unavailable",
      });
  });

  it("fails closed when the durable atomic authority is unavailable", async () => {
    const { repo } = repository();
    vi.mocked(repo.adjudicateTrustDialAndRecordRecommendation)
      .mockRejectedValueOnce(new Error("raw durable authority failure"));

    await expect(createAdminCrmSupplierOperationsService(repo, () => at)
      .recordRecommendation("admin_001", input)).rejects.toMatchObject({
        code: "operation_unavailable",
        message: "Recommendation authority is unavailable.",
      });
  });

  it("refuses missing or contradictory source envelopes instead of projecting a false zero", async () => {
    const missing = { ...emptySnapshot, sources: { ...emptySnapshot.sources } } as any;
    delete missing.sources.fulfillment;
    const { repo: missingRepo } = repository(undefined, missing);
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
    const { repo: contradictoryRepo } = repository(undefined, contradictory);
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
    const { repo: malformedRepo } = repository(undefined, malformed);
    await expect(createAdminCrmSupplierOperationsService(malformedRepo).readSnapshot("admin_001"))
      .rejects.toMatchObject({ code: "source_evidence_invalid" });

    const rawMessage = {
      ...emptySnapshot,
      sources: {
        ...emptySnapshot.sources,
        customers: { ...emptySnapshot.sources.customers, message: "database host credential failure" },
      },
    };
    const { repo: rawMessageRepo } = repository(undefined, rawMessage);
    await expect(createAdminCrmSupplierOperationsService(rawMessageRepo).readSnapshot("admin_001"))
      .rejects.toMatchObject({ code: "source_evidence_invalid" });
  });

  it("refuses restricted projection fields", async () => {
    const { repo } = repository(undefined, { ...emptySnapshot, accessToken: "must-not-cross" });
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
    const { repo: restrictedTextRepo } = repository(undefined, restrictedText);
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
    const { repo } = repository(undefined, legitimate);
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
