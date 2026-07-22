import crypto from "crypto";

// ---------------------------------------------------------------------------
// xenios research founding membership activation, Domain 2: the payment
// obligation (the money spine).
//
// ONE membership. $50 is due at activation and INCLUDES the first 30 calendar
// days. The first $25 renewal is due 30 days AFTER activation; each $25 covers
// the next 30 days. There is NO $25 due at activation. Those pricing facts are
// constants here so no caller can restate them differently.
//
// An obligation is the unit of money owed: who owes it, what it is for, how
// much, through which admin-configured manual bridge method, under which
// agreement versions, and where it sits in the exact 15-state vocabulary.
// A member REPORTING a payment never changes membership state; only an admin
// verification, recorded field by field and confirmed explicitly, moves money
// state forward (that verification lives in activation.ts and renewals.ts).
//
// Hard rules enforced by shape, not by promise:
//   - The method snapshot carries an admin label and an OPAQUE encrypted
//     instructions reference. Receiving details (numbers, handles, cash tags,
//     bank identifiers) have no field to live in, here or in any row this
//     domain writes.
//   - Bridge (manual_external_payment) methods are never product-purchase
//     eligible. A snapshot claiming otherwise is refused, not normalized.
//   - The audit trail is append-only; IP and user agent are stored as sha256
//     hashes only, matching the agreements engine's posture.
//   - Everything sits behind RESEARCH_FOUNDING_ACTIVATION_ENABLED, default
//     false. This module is inert domain logic; the surface wave wires the
//     flag into routes and production guards.
// ---------------------------------------------------------------------------

import { AGREEMENT_DEFINITIONS } from "../agreements";

// ---------------------------------------------------------------------------
// Feature flag (default false; anything but the exact string "true" is off)
// ---------------------------------------------------------------------------

export const FOUNDING_ACTIVATION_FLAG_ENV = "RESEARCH_FOUNDING_ACTIVATION_ENABLED";

export function foundingActivationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[FOUNDING_ACTIVATION_FLAG_ENV] === "true";
}

// ---------------------------------------------------------------------------
// Pricing and period facts (the spec, as constants)
// ---------------------------------------------------------------------------

export const ACTIVATION_AMOUNT_CENTS = 5000;
export const RENEWAL_AMOUNT_CENTS = 2500;
export const MEMBERSHIP_PERIOD_DAYS = 30;
export const OBLIGATION_CURRENCY = "USD";

export const ACTIVATION_DESCRIPTION =
  "Founding membership activation, $50. Includes your first 30 calendar days of membership. " +
  "No separate $25 renewal is due at activation.";

export const RENEWAL_DESCRIPTION =
  "Founding membership renewal, $25. Covers the next 30 calendar days of membership. " +
  "You initiate this payment; nothing is charged automatically.";

// The display contract every member-facing surface must carry verbatim next to
// the submission form. Submitting a payment report is a report, not a payment
// event: nothing about the membership changes until Xenios verifies by hand.
export const SUBMISSION_DISPLAY_CONTRACT =
  "Submitting this report does not activate or extend your membership. " +
  "Xenios verifies every payment by hand before your membership changes.";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const OBLIGATION_TYPES = ["activation_50", "renewal_25"] as const;
export type ObligationType = (typeof OBLIGATION_TYPES)[number];

export const EXPECTED_AMOUNT_BY_TYPE: Record<ObligationType, number> = {
  activation_50: ACTIVATION_AMOUNT_CENTS,
  renewal_25: RENEWAL_AMOUNT_CENTS,
};

/**
 * The exact 15-state obligation vocabulary. Every status transition in this
 * domain must name a value from this list; there is no sixteenth state and no
 * free-text status anywhere.
 *
 *   upcoming        created ahead of its due date (renewals start here)
 *   due             payable now (activation obligations start here)
 *   submitted       the member reported a payment; membership is UNCHANGED
 *   under_review    an admin picked it up
 *   info_requested  the admin needs more from the member
 *   mismatch        reported and expected details do not agree
 *   duplicate       the external reference was already used on another report
 *   verified        the admin confirmed receipt; the only success state
 *   rejected        the admin declined the report
 *   overdue         past due with no verified payment
 *   in_grace        overdue, inside the grace window
 *   suspended       grace exhausted; membership access suspended
 *   cancelled       closed without payment (terminal)
 *   reversed        a verified payment was reversed by the sender or bank
 *   refunded        a verified payment was refunded by Xenios
 */
