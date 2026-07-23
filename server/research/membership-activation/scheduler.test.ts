import { describe, expect, it, vi } from "vitest";
import {
  runFoundingSchedulerTick,
  runProductionFoundingSchedulerTick,
  wasReinstated,
  type FoundingSchedulerDeps,
} from "./scheduler";
import { createObligation, transitionObligation } from "./obligations";
import { applyScheduleTransitions } from "./renewals";
import { foundingEmailEventKey, type FoundingEmailEnqueueInput } from "./emails";
import { createInMemoryObligationsStore } from "./persistence/obligations-store";
import { createInMemoryIdentityStore } from "./persistence/identity-store";
import { IDENTITY_REVIEW_TYPE, type IdentityVerificationRecord } from "./identity-reviews";
import type { IdentityDocumentCase, IdentityMediaPort } from "./identity-documents";

// ---------------------------------------------------------------------------
// Founding scheduler tick: the time-driven work no request triggers. The
// contract under test: flag-gated at tick time, idempotent (a second tick at
// the same instant enqueues and performs nothing new), suspension and
// reinstatement emails at the right transitions, retention deletions through
// the worker seam, and the reservation seam honored when present.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

const METHOD = {
  methodId: "bridge-1",
  category: "manual_external_payment" as const,
  label: "Manual bridge method",
  instructionsRef: "bridge-1",
  productPurchaseEligible: false,
  capturedAt: "2026-06-01T00:00:00.000Z",
};

/** An outbox fake with the real outbox's semantics: insert-or-ignore on the
 * unique event key, returning true either way. */
function fakeOutbox() {
  const rows = new Map<string, FoundingEmailEnqueueInput>();
  const enqueue = async (input: FoundingEmailEnqueueInput): Promise<boolean> => {
    if (!rows.has(input.eventKey)) rows.set(input.eventKey, input);
    return true;
  };
  return { rows, enqueue };
}

function baseDeps(overrides: Partial<FoundingSchedulerDeps> = {}) {
  const outbox = fakeOutbox();
  const obligations = createInMemoryObligationsStore();
  const suspendedMembers: Array<{ memberId: string; at: string }> = [];
  const deps: FoundingSchedulerDeps = {
    enabled: () => true,
    obligations,
    membership: {
      async setSuspended(memberId, at) {
        suspendedMembers.push({ memberId, at });
      },
    },
    recipientFor: async () => "member@example.test",
    enqueue: outbox.enqueue,
    ...overrides,
  };
  return { deps, outbox, obligations, suspendedMembers };
}

function renewalObligation(memberId: string, createdAt: string, dueAt: string) {
  return createObligation({
    memberId,
    type: "renewal_25",
    method: METHOD,
    now: new Date(createdAt),
    dueAt: new Date(dueAt),
  });
}

describe("runFoundingSchedulerTick gating", () => {
  it("does nothing at all while the flag reads false at tick time", async () => {
    const { deps, obligations } = baseDeps({ enabled: () => false });
    const listSpy = vi.spyOn(obligations, "listAll");
    const result = await runFoundingSchedulerTick(new Date("2026-07-15T00:00:00Z"), deps);
    expect(result.ran).toBe(false);
    expect(result.scheduleAdvanced).toBe(0);
    expect(result.renewalNoticesEnqueued).toBe(0);
    expect(listSpy).not.toHaveBeenCalled();
  });

  it("the production runner is inert without the env flag (never set in tests)", async () => {
    const result = await runProductionFoundingSchedulerTick(new Date("2026-07-15T00:00:00Z"));
    expect(result.ran).toBe(false);
  });
});

