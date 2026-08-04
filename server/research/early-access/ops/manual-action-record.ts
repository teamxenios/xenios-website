/**
 * The manual action record.
 *
 * The first release is manual by design: a named human confirms availability,
 * talks to the supplier, verifies payment, sends the supplier order, enters
 * tracking, answers support, pays affiliates, and transmits refunds. This is the
 * flow where money and a physical product both move, and an unrecorded manual
 * step is indistinguishable later from a step that never happened.
 *
 * So every manual action records the same eight facts, and the type makes them
 * non-optional rather than trusting a caller to remember:
 *
 *   actor, timestamp, method or channel, external reference where available,
 *   prior status, new status, note, and an audit event.
 *
 * "Where available" is the only softness, and it is explicit: `externalReference`
 * is `string | null`, and null must be a deliberate choice, not an omission.
 */

import { createHash } from "node:crypto";
import type { CommerceResult } from "../commerce/input-guards";

// ---------------------------------------------------------------------------
// Customer-facing fulfilment copy
// ---------------------------------------------------------------------------

/**
 * The approved wording, exactly. It is a TARGET, not a guarantee, so it must not
 * be paraphrased, given a countdown, or placed beside a carrier ETA. Anything
 * that renders a fulfilment expectation reads this constant instead of writing
 * its own sentence, and `assertFulfillmentCopyUnmodified` is the enforcement.
 */
export const EARLY_ACCESS_FULFILLMENT_TARGET_COPY =
  "Current fulfillment target: within 72 hours after payment verification and product availability confirmation. Tracking will be provided when the shipment is released.";

/**
 * True only for the exact approved string. A caller that has appended a date, a
 * countdown, or a carrier estimate fails here rather than shipping a promise the
 * business did not make.
 */
export function isApprovedFulfillmentCopy(value: unknown): boolean {
  return value === EARLY_ACCESS_FULFILLMENT_TARGET_COPY;
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export const MANUAL_ACTION_KINDS = [
  "availability_confirmation",
  "supplier_communication",
  "payment_verification",
  "supplier_order_transmission",
  "shipping_coordination",
  "tracking_entry",
  "customer_support",
  "affiliate_payout",
  "refund_transmission",
] as const;

export type ManualActionKind = (typeof MANUAL_ACTION_KINDS)[number];

export const MANUAL_ACTION_CHANNELS = [
  "email",
  "sms",
  "phone",
  "portal",
  "in_person",
  "download",
  "copy_paste",
] as const;

export type ManualActionChannel = (typeof MANUAL_ACTION_CHANNELS)[number];

export type ManualActionAuditEvent = Readonly<{
  type: `early_access.manual.${ManualActionKind}`;
  subjectId: string;
  actor: string;
  at: string;
  from: string;
  to: string;
  channel: ManualActionChannel;
  externalReference: string | null;
}>;

export type ManualActionRecord = Readonly<{
  id: string;
  kind: ManualActionKind;
  /** What the action was performed against: an order, a release, a payout. */
  subjectId: string;
  /** A named human. Never "the system". */
  actor: string;
  at: string;
  channel: ManualActionChannel;
  /** Null only as a deliberate "none exists", never as a forgotten field. */
  externalReference: string | null;
  priorStatus: string;
  newStatus: string;
  note: string;
  audit: ManualActionAuditEvent;
}>;

export type ManualActionFailureCode =
  | "ACTOR_NOT_NAMED"
  | "KIND_INVALID"
  | "CHANNEL_INVALID"
  | "SUBJECT_INVALID"
  | "INSTANT_INVALID"
  | "STATUS_INVALID"
  | "NOTE_INVALID"
  | "EXTERNAL_REFERENCE_INVALID";

function fail<T>(code: ManualActionFailureCode): CommerceResult<T, ManualActionFailureCode> {
  return Object.freeze({ ok: false, code }) as CommerceResult<T, ManualActionFailureCode>;
}

function isNamedHuman(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 200) return false;
  return !/^(the\s+)?(system|automation|robot|bot|service|admin|operator)$/i.test(trimmed);
}

function isValidInstant(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isBoundedText(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= min &&
    value.trim().length <= max
  );
}

export type RecordManualActionInput = Readonly<{
  kind: ManualActionKind;
  subjectId: string;
  actor: string;
  at: string;
  channel: ManualActionChannel;
  externalReference: string | null;
  priorStatus: string;
  newStatus: string;
  note: string;
}>;

