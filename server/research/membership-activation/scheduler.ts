// ---------------------------------------------------------------------------
// xenios research founding membership activation: the scheduler tick.
//
// One pure tick function, (now, deps) in, a summary out, that runs the
// time-driven work no request ever triggers:
//
//   1. The renewal schedule sweep from renewals.ts data: every renewal_25
//      obligation still on the schedule chain walks forward (upcoming -> due
//      -> overdue -> in_grace -> suspended) to where the clock says it should
//      sit, one legal transition at a time. When the walk reaches suspended,
//      the MEMBERSHIP is suspended too, and fm_membership_suspended is
//      enqueued for the member.
//   2. Reinstatement detection: a verified renewal whose history passed
//      through suspended means the member paid their way back; enqueue
//      fm_membership_reinstated with the covered-through date.
//   3. The due renewal notices (emails.ts enqueueDueRenewalNotices), which
//      remind and never move money.
//   4. The identity raw-source retention deletion worker
//      (identity-retention.ts runRawDeletionSweep), persisted through the
//      injected store seams.
//   5. Reservation-expiry release, when the composition provides that seam
//      (the persistent ReservationRepository exposes no cross-member listing
//      yet, so the production wiring omits it; the seam is here for the
//      composition that gains one).
//
// Idempotency: a second tick at the same instant enqueues nothing new and
// performs nothing new. Every email event key is deterministic per
// (template, subject id) so the outbox unique event_key absorbs repeats; the
// schedule walk is a fixed point once an obligation sits where the clock says;
// the deletion planner plans nothing for a case whose pointer is already gone.
//
// The tick is active ONLY while RESEARCH_FOUNDING_ACTIVATION_ENABLED reads
// true AT TICK TIME (injected as a thunk so tests never touch process.env and
// a production env change needs no redeploy). Emails never block state
// changes: an enqueue failure is logged and the sweep continues.
// ---------------------------------------------------------------------------

import { foundingActivationEnabled, type ObligationRecord } from "./obligations";
import {
  DEFAULT_RENEWAL_POLICY,
  SCHEDULE_CHAIN,
  applyScheduleTransitions,
  type RenewalPolicy,
} from "./renewals";
import {
  enqueueDueRenewalNotices,
  enqueueFoundingEmail,
  type FoundingEmailEnqueue,
} from "./emails";
import {
  runRawDeletionSweep,
  type IdentityAuditSink,
  type IdentityRetentionConfig,
} from "./identity-retention";
import {
  IDENTITY_DEFAULT_TENANT,
  SupabaseIdentityMediaProvider,
  type IdentityDocumentCase,
  type IdentityMediaPort,
} from "./identity-documents";
import type { IdentityVerificationRecord } from "./identity-reviews";
import type { MembershipStateWriter } from "./activation";
import { resolveObligationsStore } from "./persistence/obligations-store";
import { resolvePeriodsStore } from "./persistence/periods-store";
import { resolveIdentityStore } from "./persistence/identity-store";
import { createSupabaseMembershipWriter } from "./production-deps";
import { enqueueNotification } from "../outbox";
import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";

// ---------------------------------------------------------------------------
// The dependency seams
// ---------------------------------------------------------------------------

export interface SchedulerObligations {
  listAll(): Promise<ObligationRecord[]>;
  save(record: ObligationRecord): Promise<void>;
}

export interface SchedulerPeriods {
  findByFundingObligation(obligationId: string): Promise<{ endsAt: string } | null>;
}

export interface SchedulerIdentity {
  /** Every case still holding a raw object (the deletion sweep's universe). */
  listCasesWithRawSource(): Promise<IdentityDocumentCase[]>;
  reviewForCase(caseId: string): Promise<IdentityVerificationRecord | null>;
  saveCase(record: IdentityDocumentCase): Promise<void>;
  saveReview(record: IdentityVerificationRecord): Promise<void>;
  provider: IdentityMediaPort;
  audit: IdentityAuditSink;
  config?: IdentityRetentionConfig;
}

