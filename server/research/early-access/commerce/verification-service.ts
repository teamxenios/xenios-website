/**
 * Early Access manual payment verification service. Server only, pure, side effect free.
 *
 * `payment-verification.ts` owns the decision: who may decide, what a replay means, and
 * what an approval produces. This module is the lane around it that holds the two facts
 * that decision cannot see on its own, and refuses before delegating when either fails:
 *
 *   1. WHAT THE ADMIN LOOKED AT. There is no verification without a proof on file, and
 *      the reviewed reference must be the proof that is CURRENT. An admin who approves
 *      against a superseded photo is approving something the customer already replaced.
 *   2. WHAT THE ADMIN IS CONFIRMING. The amount recorded must equal the order's
 *      server-authoritative total. An admin cannot mark an order paid for an amount
 *      other than the one it was billed, in either direction.
 *
 * It also holds the append-only audit trail: actor, timestamp, decision, reason, order,
 * and the exact proof reference reviewed. A correction is a new row, never an edit.
 *
 * EXACTLY ONE APPROVAL PER ORDER. `payment-verification.ts` guarantees exactly once
 * within a ledger. This module supplies the ledger, and it selects it so that a prior
 * APPROVAL is always in scope no matter what happened afterwards. A rejection can be
 * superseded by a new proof; an approval never can. The receipt and supplier release
 * intent ids stay derived from the order id alone, so one order can still only ever
 * produce one receipt and one supplier release.
 */

