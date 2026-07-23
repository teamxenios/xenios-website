// ---------------------------------------------------------------------------
// xenios research founding membership activation, Domain 2: renewals.
//
// Each $25 renewal covers the NEXT 30 calendar days. The member initiates
// every payment; this is NOT automatic billing, and nothing in this module can
// charge anyone. What lives here:
//
//   - creating manual $25 renewal obligations (via the shared obligation core),
//   - the pure schedule: upcoming -> due -> overdue -> in_grace -> suspended,
//     computed from the due date and a named policy, applied only through the
//     legal transition matrix,
//   - the verified-renewal extension: EXACTLY one 30-day period per verified
//     renewal, guarded twice (the period store's funding-obligation uniqueness
//     and the status guard), so a duplicate approval cannot extend twice,
//   - the notice schedule as DATA (7d before, 3d before, due day, 1 day over,
//     grace start, suspension warning, suspension confirmed) for the email
//     wave to consume. Notices remind; they never move money.
//
// Everything stays behind RESEARCH_FOUNDING_ACTIVATION_ENABLED (default
// false), wired by the surface wave.
// ---------------------------------------------------------------------------

import {
  FoundingActivationError,
  MEMBERSHIP_PERIOD_DAYS,
  RENEWAL_AMOUNT_CENTS,
  VERIFIABLE_STATUSES,
  addCalendarDays,
  canTransition,
  canVerify,
  createObligation,
  newId,
  transitionObligation,
  validateVerification,
  type AdminIdentity,
  type AdminVerification,
  type ObligationRecord,
  type ObligationStatus,
  type PaymentMethodSnapshot,
} from "./obligations";
import {
  createInMemoryObligationsStore,
  type ObligationsStore,
} from "./persistence/obligations-store";
import {
  createInMemoryPeriodsStore,
  type MembershipPeriodRecord,
  type PeriodsStore,
} from "./persistence/periods-store";
import {
  createInMemoryLedger,
  createInMemoryMembershipState,
  createInMemoryReceipts,
  sequentialTransactionRunner,
  type AdminVerificationInput,
  type LedgerEntry,
  type LedgerWriter,
  type MembershipState,
  type MembershipStateWriter,
  type ReceiptIssuer,
  type ReceiptRecord,
  type TransactionRunner,
} from "./activation";
import {
  InMemoryIdempotencyStore,
  type IdempotencyStore,
} from "../commerce/persistence/idempotency-store";

// ---------------------------------------------------------------------------
// Policy (named numbers, injectable; the spec wave can tune them)
// ---------------------------------------------------------------------------

export interface RenewalPolicy {
  /** How many days before the due date the obligation moves upcoming -> due. */
  openDaysBeforeDue: number;
  /** Days past due before overdue hardens into the grace window. */
  overdueToGraceDays: number;
  /** Length of the grace window before suspension is reached. */
  graceDays: number;
}

export const DEFAULT_RENEWAL_POLICY: RenewalPolicy = {
  openDaysBeforeDue: 7,
  overdueToGraceDays: 3,
  graceDays: 7,
};

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/** Create a manual $25 renewal obligation due at the given period end. */
export function createRenewalObligation(input: {
  memberId: string;
  method: PaymentMethodSnapshot;
  dueAt: Date;
  now: Date;
}): ObligationRecord {
  return createObligation({
    memberId: input.memberId,
    type: "renewal_25",
    method: input.method,
    now: input.now,
    dueAt: input.dueAt,
  });
}

// ---------------------------------------------------------------------------
// The pure schedule
// ---------------------------------------------------------------------------

/** The schedule-driven statuses, in the order time walks through them. */
export const SCHEDULE_CHAIN: readonly ObligationStatus[] = [
  "upcoming",
  "due",
  "overdue",
  "in_grace",
  "suspended",
];

