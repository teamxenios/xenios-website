// ---------------------------------------------------------------------------
// xenios research founding membership activation, Domain 2: verification and
// activation (the one place membership state moves forward).
//
// A member REPORTING a payment never activates anything. Activation happens
// only inside verifyPayment: a named admin, with permission, records every
// verification field and explicitly confirms receipt, and then, in ONE
// transaction seam:
//
//   obligation verified -> append-only ledger entry -> receipt (once) ->
//   membership active -> activation timestamp -> period start now, end
//   +30 CALENDAR days (server-side) -> the first $25 renewal obligation due
//   at the period end -> portal unlock signal -> audit.
//
// Idempotency rides the EXISTING IdempotencyStore (Track B): a repeated click
// with the same key replays the stored result, and a second attempt with a
// different key is refused by the status guard, so there is only ever ONE
// membership, ONE period, ONE receipt, and ONE renewal obligation.
//
// The reject, request-info, mismatch, duplicate, cancel, and migrate
// transitions live here too; none of them activates anything. Reversal and
// refund of an already-verified payment append a compensating ledger entry
// and suspend the membership the payment was funding.
//
// No screenshot, no evidence file, and no model output can trigger any of
// this: the only entry point is an admin identity passing the role gate.
// Everything stays behind RESEARCH_FOUNDING_ACTIVATION_ENABLED (default
// false), which the surface wave wires into routes and production guards.
// ---------------------------------------------------------------------------

import {
  ACTIVATION_AMOUNT_CENTS,
  FoundingActivationError,
  MEMBERSHIP_PERIOD_DAYS,
  TERMINAL_STATUSES,
  VERIFIABLE_STATUSES,
  addCalendarDays,
  canVerify,
  createObligation,
  findDuplicateExternalRefs,
  migrateObligationMethod,
  newId,
  recordMemberSubmission,
  transitionObligation,
  validateVerification,
  type AdminIdentity,
  type AdminVerification,
  type AuditActor,
  type BridgePhase,
  type MemberPaymentSubmission,
  type ObligationRecord,
  type PaymentMethodSnapshot,
} from "./obligations";
import {
  createInMemoryObligationsStore,
  resolveObligationsStore,
  type ObligationsStore,
} from "./persistence/obligations-store";
import {
  createInMemoryPeriodsStore,
  resolvePeriodsStore,
  type MembershipPeriodRecord,
  type PeriodsStore,
} from "./persistence/periods-store";
import {
  InMemoryIdempotencyStore,
  type IdempotencyStore,
} from "../commerce/persistence/idempotency-store";

// ---------------------------------------------------------------------------
// Membership state port. The real wiring updates the EXISTING member record
// (research_members: status, activated_at); this domain never creates a second
// member system. The in-memory writer is the reference and the test double.
// ---------------------------------------------------------------------------

export type MembershipStatus = "pending_activation" | "active" | "suspended" | "cancelled";

export interface MembershipState {
  memberId: string;
  status: MembershipStatus;
  activatedAt: string | null;
}

export interface MembershipStateWriter {
  getState(memberId: string): Promise<MembershipState>;
  setActive(memberId: string, activatedAt: string): Promise<void>;
  setSuspended(memberId: string, at: string): Promise<void>;
}

/** The portal (member area) unlocks if and only if the membership is active.
 * Before verification the portal stays locked, whatever was submitted. */
export function portalUnlocked(state: MembershipState): boolean {
  return state.status === "active";
}

export function createInMemoryMembershipState(): MembershipStateWriter {
  const states = new Map<string, MembershipState>();
  const stateOf = (memberId: string): MembershipState =>
    states.get(memberId) ?? { memberId, status: "pending_activation", activatedAt: null };
  return {
    async getState(memberId) {
      return { ...stateOf(memberId) };
    },
    async setActive(memberId, activatedAt) {
      const prior = stateOf(memberId);
      // The FIRST activation timestamp is the activation of record; a renewal
      // reactivation does not rewrite history.
      states.set(memberId, {
        memberId,
        status: "active",
        activatedAt: prior.activatedAt ?? activatedAt,
      });
    },
    async setSuspended(memberId, _at) {
      const prior = stateOf(memberId);
      states.set(memberId, { ...prior, memberId, status: "suspended" });
    },
  };
}

