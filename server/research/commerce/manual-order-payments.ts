/**
 * Manual product-order payment domain. Server only. Pure and side-effect free.
 *
 * This module deliberately stops before persistence, routes, storage, payment
 * providers, supplier release, receipts, notifications, and commissions. It
 * validates and freezes an invoice/report boundary and can produce stable,
 * non-executed intents for a later, separately reviewed atomic commit lane.
 * Reporting a payment or attaching proof never means that money was received.
 */

import type { OrderLinePriceSnapshot } from "@shared/research/pricing";
import { parseProductControlTimestamp } from "../catalog/product-control-reader";
import {
  HUMAN_REF_PATTERN,
  sha256Hex,
} from "../membership-activation/obligations";
import type { CheckoutPriceQuote } from "../pricing/checkout-recompute";
import { snapshotOrderLinesFromQuote } from "../pricing/order-price-snapshot";

export const MANUAL_ORDER_PAYMENT_METHODS = [
  "cash_app",
  "zelle",
  "venmo",
  "paypal",
  "apple_cash",
  "ach_wire",
  "other",
] as const;

export type ManualOrderPaymentMethod =
  (typeof MANUAL_ORDER_PAYMENT_METHODS)[number];

export const MANUAL_PAYMENT_VERIFY_ROLES = [
  "owner",
  "admin",
  "operations_admin",
] as const;

export type ManualPaymentVerifyRole =
  (typeof MANUAL_PAYMENT_VERIFY_ROLES)[number];

export interface ManualPaymentClockPort {
  /** Server-controlled clock. Request timestamps are never authoritative. */
  now(): string;
}

function readClock(clock: ManualPaymentClockPort): string | null {
  try {
    const now = clock.now();
    return isCanonicalTimestamp(now) ? now : null;
  } catch {
    return null;
  }
}

export type ManualPaymentFailureCode =
  | "validation_failed"
  | "quote_refused"
  | "method_unavailable"
  | "invoice_expired"
  | "invoice_mismatch"
  | "report_mismatch"
  | "proof_invalid"
  | "not_permitted"
  | "evidence_mismatch"
  | "duplicate_transaction"
  | "duplicate_proof"
  | "reservation_mismatch"
  | "idempotency_conflict"
  | "refund_exceeds_verified"
  | "refund_line_unknown"
  | "refund_evidence_invalid";

export type ManualPaymentResult<T> =
  | { state: "accepted"; value: T }
  | { state: "refused"; code: ManualPaymentFailureCode };

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_:-]{0,127}$/;
/** Typed name plus a one-way SHA-256 token; plaintext account data cannot fit. */
const OPAQUE_REF = /^[a-z][a-z0-9_]{2,31}:[a-f0-9]{64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{15,127}$/;
const PRIVATE_OBJECT_REF =
  /^private\/manual-payment-proofs\/[a-z0-9][a-z0-9/_-]{7,191}$/;
const MAX_PROOF_BYTES = 15 * 1024 * 1024;

export const MANUAL_PAYMENT_PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type ManualPaymentProofMimeType =
  (typeof MANUAL_PAYMENT_PROOF_MIME_TYPES)[number];

function refused<T>(code: ManualPaymentFailureCode): ManualPaymentResult<T> {
  return { state: "refused", code };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value);
}

function isOpaqueRef(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_REF.test(value);
}

function isPositiveCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const millis = parseProductControlTimestamp(value);
  if (millis === null) return false;
  return new Date(millis).toISOString() === value;
}