describe("the suspension sweep and its emails", () => {
  const NOW = new Date("2026-07-15T00:00:00Z"); // dueAt + 14d: past suspension (+10d)

  async function seedOverdueRenewal() {
    const fixture = baseDeps();
    const obligation = renewalObligation("member-1", "2026-06-01T00:00:00Z", "2026-07-01T00:00:00.000Z");
    await fixture.obligations.save(obligation);
    return { ...fixture, obligation };
  }

  it("walks the obligation to suspended, suspends the membership, and enqueues fm_membership_suspended", async () => {
    const { deps, outbox, obligations, suspendedMembers, obligation } = await seedOverdueRenewal();
    const result = await runFoundingSchedulerTick(NOW, deps);

    expect(result.ran).toBe(true);
    expect(result.scheduleAdvanced).toBe(1);
    const stored = await obligations.get(obligation.obligationId);
    expect(stored?.status).toBe("suspended");
    expect(suspendedMembers).toEqual([{ memberId: "member-1", at: NOW.toISOString() }]);

    const suspendedKey = foundingEmailEventKey("fm_membership_suspended", obligation.obligationId);
    expect(outbox.rows.has(suspendedKey)).toBe(true);
    expect(outbox.rows.get(suspendedKey)?.recipient).toBe("member@example.test");

    // All 7 renewal notices are past their sendAt by now, including the
    // suspension-confirmed notice; plus the lifecycle suspension email = 8.
    expect(result.renewalNoticesEnqueued).toBe(7);
    expect(outbox.rows.size).toBe(8);
    const confirmedKey = foundingEmailEventKey(
      "fm_renewal_suspension_confirmed",
      `${obligation.obligationId}:renewal_suspension_confirmed`,
    );
    expect(outbox.rows.has(confirmedKey)).toBe(true);
  });

  it("a second tick at the same instant enqueues nothing new and re-suspends nothing", async () => {
    const { deps, outbox, suspendedMembers } = await seedOverdueRenewal();
    await runFoundingSchedulerTick(NOW, deps);
    const rowsAfterFirst = new Map(outbox.rows);

    const second = await runFoundingSchedulerTick(NOW, deps);
    expect(second.scheduleAdvanced).toBe(0);
    expect(outbox.rows.size).toBe(rowsAfterFirst.size);
    expect([...outbox.rows.keys()].sort()).toEqual([...rowsAfterFirst.keys()].sort());
    expect(suspendedMembers).toHaveLength(1);
  });

  it("never enqueues when the member has no resolvable email", async () => {
    const { deps, outbox } = await seedOverdueRenewal();
    deps.recipientFor = async () => null;
    const result = await runFoundingSchedulerTick(NOW, deps);
    expect(result.suspensionEmailsEnqueued).toBe(0);
    expect(outbox.rows.size).toBe(0);
    // The membership state change still happened: email never blocks money.
    expect(result.scheduleAdvanced).toBe(1);
  });
});

describe("reinstatement detection", () => {
  const NOW = new Date("2026-07-20T00:00:00Z");

  function verifiedAfterSuspension() {
    let obligation = renewalObligation("member-2", "2026-06-01T00:00:00Z", "2026-07-01T00:00:00.000Z");
    obligation = applyScheduleTransitions(obligation, new Date("2026-07-15T00:00:00Z"));
    expect(obligation.status).toBe("suspended");
    obligation = transitionObligation(
      obligation,
      "submitted",
      { actorType: "member", actorId: "member-2" },
      new Date("2026-07-18T00:00:00Z"),
      "member_submitted",
    );
    return transitionObligation(
      obligation,
      "verified",
      { actorType: "admin", actorId: "admin-1", actorRole: "admin" },
      new Date("2026-07-19T00:00:00Z"),
      "admin_verified",
    );
  }

  it("wasReinstated is true only for a verified renewal that passed through suspended", () => {
    expect(wasReinstated(verifiedAfterSuspension())).toBe(true);
    const neverSuspended = transitionObligation(
      transitionObligation(
        renewalObligation("member-3", "2026-06-01T00:00:00Z", "2026-07-01T00:00:00.000Z"),
        "submitted",
        { actorType: "member", actorId: "member-3" },
        new Date("2026-06-20T00:00:00Z"),
        "member_submitted",
      ),
      "verified",
      { actorType: "admin", actorId: "admin-1", actorRole: "admin" },
      new Date("2026-06-21T00:00:00Z"),
      "admin_verified",
    );
    expect(wasReinstated(neverSuspended)).toBe(false);
  });

  it("enqueues fm_membership_reinstated with the covered-through date, idempotently", async () => {
    const { deps, outbox, obligations } = baseDeps({
      periods: {
        async findByFundingObligation() {
          return { endsAt: "2026-08-18T00:00:00.000Z" };
        },
      },
    });
    const reinstated = verifiedAfterSuspension();
    await obligations.save(reinstated);

    const result = await runFoundingSchedulerTick(NOW, deps);
    expect(result.reinstatementEmailsEnqueued).toBe(1);
    const key = foundingEmailEventKey("fm_membership_reinstated", reinstated.obligationId);
    expect(outbox.rows.get(key)?.payload).toEqual({ coveredThrough: "2026-08-18T00:00:00.000Z" });
    // A verified obligation gets no reminder notices and no suspension email.
    const otherKeys = [...outbox.rows.keys()].filter((k) => k !== key);
    expect(otherKeys).toEqual([]);

    const sizeAfterFirst = outbox.rows.size;
    await runFoundingSchedulerTick(NOW, deps);
    expect(outbox.rows.size).toBe(sizeAfterFirst);
  });

  it("does not fire for a verified renewal that was never suspended", async () => {
    const { deps, outbox, obligations } = baseDeps({
      periods: {
        async findByFundingObligation() {
          return { endsAt: "2026-08-01T00:00:00.000Z" };
        },
      },
    });
    let obligation = renewalObligation("member-4", "2026-06-01T00:00:00Z", "2026-07-01T00:00:00.000Z");
    obligation = transitionObligation(
      obligation,
      "submitted",
      { actorType: "member", actorId: "member-4" },
      new Date("2026-06-20T00:00:00Z"),
      "member_submitted",
    );
    obligation = transitionObligation(
      obligation,
      "verified",
      { actorType: "admin", actorId: "admin-1", actorRole: "admin" },
      new Date("2026-06-21T00:00:00Z"),
      "admin_verified",
    );
    await obligations.save(obligation);
    await runFoundingSchedulerTick(NOW, deps);
    const key = foundingEmailEventKey("fm_membership_reinstated", obligation.obligationId);
    expect(outbox.rows.has(key)).toBe(false);
  });
});