import type { EarlyAccessPaymentOptionCode } from "@shared/research/early-access-payment-options";
import {
  accepted,
  isBoundedText,
  isCanonicalTimestamp,
  isOneOf,
  isSafeIdentifier,
  readPlainArray,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";
import { readEarlyAccessOrder, type EarlyAccessCurrency } from "./early-access-order";
import {
  EARLY_ACCESS_VERIFICATION_DECISIONS,
  EARLY_ACCESS_VERIFIER_ROLES,
  readEarlyAccessVerificationRecord,
  verifyManualPayment,
  type EarlyAccessPaymentVerification,
  type EarlyAccessVerificationDecision,
  type EarlyAccessVerificationFailureCode,
  type EarlyAccessVerificationOutcome,
  type EarlyAccessVerificationRecord,
  type EarlyAccessVerifierRole,
} from "./payment-verification";
import {
  currentProof,
  readEarlyAccessProofHistory,
  type EarlyAccessProofRecord,
} from "./proof-service";

/**
 * A rejection may be followed by another attempt, so the trail is longer than the one
 * record `payment-verification.ts` reads. It is still bounded: an order that has been
 * argued about this many times is an operations problem, not a validation problem.
 */
export const EARLY_ACCESS_MAX_DECISIONS_PER_ORDER = 8;

const MIN_REASON_LENGTH = 8;
const MAX_REASON_LENGTH = 500;

export type VerificationServiceFailureCode =
  | EarlyAccessVerificationFailureCode
  | "reason_insufficient"
  | "proof_missing"
  | "proof_history_invalid"
  | "proof_ref_mismatch"
  | "amount_mismatch"
  | "currency_mismatch"
  | "decision_history_invalid"
  | "payment_rejected_needs_new_proof";

/**
 * One decision, exactly as it is recorded. Everything a later reader needs to answer
 * "who decided this, when, on what evidence, and for how much" is on the row itself.
 */
export type EarlyAccessVerificationEntry = Readonly<{
  orderId: string;
  idempotencyKey: string;
  decision: EarlyAccessVerificationDecision;
  actorId: string;
  actorRole: EarlyAccessVerifierRole;
  decidedAt: string;
  method: EarlyAccessPaymentOptionCode | null;
  reason: string;
  /** The exact proof the human reviewed, not merely the one that happened to be latest. */
  reviewedProofId: string;
  reviewedProofRef: string;
  amountVerifiedCents: number;
  currency: EarlyAccessCurrency;
  /** One based position in this order's trail. Corrections append, never overwrite. */
  sequence: number;
}>;

export const EARLY_ACCESS_VERIFICATION_ENTRY_KEYS = [
  "orderId",
  "idempotencyKey",
  "decision",
  "actorId",
  "actorRole",
  "decidedAt",
  "method",
  "reason",
  "reviewedProofId",
  "reviewedProofRef",
  "amountVerifiedCents",
  "currency",
  "sequence",
] as const;

export type EarlyAccessVerificationDecisionOutcome = Readonly<{
  orderId: string;
  outcome: EarlyAccessVerificationOutcome;
  decision: EarlyAccessVerificationDecision;
  /** The authoritative entry for this decision. On a replay it is the ORIGINAL row. */
  entry: EarlyAccessVerificationEntry;
  /** The delegated result: transition, receipt intent, supplier intent, verified order. */
  verification: EarlyAccessPaymentVerification;
  /** Non-null exactly once per applied decision. A replay has nothing to write. */
  append: EarlyAccessVerificationEntry | null;
}>;

export type VerificationDecisionResult = CommerceResult<
  EarlyAccessVerificationDecisionOutcome,
  VerificationServiceFailureCode
>;

const DECIDE_REQUIRED_KEYS = [
  "order",
  "proofs",
  "decisions",
  "actor",
  "decision",
  "reason",
  "reviewedProofRef",
  "amountVerifiedCents",
  "currency",
  "idempotencyKey",
  "now",
] as const;

const DECIDE_OPTIONAL_KEYS = ["method"] as const;

const ACTOR_KEYS = ["id", "role"] as const;

/** Validate one stored decision row. Fails closed on any deviation. */
export function readEarlyAccessVerificationEntry(
  value: unknown,
): EarlyAccessVerificationEntry | null {
  const record = readPlainRecord(value, EARLY_ACCESS_VERIFICATION_ENTRY_KEYS);
  if (!record) return null;

  // The seven core fields are validated by the module that owns their vocabulary.
  const core = readEarlyAccessVerificationRecord({
    orderId: record.orderId,
    idempotencyKey: record.idempotencyKey,
    decision: record.decision,
    actorId: record.actorId,
    actorRole: record.actorRole,
    decidedAt: record.decidedAt,
    method: record.method,
  });
  if (!core) return null;

  if (!isBoundedText(record.reason, MAX_REASON_LENGTH)) return null;
  if (record.reason.trim().length < MIN_REASON_LENGTH) return null;
  if (!isSafeIdentifier(record.reviewedProofId)) return null;
  if (!isSafeIdentifier(record.reviewedProofRef)) return null;
  if (
    typeof record.amountVerifiedCents !== "number" ||
    !Number.isSafeInteger(record.amountVerifiedCents) ||
    record.amountVerifiedCents <= 0
  ) {
    return null;
  }
  if (record.currency !== "USD") return null;
  if (
    typeof record.sequence !== "number" ||
    !Number.isSafeInteger(record.sequence) ||
    record.sequence < 1 ||
    record.sequence > EARLY_ACCESS_MAX_DECISIONS_PER_ORDER
  ) {
    return null;
  }

  return Object.freeze({
    orderId: core.orderId,
    idempotencyKey: core.idempotencyKey,
    decision: core.decision,
    actorId: core.actorId,
    actorRole: core.actorRole,
    decidedAt: core.decidedAt,
    method: core.method,
    reason: record.reason,
    reviewedProofId: record.reviewedProofId,
    reviewedProofRef: record.reviewedProofRef,
    amountVerifiedCents: record.amountVerifiedCents,
    currency: "USD" as const,
    sequence: record.sequence,
  });
}

export function readEarlyAccessVerificationHistory(
  value: unknown,
): readonly EarlyAccessVerificationEntry[] | null {
  const entries = readPlainArray(value, EARLY_ACCESS_MAX_DECISIONS_PER_ORDER);
  if (!entries) return null;

  const records: EarlyAccessVerificationEntry[] = [];
  const keys = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = readEarlyAccessVerificationEntry(entries[index]);
    if (!entry) return null;
    if (entry.sequence !== index + 1) return null;
    // A reused idempotency key inside one trail is a collision, not a history.
    if (keys.has(entry.idempotencyKey)) return null;
    keys.add(entry.idempotencyKey);
    if (index > 0 && entry.orderId !== (records[index - 1] as EarlyAccessVerificationEntry).orderId) {
      return null;
    }
    records.push(entry);
  }
  return Object.freeze(records);
}

/** Project a stored row down to the seven fields the decision module reads. */
function toVerificationRecord(entry: EarlyAccessVerificationEntry): EarlyAccessVerificationRecord {
  return Object.freeze({
    orderId: entry.orderId,
    idempotencyKey: entry.idempotencyKey,
    decision: entry.decision,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    decidedAt: entry.decidedAt,
    method: entry.method,
  });
}

/**
 * Choose the single prior decision, if any, that must be in scope for this call.
 *
 * `payment-verification.ts` accepts at most one prior record, which is exactly the
 * behavior wanted here: whichever record this returns is the one the delegate will
 * measure the new call against. The precedence is deliberate.
 */