export function recordManualAction(
  input: RecordManualActionInput,
): CommerceResult<ManualActionRecord, ManualActionFailureCode> {
  if (!MANUAL_ACTION_KINDS.includes(input.kind)) return fail("KIND_INVALID");
  if (!MANUAL_ACTION_CHANNELS.includes(input.channel)) return fail("CHANNEL_INVALID");
  if (!isBoundedText(input.subjectId, 1, 128)) return fail("SUBJECT_INVALID");
  if (!isNamedHuman(input.actor)) return fail("ACTOR_NOT_NAMED");
  if (!isValidInstant(input.at)) return fail("INSTANT_INVALID");
  if (!isBoundedText(input.priorStatus, 1, 64) || !isBoundedText(input.newStatus, 1, 64)) {
    return fail("STATUS_INVALID");
  }
  // A note is mandatory. The whole point of the record is that a later reader
  // can tell what a human did and why, and an empty note defeats that.
  if (!isBoundedText(input.note, 3, 2_000)) return fail("NOTE_INVALID");
  if (
    input.externalReference !== null &&
    !isBoundedText(input.externalReference, 1, 200)
  ) {
    return fail("EXTERNAL_REFERENCE_INVALID");
  }

  const actor = input.actor.trim();
  const externalReference = input.externalReference?.trim() ?? null;
  const id = `mact_${createHash("sha256")
    .update(
      `early-access-manual-action-v1:${input.kind}:${input.subjectId}:${input.at}:${actor}`,
    )
    .digest("hex")
    .slice(0, 32)}`;

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      id,
      kind: input.kind,
      subjectId: input.subjectId.trim(),
      actor,
      at: input.at,
      channel: input.channel,
      externalReference,
      priorStatus: input.priorStatus.trim(),
      newStatus: input.newStatus.trim(),
      note: input.note.trim(),
      audit: Object.freeze({
        type: `early_access.manual.${input.kind}` as const,
        subjectId: input.subjectId.trim(),
        actor,
        at: input.at,
        from: input.priorStatus.trim(),
        to: input.newStatus.trim(),
        channel: input.channel,
        externalReference,
      }),
    }),
  });
}

// ---------------------------------------------------------------------------
// Supplier dispatch, retry safe
// ---------------------------------------------------------------------------

export type SupplierDispatchAttempt = Readonly<{
  attemptId: string;
  releaseId: string;
  channel: ManualActionChannel;
  recipient: string;
  at: string;
  outcome: "sent" | "failed";
  externalReference: string | null;
}>;

export type SupplierDispatchDecision =
  | Readonly<{
      decision: "create_and_send";
      releaseId: string;
      attemptNumber: number;
    }>
  | Readonly<{
      decision: "resend_existing";
      releaseId: string;
      attemptNumber: number;
      /** Why this is not a new supplier order, for the operator screen. */
      reason: "prior_attempt_failed";
    }>
  | Readonly<{
      decision: "already_sent";
      releaseId: string;
      sentAt: string;
      reason: "supplier_order_already_delivered";
    }>;

/**
 * Decide what a dispatch click should do.
 *
 * The rule that matters: a retry after a failed send RESENDS the same supplier
 * order, it never creates a second one. Duplicate physical fulfilment is the
 * expensive failure here, so the release id is derived upstream from the order
 * id and is simply reused; this function never mints one.
 *
 * A dispatch that already succeeded is not resent by default either: the caller
 * gets `already_sent` and must make a deliberate choice, because a supplier
 * seeing the same order twice may ship it twice.
 */
export function decideSupplierDispatch(
  releaseId: string,
  priorAttempts: readonly SupplierDispatchAttempt[],
): SupplierDispatchDecision {
  const mine = priorAttempts.filter((attempt) => attempt.releaseId === releaseId);
  const sent = mine.find((attempt) => attempt.outcome === "sent");
  if (sent) {
    return Object.freeze({
      decision: "already_sent" as const,
      releaseId,
      sentAt: sent.at,
      reason: "supplier_order_already_delivered" as const,
    });
  }
  if (mine.length > 0) {
    return Object.freeze({
      decision: "resend_existing" as const,
      releaseId,
      attemptNumber: mine.length + 1,
      reason: "prior_attempt_failed" as const,
    });
  }
  return Object.freeze({
    decision: "create_and_send" as const,
    releaseId,
    attemptNumber: 1,
  });
}