describe("identity retention deletions through the worker seam", () => {
  const NOW = new Date("2026-07-15T00:00:00Z");
  const TENANT = "xenios-research";

  function verifiedCaseHoldingRawSource(): {
    kase: IdentityDocumentCase;
    review: IdentityVerificationRecord;
  } {
    const reviewedAt = new Date(NOW.getTime() - 8 * DAY_MS).toISOString(); // past the 7-day default
    const kase: IdentityDocumentCase = {
      caseId: "case-1",
      tenantId: TENANT,
      memberId: "member-1",
      status: "verified",
      consentVersion: "0.1.0-draft",
      consentRecordedAt: reviewedAt,
      storagePath: `identity/${TENANT}/member-1/case-1-abcdef`,
      contentType: "image/jpeg",
      uploadUrlExpiresAt: null,
      uploadedAt: reviewedAt,
      reviewId: "review-1",
      rawDeletedAt: null,
      createdAt: reviewedAt,
      updatedAt: reviewedAt,
    };
    const review: IdentityVerificationRecord = {
      reviewId: "review-1",
      caseId: "case-1",
      tenantId: TENANT,
      memberId: "member-1",
      reviewType: IDENTITY_REVIEW_TYPE,
      nameMatch: "match",
      ageThresholdMet: true,
      documentNotExpired: true,
      jurisdiction: null,
      licenseLast4: null,
      outcome: "verified",
      rejectionCategory: null,
      reviewerId: "admin-1",
      startedAt: reviewedAt,
      completedAt: reviewedAt,
      rawSourceDeletedAt: null,
    };
    return { kase, review };
  }

  async function retentionFixture() {
    const store = createInMemoryIdentityStore();
    const { kase, review } = verifiedCaseHoldingRawSource();
    await store.saveCase(kase);
    await store.saveReview(review);
    const deleteObject = vi.fn(async () => ({ ok: true as const }));
    const provider = { deleteObject } as unknown as IdentityMediaPort;
    const fixture = baseDeps({
      identity: {
        listCasesWithRawSource: () => store.listCasesWithRawSource(TENANT),
        reviewForCase: (caseId) => store.getReviewForCase(TENANT, caseId),
        saveCase: (record) => store.saveCase(record),
        saveReview: (record) => store.saveReview(record),
        provider,
        audit: (event) => store.appendAuditEvent(event),
      },
    });
    return { ...fixture, store, deleteObject };
  }

  it("executes the due deletion through the worker: object deleted, pointer nulled, review stamped, audited", async () => {
    const { deps, store, deleteObject } = await retentionFixture();
    const result = await runFoundingSchedulerTick(NOW, deps);

    expect(result.identityRawDeletions).toBe(1);
    expect(deleteObject).toHaveBeenCalledTimes(1);
    const kase = await store.getCase(TENANT, "case-1");
    expect(kase?.status).toBe("deleted");
    expect(kase?.storagePath).toBeNull();
    expect(kase?.rawDeletedAt).toBe(NOW.toISOString());
    const review = await store.getReviewForCase(TENANT, "case-1");
    expect(review?.rawSourceDeletedAt).toBe(NOW.toISOString());
    const audit = await store.listAuditEvents(TENANT, "case-1");
    expect(audit.map((event) => event.kind)).toEqual(["deletion_scheduled", "raw_deleted"]);
  });

  it("a second tick deletes nothing: the pointer is gone, so nothing plans", async () => {
    const { deps, deleteObject } = await retentionFixture();
    await runFoundingSchedulerTick(NOW, deps);
    const second = await runFoundingSchedulerTick(NOW, deps);
    expect(second.identityRawDeletions).toBe(0);
    expect(deleteObject).toHaveBeenCalledTimes(1);
  });
});

describe("the reservation-expiry seam", () => {
  it("is called with the tick instant when the composition provides it", async () => {
    const release = vi.fn(async (_now: Date) => 3);
    const { deps } = baseDeps({ releaseExpiredReservations: release });
    const now = new Date("2026-07-15T00:00:00Z");
    const result = await runFoundingSchedulerTick(now, deps);
    expect(release).toHaveBeenCalledWith(now);
    expect(result.reservationsReleased).toBe(3);
  });

  it("is simply absent otherwise: the tick reports zero released", async () => {
    const { deps } = baseDeps();
    const result = await runFoundingSchedulerTick(new Date("2026-07-15T00:00:00Z"), deps);
    expect(result.reservationsReleased).toBe(0);
  });
});