function priorInScope(
  history: readonly EarlyAccessVerificationEntry[],
  idempotencyKey: unknown,
  proof: EarlyAccessProofRecord,
): EarlyAccessVerificationEntry | null {
  // 1. A used key is a replay of THAT call, whatever else has happened since.
  const replayed = history.find((entry) => entry.idempotencyKey === idempotencyKey);
  if (replayed) return replayed;

  // 2. An approval is terminal. It stays in scope forever, so a later call can only
  //    ever be reported as a replay or a no-op, never as a second advance.
  const approved = history.find((entry) => entry.decision === "approve");
  if (approved) return approved;

  const latest = history.length === 0 ? null : (history[history.length - 1] as EarlyAccessVerificationEntry);
  if (latest === null) return null;

  // 3. A rejection holds until the customer sends something new. Comparing proof ids
  //    rather than timestamps keeps this clock free: the current proof either is the
  //    one that was rejected, or it is not.
  return latest.reviewedProofId === proof.proofId ? latest : null;
}

/**
 * Decide one manual payment with its evidence.
 *
 * Authorization is checked before the order, the proofs, or the amount are read, so an
 * unauthorized caller learns nothing about an order's payment state from the refusal.
 */
export function decideManualPayment(input: unknown): VerificationDecisionResult {
  const record = readPlainRecord(input, DECIDE_REQUIRED_KEYS, DECIDE_OPTIONAL_KEYS);
  if (!record) return refused("input_invalid");

  const actor = readPlainRecord(record.actor, ACTOR_KEYS);
  if (!actor || !isSafeIdentifier(actor.id)) return refused("actor_invalid");
  if (!isOneOf(actor.role, EARLY_ACCESS_VERIFIER_ROLES)) return refused("forbidden");

  if (!isOneOf(record.decision, EARLY_ACCESS_VERIFICATION_DECISIONS)) {
    return refused("decision_invalid");
  }
  const decision = record.decision;

  // A decision with no stated reason is an unattributable one. Both directions need it:
  // an approval is why money was accepted, a rejection is what the customer is told.
  if (!isBoundedText(record.reason, MAX_REASON_LENGTH)) return refused("reason_insufficient");
  if (record.reason.trim().length < MIN_REASON_LENGTH) return refused("reason_insufficient");
  const reason = record.reason;

  if (!isCanonicalTimestamp(record.now)) return refused("timestamp_invalid");

  const order = readEarlyAccessOrder(record.order);
  if (!order) return refused("order_invalid");

  const proofs = readEarlyAccessProofHistory(record.proofs);
  if (!proofs) return refused("proof_history_invalid");
  if (proofs.some((entry) => entry.orderId !== order.orderId)) {
    return refused("proof_history_invalid");
  }
  // HARD RULE: no evidence, no decision. Manual payment means a human looked at
  // something, so an order with an empty proof chain cannot be decided at all.
  const proof = currentProof(proofs);
  if (proof === null) return refused("proof_missing");
  // HARD RULE: the reviewed reference must be the CURRENT proof. A stale reference
  // means the admin is deciding against a photo the customer has already replaced.
  if (record.reviewedProofRef !== proof.storageRef) return refused("proof_ref_mismatch");

  // HARD RULE: the amount confirmed is the amount billed. The order total is derived
  // server side by `early-access-order.ts`, so this compares against a number no
  // customer and no admin supplied.
  if (record.amountVerifiedCents !== order.orderTotalCents) return refused("amount_mismatch");
  if (record.currency !== order.currency) return refused("currency_mismatch");

  const history = readEarlyAccessVerificationHistory(record.decisions);
  if (!history) return refused("decision_history_invalid");
  if (history.some((entry) => entry.orderId !== order.orderId)) {
    return refused("decision_history_invalid");
  }

  const prior = priorInScope(history, record.idempotencyKey, proof);

  const delegated = verifyManualPayment({
    order: record.order,
    actor: { id: actor.id, role: actor.role },
    decision,
    idempotencyKey: record.idempotencyKey,
    now: record.now,
    appliedVerifications: prior === null ? [] : [toVerificationRecord(prior)],
    ...(record.method === undefined ? {} : { method: record.method }),
  });
  if (!delegated.ok) {
    // HARD RULE: a rejected payment is not silently re-verified. The delegate refuses
    // approving over a rejection, and a rejection is only ever put in scope when the
    // proof it reviewed is still the current one, so this refusal always means the same
    // thing. It is re-labeled with the action an operator must take.
    if (delegated.code === "order_rejected") {
      return refused("payment_rejected_needs_new_proof");
    }
    return refused(delegated.code);
  }
  const verification = delegated.value;

  if (verification.outcome !== "applied") {
    // The effect was reported once already, so the authoritative row is the stored one.
    if (prior === null) return refused("ledger_inconsistent");
    return accepted(
      Object.freeze({
        orderId: order.orderId,
        outcome: verification.outcome,
        decision: prior.decision,
        entry: prior,
        verification,
        append: null,
      }),
    );
  }

  const entry: EarlyAccessVerificationEntry = Object.freeze({
    orderId: verification.record.orderId,
    idempotencyKey: verification.record.idempotencyKey,
    decision: verification.record.decision,
    actorId: verification.record.actorId,
    actorRole: verification.record.actorRole,
    decidedAt: verification.record.decidedAt,
    method: verification.record.method,
    reason,
    reviewedProofId: proof.proofId,
    reviewedProofRef: proof.storageRef,
    amountVerifiedCents: order.orderTotalCents,
    currency: order.currency,
    sequence: history.length + 1,
  });
  if (entry.sequence > EARLY_ACCESS_MAX_DECISIONS_PER_ORDER) {
    return refused("decision_history_invalid");
  }

  return accepted(
    Object.freeze({
      orderId: order.orderId,
      outcome: verification.outcome,
      decision: entry.decision,
      entry,
      verification,
      append: entry,
    }),
  );
}

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