export const OBLIGATION_STATUSES = [
  "upcoming",
  "due",
  "submitted",
  "under_review",
  "info_requested",
  "mismatch",
  "duplicate",
  "verified",
  "rejected",
  "overdue",
  "in_grace",
  "suspended",
  "cancelled",
  "reversed",
  "refunded",
] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

export const TERMINAL_STATUSES: readonly ObligationStatus[] = ["cancelled", "reversed", "refunded"];

/** Statuses from which a member may (re)submit a payment report. */
export const SUBMITTABLE_STATUSES: readonly ObligationStatus[] = [
  "upcoming",
  "due",
  "overdue",
  "in_grace",
  "suspended",
  "info_requested",
  "mismatch",
  "duplicate",
  "rejected",
];

/** Statuses from which an admin verification may proceed. */
export const VERIFIABLE_STATUSES: readonly ObligationStatus[] = ["submitted", "under_review"];

export const BRIDGE_PHASES = ["phase_a_manual_bridge", "phase_b_business_methods"] as const;
export type BridgePhase = (typeof BRIDGE_PHASES)[number];

// The legal transition matrix, pure data so it can be tested as a table.
// A transition not listed here is illegal, full stop.
export const OBLIGATION_TRANSITIONS: Record<ObligationStatus, readonly ObligationStatus[]> = {
  upcoming: ["due", "submitted", "cancelled"],
  due: ["submitted", "overdue", "cancelled"],
  submitted: ["under_review", "verified", "info_requested", "mismatch", "duplicate", "rejected", "cancelled"],
  under_review: ["verified", "info_requested", "mismatch", "duplicate", "rejected", "cancelled"],
  info_requested: ["submitted", "rejected", "cancelled"],
  mismatch: ["submitted", "rejected", "cancelled"],
  duplicate: ["submitted", "rejected", "cancelled"],
  verified: ["reversed", "refunded"],
  rejected: ["submitted", "cancelled"],
  overdue: ["submitted", "in_grace", "cancelled"],
  in_grace: ["submitted", "suspended", "cancelled"],
  suspended: ["submitted", "cancelled"],
  cancelled: [],
  reversed: [],
  refunded: [],
};