/**
 * Where an untouched renewal obligation SHOULD sit at `now`, from its due
 * date and the policy alone. Pure and deterministic; it looks at nothing but
 * its arguments.
 */
export function scheduleStatusAt(
  dueAt: Date,
  now: Date,
  policy: RenewalPolicy = DEFAULT_RENEWAL_POLICY,
): ObligationStatus {
  const opensAt = addCalendarDays(dueAt, -policy.openDaysBeforeDue);
  const graceAt = addCalendarDays(dueAt, policy.overdueToGraceDays);
  const suspendAt = addCalendarDays(graceAt, policy.graceDays);
  if (now.getTime() < opensAt.getTime()) return "upcoming";
  if (now.getTime() <= dueAt.getTime()) return "due";
  if (now.getTime() < graceAt.getTime()) return "overdue";
  if (now.getTime() < suspendAt.getTime()) return "in_grace";
  return "suspended";
}

/**
 * Walk an obligation forward along the schedule chain to where the clock says
 * it should be, one legal transition at a time, appending a system audit
 * event per step. A submitted, verified, or terminal obligation is left
 * exactly as it is: the schedule never overrides a human in the loop.
 */
export function applyScheduleTransitions(
  record: ObligationRecord,
  now: Date,
  policy: RenewalPolicy = DEFAULT_RENEWAL_POLICY,
): ObligationRecord {
  if (!SCHEDULE_CHAIN.includes(record.status)) return record;
  const target = scheduleStatusAt(new Date(record.dueAt), now, policy);
  const from = SCHEDULE_CHAIN.indexOf(record.status);
  const to = SCHEDULE_CHAIN.indexOf(target);
  if (to <= from) return record;
  let next = record;
  for (let i = from + 1; i <= to; i++) {
    const step = SCHEDULE_CHAIN[i];
    if (!canTransition(next.status, step)) break;
    next = transitionObligation(
      next,
      step,
      { actorType: "system", actorId: null },
      now,
      "schedule_advanced",
      `target=${target}`,
    );
  }
  return next;
}

// ---------------------------------------------------------------------------
// Notice schedule (data for the email wave; reminders, never money movement)
// ---------------------------------------------------------------------------

export interface RenewalNoticeDefinition {
  key: string;
  /** Days relative to the due date; negative is before, positive after. */
  offsetDaysFromDue: number;
  /** Outbox template identifier the email wave renders. */
  template: string;
  audience: "member";
}

/** The member initiates every payment; notices only remind. This constant is
 * the display-contract line every notice template must carry. */
export const NO_AUTOMATIC_BILLING_CONTRACT =
  "Xenios never charges you automatically. You send each renewal payment yourself, " +
  "and Xenios verifies it by hand.";

export function renewalNoticeSchedule(
  policy: RenewalPolicy = DEFAULT_RENEWAL_POLICY,
): RenewalNoticeDefinition[] {
  const graceStart = policy.overdueToGraceDays;
  const suspensionDay = policy.overdueToGraceDays + policy.graceDays;
  return [
    { key: "renewal_upcoming_7d", offsetDaysFromDue: -7, template: "fm_renewal_upcoming_7d", audience: "member" },
    { key: "renewal_upcoming_3d", offsetDaysFromDue: -3, template: "fm_renewal_upcoming_3d", audience: "member" },
    { key: "renewal_due_today", offsetDaysFromDue: 0, template: "fm_renewal_due_today", audience: "member" },
    { key: "renewal_overdue_1d", offsetDaysFromDue: 1, template: "fm_renewal_overdue_1d", audience: "member" },
    { key: "renewal_grace_started", offsetDaysFromDue: graceStart, template: "fm_renewal_grace_started", audience: "member" },
    {
      key: "renewal_suspension_warning",
      offsetDaysFromDue: Math.max(graceStart + 1, suspensionDay - 2),
      template: "fm_renewal_suspension_warning",
      audience: "member",
    },
    {
      key: "renewal_suspension_confirmed",
      offsetDaysFromDue: suspensionDay,
      template: "fm_renewal_suspension_confirmed",
      audience: "member",
    },
  ];
}

