import {
  canTransition,
  foundingActivationEnabled,
  type IdentityDocumentCase,
  type IdentityFlowResult,
  type IdentityMediaPort,
  type IdentityAccessGrant,
} from "./identity-documents";
import type { IdentityVerificationRecord } from "./identity-reviews";

// ---------------------------------------------------------------------------
// xenios research founding membership activation: identity document
// retention and deletion (Domain 3).
//
// The raw document is a liability, not an asset. It exists only long enough
// for the manual name and age review plus a short correction window, then it
// is destroyed. What this module guarantees:
//
// - Raw sources are deleted a configurable number of days AFTER the review
//   completes (default 7). The clock starts at review completion, never at
//   upload, so an applicant stuck in a queue is not punished by a premature
//   deletion and a completed case is not retained by a stalled one.
// - The deletion worker is PURE at its core: given a clock and the records,
//   it returns the deletions to perform. Running it twice performs nothing
//   the second time, because a deleted case has no storage pointer left.
// - A refused storage delete NEVER erases the pointer. The case stays in
//   deletion_scheduled and the next sweep retries; orphaning an object in a
//   private bucket with no record of it is the one unrecoverable failure.
// - Emergency manual delete works from any state that still holds an object,
//   at the applicant's request or an administrator's judgment, without
//   waiting for the schedule.
// - Every administrator VIEW of a document emits an audit event through the
//   sink BEFORE any signed URL is minted, so there is no access without a
//   record of the access. Deletions are audited the same way.
// - After deletion, only the minimal verification record remains, and the
//   review row is stamped with when the raw source died.
// ---------------------------------------------------------------------------

export const DEFAULT_RAW_RETENTION_DAYS = 7;
export const IDENTITY_RETENTION_ENV = "RESEARCH_IDENTITY_RAW_RETENTION_DAYS";

export type IdentityRetentionConfig = {
  rawRetentionDays: number;
};

// Reads the configured window, falling back to the default when the variable
// is absent or nonsense. Zero is allowed (delete on the next sweep after
// review); negatives and garbage are not.
export function resolveRetentionConfig(
  env: Record<string, string | undefined> = process.env,
): IdentityRetentionConfig {
  const raw = env[IDENTITY_RETENTION_ENV];
  if (raw === undefined || raw === "") return { rawRetentionDays: DEFAULT_RAW_RETENTION_DAYS };
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { rawRetentionDays: DEFAULT_RAW_RETENTION_DAYS };
  }
  return { rawRetentionDays: parsed };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function rawDeletionDueAt(reviewCompletedAt: string, config: IdentityRetentionConfig): string {
  return new Date(Date.parse(reviewCompletedAt) + config.rawRetentionDays * DAY_MS).toISOString();
}

// ---------------------------------------------------------------------------
// The audit seam
// ---------------------------------------------------------------------------

export const IDENTITY_AUDIT_KINDS = [
  "case_opened",
  "consent_recorded",
  "consent_declined",
  "upload_url_issued",
  "upload_confirmed",
  "submitted_for_review",
  "review_started",
  "review_completed",
  "admin_viewed",
  "deletion_scheduled",
  "raw_deleted",
  "emergency_deleted",
] as const;
export type IdentityAuditKind = (typeof IDENTITY_AUDIT_KINDS)[number];

export type IdentityAuditActor = "member" | "admin" | "system";

export type IdentityAuditEvent = {
  tenantId: string;
  caseId: string;
  memberId: string;
  kind: IdentityAuditKind;
  actorType: IdentityAuditActor;
  actorId: string | null;
  at: string;
  detail: string | null;
};

// The sink is injected. Production wires the persistence store's append-only
// audit table; tests inject an array push. A sink that throws stops the
// action it was auditing, which is the point: no audit, no access.
export type IdentityAuditSink = (event: IdentityAuditEvent) => void | Promise<void>;

// ---------------------------------------------------------------------------
// The pure deletion planner
// ---------------------------------------------------------------------------

export type PlannedDeletion = {
  caseId: string;
  storagePath: string;
  dueAt: string;
};