export interface FoundingSchedulerDeps {
  /** Read at tick time; defaults to the RESEARCH_FOUNDING_ACTIVATION_ENABLED flag. */
  enabled?: () => boolean;
  obligations: SchedulerObligations;
  membership: Pick<MembershipStateWriter, "setSuspended">;
  periods?: SchedulerPeriods;
  recipientFor(memberId: string): Promise<string | null>;
  enqueue: FoundingEmailEnqueue;
  policy?: RenewalPolicy;
  identity?: SchedulerIdentity;
  /** The reservation-expiry release seam, when the composition provides one. */
  releaseExpiredReservations?: (now: Date) => Promise<number>;
}

export interface FoundingSchedulerTickResult {
  /** False when the flag was off at tick time: nothing was read or written. */
  ran: boolean;
  scheduleAdvanced: number;
  suspensionEmailsEnqueued: number;
  reinstatementEmailsEnqueued: number;
  renewalNoticesEnqueued: number;
  identityRawDeletions: number;
  reservationsReleased: number;
}

function emptyResult(): FoundingSchedulerTickResult {
  return {
    ran: false,
    scheduleAdvanced: 0,
    suspensionEmailsEnqueued: 0,
    reinstatementEmailsEnqueued: 0,
    renewalNoticesEnqueued: 0,
    identityRawDeletions: 0,
    reservationsReleased: 0,
  };
}

// ---------------------------------------------------------------------------
// Detection helpers (pure over one record)
// ---------------------------------------------------------------------------

/** A verified renewal whose audit trail passed through suspended: the member
 * paid their way back, so the membership was reinstated. */
export function wasReinstated(record: ObligationRecord): boolean {
  return (
    record.type === "renewal_25" &&
    record.status === "verified" &&
    record.events.some((event) => event.toStatus === "suspended")
  );
}

