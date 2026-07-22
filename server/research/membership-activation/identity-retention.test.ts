import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FOUNDING_ACTIVATION_FLAG,
  InMemoryIdentityMediaProvider,
  confirmIdentityUpload,
  openIdentityCase,
  recordIdentityConsent,
  requestIdentityUploadUrl,
  submitIdentityCaseForReview,
  type IdentityDocumentCase,
} from "./identity-documents";
import {
  completeIdentityReview,
  startIdentityReview,
  type IdentityVerificationRecord,
} from "./identity-reviews";
import {
  DEFAULT_RAW_RETENTION_DAYS,
  IDENTITY_RETENTION_ENV,
  adminViewIdentityDocument,
  emergencyDeleteRawSource,
  planRawDeletions,
  rawDeletionDueAt,
  resolveRetentionConfig,
  runRawDeletionSweep,
  type IdentityAuditEvent,
} from "./identity-retention";

const NOW = new Date("2026-07-22T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  process.env[FOUNDING_ACTIVATION_FLAG] = "true";
});

afterEach(() => {
  delete process.env[FOUNDING_ACTIVATION_FLAG];
  delete process.env[IDENTITY_RETENTION_ENV];
});

type Fixture = {
  media: InMemoryIdentityMediaProvider;
  kase: IdentityDocumentCase;
  review: IdentityVerificationRecord;
  audit: IdentityAuditEvent[];
  sink: (event: IdentityAuditEvent) => void;
};