// Given the clock and the records, which raw sources are due to die. Pure and
// idempotent by construction: a case whose pointer is already gone plans
// nothing, so a second run over post-deletion state is empty. Only cases
// whose review is COMPLETE are eligible; the emergency path handles the rest.
export function planRawDeletions(
  now: Date,
  cases: readonly IdentityDocumentCase[],
  reviews: readonly IdentityVerificationRecord[],
  config: IdentityRetentionConfig,
): PlannedDeletion[] {
  const reviewByCase = new Map(reviews.map((review) => [review.caseId, review]));
  const planned: PlannedDeletion[] = [];
  for (const kase of cases) {
    if (kase.storagePath === null) continue; // already gone: nothing to plan
    if (kase.status !== "verified" && kase.status !== "rejected" && kase.status !== "deletion_scheduled") {
      continue; // review not complete: the schedule has not started
    }
    const review = reviewByCase.get(kase.caseId);
    if (!review) continue; // no completed review record: never delete on a guess
    const dueAt = rawDeletionDueAt(review.completedAt, config);
    if (now.getTime() < Date.parse(dueAt)) continue; // not due yet
    planned.push({ caseId: kase.caseId, storagePath: kase.storagePath, dueAt });
  }
  return planned;
}

// ---------------------------------------------------------------------------
// The deletion worker (applies a plan through the provider, audited)
// ---------------------------------------------------------------------------

export type DeletionSweepResult = {
  updatedCases: IdentityDocumentCase[];
  updatedReviews: IdentityVerificationRecord[];
  deletedPaths: string[];
  refusedCaseIds: string[];
};

export async function runRawDeletionSweep(input: {
  now: Date;
  cases: readonly IdentityDocumentCase[];
  reviews: readonly IdentityVerificationRecord[];
  provider: IdentityMediaPort;
  audit: IdentityAuditSink;
  config?: IdentityRetentionConfig;
}): Promise<DeletionSweepResult> {
  const config = input.config ?? resolveRetentionConfig();
  const planned = planRawDeletions(input.now, input.cases, input.reviews, config);
  const caseById = new Map(input.cases.map((kase) => [kase.caseId, kase]));
  const reviewByCase = new Map(input.reviews.map((review) => [review.caseId, review]));
  const at = input.now.toISOString();

  const updatedCases: IdentityDocumentCase[] = [];
  const updatedReviews: IdentityVerificationRecord[] = [];
  const deletedPaths: string[] = [];
  const refusedCaseIds: string[] = [];

  for (const plan of planned) {
    const kase = caseById.get(plan.caseId);
    if (!kase) continue;

    // Move through deletion_scheduled first so a refused delete leaves an
    // honest intermediate state rather than a silent verified-with-a-body.
    let scheduled = kase;
    if (kase.status !== "deletion_scheduled") {
      if (!canTransition(kase.status, "deletion_scheduled")) continue;
      scheduled = { ...kase, status: "deletion_scheduled", updatedAt: at };
      await input.audit({
        tenantId: kase.tenantId,
        caseId: kase.caseId,
        memberId: kase.memberId,
        kind: "deletion_scheduled",
        actorType: "system",
        actorId: null,
        at,
        detail: `raw source due for deletion at ${plan.dueAt}`,
      });
    }

    const removed = await input.provider.deleteObject(plan.storagePath);
    if (!removed.ok) {
      // The pointer stays; the next sweep retries. Never orphan the object.
      refusedCaseIds.push(kase.caseId);
      updatedCases.push(scheduled);
      continue;
    }

    deletedPaths.push(plan.storagePath);
    updatedCases.push({
      ...scheduled,
      status: "deleted",
      storagePath: null,
      rawDeletedAt: at,
      updatedAt: at,
    });
    const review = reviewByCase.get(kase.caseId);
    if (review && review.rawSourceDeletedAt === null) {
      updatedReviews.push({ ...review, rawSourceDeletedAt: at });
    }
    await input.audit({
      tenantId: kase.tenantId,
      caseId: kase.caseId,
      memberId: kase.memberId,
      kind: "raw_deleted",
      actorType: "system",
      actorId: null,
      at,
      detail: null,
    });
  }

  return { updatedCases, updatedReviews, deletedPaths, refusedCaseIds };
}