// An enqueue failure never blocks the sweep it follows.
async function safeEnqueue(
  enqueue: FoundingEmailEnqueue,
  input: { templateKey: string; recipient: string; subjectId: string; payload?: Record<string, unknown> },
): Promise<boolean> {
  try {
    return await enqueueFoundingEmail(enqueue, input);
  } catch (error) {
    console.error(
      "[founding-scheduler] email enqueue failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

export async function runFoundingSchedulerTick(
  now: Date,
  deps: FoundingSchedulerDeps,
): Promise<FoundingSchedulerTickResult> {
  const result = emptyResult();
  const enabled = deps.enabled ?? (() => foundingActivationEnabled());
  if (!enabled()) return result;
  result.ran = true;
  const policy = deps.policy ?? DEFAULT_RENEWAL_POLICY;

  // ---- 1 + 2: the renewal schedule sweep and the lifecycle emails ----------
  let current: ObligationRecord[] = [];
  try {
    const all = await deps.obligations.listAll();
    for (const record of all) {
      let next = record;
      try {
        if (record.type === "renewal_25" && SCHEDULE_CHAIN.includes(record.status)) {
          next = applyScheduleTransitions(record, now, policy);
          if (next !== record) {
            // Persist the walk FIRST; membership and email follow the money
            // spine, never precede it.
            await deps.obligations.save(next);
            result.scheduleAdvanced += 1;
            if (next.status === "suspended") {
              await deps.membership.setSuspended(next.memberId, now.toISOString());
            }
          }
        }

        // Suspension email for EVERY currently-suspended renewal, keyed by the
        // obligation id: crash-safe (a tick that died between save and email
        // recovers on the next tick) and idempotent (the outbox unique
        // event_key absorbs the repeat).
        if (next.type === "renewal_25" && next.status === "suspended") {
          const recipient = await deps.recipientFor(next.memberId);
          if (recipient) {
            const ok = await safeEnqueue(deps.enqueue, {
              templateKey: "fm_membership_suspended",
              recipient,
              subjectId: next.obligationId,
            });
            if (ok) result.suspensionEmailsEnqueued += 1;
          }
        }

        // Reinstatement email once a formerly-suspended renewal verifies.
        if (wasReinstated(next) && deps.periods) {
          const period = await deps.periods.findByFundingObligation(next.obligationId);
          if (period) {
            const recipient = await deps.recipientFor(next.memberId);
            if (recipient) {
              const ok = await safeEnqueue(deps.enqueue, {
                templateKey: "fm_membership_reinstated",
                recipient,
                subjectId: next.obligationId,
                payload: { coveredThrough: period.endsAt },
              });
              if (ok) result.reinstatementEmailsEnqueued += 1;
            }
          }
        }
      } catch (error) {
        // One obligation's failure never stops the sweep. Metadata only.
        console.error(
          "[founding-scheduler] schedule sweep item failed:",
          error instanceof Error ? error.message : "unknown error",
        );
      }
      current.push(next);
    }
  } catch (error) {
    console.error(
      "[founding-scheduler] schedule sweep failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    current = [];
  }

  // ---- 3: due renewal notices (reminders, never money movement) ------------
  try {
    result.renewalNoticesEnqueued = await enqueueDueRenewalNotices({
      obligations: current,
      recipientFor: deps.recipientFor,
      enqueue: deps.enqueue,
      now,
      policy,
    });
  } catch (error) {
    console.error(
      "[founding-scheduler] renewal notices failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  // ---- 4: identity raw-source retention deletions --------------------------
  if (deps.identity) {
    try {
      const identity = deps.identity;
      const cases = await identity.listCasesWithRawSource();
      const reviews: IdentityVerificationRecord[] = [];
      for (const kase of cases) {
        const review = await identity.reviewForCase(kase.caseId);
        if (review) reviews.push(review);
      }
      const sweep = await runRawDeletionSweep({
        now,
        cases,
        reviews,
        provider: identity.provider,
        audit: identity.audit,
        ...(identity.config ? { config: identity.config } : {}),
      });
      for (const updated of sweep.updatedCases) await identity.saveCase(updated);
      for (const updated of sweep.updatedReviews) await identity.saveReview(updated);
      result.identityRawDeletions = sweep.deletedPaths.length;
    } catch (error) {
      console.error(
        "[founding-scheduler] identity retention sweep failed:",
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }

  // ---- 5: reservation-expiry release (only where the seam exists) ----------
  if (deps.releaseExpiredReservations) {
    try {
      result.reservationsReleased = await deps.releaseExpiredReservations(now);
    } catch (error) {
      console.error(
        "[founding-scheduler] reservation release failed:",
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// The production composition (index.ts calls this bare from its interval)
// ---------------------------------------------------------------------------

/** The member's email for notifications. Null on any failure: an email that
 * cannot resolve must never block the sweep. */
async function productionMemberEmail(memberId: string): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("research_members")
      .select("email")
      .eq("id", memberId)
      .maybeSingle();
    if (error || !data) return null;
    const email = (data as { email?: unknown }).email;
    return typeof email === "string" && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

/**
 * One production tick. The flag AND storage are read here, at tick time, so
 * the interval in index.ts is a no-op until RESEARCH_FOUNDING_ACTIVATION_ENABLED
 * is true with storage provisioned, and turning the flag off stops the next
 * tick without a restart. The resolved Supabase stores are stateless over the
 * database, so re-resolving per tick holds no state of its own.
 */
export async function runProductionFoundingSchedulerTick(
  now: Date = new Date(),
): Promise<FoundingSchedulerTickResult> {
  if (!foundingActivationEnabled() || !supabaseConfigured()) return emptyResult();
  const identityStore = resolveIdentityStore();
  return runFoundingSchedulerTick(now, {
    obligations: resolveObligationsStore(),
    membership: createSupabaseMembershipWriter(),
    periods: resolvePeriodsStore(),
    recipientFor: productionMemberEmail,
    enqueue: enqueueNotification,
    identity: {
      listCasesWithRawSource: () => identityStore.listCasesWithRawSource(IDENTITY_DEFAULT_TENANT),
      reviewForCase: (caseId) => identityStore.getReviewForCase(IDENTITY_DEFAULT_TENANT, caseId),
      saveCase: (record) => identityStore.saveCase(record),
      saveReview: (record) => identityStore.saveReview(record),
      provider: new SupabaseIdentityMediaProvider(),
      audit: (event) => identityStore.appendAuditEvent(event),
    },
    // No releaseExpiredReservations: the persistent ReservationRepository has
    // no cross-member listing, so no honest global sweep exists yet. The seam
    // stays injectable for the composition that gains one.
  });
}