export function canTransition(from: ObligationStatus, to: ObligationStatus): boolean {
  return OBLIGATION_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export const METHOD_CATEGORIES = ["manual_external_payment", "business_integrated"] as const;
export type MethodCategory = (typeof METHOD_CATEGORIES)[number];

/**
 * The payment method as the member saw it when the obligation was created.
 * Carries the admin-configured LABEL (for example "Zelle") and an OPAQUE
 * reference to the encrypted receiving instructions. The instructions
 * themselves (numbers, handles, cash tags, bank details) never enter this
 * type, this domain, or any row it writes.
 */
export interface PaymentMethodSnapshot {
  methodId: string;
  category: MethodCategory;
  /** Admin-configured display label only, never a handle or identifier. */
  label: string;
  /** Opaque pointer at the encrypted-at-rest instructions record, or null. */
  instructionsRef: string | null;
  /** Bridge methods are never eligible for product purchases. */
  productPurchaseEligible: boolean;
  capturedAt: string;
}

/** One agreement identity the member accepted under, by key and version. */
export interface AgreementVersionEntry {
  key: string;
  version: string;
  contentHash: string;
}

export interface AgreementVersionsSnapshot {
  agreements: AgreementVersionEntry[];
  capturedAt: string;
}

/** Snapshot the CURRENT agreement definitions at obligation creation, so the
 * obligation records exactly which paper versions governed it. */
export function snapshotCurrentAgreements(now: Date): AgreementVersionsSnapshot {
  return {
    agreements: AGREEMENT_DEFINITIONS.map((d) => ({
      key: d.key,
      version: d.version,
      contentHash: d.contentHash,
    })),
    capturedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Member submission and admin verification shapes
// ---------------------------------------------------------------------------

/**
 * What the member reports after sending a manual payment. This is a REPORT.
 * Recording it never changes membership state (see SUBMISSION_DISPLAY_CONTRACT).
 * senderIdentifierMasked is a masked display fragment (for example
 * "ending 1234"), never a full account number, handle, or contact detail.
 */
export interface MemberPaymentSubmission {
  methodId: string;
  amountCents: number;
  /** The calendar date the member says they sent it, as they entered it. */
  sentDate: string;
  /** The approximate time, if the member gave one. */
  sentTime: string | null;
  senderName: string;
  senderContact: string | null;
  senderIdentifierMasked: string | null;
  /** The reference from the external payment app, if any. */
  externalRef: string | null;
  /** The obligation's human reference the member was told to include. */
  xeniosRef: string;
  note: string | null;
  /** Opaque media reference (media-provider id), never image bytes. */
  evidenceRef: string | null;
  /** The member certified the report is accurate. Must be exactly true. */
  accuracyCertified: boolean;
  submittedAt: string;
}

/**
 * What the admin records before an obligation can verify. Every field is
 * required (external reference and note may be explicitly null) and
 * confirmedReceived must be exactly true; nothing verifies by omission.
 * receivingDestinationRef is an opaque reference to the admin's configured
 * receiving account record, never the account details themselves.
 */
export interface AdminVerification {
  amountReceivedCents: number;
  dateReceived: string;
  receivingDestinationRef: string;
  methodId: string;
  externalRef: string | null;
  reconciliationDate: string;
  note: string | null;
  confirmedReceived: boolean;
  verifiedAt: string;
}

// ---------------------------------------------------------------------------
// Audit events (append-only; the record carries its own trail)
// ---------------------------------------------------------------------------

export const AUDIT_ACTOR_TYPES = ["member", "admin", "system"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export interface ObligationAuditEvent {
  eventId: string;
  obligationId: string;
  occurredAt: string;
  action: string;
  actorType: AuditActorType;
  actorId: string | null;
  actorRole: string | null;
  /** sha256 hex of the IP, never the raw address. */
  ipHash: string | null;
  /** sha256 hex of the user agent, never the raw string. */
  userAgentHash: string | null;
  fromStatus: ObligationStatus | null;
  toStatus: ObligationStatus | null;
  detail: string | null;
}

export interface AuditActor {
  actorType: AuditActorType;
  actorId: string | null;
  actorRole?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashOrNull(value: string | null | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? sha256Hex(value) : null;
}

// ---------------------------------------------------------------------------
// The obligation record
// ---------------------------------------------------------------------------

export interface ObligationRecord {
  obligationId: string;
  /** Human reference, XRM-XXXXXXXX, from crypto randomness. */
  humanRef: string;
  memberId: string;
  type: ObligationType;
  expectedAmountCents: number;
  currency: string;
  description: string;
  status: ObligationStatus;
  bridgePhase: BridgePhase;
  method: PaymentMethodSnapshot;
  agreements: AgreementVersionsSnapshot;
  submission: MemberPaymentSubmission | null;
  verification: AdminVerification | null;
  /** Opaque reference to the receiving-account record, set at verification. */
  receivingAccountRef: string | null;
  /** Set once, when the receipt is issued at verification. */
  receiptRef: string | null;
  createdAt: string;
  dueAt: string;
  expiresAt: string;
  events: ObligationAuditEvent[];
}

// ---------------------------------------------------------------------------
// Human reference generation
// ---------------------------------------------------------------------------

// 32 unambiguous characters (no 0, O, 1, I). Each random byte masked to five
// bits indexes the alphabet without modulo bias.
export const HUMAN_REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const HUMAN_REF_PATTERN = /^XRM-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

export function newHumanRef(random: (size: number) => Buffer = crypto.randomBytes): string {
  const bytes = random(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += HUMAN_REF_ALPHABET[bytes[i] & 0x1f];
  return `XRM-${out}`;
}

export function newId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type FoundingActivationErrorCode =
  | "validation_failed"
  | "illegal_transition"
  | "not_permitted"
  | "not_found"
  | "already_verified"
  | "amount_mismatch"
  | "already_exists"
  | "already_extended";

export class FoundingActivationError extends Error {
  constructor(
    public readonly code: FoundingActivationErrorCode,
    message: string,
    public readonly fieldErrors: string[] = [],
  ) {
    super(message);
    this.name = "FoundingActivationError";
  }
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

function assertMethodSnapshotSafe(method: PaymentMethodSnapshot): void {
  if (method.category === "manual_external_payment" && method.productPurchaseEligible) {
    // The bridge covers activation and membership renewals only, never
    // peptide commerce. Refuse loudly rather than quietly correcting.
    throw new FoundingActivationError(
      "validation_failed",
      "A manual external payment method can never be product-purchase eligible.",
    );
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Add whole calendar days in UTC. All period math flows through this one
 * function so 30 days is 30 days everywhere. */
export function addCalendarDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

/** How long an unpaid obligation stays open before it can be closed out. */
export const OBLIGATION_EXPIRY_DAYS = 60;

function auditEvent(
  obligationId: string,
  now: Date,
  action: string,
  actor: AuditActor,
  fromStatus: ObligationStatus | null,
  toStatus: ObligationStatus | null,
  detail: string | null,
): ObligationAuditEvent {
  return {
    eventId: newId(),
    obligationId,
    occurredAt: now.toISOString(),
    action,
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorRole: actor.actorRole ?? null,
    ipHash: hashOrNull(actor.ip),
    userAgentHash: hashOrNull(actor.userAgent),
    fromStatus,
    toStatus,
    detail,
  };
}

export interface CreateObligationInput {
  memberId: string;
  type: ObligationType;
  method: PaymentMethodSnapshot;
  agreements?: AgreementVersionsSnapshot;
  /** Server clock. Every stored date derives from this, never from a client. */
  now: Date;
  /** When the obligation is due. Activation defaults to now; renewals pass the period end. */
  dueAt?: Date;
  bridgePhase?: BridgePhase;
}

/**
 * Create an obligation. An activation obligation is the ONLY money due at
 * activation ($50, which includes the first 30 days); creating one never
 * creates a companion $25. A renewal obligation starts upcoming with its due
 * date at the period end it follows.
 */
export function createObligation(input: CreateObligationInput): ObligationRecord {
  assertMethodSnapshotSafe(input.method);
  const now = input.now;
  const dueAt = input.dueAt ?? now;
  const obligationId = newId();
  const status: ObligationStatus = input.type === "activation_50" ? "due" : "upcoming";
  const record: ObligationRecord = {
    obligationId,
    humanRef: newHumanRef(),
    memberId: input.memberId,
    type: input.type,
    expectedAmountCents: EXPECTED_AMOUNT_BY_TYPE[input.type],
    currency: OBLIGATION_CURRENCY,
    description: input.type === "activation_50" ? ACTIVATION_DESCRIPTION : RENEWAL_DESCRIPTION,
    status,
    bridgePhase: input.bridgePhase ?? "phase_a_manual_bridge",
    method: { ...input.method },
    agreements: input.agreements ?? snapshotCurrentAgreements(now),
    submission: null,
    verification: null,
    receivingAccountRef: null,
    receiptRef: null,
    createdAt: now.toISOString(),
    dueAt: dueAt.toISOString(),
    expiresAt: addCalendarDays(dueAt, OBLIGATION_EXPIRY_DAYS).toISOString(),
    events: [
      auditEvent(
        obligationId,
        now,
        "created",
        { actorType: "system", actorId: null },
        null,
        status,
        `type=${input.type}`,
      ),
    ],
  };
  return record;
}

// ---------------------------------------------------------------------------
// Transitions (pure; every change appends an audit event)
// ---------------------------------------------------------------------------

export function transitionObligation(
  record: ObligationRecord,
  to: ObligationStatus,
  actor: AuditActor,
  now: Date,
  action: string,
  detail: string | null = null,
): ObligationRecord {
  if (!canTransition(record.status, to)) {
    throw new FoundingActivationError(
      "illegal_transition",
      `An obligation cannot move from ${record.status} to ${to}.`,
    );
  }
  return {
    ...record,
    status: to,
    events: [
      ...record.events,
      auditEvent(record.obligationId, now, action, actor, record.status, to, detail),
    ],
  };
}

/**
 * Swap the method snapshot (the phase B migration path: configuration, not a
 * rewrite). Allowed only while the obligation is still open and unverified;
 * the status does not move, and the swap is recorded in the audit trail.
 */
export function migrateObligationMethod(
  record: ObligationRecord,
  newMethod: PaymentMethodSnapshot,
  newPhase: BridgePhase,
  actor: AuditActor,
  now: Date,
): ObligationRecord {
  assertMethodSnapshotSafe(newMethod);
  if (record.status === "verified" || TERMINAL_STATUSES.includes(record.status)) {
    throw new FoundingActivationError(
      "illegal_transition",
      "Only an open, unverified obligation can migrate to a new payment method.",
    );
  }
  return {
    ...record,
    method: { ...newMethod },
    bridgePhase: newPhase,
    events: [
      ...record.events,
      auditEvent(
        record.obligationId,
        now,
        "method_migrated",
        actor,
        record.status,
        record.status,
        `method=${newMethod.methodId} phase=${newPhase}`,
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// Member submission (a report; NEVER a membership change)
// ---------------------------------------------------------------------------

export function validateSubmission(submission: MemberPaymentSubmission): string[] {
  const errors: string[] = [];
  if (!submission.methodId) errors.push("methodId is required");
  if (!Number.isInteger(submission.amountCents) || submission.amountCents <= 0) {
    errors.push("amountCents must be a positive integer");
  }
  if (!submission.sentDate) errors.push("sentDate is required");
  if (!submission.senderName || !submission.senderName.trim()) errors.push("senderName is required");
  if (!submission.xeniosRef) errors.push("xeniosRef is required");
  if (submission.accuracyCertified !== true) {
    errors.push("accuracyCertified must be exactly true");
  }
  return errors;
}

/**
 * Record the member's payment report on the obligation. The status becomes
 * submitted and nothing else in the world changes: no membership state, no
 * period, no receipt, no ledger entry. Verification is a separate, human,
 * admin act (activation.ts / renewals.ts).
 */
export function recordMemberSubmission(
  record: ObligationRecord,
  submission: MemberPaymentSubmission,
  actor: AuditActor,
  now: Date,
): ObligationRecord {
  const errors = validateSubmission(submission);
  if (errors.length > 0) {
    throw new FoundingActivationError("validation_failed", "The payment report is incomplete.", errors);
  }
  if (!SUBMITTABLE_STATUSES.includes(record.status)) {
    throw new FoundingActivationError(
      "illegal_transition",
      `A payment report cannot be submitted while the obligation is ${record.status}.`,
    );
  }
  const next = transitionObligation(record, "submitted", actor, now, "member_submitted", null);
  return { ...next, submission: { ...submission } };
}

/**
 * Find other obligations whose member report used the same external reference
 * on the same method. A duplicate reference is a red flag for a re-used
 * screenshot or a double-report; the caller flags the obligation as duplicate
 * for human review. Matching is trimmed and case-insensitive.
 */
export function findDuplicateExternalRefs(
  all: readonly ObligationRecord[],
  candidate: ObligationRecord,
): ObligationRecord[] {
  const ref = candidate.submission?.externalRef?.trim().toLowerCase();
  if (!ref) return [];
  return all.filter(
    (other) =>
      other.obligationId !== candidate.obligationId &&
      other.submission?.methodId === candidate.submission?.methodId &&
      other.submission?.externalRef?.trim().toLowerCase() === ref,
  );
}

// ---------------------------------------------------------------------------
// Admin verification validation and permission gate
// ---------------------------------------------------------------------------

/** Roles allowed to verify a payment. Model or member input never appears here. */
export const ADMIN_VERIFIER_ROLES = ["owner", "admin"] as const;
export type AdminVerifierRole = (typeof ADMIN_VERIFIER_ROLES)[number];

export interface AdminIdentity {
  adminId: string;
  role: string;
  ip?: string | null;
  userAgent?: string | null;
}

export function canVerify(role: string): boolean {
  return (ADMIN_VERIFIER_ROLES as readonly string[]).includes(role);
}

export function validateVerification(verification: AdminVerification): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(verification.amountReceivedCents) || verification.amountReceivedCents <= 0) {
    errors.push("amountReceivedCents must be a positive integer");
  }
  if (!verification.dateReceived) errors.push("dateReceived is required");
  if (!verification.receivingDestinationRef) errors.push("receivingDestinationRef is required");
  if (!verification.methodId) errors.push("methodId is required");
  if (verification.externalRef !== null && typeof verification.externalRef !== "string") {
    errors.push("externalRef must be a string or explicitly null");
  }
  if (!verification.reconciliationDate) errors.push("reconciliationDate is required");
  if (verification.note !== null && typeof verification.note !== "string") {
    errors.push("note must be a string or explicitly null");
  }
  if (verification.confirmedReceived !== true) {
    errors.push("confirmedReceived must be exactly true");
  }
  return errors;
}