async function reviewedFixture(
  outcome: "verified" | "rejected" = "verified",
  storageHint = "",
): Promise<Fixture> {
  const media = new InMemoryIdentityMediaProvider();
  const consented = recordIdentityConsent(openIdentityCase({ memberId: "member-1", now: NOW }), {
    accepted: true,
    consentVersion: "0.1.0-draft",
    now: NOW,
  });
  const requested = await requestIdentityUploadUrl(
    consented,
    { contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg", now: NOW },
    media,
    undefined,
    () => `${storageHint}aaaaaaaaaaaaaaaaaaaaaaaa`,
  );
  if (!requested.ok) throw new Error("fixture request failed");
  const confirmed = await confirmIdentityUpload(requested.value.kase, media, NOW);
  if (!confirmed.ok) throw new Error("fixture confirm failed");
  const queued = submitIdentityCaseForReview(confirmed.value, NOW);
  const { kase: open, start } = startIdentityReview(queued, "admin-sam", NOW);
  const { kase, record } = completeIdentityReview(
    open,
    start,
    {
      nameMatch: outcome === "verified" ? "match" : "mismatch",
      ageThresholdMet: true,
      documentNotExpired: true,
      jurisdiction: "TX",
      licenseLast4: "4821",
    },
    NOW,
  );
  const audit: IdentityAuditEvent[] = [];
  return { media, kase, review: record, audit, sink: (event) => void audit.push(event) };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe("retention configuration", () => {
  it("defaults to 7 days after completed review", () => {
    expect(DEFAULT_RAW_RETENTION_DAYS).toBe(7);
    expect(resolveRetentionConfig({}).rawRetentionDays).toBe(7);
  });

  it("honors a configured window and refuses garbage", () => {
    expect(resolveRetentionConfig({ [IDENTITY_RETENTION_ENV]: "3" }).rawRetentionDays).toBe(3);
    expect(resolveRetentionConfig({ [IDENTITY_RETENTION_ENV]: "0" }).rawRetentionDays).toBe(0);
    expect(resolveRetentionConfig({ [IDENTITY_RETENTION_ENV]: "-1" }).rawRetentionDays).toBe(7);
    expect(resolveRetentionConfig({ [IDENTITY_RETENTION_ENV]: "soon" }).rawRetentionDays).toBe(7);
  });

  it("computes the due date from the review completion, not the upload", () => {
    const dueAt = rawDeletionDueAt(NOW.toISOString(), { rawRetentionDays: 7 });
    expect(dueAt).toBe(new Date(NOW.getTime() + 7 * DAY_MS).toISOString());
  });
});

// ---------------------------------------------------------------------------
// The pure planner
// ---------------------------------------------------------------------------

describe("planRawDeletions", () => {
  it("plans nothing before the retention window closes", async () => {
    const { kase, review } = await reviewedFixture();
    const justBefore = new Date(NOW.getTime() + 7 * DAY_MS - 1000);
    expect(planRawDeletions(justBefore, [kase], [review], { rawRetentionDays: 7 })).toEqual([]);
  });

  it("plans the deletion once the window has passed", async () => {
    const { kase, review } = await reviewedFixture();
    const after = new Date(NOW.getTime() + 7 * DAY_MS + 1000);
    const planned = planRawDeletions(after, [kase], [review], { rawRetentionDays: 7 });
    expect(planned).toHaveLength(1);
    expect(planned[0].caseId).toBe(kase.caseId);
    expect(planned[0].storagePath).toBe(kase.storagePath);
  });

  it("never plans a case whose review is not complete", async () => {
    const media = new InMemoryIdentityMediaProvider();
    const consented = recordIdentityConsent(openIdentityCase({ memberId: "member-1", now: NOW }), {
      accepted: true,
      consentVersion: "0.1.0-draft",
      now: NOW,
    });
    const requested = await requestIdentityUploadUrl(
      consented,
      { contentType: "image/jpeg", contentLengthBytes: 1000, fileName: "id.jpg", now: NOW },
      media,
    );
    if (!requested.ok) throw new Error("fixture failed");
    const confirmed = await confirmIdentityUpload(requested.value.kase, media, NOW);
    if (!confirmed.ok) throw new Error("fixture failed");
    const waiting = submitIdentityCaseForReview(confirmed.value, NOW);
    const longAfter = new Date(NOW.getTime() + 30 * DAY_MS);
    expect(planRawDeletions(longAfter, [waiting], [], { rawRetentionDays: 7 })).toEqual([]);
  });

  it("is idempotent: a deleted case (no pointer) plans nothing", async () => {
    const { kase, review } = await reviewedFixture();
    const gone = { ...kase, storagePath: null };
    const after = new Date(NOW.getTime() + 30 * DAY_MS);
    expect(planRawDeletions(after, [gone], [review], { rawRetentionDays: 7 })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

describe("runRawDeletionSweep", () => {
  it("deletes the raw source, stamps the review, and audits the deletion", async () => {
    const { media, kase, review, audit, sink } = await reviewedFixture();
    const after = new Date(NOW.getTime() + 8 * DAY_MS);
    const result = await runRawDeletionSweep({
      now: after,
      cases: [kase],
      reviews: [review],
      provider: media,
      audit: sink,
      config: { rawRetentionDays: 7 },
    });
    expect(result.deletedPaths).toEqual([kase.storagePath]);
    expect(media.deleted).toEqual([kase.storagePath]);
    const updated = result.updatedCases[0];
    expect(updated.status).toBe("deleted");
    expect(updated.storagePath).toBeNull();
    expect(updated.rawDeletedAt).toBe(after.toISOString());
    expect(result.updatedReviews[0].rawSourceDeletedAt).toBe(after.toISOString());
    expect(audit.map((event) => event.kind)).toEqual(["deletion_scheduled", "raw_deleted"]);
  });

  it("after deletion only the minimal record remains, and a second sweep does nothing", async () => {
    const { media, kase, review, sink } = await reviewedFixture();
    const after = new Date(NOW.getTime() + 8 * DAY_MS);
    const first = await runRawDeletionSweep({
      now: after,
      cases: [kase],
      reviews: [review],
      provider: media,
      audit: sink,
      config: { rawRetentionDays: 7 },
    });
    const survivor = first.updatedReviews[0];
    // The minimal record survives with its outcome; nothing points at storage.
    expect(survivor.outcome).toBe("verified");
    expect(survivor.licenseLast4).toBe("4821");
    expect(first.updatedCases[0].storagePath).toBeNull();

    const second = await runRawDeletionSweep({
      now: new Date(after.getTime() + DAY_MS),
      cases: first.updatedCases,
      reviews: first.updatedReviews,
      provider: media,
      audit: sink,
      config: { rawRetentionDays: 7 },
    });
    expect(second.deletedPaths).toEqual([]);
    expect(second.updatedCases).toEqual([]);
    expect(media.deleted).toHaveLength(1);
  });

  it("a refused storage delete keeps the pointer for retry, never orphans", async () => {
    const { media, kase, review, sink } = await reviewedFixture("verified", "undeletable");
    const after = new Date(NOW.getTime() + 8 * DAY_MS);
    const result = await runRawDeletionSweep({
      now: after,
      cases: [kase],
      reviews: [review],
      provider: media,
      audit: sink,
      config: { rawRetentionDays: 7 },
    });
    expect(result.refusedCaseIds).toEqual([kase.caseId]);
    expect(result.deletedPaths).toEqual([]);
    const kept = result.updatedCases[0];
    expect(kept.status).toBe("deletion_scheduled");
    expect(kept.storagePath).toBe(kase.storagePath);
    // The next sweep retries the same case.
    const retry = planRawDeletions(after, result.updatedCases, [review], { rawRetentionDays: 7 });
    expect(retry).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Emergency delete
// ---------------------------------------------------------------------------

describe("emergencyDeleteRawSource", () => {
  it("deletes immediately from a reviewed case without waiting for the schedule", async () => {
    const { media, kase, review, audit, sink } = await reviewedFixture();
    const result = await emergencyDeleteRawSource({
      kase,
      review,
      actorType: "admin",
      actorId: "admin-sam",
      provider: media,
      audit: sink,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kase.status).toBe("deleted");
    expect(result.value.kase.storagePath).toBeNull();
    expect(result.value.review?.rawSourceDeletedAt).toBe(NOW.toISOString());
    expect(audit.map((event) => event.kind)).toEqual(["emergency_deleted"]);
    expect(audit[0].actorId).toBe("admin-sam");
  });

  it("is idempotent: nothing left to delete is a success", async () => {
    const { media, kase, review, sink } = await reviewedFixture();
    const first = await emergencyDeleteRawSource({
      kase,
      review,
      actorType: "member",
      actorId: "member-1",
      provider: media,
      audit: sink,
      now: NOW,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await emergencyDeleteRawSource({
      kase: first.value.kase,
      review: first.value.review,
      actorType: "member",
      actorId: "member-1",
      provider: media,
      audit: sink,
      now: NOW,
    });
    expect(second.ok).toBe(true);
    expect(media.deleted).toHaveLength(1);
  });

  it("a refused storage delete surfaces the failure and keeps the pointer", async () => {
    const { media, kase, review, sink } = await reviewedFixture("verified", "undeletable");
    const result = await emergencyDeleteRawSource({
      kase,
      review,
      actorType: "admin",
      actorId: "admin-sam",
      provider: media,
      audit: sink,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
    expect(kase.storagePath).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Audited admin access
// ---------------------------------------------------------------------------

describe("adminViewIdentityDocument", () => {
  it("refuses when the founding activation flag is off", async () => {
    const { media, kase, sink } = await reviewedFixture();
    delete process.env[FOUNDING_ACTIVATION_FLAG];
    const result = await adminViewIdentityDocument({
      kase,
      requestedMemberId: "member-1",
      adminId: "admin-sam",
      provider: media,
      audit: sink,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DISABLED");
  });

  it("denies cross-member access before anything else happens", async () => {
    const { media, kase, audit, sink } = await reviewedFixture();
    const result = await adminViewIdentityDocument({
      kase,
      requestedMemberId: "member-2",
      adminId: "admin-sam",
      provider: media,
      audit: sink,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REFUSED");
    // No audit noise and no provider call for a refused cross-member request.
    expect(audit).toEqual([]);
    expect(media.calls.filter((call) => call.method === "createAdminAccessUrl")).toHaveLength(0);
  });

  it("emits the audit event and then mints a short-lived signed URL", async () => {
    const { media, kase, audit, sink } = await reviewedFixture();
    const result = await adminViewIdentityDocument({
      kase,
      requestedMemberId: "member-1",
      adminId: "admin-sam",
      provider: media,
      audit: sink,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.signedUrl).toContain("identity-signed");
    expect(audit).toHaveLength(1);
    expect(audit[0].kind).toBe("admin_viewed");
    expect(audit[0].actorId).toBe("admin-sam");
  });

  it("a failing audit sink means no URL is ever minted", async () => {
    const { media, kase } = await reviewedFixture();
    await expect(
      adminViewIdentityDocument({
        kase,
        requestedMemberId: "member-1",
        adminId: "admin-sam",
        provider: media,
        audit: () => {
          throw new Error("audit store down");
        },
        now: NOW,
      }),
    ).rejects.toThrow(/audit store down/);
    expect(media.calls.filter((call) => call.method === "createAdminAccessUrl")).toHaveLength(0);
  });

  it("refuses to view a case whose raw source was deleted", async () => {
    const { media, kase, review, sink } = await reviewedFixture();
    const deleted = await emergencyDeleteRawSource({
      kase,
      review,
      actorType: "admin",
      actorId: "admin-sam",
      provider: media,
      audit: sink,
      now: NOW,
    });
    if (!deleted.ok) throw new Error("fixture delete failed");
    const result = await adminViewIdentityDocument({
      kase: deleted.value.kase,
      requestedMemberId: "member-1",
      adminId: "admin-sam",
      provider: media,
      audit: sink,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_STATE");
  });
});