// ---------------------------------------------------------------------------
// Ledger port (append-only) and receipt port (once per obligation)
// ---------------------------------------------------------------------------

export type LedgerEntryType = "activation_payment" | "renewal_payment" | "reversal" | "refund";

export interface LedgerEntry {
  entryId: string;
  memberId: string;
  obligationId: string;
  entryType: LedgerEntryType;
  /** Positive for money received, negative for a reversal or refund. */
  amountCents: number;
  recordedAt: string;
  actorId: string;
}

export interface LedgerWriter {
  append(entry: LedgerEntry): Promise<void>;
  listByObligation(obligationId: string): Promise<LedgerEntry[]>;
  listByMember(memberId: string): Promise<LedgerEntry[]>;
}

export function createInMemoryLedger(): LedgerWriter {
  const entries: LedgerEntry[] = [];
  return {
    async append(entry) {
      entries.push({ ...entry });
    },
    async listByObligation(obligationId) {
      return entries.filter((e) => e.obligationId === obligationId).map((e) => ({ ...e }));
    },
    async listByMember(memberId) {
      return entries.filter((e) => e.memberId === memberId).map((e) => ({ ...e }));
    },
  };
}

export interface ReceiptRecord {
  receiptId: string;
  /** Human receipt number, derived from the obligation's human ref. */
  receiptNumber: string;
  obligationId: string;
  memberId: string;
  amountCents: number;
  currency: string;
  /** The admin-configured method label only, never receiving details. */
  methodLabel: string;
  issuedAt: string;
}

export interface ReceiptIssuer {
  /** Issue at most one receipt per obligation; a second call returns the first. */
  issueOnce(receipt: ReceiptRecord): Promise<ReceiptRecord>;
  findByObligation(obligationId: string): Promise<ReceiptRecord | null>;
}

export function createInMemoryReceipts(): ReceiptIssuer {
  const byObligation = new Map<string, ReceiptRecord>();
  return {
    async issueOnce(receipt) {
      const existing = byObligation.get(receipt.obligationId);
      if (existing) return { ...existing };
      byObligation.set(receipt.obligationId, { ...receipt });
      return { ...receipt };
    },
    async findByObligation(obligationId) {
      const found = byObligation.get(obligationId);
      return found ? { ...found } : null;
    },
  };
}

// ---------------------------------------------------------------------------
// The transaction seam. The default runner executes the work sequentially in
// one process; a Supabase RPC that wraps the same writes in a database
// transaction drops in behind this interface later, without a rewrite.
// ---------------------------------------------------------------------------