// ---------------------------------------------------------------------------
// Emergency manual delete (any state that still holds an object)
// ---------------------------------------------------------------------------

export async function emergencyDeleteRawSource(input: {
  kase: IdentityDocumentCase;
  review: IdentityVerificationRecord | null;
  actorType: IdentityAuditActor;
  actorId: string | null;
  provider: IdentityMediaPort;
  audit: IdentityAuditSink;
  now: Date;
}): Promise<
  IdentityFlowResult<{ kase: IdentityDocumentCase; review: IdentityVerificationRecord | null }>
> {
  const { kase } = input;
  if (kase.storagePath === null) {
    // Nothing to delete is a success for an emergency delete: idempotent.
    return { ok: true, value: { kase, review: input.review } };
  }
  if (!canTransition(kase.status, "deleted")) {
    return {
      ok: false,
      code: "INVALID_STATE",
      message: `An emergency delete cannot run from status ${kase.status}.`,
    };
  }
  const removed = await input.provider.deleteObject(kase.storagePath);
  if (!removed.ok) {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: removed.message ?? "Identity storage refused the delete; the pointer is kept for retry.",
    };
  }
  const at = input.now.toISOString();
  await input.audit({
    tenantId: kase.tenantId,
    caseId: kase.caseId,
    memberId: kase.memberId,
    kind: "emergency_deleted",
    actorType: input.actorType,
    actorId: input.actorId,
    at,
    detail: null,
  });
  const updated: IdentityDocumentCase = {
    ...kase,
    status: "deleted",
    storagePath: null,
    rawDeletedAt: at,
    updatedAt: at,
  };
  const review =
    input.review && input.review.rawSourceDeletedAt === null
      ? { ...input.review, rawSourceDeletedAt: at }
      : input.review;
  return { ok: true, value: { kase: updated, review } };
}

// ---------------------------------------------------------------------------
// Admin access (audited before any URL exists)
// ---------------------------------------------------------------------------

export const IDENTITY_ADMIN_ACCESS_TTL_SECONDS = 120;

// Mint a short-lived signed URL for a reviewer to see the document. The
// ordering is the contract: the audit event is written and awaited FIRST, so
// a failed audit means no URL and there is never a view without a record of
// the view. Cross-member access is refused before anything else happens.
export async function adminViewIdentityDocument(input: {
  kase: IdentityDocumentCase;
  requestedMemberId: string;
  adminId: string;
  provider: IdentityMediaPort;
  audit: IdentityAuditSink;
  now: Date;
  expiresInSeconds?: number;
}): Promise<IdentityFlowResult<IdentityAccessGrant>> {
  if (!foundingActivationEnabled()) {
    return { ok: false, code: "DISABLED", message: "Founding membership activation is disabled." };
  }
  if (input.kase.memberId !== input.requestedMemberId) {
    // The message never confirms whose document this is.
    return { ok: false, code: "REFUSED", message: "That document does not belong to the requested member." };
  }
  if (typeof input.adminId !== "string" || input.adminId.length === 0) {
    return { ok: false, code: "REFUSED", message: "Document access requires a named administrator." };
  }
  if (input.kase.storagePath === null) {
    return { ok: false, code: "INVALID_STATE", message: "The raw source for this case no longer exists." };
  }

  // Audit first. If this throws, the caller sees the failure and no URL was
  // ever minted.
  await input.audit({
    tenantId: input.kase.tenantId,
    caseId: input.kase.caseId,
    memberId: input.kase.memberId,
    kind: "admin_viewed",
    actorType: "admin",
    actorId: input.adminId,
    at: input.now.toISOString(),
    detail: null,
  });

  const grant = await input.provider.createAdminAccessUrl({
    storagePath: input.kase.storagePath,
    expiresInSeconds: input.expiresInSeconds ?? IDENTITY_ADMIN_ACCESS_TTL_SECONDS,
    now: input.now,
  });
  if (!grant.ok) {
    return { ok: false, code: "PROVIDER_ERROR", message: grant.message ?? "Identity storage refused the access URL." };
  }
  return { ok: true, value: grant.value };
}