export type VerificationAppendResult = CommerceResult<
  EarlyAccessVerificationEntry,
  VerificationServiceFailureCode
>;

/** Append-only by construction: there is no update, no delete, and no clear. */
export interface EarlyAccessVerificationRepository {
  append(entry: unknown): Promise<VerificationAppendResult>;
  /** Every decision ever recorded for an order, oldest first. */
  history(orderId: string): Promise<readonly EarlyAccessVerificationEntry[]>;
  /** The approval, if one exists. There is at most one, ever. */
  approval(orderId: string): Promise<EarlyAccessVerificationEntry | null>;
}

export class InMemoryVerificationRepository implements EarlyAccessVerificationRepository {
  private readonly byOrder = new Map<string, readonly EarlyAccessVerificationEntry[]>();
  private readonly seenKeys = new Set<string>();

  /**
   * The last line of defense for the exactly-once rule. A pure function cannot hold a
   * lock, so the store refuses a second approval and a reused idempotency key outright,
   * the way a unique constraint would.
   */
  async append(entry: unknown): Promise<VerificationAppendResult> {
    const validated = readEarlyAccessVerificationEntry(entry);
    if (!validated) return refused("input_invalid");
    if (this.seenKeys.has(validated.idempotencyKey)) return refused("idempotency_conflict");

    const trail = this.byOrder.get(validated.orderId) ?? [];
    if (trail.length >= EARLY_ACCESS_MAX_DECISIONS_PER_ORDER) {
      return refused("decision_history_invalid");
    }
    if (validated.sequence !== trail.length + 1) return refused("decision_history_invalid");
    if (trail.some((prior) => prior.decision === "approve")) {
      return refused("order_already_verified");
    }

    this.byOrder.set(validated.orderId, Object.freeze([...trail, validated]));
    this.seenKeys.add(validated.idempotencyKey);
    return accepted(validated);
  }

  async history(orderId: string): Promise<readonly EarlyAccessVerificationEntry[]> {
    return this.byOrder.get(orderId) ?? Object.freeze([]);
  }

  async approval(orderId: string): Promise<EarlyAccessVerificationEntry | null> {
    const trail = await this.history(orderId);
    return trail.find((entry) => entry.decision === "approve") ?? null;
  }
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

export type RecordDecisionInput = Readonly<{
  order: unknown;
  actor: unknown;
  decision: unknown;
  reason: unknown;
  reviewedProofRef: unknown;
  amountVerifiedCents: unknown;
  currency: unknown;
  idempotencyKey: unknown;
  now: unknown;
  method?: unknown;
}>;

export type VerificationServiceDependencies = Readonly<{
  proofs: Readonly<{ history(orderId: string): Promise<readonly EarlyAccessProofRecord[]> }>;
  verifications: EarlyAccessVerificationRepository;
}>;

/**
 * Record one decision, reading both histories from their repositories.
 *
 * The append happens only when the pure decision says an effect is new, so a replay
 * touches nothing. If the store refuses the append anyway, that refusal wins: the
 * store is the one component that can see a concurrent caller.
 */
export async function recordManualPaymentDecision(
  deps: VerificationServiceDependencies,
  input: RecordDecisionInput,
): Promise<VerificationDecisionResult> {
  const order = readEarlyAccessOrder(input.order);
  if (!order) return refused("order_invalid");

  const [proofs, decisions] = await Promise.all([
    deps.proofs.history(order.orderId),
    deps.verifications.history(order.orderId),
  ]);

  const decided = decideManualPayment({
    order: input.order,
    proofs: [...proofs],
    decisions: [...decisions],
    actor: input.actor,
    decision: input.decision,
    reason: input.reason,
    reviewedProofRef: input.reviewedProofRef,
    amountVerifiedCents: input.amountVerifiedCents,
    currency: input.currency,
    idempotencyKey: input.idempotencyKey,
    now: input.now,
    ...(input.method === undefined ? {} : { method: input.method }),
  });
  if (!decided.ok) return decided;
  if (decided.value.append === null) return decided;

  const appended = await deps.verifications.append(decided.value.append);
  if (!appended.ok) return refused(appended.code);
  return decided;
}