// ---------------------------------------------------------------------------
// The renewal service (verification extends exactly one period)
// ---------------------------------------------------------------------------

export interface RenewalResult {
  obligation: ObligationRecord;
  period: MembershipPeriodRecord;
  nextRenewalObligation: ObligationRecord;
  receipt: ReceiptRecord;
  ledgerEntryId: string;
  membership: MembershipState;
  replayed: boolean;
}

export interface RenewalServiceDeps {
  obligations?: ObligationsStore;
  periods?: PeriodsStore;
  membership?: MembershipStateWriter;
  ledger?: LedgerWriter;
  receipts?: ReceiptIssuer;
  idempotency?: IdempotencyStore;
  tx?: TransactionRunner;
  now?: () => Date;
  policy?: RenewalPolicy;
}

export function createRenewalService(deps: RenewalServiceDeps = {}) {
  const obligations = deps.obligations ?? createInMemoryObligationsStore();
  const periods = deps.periods ?? createInMemoryPeriodsStore();
  const membership = deps.membership ?? createInMemoryMembershipState();
  const ledger = deps.ledger ?? createInMemoryLedger();
  const receipts = deps.receipts ?? createInMemoryReceipts();
  const idempotency = deps.idempotency ?? new InMemoryIdempotencyStore();
  const tx = deps.tx ?? sequentialTransactionRunner;
  const now = deps.now ?? (() => new Date());
  const policy = deps.policy ?? DEFAULT_RENEWAL_POLICY;

  return {
    stores: { obligations, periods, membership, ledger, receipts },
    policy,

    /** Sweep one obligation along the schedule (upcoming/due/overdue/grace/
     * suspended) and persist the walk. Suspension of the MEMBERSHIP follows
     * the obligation reaching suspended. */
    async advanceSchedule(obligationId: string): Promise<ObligationRecord> {
      const record = await obligations.get(obligationId);
      if (!record) throw new FoundingActivationError("not_found", "No obligation with that id.");
      const at = now();
      const next = applyScheduleTransitions(record, at, policy);
      if (next !== record) {
        if (next.status === "suspended") {
          await membership.setSuspended(record.memberId, at.toISOString());
        }
        await obligations.save(next);
      }
      return next;
    },

    /**
     * Verify a renewal payment. Extends coverage by EXACTLY one 30-day
     * period: the new period starts where the current one ends (or now, if
     * coverage lapsed), and a duplicate approval cannot extend twice: same
     * key replays, different key hits the verified-status and
     * period-per-obligation guards.
     */
    async verifyRenewal(
      admin: AdminIdentity,
      obligationId: string,
      fields: AdminVerificationInput,
      idempotencyKey: string,
    ): Promise<RenewalResult> {
      if (!admin.adminId || !canVerify(admin.role)) {
        throw new FoundingActivationError(
          "not_permitted",
          "Only a named admin with a verifier role can verify a renewal.",
        );
      }
      if (!idempotencyKey) {
        throw new FoundingActivationError("validation_failed", "An idempotency key is required.");
      }
      const outcome = await idempotency.once(
        `fm_renewal_verify:${obligationId}`,
        idempotencyKey,
        async () => {
          const record = await obligations.get(obligationId);
          if (!record) throw new FoundingActivationError("not_found", "No obligation with that id.");
          if (record.type !== "renewal_25") {
            throw new FoundingActivationError(
              "validation_failed",
              "This obligation is an activation; verify it through the activation service.",
            );
          }
          if (record.status === "verified" || (await periods.findByFundingObligation(obligationId))) {
            throw new FoundingActivationError(
              "already_extended",
              "This renewal already extended a period; a duplicate approval cannot extend twice.",
            );
          }
          if (!VERIFIABLE_STATUSES.includes(record.status)) {
            throw new FoundingActivationError(
              "illegal_transition",
              `A renewal cannot be verified while the obligation is ${record.status}.`,
            );
          }
          const at = now();
          const verification: AdminVerification = { ...fields, verifiedAt: at.toISOString() };
          const errors = validateVerification(verification);
          if (errors.length > 0) {
            throw new FoundingActivationError(
              "validation_failed",
              "The verification is incomplete; every field and the explicit confirmation are required.",
              errors,
            );
          }
          if (verification.amountReceivedCents !== record.expectedAmountCents) {
            throw new FoundingActivationError(
              "amount_mismatch",
              "The amount received does not match the amount due; record a mismatch instead of verifying.",
            );
          }

          const latest = await periods.latestForMember(record.memberId);
          if (!latest) {
            throw new FoundingActivationError(
              "illegal_transition",
              "No membership period exists; the activation payment must verify first.",
            );
          }

          return tx.run(async () => {
            const atIso = at.toISOString();

            let verified = transitionObligation(
              record,
              "verified",
              {
                actorType: "admin",
                actorId: admin.adminId,
                actorRole: admin.role,
                ip: admin.ip ?? null,
                userAgent: admin.userAgent ?? null,
              },
              at,
              "admin_verified",
              `old=${record.status} new=verified admin=${admin.adminId} role=${admin.role}`,
            );
            verified = {
              ...verified,
              verification,
              receivingAccountRef: verification.receivingDestinationRef,
            };

            const ledgerEntry: LedgerEntry = {
              entryId: newId(),
              memberId: record.memberId,
              obligationId: record.obligationId,
              entryType: "renewal_payment",
              amountCents: RENEWAL_AMOUNT_CENTS,
              recordedAt: atIso,
              actorId: admin.adminId,
            };
            await ledger.append(ledgerEntry);

            const receipt = await receipts.issueOnce({
              receiptId: newId(),
              receiptNumber: `RCPT-${verified.humanRef}`,
              obligationId: record.obligationId,
              memberId: record.memberId,
              amountCents: RENEWAL_AMOUNT_CENTS,
              currency: record.currency,
              methodLabel: record.method.label,
              issuedAt: atIso,
            });
            verified = { ...verified, receiptRef: receipt.receiptId };

            // EXACTLY one period. Continuous coverage extends from the
            // current period end; lapsed coverage restarts now. All dates
            // are the server's.
            const lapsed = Date.parse(latest.endsAt) < at.getTime();
            const startsAt = lapsed ? atIso : latest.endsAt;
            const period: MembershipPeriodRecord = {
              periodId: newId(),
              memberId: record.memberId,
              sequence: latest.sequence + 1,
              startsAt,
              endsAt: addCalendarDays(new Date(startsAt), MEMBERSHIP_PERIOD_DAYS).toISOString(),
              fundingObligationId: record.obligationId,
              createdAt: atIso,
            };
            await periods.append(period);

            // A suspended (or still pending-looking) membership becomes
            // active again; the original activation timestamp is preserved.
            await membership.setActive(record.memberId, atIso);

            // The NEXT renewal obligation, due at the new period end. Each
            // $25 covers the next 30 days, so the chain continues.
            const nextRenewal = createRenewalObligation({
              memberId: record.memberId,
              method: record.method,
              dueAt: new Date(period.endsAt),
              now: at,
            });
            await obligations.save(nextRenewal);

            await obligations.save(verified);

            const result: Omit<RenewalResult, "replayed"> = {
              obligation: verified,
              period,
              nextRenewalObligation: nextRenewal,
              receipt,
              ledgerEntryId: ledgerEntry.entryId,
              membership: await membership.getState(record.memberId),
            };
            return result;
          });
        },
      );
      return { ...outcome.value, replayed: outcome.replayed };
    },
  };
}

export type RenewalService = ReturnType<typeof createRenewalService>;