function timestampMillis(value: string): number | null {
  return isCanonicalTimestamp(value) ? Date.parse(value) : null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

function asManualMethod(value: unknown): ManualOrderPaymentMethod | null {
  return typeof value === "string" &&
    (MANUAL_ORDER_PAYMENT_METHODS as readonly string[]).includes(value)
    ? (value as ManualOrderPaymentMethod)
    : null;
}

function tokenFromHumanRef(humanRef: string): string {
  return humanRef.slice("XRM-".length);
}

function stableEffectId(fingerprint: string, effect: string): string {
  return `mpi_${sha256Hex(`${fingerprint}:${effect}`).slice(0, 32)}`;
}

export interface ManualPaymentMethodSnapshot {
  readonly method: ManualOrderPaymentMethod;
  readonly configurationRef: string;
  readonly instructionsRef: string;
  readonly approvalRef: string;
  readonly approvedByRole: ManualPaymentVerifyRole;
  readonly approvedAt: string;
  readonly verificationRef: string;
  readonly verifiedByRole: ManualPaymentVerifyRole;
  readonly verifiedAt: string;
  readonly enablementRef: string;
  readonly enabledByRole: ManualPaymentVerifyRole;
  readonly enabledAt: string;
}

export interface ManualPaymentMethodRegistryPort {
  /** Resolve from the protected method registry, never request JSON. */
  resolveEnabledMethod(input: {
    method: ManualOrderPaymentMethod;
    evaluatedAt: string;
  }): unknown;
}

export interface ManualPaymentReferencePort {
  /** CSPRNG-backed XRM reference factory owned by the server composition root. */
  createHumanRef(): string;
}

const METHOD_KEYS = [
  "method",
  "configurationRef",
  "instructionsRef",
  "approvalRef",
  "approvedByRole",
  "approvedAt",
  "verificationRef",
  "verifiedByRole",
  "verifiedAt",
  "enablementRef",
  "enabledByRole",
  "enabledAt",
] as const;

export function parseManualPaymentMethodSnapshot(
  value: unknown,
): ManualPaymentResult<ManualPaymentMethodSnapshot> {
  if (!isRecord(value) || !hasExactKeys(value, METHOD_KEYS)) {
    return refused("validation_failed");
  }
  const method = asManualMethod(value.method);
  if (
    method === null ||
    !isOpaqueRef(value.configurationRef) ||
    !isOpaqueRef(value.instructionsRef) ||
    !isOpaqueRef(value.approvalRef) ||
    typeof value.approvedByRole !== "string" ||
    !(MANUAL_PAYMENT_VERIFY_ROLES as readonly string[]).includes(
      value.approvedByRole,
    ) ||
    !isCanonicalTimestamp(value.approvedAt) ||
    !isOpaqueRef(value.verificationRef) ||
    typeof value.verifiedByRole !== "string" ||
    !(MANUAL_PAYMENT_VERIFY_ROLES as readonly string[]).includes(
      value.verifiedByRole,
    ) ||
    !isCanonicalTimestamp(value.verifiedAt) ||
    !isOpaqueRef(value.enablementRef) ||
    typeof value.enabledByRole !== "string" ||
    !(MANUAL_PAYMENT_VERIFY_ROLES as readonly string[]).includes(
      value.enabledByRole,
    ) ||
    !isCanonicalTimestamp(value.enabledAt)
  ) {
    return refused("method_unavailable");
  }
  const approved = Date.parse(value.approvedAt);
  const verified = Date.parse(value.verifiedAt);
  const enabled = Date.parse(value.enabledAt);
  if (approved > verified || verified > enabled) {
    return refused("method_unavailable");
  }
  return {
    state: "accepted",
    value: deepFreeze({
      method,
      configurationRef: value.configurationRef,
      instructionsRef: value.instructionsRef,
      approvalRef: value.approvalRef,
      approvedByRole: value.approvedByRole as ManualPaymentVerifyRole,
      approvedAt: value.approvedAt,
      verificationRef: value.verificationRef,
      verifiedByRole: value.verifiedByRole as ManualPaymentVerifyRole,
      verifiedAt: value.verifiedAt,
      enablementRef: value.enablementRef,
      enabledByRole: value.enabledByRole as ManualPaymentVerifyRole,
      enabledAt: value.enabledAt,
    }),
  };
}

export interface ManualOrderInvoice {
  readonly invoiceVersion: 1;
  readonly invoiceId: string;
  readonly humanRef: string;
  readonly orderRef: string;
  readonly invoiceRef: string;
  /** The only customer-entered payment memo: never recipient/account data. */
  readonly paymentMemo: string;
  readonly receiptRef: string;
  readonly memberId: string;
  readonly orderId: string;
  readonly quoteHash: string;
  readonly lines: readonly OrderLinePriceSnapshot[];
  readonly amountCents: number;
  readonly currency: "USD";
  readonly method: ManualPaymentMethodSnapshot;
  readonly state: "awaiting_payment";
  readonly createdAt: string;
  readonly dueAt: string;
}

export interface CreateManualOrderInvoiceInput {
  readonly invoiceId: string;
  readonly memberId: string;
  readonly orderId: string;
  readonly quote: CheckoutPriceQuote;
  readonly requestedMethod: unknown;
  readonly methodRegistry: ManualPaymentMethodRegistryPort;
  readonly referenceFactory: ManualPaymentReferencePort;
  readonly clock: ManualPaymentClockPort;
  readonly createdAt: string;
  readonly dueAt: string;
}

export function createManualOrderInvoice(
  input: CreateManualOrderInvoiceInput,
): ManualPaymentResult<ManualOrderInvoice> {
  const createdAt = readClock(input.clock);
  const requestedMethod = asManualMethod(input.requestedMethod);
  if (
    !isSafeIdentifier(input.invoiceId) ||
    !isSafeIdentifier(input.memberId) ||
    !isSafeIdentifier(input.orderId) ||
    createdAt === null ||
    input.createdAt !== createdAt ||
    !isCanonicalTimestamp(input.dueAt) ||
    Date.parse(input.createdAt) >= Date.parse(input.dueAt)
  ) {
    return refused("validation_failed");
  }
  if (requestedMethod === null) return refused("method_unavailable");
  let resolvedMethod: unknown;
  try {
    resolvedMethod = input.methodRegistry.resolveEnabledMethod({
      method: requestedMethod,
      evaluatedAt: createdAt,
    });
  } catch {
    return refused("method_unavailable");
  }
  const method = parseManualPaymentMethodSnapshot(resolvedMethod);
  if (method.state === "refused") return method;
  if (
    method.value.method !== requestedMethod ||
    Date.parse(method.value.enabledAt) > Date.parse(createdAt)
  ) {
    return refused("method_unavailable");
  }
  const snapshotted = snapshotOrderLinesFromQuote(input.quote);
  if (snapshotted.state === "refused") return refused("quote_refused");
  if (
    input.quote.currency !== "USD" ||
    !isPositiveCents(input.quote.subtotalCents) ||
    typeof input.quote.quoteHash !== "string" ||
    !SHA256.test(input.quote.quoteHash) ||
    input.quote.quotedAt !== createdAt
  ) {
    return refused("quote_refused");
  }
  let humanRef: string;
  try {
    humanRef = input.referenceFactory.createHumanRef();
  } catch {
    return refused("validation_failed");
  }
  if (typeof humanRef !== "string" || !HUMAN_REF_PATTERN.test(humanRef)) {
    return refused("validation_failed");
  }
  const token = tokenFromHumanRef(humanRef);
  return {
    state: "accepted",
    value: deepFreeze({
      invoiceId: input.invoiceId,
      invoiceVersion: 1 as const,
      humanRef,
      orderRef: `XRO-${token}`,
      invoiceRef: `INV-XRM-${token}`,
      paymentMemo: `INV-XRM-${token}`,
      receiptRef: `RCPT-XRM-${token}`,
      memberId: input.memberId,
      orderId: input.orderId,
      quoteHash: input.quote.quoteHash,
      lines: snapshotted.lines,
      amountCents: input.quote.subtotalCents,
      currency: "USD" as const,
      method: method.value,
      state: "awaiting_payment" as const,
      createdAt,
      dueAt: input.dueAt,
    }),
  };
}

export interface ManualPaymentProofMetadata {
  readonly storageObjectRef: string;
  readonly sha256: string;
  readonly mimeType: ManualPaymentProofMimeType;
  readonly sizeBytes: number;
  readonly uploadedAt: string;
}

const PROOF_KEYS = [
  "storageObjectRef",
  "sha256",
  "mimeType",
  "sizeBytes",
  "uploadedAt",
] as const;

export function parseManualPaymentProofMetadata(
  value: unknown,
): ManualPaymentResult<ManualPaymentProofMetadata> {
  if (!isRecord(value) || !hasExactKeys(value, PROOF_KEYS)) {
    return refused("proof_invalid");
  }
  if (
    typeof value.storageObjectRef !== "string" ||
    !PRIVATE_OBJECT_REF.test(value.storageObjectRef) ||
    value.storageObjectRef.includes("..") ||
    typeof value.sha256 !== "string" ||
    !SHA256.test(value.sha256) ||
    typeof value.mimeType !== "string" ||
    !(MANUAL_PAYMENT_PROOF_MIME_TYPES as readonly string[]).includes(
      value.mimeType,
    ) ||
    !isPositiveCents(value.sizeBytes) ||
    value.sizeBytes > MAX_PROOF_BYTES ||
    !isCanonicalTimestamp(value.uploadedAt)
  ) {
    return refused("proof_invalid");
  }
  return {
    state: "accepted",
    value: deepFreeze({
      storageObjectRef: value.storageObjectRef,
      sha256: value.sha256 as string,
      mimeType: value.mimeType as ManualPaymentProofMimeType,
      sizeBytes: value.sizeBytes,
      uploadedAt: value.uploadedAt,
    }),
  };
}

export interface ManualPaymentReport {
  readonly memberId: string;
  readonly orderId: string;
  readonly orderRef: string;
  readonly invoiceRef: string;
  readonly method: ManualOrderPaymentMethod;
  readonly currency: "USD";
  readonly amountCents: number;
  readonly proof: ManualPaymentProofMetadata;
  readonly reportedAt: string;
  readonly reportFingerprint: string;
  readonly state: "reported_unverified";
}

const REPORT_KEYS = [
  "memberId",
  "orderId",
  "orderRef",
  "invoiceRef",
  "method",
  "currency",
  "amountCents",
  "proof",
  "reportedAt",
] as const;

const REPORT_OUTPUT_KEYS = [
  ...REPORT_KEYS,
  "reportFingerprint",
  "state",
] as const;

function reportFingerprint(
  invoice: ManualOrderInvoice,
  method: ManualOrderPaymentMethod,
  proof: ManualPaymentProofMetadata,
  reportedAt: string,
): string {
  return sha256Hex(
    canonicalJson({
      memberId: invoice.memberId,
      orderId: invoice.orderId,
      orderRef: invoice.orderRef,
      invoiceRef: invoice.invoiceRef,
      method,
      amountCents: invoice.amountCents,
      currency: invoice.currency,
      proof,
      reportedAt,
    }),
  );
}

export function reportManualOrderPayment(
  invoice: ManualOrderInvoice,
  value: unknown,
  clock: ManualPaymentClockPort,
): ManualPaymentResult<ManualPaymentReport> {
  const reportedAt = readClock(clock);
  if (reportedAt === null) return refused("validation_failed");
  if (!isRecord(value) || !hasExactKeys(value, REPORT_KEYS)) {
    return refused("validation_failed");
  }
  const proof = parseManualPaymentProofMetadata(value.proof);
  if (proof.state === "refused") return proof;
  const method = asManualMethod(value.method);
  if (
    !isSafeIdentifier(value.memberId) ||
    !isSafeIdentifier(value.orderId) ||
    typeof value.orderRef !== "string" ||
    typeof value.invoiceRef !== "string" ||
    method === null ||
    typeof value.currency !== "string" ||
    !isPositiveCents(value.amountCents) ||
    !isCanonicalTimestamp(value.reportedAt) ||
    value.reportedAt !== reportedAt
  ) {
    return refused("validation_failed");
  }
  if (
    value.memberId !== invoice.memberId ||
    value.orderId !== invoice.orderId ||
    value.orderRef !== invoice.orderRef ||
    value.invoiceRef !== invoice.invoiceRef ||
    method !== invoice.method.method ||
    value.currency !== invoice.currency ||
    value.amountCents !== invoice.amountCents
  ) {
    return refused("report_mismatch");
  }
  const reported = Date.parse(value.reportedAt);
  const proofPrefix = `private/manual-payment-proofs/${invoice.memberId}/${invoice.orderId}/`;
  if (
    reported < Date.parse(invoice.createdAt) ||
    reported > Date.parse(invoice.dueAt) ||
    !proof.value.storageObjectRef.startsWith(proofPrefix) ||
    Date.parse(proof.value.uploadedAt) < Date.parse(invoice.createdAt) ||
    Date.parse(proof.value.uploadedAt) > reported
  ) {
    return refused("invoice_expired");
  }
  const fingerprint = reportFingerprint(
    invoice,
    method,
    proof.value,
    value.reportedAt,
  );
  return {
    state: "accepted",
    value: deepFreeze({
      memberId: value.memberId,
      orderId: value.orderId,
      orderRef: value.orderRef,
      invoiceRef: value.invoiceRef,
      method,
      currency: "USD" as const,
      amountCents: value.amountCents,
      proof: proof.value,
      reportedAt: value.reportedAt,
      reportFingerprint: fingerprint,
      state: "reported_unverified" as const,
    }),
  };
}

function canonicalReportForInvoice(
  invoice: ManualOrderInvoice,
  value: unknown,
): ManualPaymentReport | null {
  if (!isRecord(value) || !hasExactKeys(value, REPORT_OUTPUT_KEYS)) return null;
  if (
    typeof value.reportFingerprint !== "string" ||
    !SHA256.test(value.reportFingerprint) ||
    value.state !== "reported_unverified"
  ) {
    return null;
  }
  const parsed = reportManualOrderPayment(
    invoice,
    {
      memberId: value.memberId,
      orderId: value.orderId,
      orderRef: value.orderRef,
      invoiceRef: value.invoiceRef,
      method: value.method,
      currency: value.currency,
      amountCents: value.amountCents,
      proof: value.proof,
      reportedAt: value.reportedAt,
    },
    { now: () => value.reportedAt as string },
  );
  if (
    parsed.state !== "accepted" ||
    canonicalJson(parsed.value) !== canonicalJson(value)
  ) {
    return null;
  }
  return parsed.value;
}

export interface ManualPaymentReservationEvidence {
  readonly reservationId: string;
  readonly memberId: string;
  readonly orderId: string;
  readonly lineKey: string;
  readonly quantity: number;
  readonly state: "held";
  readonly expiresAt: string;
}

export interface ManualPaymentVerificationEvidence {
  readonly memberId: string;
  readonly orderId: string;
  readonly orderRef: string;
  readonly invoiceRef: string;
  readonly method: ManualOrderPaymentMethod;
  readonly currency: "USD";
  readonly amountCents: number;
  /** Opaque approved receiving configuration, never account details. */
  readonly receivingConfigurationRef: string;
  readonly fundsObserved: "confirmed";
  readonly proofReview: "accepted_readable";
  readonly externalTransactionRef: string;
  readonly verifiedAt: string;
  readonly idempotencyKey: string;
}

const VERIFICATION_KEYS = [
  "memberId",
  "orderId",
  "orderRef",
  "invoiceRef",
  "method",
  "currency",
  "amountCents",
  "receivingConfigurationRef",
  "fundsObserved",
  "proofReview",
  "externalTransactionRef",
  "verifiedAt",
  "idempotencyKey",
] as const;

const RESERVATION_KEYS = [
  "reservationId",
  "memberId",
  "orderId",
  "lineKey",
  "quantity",
  "state",
  "expiresAt",
] as const;

export type ManualPaymentEffectKind =
  | "payment_verified"
  | "order_paid"
  | "receipt_issue"
  | "reservation_finalize"
  | "supplier_release"
  | "audit_append"
  | "notification_enqueue"
  | "commission_evaluate";

export interface ManualPaymentPlannedEffect {
  readonly effectId: string;
  readonly kind: ManualPaymentEffectKind;
  readonly orderId: string;
  readonly memberId: string;
  readonly reference: string;
  readonly execution: "not_executed";
}

export interface ManualPaymentVerificationPlan {
  readonly planFingerprint: string;
  readonly idempotencyKey: string;
  readonly memberId: string;
  readonly orderId: string;
  readonly invoiceRef: string;
  readonly receiptRef: string;
  readonly externalTransactionRef: string;
  readonly amountCents: number;
  readonly currency: "USD";
  readonly verifiedAt: string;
  readonly verifiedByActorId: string;
  readonly verifiedByRole: ManualPaymentVerifyRole;
  readonly reportFingerprint: string;
  readonly effects: readonly ManualPaymentPlannedEffect[];
  readonly execution: "not_executed";
  readonly atomicity: "requires_separately_reviewed_commit";
}

export interface CommittedManualPaymentVerificationPlan {
  readonly memberId: string;
  readonly orderId: string;
  readonly idempotencyKey: string;
  readonly planFingerprint: string;
  readonly plan: ManualPaymentVerificationPlan;
  readonly state: "verification_plan_committed";
}

const PRIOR_PLAN_KEYS = [
  "memberId",
  "orderId",
  "idempotencyKey",
  "planFingerprint",
  "plan",
  "state",
] as const;
const VERIFICATION_PLAN_KEYS = [
  "planFingerprint",
  "idempotencyKey",
  "memberId",
  "orderId",
  "invoiceRef",
  "receiptRef",
  "externalTransactionRef",
  "amountCents",
  "currency",
  "verifiedAt",
  "verifiedByActorId",
  "verifiedByRole",
  "reportFingerprint",
  "effects",
  "execution",
  "atomicity",
] as const;
const PLANNED_EFFECT_KEYS = [
  "effectId",
  "kind",
  "orderId",
  "memberId",
  "reference",
  "execution",
] as const;

function isPriorVerificationPlan(
  value: unknown,
): value is CommittedManualPaymentVerificationPlan {
  if (!isRecord(value) || !hasExactKeys(value, PRIOR_PLAN_KEYS)) return false;
  if (
    !isSafeIdentifier(value.memberId) ||
    !isSafeIdentifier(value.orderId) ||
    typeof value.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY.test(value.idempotencyKey) ||
    typeof value.planFingerprint !== "string" ||
    !SHA256.test(value.planFingerprint) ||
    !isRecord(value.plan) ||
    value.state !== "verification_plan_committed" ||
    !hasExactKeys(value.plan, VERIFICATION_PLAN_KEYS)
  ) {
    return false;
  }
  const plan = value.plan;
  if (
    plan.planFingerprint !== value.planFingerprint ||
    plan.idempotencyKey !== value.idempotencyKey ||
    plan.memberId !== value.memberId ||
    plan.orderId !== value.orderId ||
    !isSafeIdentifier(plan.memberId) ||
    !isSafeIdentifier(plan.orderId) ||
    typeof plan.invoiceRef !== "string" ||
    typeof plan.receiptRef !== "string" ||
    !isOpaqueRef(plan.externalTransactionRef) ||
    !isPositiveCents(plan.amountCents) ||
    plan.currency !== "USD" ||
    !isCanonicalTimestamp(plan.verifiedAt) ||
    !isSafeIdentifier(plan.verifiedByActorId) ||
    typeof plan.verifiedByRole !== "string" ||
    !(MANUAL_PAYMENT_VERIFY_ROLES as readonly string[]).includes(
      plan.verifiedByRole,
    ) ||
    typeof plan.reportFingerprint !== "string" ||
    !SHA256.test(plan.reportFingerprint) ||
    !Array.isArray(plan.effects) ||
    plan.execution !== "not_executed" ||
    plan.atomicity !== "requires_separately_reviewed_commit"
  ) {
    return false;
  }
  const kinds = new Set<ManualPaymentEffectKind>();
  for (const effect of plan.effects) {
    if (
      !isRecord(effect) ||
      !hasExactKeys(effect, PLANNED_EFFECT_KEYS) ||
      typeof effect.effectId !== "string" ||
      !/^mpi_[a-f0-9]{32}$/.test(effect.effectId) ||
      typeof effect.kind !== "string" ||
      !(
        [
          "payment_verified",
          "order_paid",
          "receipt_issue",
          "reservation_finalize",
          "supplier_release",
          "audit_append",
          "notification_enqueue",
          "commission_evaluate",
        ] as readonly string[]
      ).includes(effect.kind) ||
      effect.orderId !== plan.orderId ||
      effect.memberId !== plan.memberId ||
      typeof effect.reference !== "string" ||
      effect.reference.length === 0 ||
      effect.execution !== "not_executed" ||
      kinds.has(effect.kind as ManualPaymentEffectKind)
    ) {
      return false;
    }
    kinds.add(effect.kind as ManualPaymentEffectKind);
  }
  return kinds.size === 8;
}

export interface PlanManualPaymentVerificationInput {
  readonly invoice: ManualOrderInvoice;
  readonly report: ManualPaymentReport;
  readonly evidence: unknown;
  readonly authenticatedActorId: string;
  readonly authorization: ManualPaymentAuthorizationPort;
  readonly clock: ManualPaymentClockPort;
  readonly state: ManualPaymentVerificationStatePort;
  readonly reservations: readonly unknown[];
}

export interface ManualPaymentAuthorizationPort {
  /** Resolve only from authenticated server context, never request fields. */
  resolveRole(actorId: string): ManualPaymentVerifyRole | null;
}

export interface ManualPaymentOccurrenceOwner {
  readonly memberId: string;
  readonly orderId: string;
  readonly idempotencyKey: string;
}

const OCCURRENCE_OWNER_KEYS = [
  "memberId",
  "orderId",
  "idempotencyKey",
] as const;

function parseOccurrenceOwner(
  value: unknown,
): ManualPaymentOccurrenceOwner | null {
  if (!isRecord(value) || !hasExactKeys(value, OCCURRENCE_OWNER_KEYS)) {
    return null;
  }
  if (
    !isSafeIdentifier(value.memberId) ||
    !isSafeIdentifier(value.orderId) ||
    typeof value.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY.test(value.idempotencyKey)
  ) {
    return null;
  }
  return value as unknown as ManualPaymentOccurrenceOwner;
}

function matchesOccurrence(
  owner: ManualPaymentOccurrenceOwner | null,
  memberId: string,
  orderId: string,
  idempotencyKey: string,
): boolean {
  return (
    owner !== null &&
    owner.memberId === memberId &&
    owner.orderId === orderId &&
    owner.idempotencyKey === idempotencyKey
  );
}

export interface ManualPaymentVerificationStatePort {
  resolvePlanByIdempotency(input: {
    memberId: string;
    orderId: string;
    idempotencyKey: string;
  }): unknown;
  resolveExternalTransactionOwner(externalTransactionRef: string): unknown;
  resolveProofOwner(proofSha256: string): unknown;
}

function lineKey(line: OrderLinePriceSnapshot): string {
  return `${line.productId}:${line.variantId}:${line.sku}`;
}

function parseReservation(
  value: unknown,
): ManualPaymentReservationEvidence | null {
  if (!isRecord(value) || !hasExactKeys(value, RESERVATION_KEYS)) return null;
  if (
    !isSafeIdentifier(value.reservationId) ||
    !isSafeIdentifier(value.memberId) ||
    !isSafeIdentifier(value.orderId) ||
    typeof value.lineKey !== "string" ||
    value.lineKey.length === 0 ||
    !Number.isSafeInteger(value.quantity) ||
    (value.quantity as number) <= 0 ||
    value.state !== "held" ||
    !isCanonicalTimestamp(value.expiresAt)
  ) {
    return null;
  }
  return value as unknown as ManualPaymentReservationEvidence;
}

function parseVerificationEvidence(
  value: unknown,
): ManualPaymentVerificationEvidence | null {
  if (!isRecord(value) || !hasExactKeys(value, VERIFICATION_KEYS)) return null;
  const method = asManualMethod(value.method);
  if (
    !isSafeIdentifier(value.memberId) ||
    !isSafeIdentifier(value.orderId) ||
    typeof value.orderRef !== "string" ||
    typeof value.invoiceRef !== "string" ||
    method === null ||
    value.currency !== "USD" ||
    !isPositiveCents(value.amountCents) ||
    !isOpaqueRef(value.receivingConfigurationRef) ||
    value.fundsObserved !== "confirmed" ||
    value.proofReview !== "accepted_readable" ||
    !isOpaqueRef(value.externalTransactionRef) ||
    !isCanonicalTimestamp(value.verifiedAt) ||
    typeof value.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY.test(value.idempotencyKey)
  ) {
    return null;
  }
  return value as unknown as ManualPaymentVerificationEvidence;
}

export function planManualPaymentVerification(
  input: PlanManualPaymentVerificationInput,
): ManualPaymentResult<{
  readonly plan: ManualPaymentVerificationPlan;
  readonly replayed: boolean;
}> {
  const evidence = parseVerificationEvidence(input.evidence);
  if (evidence === null) return refused("validation_failed");
  if (!isSafeIdentifier(input.authenticatedActorId)) {
    return refused("not_permitted");
  }
  let actorRole: ManualPaymentVerifyRole | null;
  try {
    actorRole = input.authorization.resolveRole(input.authenticatedActorId);
  } catch {
    return refused("not_permitted");
  }
  if (
    actorRole === null ||
    !(MANUAL_PAYMENT_VERIFY_ROLES as readonly string[]).includes(actorRole)
  ) {
    return refused("not_permitted");
  }
  let rawPrior: unknown;
  try {
    rawPrior = input.state.resolvePlanByIdempotency({
      memberId: input.invoice.memberId,
      orderId: input.invoice.orderId,
      idempotencyKey: evidence.idempotencyKey,
    });
  } catch {
    return refused("idempotency_conflict");
  }
  if (rawPrior !== null && !isPriorVerificationPlan(rawPrior)) {
    return refused("idempotency_conflict");
  }
  const preexistingPlan =
    rawPrior as CommittedManualPaymentVerificationPlan | null;
  const verifiedAtFromClock = readClock(input.clock);
  if (
    !Array.isArray(input.reservations) ||
    (preexistingPlan === null &&
      (verifiedAtFromClock === null ||
        evidence.verifiedAt !== verifiedAtFromClock))
  ) {
    return refused("validation_failed");
  }
  const { invoice } = input;
  const report = canonicalReportForInvoice(invoice, input.report);
  if (report === null) {
    return refused("invoice_mismatch");
  }
  if (
    evidence.memberId !== invoice.memberId ||
    evidence.orderId !== invoice.orderId ||
    evidence.orderRef !== invoice.orderRef ||
    evidence.invoiceRef !== invoice.invoiceRef ||
    evidence.method !== invoice.method.method ||
    evidence.currency !== invoice.currency ||
    evidence.amountCents !== invoice.amountCents ||
    evidence.receivingConfigurationRef !== invoice.method.configurationRef ||
    report.method !== evidence.method ||
    report.currency !== evidence.currency ||
    report.amountCents !== evidence.amountCents
  ) {
    return refused("evidence_mismatch");
  }
  const verifiedAt = timestampMillis(evidence.verifiedAt);
  if (
    verifiedAt === null ||
    verifiedAt < Date.parse(report.reportedAt) ||
    verifiedAt > Date.parse(invoice.dueAt)
  ) {
    return refused("invoice_expired");
  }
  const reservations = input.reservations.map(parseReservation);
  if (reservations.some((reservation) => reservation === null)) {
    return refused("reservation_mismatch");
  }
  const validReservations = reservations as ManualPaymentReservationEvidence[];
  const expectedLines = new Map(
    invoice.lines.map((line) => [lineKey(line), line.quantity] as const),
  );
  if (
    expectedLines.size !== invoice.lines.length ||
    validReservations.length !== expectedLines.size
  ) {
    return refused("reservation_mismatch");
  }
  const seenLines = new Set<string>();
  const seenReservationIds = new Set<string>();
  for (const reservation of validReservations) {
    if (
      reservation.memberId !== invoice.memberId ||
      reservation.orderId !== invoice.orderId ||
      reservation.state !== "held" ||
      Date.parse(reservation.expiresAt) <= verifiedAt ||
      seenLines.has(reservation.lineKey) ||
      seenReservationIds.has(reservation.reservationId) ||
      expectedLines.get(reservation.lineKey) !== reservation.quantity
    ) {
      return refused("reservation_mismatch");
    }
    seenLines.add(reservation.lineKey);
    seenReservationIds.add(reservation.reservationId);
  }

  const fingerprint = sha256Hex(
    canonicalJson({
      invoiceRef: invoice.invoiceRef,
      quoteHash: invoice.quoteHash,
      report: {
        reportFingerprint: report.reportFingerprint,
        reportedAt: report.reportedAt,
        proof: report.proof,
      },
      actorId: input.authenticatedActorId,
      actorRole,
      externalTransactionRef: evidence.externalTransactionRef,
      receivingConfigurationRef: evidence.receivingConfigurationRef,
      verifiedAt: evidence.verifiedAt,
      idempotencyKey: evidence.idempotencyKey,
      reservations: validReservations
        .map((reservation) => ({
          reservationId: reservation.reservationId,
          lineKey: reservation.lineKey,
          quantity: reservation.quantity,
          expiresAt: reservation.expiresAt,
        }))
        .sort((a, b) => a.lineKey.localeCompare(b.lineKey)),
    }),
  );

  const effectKinds: readonly ManualPaymentEffectKind[] = [
    "payment_verified",
    "order_paid",
    "receipt_issue",
    "reservation_finalize",
    "supplier_release",
    "audit_append",
    "notification_enqueue",
    "commission_evaluate",
  ];
  const effects = effectKinds.map((kind) => ({
    effectId: stableEffectId(fingerprint, kind),
    kind,
    orderId: invoice.orderId,
    memberId: invoice.memberId,
    reference:
      kind === "receipt_issue"
        ? invoice.receiptRef
        : kind === "reservation_finalize"
          ? validReservations
              .map((reservation) => reservation.reservationId)
              .sort()
              .join(",")
          : invoice.orderRef,
    execution: "not_executed" as const,
  }));
  const plan: ManualPaymentVerificationPlan = deepFreeze({
    planFingerprint: fingerprint,
    idempotencyKey: evidence.idempotencyKey,
    memberId: invoice.memberId,
    orderId: invoice.orderId,
    invoiceRef: invoice.invoiceRef,
    receiptRef: invoice.receiptRef,
    externalTransactionRef: evidence.externalTransactionRef,
    amountCents: invoice.amountCents,
    currency: "USD" as const,
    verifiedAt: evidence.verifiedAt,
    verifiedByActorId: input.authenticatedActorId,
    verifiedByRole: actorRole,
    reportFingerprint: report.reportFingerprint,
    effects,
    execution: "not_executed" as const,
    atomicity: "requires_separately_reviewed_commit" as const,
  });
  let rawTransactionOwner: unknown;
  let rawProofOwner: unknown;
  try {
    rawTransactionOwner = input.state.resolveExternalTransactionOwner(
      evidence.externalTransactionRef,
    );
    rawProofOwner = input.state.resolveProofOwner(report.proof.sha256);
  } catch {
    return refused("idempotency_conflict");
  }
  const transactionOwner =
    rawTransactionOwner === null
      ? null
      : parseOccurrenceOwner(rawTransactionOwner);
  const proofOwner =
    rawProofOwner === null ? null : parseOccurrenceOwner(rawProofOwner);
  if (
    (rawTransactionOwner !== null && transactionOwner === null) ||
    (rawProofOwner !== null && proofOwner === null)
  ) {
    return refused("idempotency_conflict");
  }
  const prior = preexistingPlan;
  if (prior !== null) {
    if (
      prior.planFingerprint !== fingerprint ||
      prior.memberId !== invoice.memberId ||
      prior.orderId !== invoice.orderId ||
      prior.idempotencyKey !== evidence.idempotencyKey ||
      prior.plan.idempotencyKey !== evidence.idempotencyKey ||
      prior.plan.planFingerprint !== fingerprint ||
      canonicalJson(prior.plan) !== canonicalJson(plan) ||
      !matchesOccurrence(
        transactionOwner,
        invoice.memberId,
        invoice.orderId,
        evidence.idempotencyKey,
      ) ||
      !matchesOccurrence(
        proofOwner,
        invoice.memberId,
        invoice.orderId,
        evidence.idempotencyKey,
      )
    ) {
      return refused("idempotency_conflict");
    }
    return {
      state: "accepted",
      value: deepFreeze({ plan, replayed: true }),
    };
  }
  if (transactionOwner !== null) {
    return refused("duplicate_transaction");
  }
  if (proofOwner !== null) {
    return refused("duplicate_proof");
  }
  return {
    state: "accepted",
    value: deepFreeze({ plan, replayed: false }),
  };
}

export interface ManualInvoiceExpiryPlan {
  readonly invoiceRef: string;
  readonly orderId: string;
  readonly releaseReservationIds: readonly string[];
  readonly execution: "not_executed";
}

export function planManualInvoiceExpiry(
  invoice: ManualOrderInvoice,
  clock: ManualPaymentClockPort,
  reservations: readonly unknown[],
): ManualPaymentResult<ManualInvoiceExpiryPlan> {
  const at = readClock(clock);
  if (
    at === null ||
    Date.parse(at) <= Date.parse(invoice.dueAt) ||
    !Array.isArray(reservations)
  ) {
    return refused("validation_failed");
  }
  const parsed = reservations.map(parseReservation);
  if (
    parsed.some((reservation) => reservation === null) ||
    parsed.some(
      (reservation) =>
        reservation?.memberId !== invoice.memberId ||
        reservation.orderId !== invoice.orderId,
    )
  ) {
    return refused("reservation_mismatch");
  }
  const reservationIds = (parsed as ManualPaymentReservationEvidence[]).map(
    (reservation) => reservation.reservationId,
  );
  const lineIdentities = (parsed as ManualPaymentReservationEvidence[]).map(
    (reservation) => reservation.lineKey,
  );
  const expectedLines = new Map(
    invoice.lines.map((line) => [lineKey(line), line.quantity] as const),
  );
  if (
    expectedLines.size !== invoice.lines.length ||
    reservationIds.length !== expectedLines.size ||
    new Set(reservationIds).size !== reservationIds.length ||
    new Set(lineIdentities).size !== lineIdentities.length ||
    (parsed as ManualPaymentReservationEvidence[]).some(
      (reservation) =>
        expectedLines.get(reservation.lineKey) !== reservation.quantity,
    )
  ) {
    return refused("reservation_mismatch");
  }
  return {
    state: "accepted",
    value: deepFreeze({
      invoiceRef: invoice.invoiceRef,
      orderId: invoice.orderId,
      releaseReservationIds: reservationIds.sort(),
      execution: "not_executed" as const,
    }),
  };
}

export interface ManualRefundAllocation {
  readonly lineKey: string;
  readonly amountCents: number;
}

const REFUND_ALLOCATION_KEYS = ["lineKey", "amountCents"] as const;

function parseRefundAllocation(value: unknown): ManualRefundAllocation | null {
  if (!isRecord(value) || !hasExactKeys(value, REFUND_ALLOCATION_KEYS)) {
    return null;
  }
  if (
    typeof value.lineKey !== "string" ||
    value.lineKey.length === 0 ||
    !isPositiveCents(value.amountCents)
  ) {
    return null;
  }
  return value as unknown as ManualRefundAllocation;
}

export interface ExternalRefundEvidence {
  readonly externalRefundRef: string;
  readonly externalTransactionRef: string;
  readonly method: ManualOrderPaymentMethod;
  readonly reason: ManualRefundReason;
  readonly proof: ManualPaymentProofMetadata;
  readonly completedAt: string;
  readonly amountCents: number;
  readonly currency: "USD";
  readonly idempotencyKey: string;
  readonly allocations: readonly ManualRefundAllocation[];
}

export const MANUAL_REFUND_REASONS = [
  "cancellation",
  "out_of_stock",
  "overpayment",
  "customer_service_resolution",
  "other_approved",
] as const;

export type ManualRefundReason = (typeof MANUAL_REFUND_REASONS)[number];

/**
 * Evidence emitted only after the later persistence lane has atomically
 * committed a verification. A non-executed verification plan is deliberately
 * not accepted as proof that funds were verified.
 */
export interface CommittedManualPaymentVerification {
  readonly memberId: string;
  readonly orderId: string;
  readonly externalTransactionRef: string;
  readonly verifiedAmountCents: number;
  readonly currency: "USD";
  readonly verifiedAt: string;
  readonly verifiedByActorId: string;
  readonly verifiedByRole: ManualPaymentVerifyRole;
  readonly verificationFingerprint: string;
  readonly commitRef: string;
  readonly state: "verified_committed";
}

const COMMITTED_VERIFICATION_KEYS = [
  "memberId",
  "orderId",
  "externalTransactionRef",
  "verifiedAmountCents",
  "currency",
  "verifiedAt",
  "verifiedByActorId",
  "verifiedByRole",
  "verificationFingerprint",
  "commitRef",
  "state",
] as const;

function parseCommittedVerification(
  value: unknown,
): CommittedManualPaymentVerification | null {
  if (!isRecord(value) || !hasExactKeys(value, COMMITTED_VERIFICATION_KEYS)) {
    return null;
  }
  if (
    !isSafeIdentifier(value.memberId) ||
    !isSafeIdentifier(value.orderId) ||
    !isOpaqueRef(value.externalTransactionRef) ||
    !isPositiveCents(value.verifiedAmountCents) ||
    value.currency !== "USD" ||
    !isCanonicalTimestamp(value.verifiedAt) ||
    !isSafeIdentifier(value.verifiedByActorId) ||
    typeof value.verifiedByRole !== "string" ||
    !(MANUAL_PAYMENT_VERIFY_ROLES as readonly string[]).includes(
      value.verifiedByRole,
    ) ||
    typeof value.verificationFingerprint !== "string" ||
    !SHA256.test(value.verificationFingerprint) ||
    !isOpaqueRef(value.commitRef) ||
    value.state !== "verified_committed"
  ) {
    return null;
  }
  return value as unknown as CommittedManualPaymentVerification;
}

const REFUND_KEYS = [
  "externalRefundRef",
  "externalTransactionRef",
  "method",
  "reason",
  "proof",
  "completedAt",
  "amountCents",
  "currency",
  "idempotencyKey",
  "allocations",
] as const;

export type ManualRefundEffectKind =
  | "credit_record"
  | "refund_record"
  | "commission_reversal_evaluate"
  | "audit_append"
  | "notification_enqueue";

export interface ManualRefundPlan {
  readonly refundRef: string;
  readonly refundFingerprint: string;
  readonly idempotencyKey: string;
  readonly externalRefundRef: string;
  readonly externalTransactionRef: string;
  readonly orderId: string;
  readonly memberId: string;
  readonly amountCents: number;
  readonly currency: "USD";
  readonly method: ManualOrderPaymentMethod;
  readonly reason: ManualRefundReason;
  readonly proofSha256: string;
  readonly completedAt: string;
  readonly recordedByActorId: string;
  readonly recordedByRole: ManualPaymentVerifyRole;
  readonly allocations: readonly ManualRefundAllocation[];
  readonly effects: readonly {
    effectId: string;
    kind: ManualRefundEffectKind;
    execution: "not_executed";
  }[];
  readonly execution: "not_executed";
  readonly movesMoney: false;
  readonly restocksInventory: false;
}

export interface CommittedManualRefundRecord {
  readonly memberId: string;
  readonly orderId: string;
  readonly externalRefundRef: string;
  readonly idempotencyKey: string;
  readonly amountCents: number;
  readonly currency: "USD";
  readonly proofSha256: string;
  readonly allocations: readonly ManualRefundAllocation[];
  readonly refundFingerprint: string;
  readonly state: "refund_committed";
}

const COMMITTED_REFUND_KEYS = [
  "memberId",
  "orderId",
  "externalRefundRef",
  "idempotencyKey",
  "amountCents",
  "currency",
  "proofSha256",
  "allocations",
  "refundFingerprint",
  "state",
] as const;

function parseCommittedRefund(
  value: unknown,
): CommittedManualRefundRecord | null {
  if (!isRecord(value) || !hasExactKeys(value, COMMITTED_REFUND_KEYS))
    return null;
  if (
    !isSafeIdentifier(value.memberId) ||
    !isSafeIdentifier(value.orderId) ||
    !isOpaqueRef(value.externalRefundRef) ||
    typeof value.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY.test(value.idempotencyKey) ||
    !isPositiveCents(value.amountCents) ||
    value.currency !== "USD" ||
    typeof value.proofSha256 !== "string" ||
    !SHA256.test(value.proofSha256) ||
    !Array.isArray(value.allocations) ||
    typeof value.refundFingerprint !== "string" ||
    !SHA256.test(value.refundFingerprint) ||
    value.state !== "refund_committed"
  ) {
    return null;
  }
  const allocations = value.allocations.map(parseRefundAllocation);
  if (allocations.some((allocation) => allocation === null)) return null;
  const validAllocations = allocations as ManualRefundAllocation[];
  const lineKeys = validAllocations.map((allocation) => allocation.lineKey);
  let allocatedTotal = 0;
  for (const allocation of validAllocations) {
    const next = allocatedTotal + allocation.amountCents;
    if (!Number.isSafeInteger(next)) return null;
    allocatedTotal = next;
  }
  if (
    validAllocations.length === 0 ||
    new Set(lineKeys).size !== lineKeys.length ||
    allocatedTotal !== value.amountCents
  ) {
    return null;
  }
  return deepFreeze({
    memberId: value.memberId,
    orderId: value.orderId,
    externalRefundRef: value.externalRefundRef,
    idempotencyKey: value.idempotencyKey,
    amountCents: value.amountCents,
    currency: "USD" as const,
    proofSha256: value.proofSha256,
    allocations: validAllocations,
    refundFingerprint: value.refundFingerprint,
    state: "refund_committed" as const,
  });
}

const REFUND_PLAN_KEYS = [
  "refundRef",
  "refundFingerprint",
  "idempotencyKey",
  "externalRefundRef",
  "externalTransactionRef",
  "orderId",
  "memberId",
  "amountCents",
  "currency",
  "method",
  "reason",
  "proofSha256",
  "completedAt",
  "recordedByActorId",
  "recordedByRole",
  "allocations",
  "effects",
  "execution",
  "movesMoney",
  "restocksInventory",
] as const;
const REFUND_EFFECT_KEYS = ["effectId", "kind", "execution"] as const;

function isManualRefundPlan(value: unknown): value is ManualRefundPlan {
  if (!isRecord(value) || !hasExactKeys(value, REFUND_PLAN_KEYS)) return false;
  if (
    typeof value.refundRef !== "string" ||
    !/^RFND-XRM-[A-F0-9]{12}$/.test(value.refundRef) ||
    typeof value.refundFingerprint !== "string" ||
    !SHA256.test(value.refundFingerprint) ||
    typeof value.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY.test(value.idempotencyKey) ||
    !isOpaqueRef(value.externalRefundRef) ||
    !isOpaqueRef(value.externalTransactionRef) ||
    !isSafeIdentifier(value.orderId) ||
    !isSafeIdentifier(value.memberId) ||
    !isPositiveCents(value.amountCents) ||
    value.currency !== "USD" ||
    asManualMethod(value.method) === null ||
    typeof value.reason !== "string" ||
    !(MANUAL_REFUND_REASONS as readonly string[]).includes(value.reason) ||
    typeof value.proofSha256 !== "string" ||
    !SHA256.test(value.proofSha256) ||
    !isCanonicalTimestamp(value.completedAt) ||
    !isSafeIdentifier(value.recordedByActorId) ||
    typeof value.recordedByRole !== "string" ||
    !(MANUAL_PAYMENT_VERIFY_ROLES as readonly string[]).includes(
      value.recordedByRole,
    ) ||
    !Array.isArray(value.allocations) ||
    !Array.isArray(value.effects) ||
    value.execution !== "not_executed" ||
    value.movesMoney !== false ||
    value.restocksInventory !== false
  ) {
    return false;
  }
  const allocations = value.allocations.map(parseRefundAllocation);
  if (allocations.some((allocation) => allocation === null)) return false;
  const validAllocations = allocations as ManualRefundAllocation[];
  const allocationLines = validAllocations.map(
    (allocation) => allocation.lineKey,
  );
  let allocationTotal = 0;
  for (const allocation of validAllocations) {
    const next = allocationTotal + allocation.amountCents;
    if (!Number.isSafeInteger(next)) return false;
    allocationTotal = next;
  }
  if (
    validAllocations.length === 0 ||
    new Set(allocationLines).size !== allocationLines.length ||
    allocationTotal !== value.amountCents
  ) {
    return false;
  }
  const kinds = new Set<ManualRefundEffectKind>();
  for (const effect of value.effects) {
    if (
      !isRecord(effect) ||
      !hasExactKeys(effect, REFUND_EFFECT_KEYS) ||
      typeof effect.effectId !== "string" ||
      !/^mpi_[a-f0-9]{32}$/.test(effect.effectId) ||
      typeof effect.kind !== "string" ||
      !(
        [
          "credit_record",
          "refund_record",
          "commission_reversal_evaluate",
          "audit_append",
          "notification_enqueue",
        ] as readonly string[]
      ).includes(effect.kind) ||
      effect.execution !== "not_executed" ||
      kinds.has(effect.kind as ManualRefundEffectKind)
    ) {
      return false;
    }
    kinds.add(effect.kind as ManualRefundEffectKind);
  }
  return kinds.size === 5;
}

export interface CommittedManualRefundPlan {
  readonly memberId: string;
  readonly orderId: string;
  readonly idempotencyKey: string;
  readonly refundFingerprint: string;
  readonly plan: ManualRefundPlan;
  readonly state: "refund_plan_committed";
}

const COMMITTED_REFUND_PLAN_KEYS = [
  "memberId",
  "orderId",
  "idempotencyKey",
  "refundFingerprint",
  "plan",
  "state",
] as const;

function parseCommittedRefundPlan(
  value: unknown,
): CommittedManualRefundPlan | null {
  if (!isRecord(value) || !hasExactKeys(value, COMMITTED_REFUND_PLAN_KEYS)) {
    return null;
  }
  if (
    !isSafeIdentifier(value.memberId) ||
    !isSafeIdentifier(value.orderId) ||
    typeof value.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY.test(value.idempotencyKey) ||
    typeof value.refundFingerprint !== "string" ||
    !SHA256.test(value.refundFingerprint) ||
    !isManualRefundPlan(value.plan) ||
    value.plan.memberId !== value.memberId ||
    value.plan.orderId !== value.orderId ||
    value.plan.idempotencyKey !== value.idempotencyKey ||
    value.plan.refundFingerprint !== value.refundFingerprint ||
    value.state !== "refund_plan_committed"
  ) {
    return null;
  }
  return value as unknown as CommittedManualRefundPlan;
}

export interface ManualPaymentCommitPort {
  /** Implemented later by the durable store; never from request JSON. */
  resolveVerification(input: {
    memberId: string;
    orderId: string;
    externalTransactionRef: string;
  }): unknown;
  listCommittedRefunds(input: {
    memberId: string;
    orderId: string;
  }): readonly unknown[];
  resolveRefundPlanByIdempotency(input: {
    memberId: string;
    orderId: string;
    idempotencyKey: string;
  }): unknown;
  resolveExternalRefundOwner(externalRefundRef: string): unknown;
  resolveRefundProofOwner(proofSha256: string): unknown;
}

export interface PlanManualRefundInput {
  readonly invoice: ManualOrderInvoice;
  readonly evidence: unknown;
  readonly authenticatedActorId: string;
  readonly authorization: ManualPaymentAuthorizationPort;
  readonly clock: ManualPaymentClockPort;
  readonly commits: ManualPaymentCommitPort;
}

export function planExternallyCompletedManualRefund(
  input: PlanManualRefundInput,
): ManualPaymentResult<{
  readonly plan: ManualRefundPlan;
  readonly replayed: boolean;
}> {
  if (!isRecord(input.evidence) || !hasExactKeys(input.evidence, REFUND_KEYS)) {
    return refused("refund_evidence_invalid");
  }
  const evidence = input.evidence;
  const refundMethod = asManualMethod(evidence.method);
  const refundProof = parseManualPaymentProofMetadata(evidence.proof);
  if (
    !isOpaqueRef(evidence.externalRefundRef) ||
    !isOpaqueRef(evidence.externalTransactionRef) ||
    refundMethod === null ||
    typeof evidence.reason !== "string" ||
    !(MANUAL_REFUND_REASONS as readonly string[]).includes(evidence.reason) ||
    refundProof.state !== "accepted" ||
    !isCanonicalTimestamp(evidence.completedAt) ||
    !isPositiveCents(evidence.amountCents) ||
    evidence.currency !== "USD" ||
    typeof evidence.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY.test(evidence.idempotencyKey) ||
    !Array.isArray(evidence.allocations)
  ) {
    return refused("refund_evidence_invalid");
  }
  const parsedAllocations = evidence.allocations.map(parseRefundAllocation);
  if (parsedAllocations.some((allocation) => allocation === null)) {
    return refused("refund_evidence_invalid");
  }
  const allocations = parsedAllocations as ManualRefundAllocation[];
  const allocationLineKeys = allocations.map(
    (allocation) => allocation.lineKey,
  );
  let requestedAllocationTotal = 0;
  for (const allocation of allocations) {
    const next = requestedAllocationTotal + allocation.amountCents;
    if (!Number.isSafeInteger(next)) return refused("refund_evidence_invalid");
    requestedAllocationTotal = next;
  }
  if (
    allocations.length === 0 ||
    new Set(allocationLineKeys).size !== allocationLineKeys.length ||
    requestedAllocationTotal !== evidence.amountCents
  ) {
    return refused("refund_evidence_invalid");
  }
  if (!isSafeIdentifier(input.authenticatedActorId)) {
    return refused("not_permitted");
  }
  let actorRole: ManualPaymentVerifyRole | null;
  try {
    actorRole = input.authorization.resolveRole(input.authenticatedActorId);
  } catch {
    return refused("not_permitted");
  }
  if (
    actorRole === null ||
    !(MANUAL_PAYMENT_VERIFY_ROLES as readonly string[]).includes(actorRole)
  ) {
    return refused("not_permitted");
  }
  let rawPriorRefundPlan: unknown;
  try {
    rawPriorRefundPlan = input.commits.resolveRefundPlanByIdempotency({
      memberId: input.invoice.memberId,
      orderId: input.invoice.orderId,
      idempotencyKey: evidence.idempotencyKey,
    });
  } catch {
    return refused("refund_evidence_invalid");
  }
  const preexistingRefundPlan =
    rawPriorRefundPlan === null
      ? null
      : parseCommittedRefundPlan(rawPriorRefundPlan);
  if (rawPriorRefundPlan !== null && preexistingRefundPlan === null) {
    return refused("refund_evidence_invalid");
  }
  const completedAtFromClock = readClock(input.clock);
  if (
    preexistingRefundPlan === null &&
    (completedAtFromClock === null ||
      evidence.completedAt !== completedAtFromClock)
  ) {
    return refused("refund_evidence_invalid");
  }
  if (
    !refundProof.value.storageObjectRef.startsWith(
      `private/manual-payment-proofs/${input.invoice.memberId}/${input.invoice.orderId}/`,
    ) ||
    Date.parse(refundProof.value.uploadedAt) <
      Date.parse(input.invoice.createdAt) ||
    Date.parse(refundProof.value.uploadedAt) > Date.parse(evidence.completedAt)
  ) {
    return refused("refund_evidence_invalid");
  }
  let resolvedVerification: unknown;
  let listedRefunds: readonly unknown[];
  let rawExternalRefundOwner: unknown;
  let rawRefundProofOwner: unknown;
  try {
    resolvedVerification = input.commits.resolveVerification({
      memberId: input.invoice.memberId,
      orderId: input.invoice.orderId,
      externalTransactionRef: evidence.externalTransactionRef,
    });
    listedRefunds = input.commits.listCommittedRefunds({
      memberId: input.invoice.memberId,
      orderId: input.invoice.orderId,
    });
    rawExternalRefundOwner = input.commits.resolveExternalRefundOwner(
      evidence.externalRefundRef,
    );
    rawRefundProofOwner = input.commits.resolveRefundProofOwner(
      refundProof.value.sha256,
    );
  } catch {
    return refused("refund_evidence_invalid");
  }
  const verifiedPayment = parseCommittedVerification(resolvedVerification);
  if (verifiedPayment === null) return refused("refund_evidence_invalid");
  if (
    verifiedPayment.orderId !== input.invoice.orderId ||
    verifiedPayment.memberId !== input.invoice.memberId ||
    verifiedPayment.externalTransactionRef !==
      evidence.externalTransactionRef ||
    verifiedPayment.currency !== input.invoice.currency ||
    verifiedPayment.verifiedAmountCents !== input.invoice.amountCents ||
    refundMethod !== input.invoice.method.method ||
    Date.parse(verifiedPayment.verifiedAt) <
      Date.parse(input.invoice.createdAt) ||
    Date.parse(verifiedPayment.verifiedAt) > Date.parse(input.invoice.dueAt) ||
    Date.parse(evidence.completedAt) < Date.parse(verifiedPayment.verifiedAt)
  ) {
    return refused("refund_evidence_invalid");
  }
  if (!Array.isArray(listedRefunds)) return refused("refund_evidence_invalid");
  const priorRefundPlan = preexistingRefundPlan;
  const externalRefundOwner =
    rawExternalRefundOwner === null
      ? null
      : parseOccurrenceOwner(rawExternalRefundOwner);
  const refundProofOwner =
    rawRefundProofOwner === null
      ? null
      : parseOccurrenceOwner(rawRefundProofOwner);
  if (
    (rawExternalRefundOwner !== null && externalRefundOwner === null) ||
    (rawRefundProofOwner !== null && refundProofOwner === null)
  ) {
    return refused("refund_evidence_invalid");
  }
  const committedRefunds = listedRefunds.map(parseCommittedRefund);
  if (committedRefunds.some((record) => record === null)) {
    return refused("refund_evidence_invalid");
  }
  const validCommittedRefunds =
    committedRefunds as CommittedManualRefundRecord[];
  const committedRefs = new Set<string>();
  const committedIdempotencyKeys = new Set<string>();
  const committedProofs = new Set<string>();
  let matchingCommittedRefund: CommittedManualRefundRecord | null = null;
  const priorAllocatedByLine = new Map<string, number>();
  let priorTotal = 0;
  for (const record of validCommittedRefunds) {
    if (
      record.memberId !== input.invoice.memberId ||
      record.orderId !== input.invoice.orderId ||
      committedRefs.has(record.externalRefundRef) ||
      committedIdempotencyKeys.has(record.idempotencyKey) ||
      committedProofs.has(record.proofSha256)
    ) {
      return refused("refund_evidence_invalid");
    }
    committedRefs.add(record.externalRefundRef);
    committedIdempotencyKeys.add(record.idempotencyKey);
    committedProofs.add(record.proofSha256);
    if (record.idempotencyKey === evidence.idempotencyKey) {
      matchingCommittedRefund = record;
      continue;
    }
    for (const allocation of record.allocations) {
      const nextLineTotal =
        (priorAllocatedByLine.get(allocation.lineKey) ?? 0) +
        allocation.amountCents;
      if (!Number.isSafeInteger(nextLineTotal)) {
        return refused("refund_evidence_invalid");
      }
      priorAllocatedByLine.set(allocation.lineKey, nextLineTotal);
    }
    const next = priorTotal + record.amountCents;
    if (!Number.isSafeInteger(next)) return refused("refund_evidence_invalid");
    priorTotal = next;
  }
  if (evidence.amountCents > verifiedPayment.verifiedAmountCents - priorTotal) {
    return refused("refund_exceeds_verified");
  }
  const knownLineValues = new Map(
    input.invoice.lines.map(
      (line) => [lineKey(line), line.lineTotalCents] as const,
    ),
  );
  for (const [priorLineKey, priorLineAmount] of Array.from(
    priorAllocatedByLine.entries(),
  )) {
    const lineAmount = knownLineValues.get(priorLineKey);
    if (lineAmount === undefined || priorLineAmount > lineAmount) {
      return refused("refund_evidence_invalid");
    }
  }
  const sortedAllocations = allocations
    .map((allocation) => ({
      lineKey: allocation.lineKey,
      amountCents: allocation.amountCents,
    }))
    .sort((left, right) => left.lineKey.localeCompare(right.lineKey));
  for (const allocation of sortedAllocations) {
    const lineAmount = knownLineValues.get(allocation.lineKey);
    if (lineAmount === undefined) return refused("refund_line_unknown");
    const priorLineAmount = priorAllocatedByLine.get(allocation.lineKey) ?? 0;
    if (allocation.amountCents > lineAmount - priorLineAmount) {
      return refused("refund_exceeds_verified");
    }
  }
  const fingerprint = sha256Hex(
    canonicalJson({
      memberId: input.invoice.memberId,
      orderId: input.invoice.orderId,
      invoiceRef: input.invoice.invoiceRef,
      externalRefundRef: evidence.externalRefundRef,
      externalTransactionRef: evidence.externalTransactionRef,
      completedAt: evidence.completedAt,
      amountCents: evidence.amountCents,
      currency: evidence.currency,
      method: refundMethod,
      reason: evidence.reason,
      proof: refundProof.value,
      verifiedCommit: {
        verificationFingerprint: verifiedPayment.verificationFingerprint,
        commitRef: verifiedPayment.commitRef,
      },
      actorId: input.authenticatedActorId,
      actorRole,
      allocations: sortedAllocations,
      idempotencyKey: evidence.idempotencyKey,
    }),
  );
  const refundRef = `RFND-XRM-${fingerprint.slice(0, 12).toUpperCase()}`;
  const kinds: readonly ManualRefundEffectKind[] = [
    "credit_record",
    "refund_record",
    "commission_reversal_evaluate",
    "audit_append",
    "notification_enqueue",
  ];
  const plan: ManualRefundPlan = deepFreeze({
    refundRef,
    refundFingerprint: fingerprint,
    idempotencyKey: evidence.idempotencyKey,
    externalRefundRef: evidence.externalRefundRef,
    externalTransactionRef: evidence.externalTransactionRef,
    orderId: input.invoice.orderId,
    memberId: input.invoice.memberId,
    amountCents: evidence.amountCents,
    currency: "USD" as const,
    method: refundMethod,
    reason: evidence.reason as ManualRefundReason,
    proofSha256: refundProof.value.sha256,
    completedAt: evidence.completedAt,
    recordedByActorId: input.authenticatedActorId,
    recordedByRole: actorRole,
    allocations: sortedAllocations,
    effects: kinds.map((kind) => ({
      effectId: stableEffectId(fingerprint, kind),
      kind,
      execution: "not_executed" as const,
    })),
    execution: "not_executed" as const,
    movesMoney: false as const,
    restocksInventory: false as const,
  });
  if (priorRefundPlan !== null) {
    if (
      matchingCommittedRefund === null ||
      priorRefundPlan.memberId !== input.invoice.memberId ||
      priorRefundPlan.orderId !== input.invoice.orderId ||
      priorRefundPlan.idempotencyKey !== evidence.idempotencyKey ||
      priorRefundPlan.refundFingerprint !== fingerprint ||
      canonicalJson(priorRefundPlan.plan) !== canonicalJson(plan) ||
      matchingCommittedRefund.externalRefundRef !==
        evidence.externalRefundRef ||
      matchingCommittedRefund.proofSha256 !== refundProof.value.sha256 ||
      matchingCommittedRefund.amountCents !== evidence.amountCents ||
      matchingCommittedRefund.currency !== evidence.currency ||
      canonicalJson(
        [...matchingCommittedRefund.allocations].sort((left, right) =>
          left.lineKey.localeCompare(right.lineKey),
        ),
      ) !== canonicalJson(sortedAllocations) ||
      matchingCommittedRefund.refundFingerprint !== fingerprint ||
      !matchesOccurrence(
        externalRefundOwner,
        input.invoice.memberId,
        input.invoice.orderId,
        evidence.idempotencyKey,
      ) ||
      !matchesOccurrence(
        refundProofOwner,
        input.invoice.memberId,
        input.invoice.orderId,
        evidence.idempotencyKey,
      )
    ) {
      return refused("idempotency_conflict");
    }
    return {
      state: "accepted",
      value: deepFreeze({ plan, replayed: true }),
    };
  }
  if (
    matchingCommittedRefund !== null ||
    committedRefs.has(evidence.externalRefundRef) ||
    committedProofs.has(refundProof.value.sha256) ||
    externalRefundOwner !== null ||
    refundProofOwner !== null
  ) {
    return refused("refund_evidence_invalid");
  }
  return {
    state: "accepted",
    value: deepFreeze({ plan, replayed: false }),
  };
}

export interface MemberManualPaymentProjection {
  readonly orderRef: string;
  readonly invoiceRef: string;
  readonly paymentMemo: string;
  readonly amountCents: number;
  readonly currency: "USD";
  readonly method: ManualOrderPaymentMethod;
  readonly status: "awaiting_payment" | "reported_pending_verification";
  readonly dueAt: string;
}

export interface ManualPaymentMemberViewerPort {
  /** Resolve from the authenticated member session, never a route parameter. */
  resolveMemberId(): string | null;
}

export function projectManualPaymentForMember(
  invoice: ManualOrderInvoice,
  report: ManualPaymentReport | null,
  viewer: ManualPaymentMemberViewerPort,
): ManualPaymentResult<MemberManualPaymentProjection> {
  let viewerMemberId: string | null;
  try {
    viewerMemberId = viewer.resolveMemberId();
  } catch {
    return refused("not_permitted");
  }
  if (viewerMemberId !== invoice.memberId) return refused("not_permitted");
  const canonicalReport =
    report === null ? null : canonicalReportForInvoice(invoice, report);
  if (report !== null && canonicalReport === null) {
    return refused("report_mismatch");
  }
  return {
    state: "accepted",
    value: deepFreeze({
      orderRef: invoice.orderRef,
      invoiceRef: invoice.invoiceRef,
      paymentMemo: invoice.paymentMemo,
      amountCents: invoice.amountCents,
      currency: "USD" as const,
      method: invoice.method.method,
      status:
        canonicalReport === null
          ? ("awaiting_payment" as const)
          : ("reported_pending_verification" as const),
      dueAt: invoice.dueAt,
    }),
  };
}

export const MANUAL_PAYMENT_ANOMALY_CODES = [
  "input_invalid",
  "duplicate_transaction",
  "duplicate_proof",
  "same_sender_amount_time",
  "paid_without_supplier_release",
  "supplier_release_without_paid",
  "receipt_missing",
  "notification_failed",
  "proof_overdue",
  "total_changed_after_proof",
] as const;

export type ManualPaymentAnomalyCode =
  (typeof MANUAL_PAYMENT_ANOMALY_CODES)[number];

export interface ManualPaymentReconciliationInput {
  readonly now: string;
  readonly invoiceDueAt: string;
  readonly reported: boolean;
  readonly paid: boolean;
  readonly supplierReleased: boolean;
  readonly receiptIssued: boolean;
  readonly notificationFailed: boolean;
  readonly originalAmountCents: number;
  readonly currentAmountCents: number;
  readonly externalTransactionUseCount: number;
  readonly proofUseCount: number;
  /** Count of an opaque, privacy-safe sender/amount/time fingerprint. */
  readonly senderAmountTimeFingerprintUseCount: number;
}

export function reconcileManualPayment(
  input: ManualPaymentReconciliationInput,
): readonly ManualPaymentAnomalyCode[] {
  if (
    !isCanonicalTimestamp(input.now) ||
    !isCanonicalTimestamp(input.invoiceDueAt) ||
    typeof input.reported !== "boolean" ||
    typeof input.paid !== "boolean" ||
    typeof input.supplierReleased !== "boolean" ||
    typeof input.receiptIssued !== "boolean" ||
    typeof input.notificationFailed !== "boolean" ||
    !isPositiveCents(input.originalAmountCents) ||
    !isPositiveCents(input.currentAmountCents) ||
    !Number.isSafeInteger(input.externalTransactionUseCount) ||
    input.externalTransactionUseCount < 0 ||
    !Number.isSafeInteger(input.proofUseCount) ||
    input.proofUseCount < 0 ||
    !Number.isSafeInteger(input.senderAmountTimeFingerprintUseCount) ||
    input.senderAmountTimeFingerprintUseCount < 0
  ) {
    return Object.freeze(["input_invalid"] as const);
  }
  const anomalies: ManualPaymentAnomalyCode[] = [];
  if (input.externalTransactionUseCount > 1)
    anomalies.push("duplicate_transaction");
  if (input.proofUseCount > 1) anomalies.push("duplicate_proof");
  if (input.senderAmountTimeFingerprintUseCount > 1) {
    anomalies.push("same_sender_amount_time");
  }
  if (input.paid && !input.supplierReleased) {
    anomalies.push("paid_without_supplier_release");
  }
  if (input.supplierReleased && !input.paid) {
    anomalies.push("supplier_release_without_paid");
  }
  if (input.paid && !input.receiptIssued) anomalies.push("receipt_missing");
  if (input.notificationFailed) anomalies.push("notification_failed");
  if (
    !input.reported &&
    Date.parse(input.now) > Date.parse(input.invoiceDueAt)
  ) {
    anomalies.push("proof_overdue");
  }
  if (
    input.reported &&
    input.originalAmountCents !== input.currentAmountCents
  ) {
    anomalies.push("total_changed_after_proof");
  }
  return Object.freeze(anomalies);
}