export interface TransactionRunner {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export const sequentialTransactionRunner: TransactionRunner = {
  run: (work) => work(),
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** The verification fields the admin supplies; verifiedAt is stamped by the
 * server clock, never accepted from a client. */
export type AdminVerificationInput = Omit<AdminVerification, "verifiedAt">;

export interface ActivationResult {
  obligation: ObligationRecord;
  period: MembershipPeriodRecord;
  renewalObligation: ObligationRecord;
  receipt: ReceiptRecord;
  ledgerEntryId: string;
  portalUnlock: { memberId: string; effectiveAt: string };
  membership: MembershipState;
  replayed: boolean;
}

export interface ActivationServiceDeps {
  obligations?: ObligationsStore;
  periods?: PeriodsStore;
  membership?: MembershipStateWriter;
  ledger?: LedgerWriter;
  receipts?: ReceiptIssuer;
  idempotency?: IdempotencyStore;
  tx?: TransactionRunner;
  now?: () => Date;
}

function adminActor(admin: AdminIdentity): AuditActor {
  return {
    actorType: "admin",
    actorId: admin.adminId,
    actorRole: admin.role,
    ip: admin.ip ?? null,
    userAgent: admin.userAgent ?? null,
  };
}

function requireVerifier(admin: AdminIdentity): void {
  if (!admin.adminId || !canVerify(admin.role)) {
    throw new FoundingActivationError(
      "not_permitted",
      "Only a named admin with a verifier role can perform this action.",
    );
  }
}

export function createActivationService(deps: ActivationServiceDeps = {}) {
  const obligations = deps.obligations ?? createInMemoryObligationsStore();
  const periods = deps.periods ?? createInMemoryPeriodsStore();
  const membership = deps.membership ?? createInMemoryMembershipState();
  const ledger = deps.ledger ?? createInMemoryLedger();
  const receipts = deps.receipts ?? createInMemoryReceipts();
  const idempotency = deps.idempotency ?? new InMemoryIdempotencyStore();
  const tx = deps.tx ?? sequentialTransactionRunner;
  const now = deps.now ?? (() => new Date());

  async function mustLoad(obligationId: string): Promise<ObligationRecord> {
    const record = await obligations.get(obligationId);
    if (!record) {
      throw new FoundingActivationError("not_found", "No obligation with that id.");
    }
    return record;
  }

  return {
    stores: { obligations, periods, membership, ledger, receipts },

    /**
     * Create the member's single $50 activation obligation. $50 includes the
     * first 30 days; NO $25 obligation is created at activation. Creating is
     * idempotent by construction: an existing open activation obligation is
     * returned rather than duplicated, and an already-active membership
     * refuses a second activation outright.
     */
    async createActivation(
      memberId: string,
      method: PaymentMethodSnapshot,
    ): Promise<ObligationRecord> {
      const state = await membership.getState(memberId);
      if (state.status === "active") {
        throw new FoundingActivationError("already_exists", "This membership is already active.");
      }
      const existing = (await obligations.listByMember(memberId)).find(
        (record) =>
          record.type === "activation_50" &&
          record.status !== "cancelled" &&
          !TERMINAL_STATUSES.includes(record.status),
      );
      if (existing) return existing;
      const record = createObligation({ memberId, type: "activation_50", method, now: now() });
      await obligations.save(record);
      return record;
    },

    /**
     * Record the member's payment report. This NEVER changes membership state
     * (see SUBMISSION_DISPLAY_CONTRACT). If the report re-uses an external
     * reference already reported on another obligation with the same method,
     * the obligation is flagged duplicate for human review, still without any
     * membership change.
     */
    async recordSubmission(
      obligationId: string,
      submission: Omit<MemberPaymentSubmission, "submittedAt">,
      actor: { memberId: string; ip?: string | null; userAgent?: string | null },
    ): Promise<ObligationRecord> {
      const record = await mustLoad(obligationId);
      if (record.memberId !== actor.memberId) {
        throw new FoundingActivationError("not_permitted", "This obligation belongs to another member.");
      }
      const at = now();
      let next = recordMemberSubmission(
        record,
        { ...submission, submittedAt: at.toISOString() },
        { actorType: "member", actorId: actor.memberId, ip: actor.ip, userAgent: actor.userAgent },
        at,
      );
      const duplicates = findDuplicateExternalRefs(await obligations.listAll(), next);
      if (duplicates.length > 0) {
        next = transitionObligation(
          next,
          "duplicate",
          { actorType: "system", actorId: null },
          at,
          "duplicate_external_ref",
          `matches=${duplicates.map((d) => d.humanRef).join(",")}`,
        );
      }
      await obligations.save(next);
      return next;
    },

    /**
     * The admin verification that activates the membership. Requires every
     * verification field plus an explicit confirmation, gated on the admin
     * role, and idempotent per (obligation, idempotency key): repeated clicks
     * produce ONE membership, ONE period, ONE receipt, ONE renewal.
     */
    async verifyPayment(
      admin: AdminIdentity,
      obligationId: string,
      fields: AdminVerificationInput,
      idempotencyKey: string,
    ): Promise<ActivationResult> {
      requireVerifier(admin);
      if (!idempotencyKey) {
        throw new FoundingActivationError("validation_failed", "An idempotency key is required.");
      }
      const outcome = await idempotency.once(
        `fm_activation_verify:${obligationId}`,
        idempotencyKey,
        async () => {
          const record = await mustLoad(obligationId);
          if (record.type !== "activation_50") {
            throw new FoundingActivationError(
              "validation_failed",
              "This obligation is a renewal; verify it through the renewal service.",
            );
          }
          if (record.status === "verified" || (await periods.findByFundingObligation(obligationId))) {
            throw new FoundingActivationError(
              "already_verified",
              "This payment is already verified; a second approval cannot activate twice.",
            );
          }
          if (!VERIFIABLE_STATUSES.includes(record.status)) {
            throw new FoundingActivationError(
              "illegal_transition",
              `A payment cannot be verified while the obligation is ${record.status}.`,
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

          return tx.run(async () => {
            const atIso = at.toISOString();

            // 1. Obligation verified, with the admin's identity, old and new
            // state, and hashed request context in the append-only trail.
            let verified = transitionObligation(
              record,
              "verified",
              adminActor(admin),
              at,
              "admin_verified",
              `old=${record.status} new=verified admin=${admin.adminId} role=${admin.role}`,
            );
            verified = {
              ...verified,
              verification,
              receivingAccountRef: verification.receivingDestinationRef,
            };

            // 2. Append-only ledger entry.
            const ledgerEntry: LedgerEntry = {
              entryId: newId(),
              memberId: record.memberId,
              obligationId: record.obligationId,
              entryType: "activation_payment",
              amountCents: ACTIVATION_AMOUNT_CENTS,
              recordedAt: atIso,
              actorId: admin.adminId,
            };
            await ledger.append(ledgerEntry);

            // 3. Receipt, issued once.
            const receipt = await receipts.issueOnce({
              receiptId: newId(),
              receiptNumber: `RCPT-${verified.humanRef}`,
              obligationId: record.obligationId,
              memberId: record.memberId,
              amountCents: ACTIVATION_AMOUNT_CENTS,
              currency: record.currency,
              methodLabel: record.method.label,
              issuedAt: atIso,
            });
            verified = { ...verified, receiptRef: receipt.receiptId };

            // 4 and 5. Membership active with its activation timestamp, and
            // the first period: starts now, ends +30 calendar days, all dates
            // from the server clock.
            await membership.setActive(record.memberId, atIso);
            // Sequence 1 for a first activation; a re-activation after a
            // reversal continues the member's period history.
            const latest = await periods.latestForMember(record.memberId);
            const period: MembershipPeriodRecord = {
              periodId: newId(),
              memberId: record.memberId,
              sequence: latest ? latest.sequence + 1 : 1,
              startsAt: atIso,
              endsAt: addCalendarDays(at, MEMBERSHIP_PERIOD_DAYS).toISOString(),
              fundingObligationId: record.obligationId,
              createdAt: atIso,
            };
            await periods.append(period);

            // 6. The first $25 renewal obligation, due at the period end.
            // This is the FIRST money after the $50; nothing else was owed at
            // activation.
            const renewal = createObligation({
              memberId: record.memberId,
              type: "renewal_25",
              method: record.method,
              now: at,
              dueAt: new Date(period.endsAt),
              bridgePhase: record.bridgePhase,
            });
            await obligations.save(renewal);

            // 7. Portal unlock signal and the closing audit event.
            verified = {
              ...verified,
              events: [
                ...verified.events,
                {
                  eventId: newId(),
                  obligationId: record.obligationId,
                  occurredAt: atIso,
                  action: "portal_unlocked",
                  actorType: "system" as const,
                  actorId: null,
                  actorRole: null,
                  ipHash: null,
                  userAgentHash: null,
                  fromStatus: "verified" as const,
                  toStatus: "verified" as const,
                  detail: `period=${period.periodId}`,
                },
              ],
            };
            await obligations.save(verified);

            const result: Omit<ActivationResult, "replayed"> = {
              obligation: verified,
              period,
              renewalObligation: renewal,
              receipt,
              ledgerEntryId: ledgerEntry.entryId,
              portalUnlock: { memberId: record.memberId, effectiveAt: atIso },
              membership: await membership.getState(record.memberId),
            };
            return result;
          });
        },
      );
      return { ...outcome.value, replayed: outcome.replayed };
    },

    // -----------------------------------------------------------------------
    // The non-activating admin transitions. None of these touches membership
    // state, periods, receipts, or the ledger (reversal and refund are the
    // exceptions and only ever move money BACKWARD).
    // -----------------------------------------------------------------------

    async startReview(admin: AdminIdentity, obligationId: string): Promise<ObligationRecord> {
      requireVerifier(admin);
      const record = await mustLoad(obligationId);
      const next = transitionObligation(record, "under_review", adminActor(admin), now(), "review_started");
      await obligations.save(next);
      return next;
    },

    async requestInfo(admin: AdminIdentity, obligationId: string, detail: string): Promise<ObligationRecord> {
      requireVerifier(admin);
      const record = await mustLoad(obligationId);
      const next = transitionObligation(record, "info_requested", adminActor(admin), now(), "info_requested", detail);
      await obligations.save(next);
      return next;
    },

    async markMismatch(admin: AdminIdentity, obligationId: string, detail: string): Promise<ObligationRecord> {
      requireVerifier(admin);
      const record = await mustLoad(obligationId);
      const next = transitionObligation(record, "mismatch", adminActor(admin), now(), "mismatch_recorded", detail);
      await obligations.save(next);
      return next;
    },

    async markDuplicate(admin: AdminIdentity, obligationId: string, detail: string): Promise<ObligationRecord> {
      requireVerifier(admin);
      const record = await mustLoad(obligationId);
      const next = transitionObligation(record, "duplicate", adminActor(admin), now(), "duplicate_recorded", detail);
      await obligations.save(next);
      return next;
    },

    async reject(admin: AdminIdentity, obligationId: string, detail: string): Promise<ObligationRecord> {
      requireVerifier(admin);
      const record = await mustLoad(obligationId);
      const next = transitionObligation(record, "rejected", adminActor(admin), now(), "rejected", detail);
      await obligations.save(next);
      return next;
    },

    async cancel(admin: AdminIdentity, obligationId: string, detail: string): Promise<ObligationRecord> {
      requireVerifier(admin);
      const record = await mustLoad(obligationId);
      const next = transitionObligation(record, "cancelled", adminActor(admin), now(), "cancelled", detail);
      await obligations.save(next);
      return next;
    },

    /** Swap an open obligation to a new method configuration (the phase B
     * migration). Status does not move; nothing activates. */
    async migrateMethod(
      admin: AdminIdentity,
      obligationId: string,
      newMethod: PaymentMethodSnapshot,
      newPhase: BridgePhase,
    ): Promise<ObligationRecord> {
      requireVerifier(admin);
      const record = await mustLoad(obligationId);
      const next = migrateObligationMethod(record, newMethod, newPhase, adminActor(admin), now());
      await obligations.save(next);
      return next;
    },

    /**
     * A verified payment came back (sender or bank reversal). Appends the
     * compensating ledger entry and suspends the membership when this payment
     * was funding the member's latest period. Never deletes history.
     */
    async reversePayment(admin: AdminIdentity, obligationId: string, detail: string): Promise<ObligationRecord> {
      return this.unwindPayment(admin, obligationId, "reversed", "reversal", detail);
    },

    /** Xenios refunded a verified payment. Same money-backward mechanics. */
    async refundPayment(admin: AdminIdentity, obligationId: string, detail: string): Promise<ObligationRecord> {
      return this.unwindPayment(admin, obligationId, "refunded", "refund", detail);
    },

    async unwindPayment(
      admin: AdminIdentity,
      obligationId: string,
      toStatus: "reversed" | "refunded",
      entryType: "reversal" | "refund",
      detail: string,
    ): Promise<ObligationRecord> {
      requireVerifier(admin);
      const record = await mustLoad(obligationId);
      const at = now();
      const next = transitionObligation(record, toStatus, adminActor(admin), at, entryType, detail);
      await ledger.append({
        entryId: newId(),
        memberId: record.memberId,
        obligationId: record.obligationId,
        entryType,
        amountCents: -record.expectedAmountCents,
        recordedAt: at.toISOString(),
        actorId: admin.adminId,
      });
      const latest = await periods.latestForMember(record.memberId);
      if (latest && latest.fundingObligationId === record.obligationId) {
        await membership.setSuspended(record.memberId, at.toISOString());
      }
      await obligations.save(next);
      return next;
    },
  };
}

export type ActivationService = ReturnType<typeof createActivationService>;

/** Production resolution: durable stores when Supabase is configured, else the
 * in-memory references. The surface wave supplies membership, ledger, and
 * receipt wiring against the real member record and tables. */
export function resolveActivationService(deps: ActivationServiceDeps = {}): ActivationService {
  return createActivationService({
    ...deps,
    obligations: deps.obligations ?? resolveObligationsStore(),
    periods: deps.periods ?? resolvePeriodsStore(),
  });
}
