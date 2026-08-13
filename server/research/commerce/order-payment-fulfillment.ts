/**
 * Unmounted order -> manual payment -> supplier fulfilment workflow.
 *
 * This composes the existing manual-payment records without weakening their
 * boundary: an invoice is still an immutable ManualOrderInvoice, payment is
 * only considered verified after a CommittedManualPaymentVerification exists,
 * and a supplier never receives an unapproved request. The in-memory engine is
 * a deterministic reference adapter; M66 moves the same gates, ownership and
 * idempotency invariants into Postgres for a production adapter.
 */

import { createHash } from "node:crypto";
import type {
  CommittedManualPaymentVerification,
  ManualOrderInvoice,
  ManualPaymentReport,
} from "./manual-order-payments";

export const ORDER_WORKFLOW_STAGES = [
  "request_pending",
  "request_rejected",
  "approved",
  "invoiced",
  "payment_evidence_submitted",
  "payment_verified",
  "supplier_handoff_queued",
  "supplier_handoff_released",
  "fulfilling",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type OrderWorkflowStage = (typeof ORDER_WORKFLOW_STAGES)[number];
export type TrustDialMode = "auto" | "queue" | "ask" | "never";
export type OrderActorRole = "buyer" | "admin" | "finance" | "supplier";

export type PersonalOrderOwner = Readonly<{
  kind: "personal";
  buyerId: string;
}>;

export type BusinessOrderOwner = Readonly<{
  kind: "business";
  organizationId: string;
  buyerId: string;
}>;

export type OrderOwner = PersonalOrderOwner | BusinessOrderOwner;

export type OrderActor = Readonly<{
  actorId: string;
  role: OrderActorRole;
  organizationIds?: readonly string[];
  supplierId?: string;
  trustMode?: TrustDialMode;
  /** Required for consequential queue/ask actions. Never accepted from buyer input. */
  trustApprovalRef?: string;
}>;

export type BuyerRequestLine = Readonly<{
  sku: string;
  quantity: number;
}>;

export type BuyerOrderRequest = Readonly<{
  requestRef: string;
  lines: readonly BuyerRequestLine[];
  note?: string;
}>;

export type SupplierHandoff = Readonly<{
  handoffRef: string;
  supplierId: string;
  queuedAt: string;
  queuedBy: string;
  releasedAt: string | null;
  releasedBy: string | null;
}>;

export type TrackingFact = Readonly<{
  trackingRef: string;
  carrier: string;
  trackingNumber: string;
  recordedAt: string;
  recordedBy: string;
}>;

/** Durable money-settlement projection created from committed verification evidence. */
export type OrderSettlement = Readonly<{
  settlementRef: string;
  externalTransactionRef: string;
  amountCents: number;
  currency: "USD";
  settledAt: string;
}>;

export type OrderWorkflowEventKind =
  | "buyer_request_created"
  | "request_approved"
  | "request_rejected"
  | "invoice_issued"
  | "payment_evidence_submitted"
  | "payment_verified"
  | "supplier_handoff_queued"
  | "supplier_handoff_released"
  | "fulfillment_started"
  | "tracking_added"
  | "order_shipped"
  | "order_delivered"
  | "order_cancelled";

export type OrderWorkflowEvent = Readonly<{
  eventId: string;
  orderId: string;
  sequence: number;
  kind: OrderWorkflowEventKind;
  occurredAt: string;
  actorId: string;
  actorRole: OrderActorRole;
  trustMode: TrustDialMode | null;
  trustApprovalRef: string | null;
  customerVisible: boolean;
  detail: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type OrderAuditOutcome = "accepted" | "refused" | "replayed";

export type OrderAuditEntry = Readonly<{
  auditId: string;
  orderId: string | null;
  actorId: string;
  actorRole: OrderActorRole;
  command: OrderCommand["kind"];
  idempotencyKey: string;
  fingerprint: string;
  outcome: OrderAuditOutcome;
  reason: OrderWorkflowFailureCode | null;
  occurredAt: string;
  trustMode: TrustDialMode | null;
  trustApprovalRef: string | null;
}>;

export type OrderWorkflow = Readonly<{
  orderId: string;
  owner: OrderOwner;
  request: BuyerOrderRequest;
  stage: OrderWorkflowStage;
  approvedAt: string | null;
  approvedBy: string | null;
  invoice: ManualOrderInvoice | null;
  paymentEvidence: readonly ManualPaymentReport[];
  verification: CommittedManualPaymentVerification | null;
  settlement: OrderSettlement | null;
  supplierHandoff: SupplierHandoff | null;
  tracking: readonly TrackingFact[];
  version: number;
  createdAt: string;
  updatedAt: string;
  events: readonly OrderWorkflowEvent[];
}>;

type CommandBase = Readonly<{
  orderId: string;
  occurredAt: string;
}>;

export type OrderCommand =
  | (CommandBase & Readonly<{ kind: "create_request"; owner: OrderOwner; request: BuyerOrderRequest }>)
  | (CommandBase & Readonly<{ kind: "approve_request" }>)
  | (CommandBase & Readonly<{ kind: "reject_request"; reason: string }>)
  | (CommandBase & Readonly<{ kind: "issue_invoice"; invoice: ManualOrderInvoice }>)
  | (CommandBase & Readonly<{ kind: "submit_payment_evidence"; report: ManualPaymentReport }>)
  | (CommandBase & Readonly<{
      kind: "verify_payment";
      verification: CommittedManualPaymentVerification;
    }>)
  | (CommandBase & Readonly<{
      kind: "queue_supplier_handoff";
      handoffRef: string;
      supplierId: string;
    }>)
  | (CommandBase & Readonly<{ kind: "release_supplier_handoff" }>)
  | (CommandBase & Readonly<{ kind: "start_fulfillment" }>)
  | (CommandBase & Readonly<{
      kind: "add_tracking";
      trackingRef: string;
      carrier: string;
      trackingNumber: string;
    }>)
  | (CommandBase & Readonly<{ kind: "mark_shipped" }>)
  | (CommandBase & Readonly<{ kind: "mark_delivered" }>)
  | (CommandBase & Readonly<{ kind: "cancel_order"; reason: string }>);

export type OrderWorkflowFailureCode =
  | "validation_failed"
  | "not_permitted"
  | "order_not_found"
  | "order_already_exists"
  | "ownership_mismatch"
  | "stage_invalid"
  | "approval_required"
  | "invoice_required"
  | "payment_evidence_required"
  | "payment_verification_required"
  | "supplier_handoff_required"
  | "tracking_required"
  | "trust_dial_refused"
  | "trust_approval_required"
  | "idempotency_conflict";

export type OrderWorkflowResult =
  | Readonly<{ ok: true; order: OrderWorkflow; replayed: boolean; audit: OrderAuditEntry }>
  | Readonly<{ ok: false; code: OrderWorkflowFailureCode; audit: OrderAuditEntry }>;

export type CustomerOrderTimeline = Readonly<{
  orderId: string;
  stage: OrderWorkflowStage;
  ownerKind: OrderOwner["kind"];
  invoiceRef: string | null;
  amountCents: number | null;
  currency: "USD" | null;
  tracking: readonly Readonly<{ carrier: string; trackingNumber: string; recordedAt: string }>[];
  events: readonly Readonly<{
    kind: OrderWorkflowEventKind;
    occurredAt: string;
    detail: Readonly<Record<string, string | number | boolean | null>>;
  }>[];
}>;

export type OrderWorkflowIdempotencyReceipt = Readonly<{
  scope: string;
  key: string;
  fingerprint: string;
  orderId: string;
  resultVersion: number;
}>;

export type OrderWorkflowEngineSnapshot = Readonly<{
  orders: readonly OrderWorkflow[];
  receipts: readonly OrderWorkflowIdempotencyReceipt[];
  auditTrail: readonly OrderAuditEntry[];
}>;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{2,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9:._-]{15,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
export const PACK04_ORDER_QUANTITY_MIN = 1;
export const PACK04_ORDER_QUANTITY_MAX = 50;
const CONSEQUENTIAL = new Set<OrderCommand["kind"]>([
  "approve_request",
  "reject_request",
  "issue_invoice",
  "verify_payment",
  "queue_supplier_handoff",
  "release_supplier_handoff",
  "start_fulfillment",
  "add_tracking",
  "mark_shipped",
  "mark_delivered",
  "cancel_order",
]);

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function frozen<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(frozen);
  }
  return value;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function nonBlank(value: unknown, max = 240): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= max;
}

function ownerScope(owner: OrderOwner): string {
  return owner.kind === "personal"
    ? `personal:${owner.buyerId}`
    : `business:${owner.organizationId}:${owner.buyerId}`;
}

function receiptMapKey(scope: string, idempotencyKey: string): string {
  // Neither component can contain NUL under the public input validators. Using
  // it as a structural delimiter prevents ambiguous `scope:key` collisions.
  return `${scope}\u0000${idempotencyKey}`;
}

function actorCanOwn(actor: OrderActor, owner: OrderOwner): boolean {
  if (actor.role !== "buyer" || actor.actorId !== owner.buyerId) return false;
  return owner.kind === "personal" || (actor.organizationIds ?? []).includes(owner.organizationId);
}

function actorCanView(actor: OrderActor, owner: OrderOwner): boolean {
  if (actor.role === "admin" || actor.role === "finance") return true;
  return actorCanOwn(actor, owner);
}

function adminLike(actor: OrderActor): boolean {
  return actor.role === "admin" || actor.role === "finance";
}

function validateOwner(owner: OrderOwner): boolean {
  return safeId(owner.buyerId) && (owner.kind === "personal" || safeId(owner.organizationId));
}

function validOrderQuantity(quantity: unknown): quantity is number {
  return typeof quantity === "number"
    && Number.isSafeInteger(quantity)
    && quantity >= PACK04_ORDER_QUANTITY_MIN
    && quantity <= PACK04_ORDER_QUANTITY_MAX;
}

function validOrderLines(lines: readonly BuyerRequestLine[]): boolean {
  return lines.length > 0
    && lines.length <= 100
    && lines.every((line) => safeId(line.sku) && validOrderQuantity(line.quantity))
    && new Set(lines.map((line) => line.sku)).size === lines.length;
}

function invoiceMatchesRequestedQuantities(
  invoiceLines: ManualOrderInvoice["lines"],
  requestLines: readonly BuyerRequestLine[],
): boolean {
  if (invoiceLines.length !== requestLines.length) return false;
  const requested = new Map(requestLines.map((line) => [line.sku, line.quantity] as const));
  return invoiceLines.every((line) => requested.get(line.sku) === line.quantity);
}

function validateRequest(request: BuyerOrderRequest): boolean {
  return safeId(request.requestRef)
    && Array.isArray(request.lines)
    && validOrderLines(request.lines)
    && (request.note === undefined || nonBlank(request.note, 1000));
}

function validateInvoice(invoice: ManualOrderInvoice, order: OrderWorkflow): boolean {
  return invoice.invoiceVersion === 1
    && invoice.orderId === order.orderId
    && invoice.memberId === order.owner.buyerId
    && invoice.state === "awaiting_payment"
    && invoice.currency === "USD"
    && Number.isSafeInteger(invoice.amountCents)
    && invoice.amountCents > 0
    && Array.isArray(invoice.lines)
    && validOrderLines(invoice.lines)
    && invoiceMatchesRequestedQuantities(invoice.lines, order.request.lines)
    && safeId(invoice.invoiceId)
    && nonBlank(invoice.invoiceRef, 128)
    && nonBlank(invoice.paymentMemo, 128)
    && timestamp(invoice.createdAt)
    && timestamp(invoice.dueAt)
    && Date.parse(invoice.dueAt) > Date.parse(invoice.createdAt);
}

function validateReport(report: ManualPaymentReport, order: OrderWorkflow): boolean {
  const invoice = order.invoice;
  return invoice !== null
    && report.orderId === order.orderId
    && report.memberId === order.owner.buyerId
    && report.invoiceRef === invoice.invoiceRef
    && report.orderRef === invoice.orderRef
    && report.amountCents === invoice.amountCents
    && report.currency === invoice.currency
    && report.method === invoice.method.method
    && report.state === "reported_unverified"
    && SHA256.test(report.reportFingerprint)
    && SHA256.test(report.proof.sha256)
    && CONTENT_TYPES.has(report.proof.mimeType)
    && Number.isSafeInteger(report.proof.sizeBytes)
    && report.proof.sizeBytes > 0
    && timestamp(report.reportedAt)
    && timestamp(report.proof.uploadedAt);
}

function validateVerification(
  verification: CommittedManualPaymentVerification,
  order: OrderWorkflow,
): boolean {
  const invoice = order.invoice;
  const report = order.paymentEvidence.at(-1);
  return invoice !== null
    && report !== undefined
    && verification.state === "verified_committed"
    && verification.orderId === order.orderId
    && verification.memberId === order.owner.buyerId
    && verification.verifiedAmountCents === invoice.amountCents
    && verification.currency === invoice.currency
    && SHA256.test(verification.verificationFingerprint)
    && safeId(verification.commitRef)
    && timestamp(verification.verifiedAt)
    && Date.parse(verification.verifiedAt) >= Date.parse(report.reportedAt);
}

function trustFailure(command: OrderCommand, actor: OrderActor): OrderWorkflowFailureCode | null {
  if (!CONSEQUENTIAL.has(command.kind)) return null;
  const mode = actor.trustMode ?? "queue";
  if (mode === "never") return "trust_dial_refused";
  if ((mode === "queue" || mode === "ask") && !safeId(actor.trustApprovalRef)) {
    return "trust_approval_required";
  }
  return null;
}

function event(
  order: OrderWorkflow,
  command: OrderCommand,
  actor: OrderActor,
  kind: OrderWorkflowEventKind,
  customerVisible: boolean,
  detail: Record<string, string | number | boolean | null> = {},
): OrderWorkflowEvent {
  const sequence = order.events.length + 1;
  return frozen({
    eventId: `owe_${digest([order.orderId, sequence, kind, command.occurredAt]).slice(0, 32)}`,
    orderId: order.orderId,
    sequence,
    kind,
    occurredAt: command.occurredAt,
    actorId: actor.actorId,
    actorRole: actor.role,
    trustMode: CONSEQUENTIAL.has(command.kind) ? (actor.trustMode ?? "queue") : null,
    trustApprovalRef: actor.trustApprovalRef ?? null,
    customerVisible,
    detail: frozen({ ...detail }),
  });
}

function nextOrder(
  order: OrderWorkflow,
  command: OrderCommand,
  actor: OrderActor,
  changes: Partial<OrderWorkflow>,
  nextEvent: OrderWorkflowEvent,
): OrderWorkflow {
  return frozen({
    ...order,
    ...changes,
    version: order.version + 1,
    updatedAt: command.occurredAt,
    events: [...order.events, nextEvent],
  });
}

function isTerminal(stage: OrderWorkflowStage): boolean {
  return stage === "request_rejected" || stage === "cancelled" || stage === "delivered";
}

export class InMemoryOrderWorkflowEngine {
  private readonly orders = new Map<string, OrderWorkflow>();
  private readonly receipts = new Map<string, OrderWorkflowIdempotencyReceipt>();
  private readonly auditTrail: OrderAuditEntry[] = [];

  constructor(snapshot?: OrderWorkflowEngineSnapshot) {
    if (!snapshot) return;
    for (const order of snapshot.orders) this.orders.set(order.orderId, frozen(order));
    for (const receipt of snapshot.receipts) {
      this.receipts.set(receiptMapKey(receipt.scope, receipt.key), frozen(receipt));
    }
    this.auditTrail.push(...snapshot.auditTrail.map((entry) => frozen(entry)));
  }

  execute(actor: OrderActor, idempotencyKey: string, command: OrderCommand): OrderWorkflowResult {
    const fingerprint = digest({ actor, command });
    const current = this.orders.get(command.orderId) ?? null;
    const scope = command.kind === "create_request"
      ? `actor:${actor.actorId}`
      : current
        ? ownerScope(current.owner)
        : `actor:${actor.actorId}`;
    const receiptKey = receiptMapKey(scope, idempotencyKey);
    const prior = this.receipts.get(receiptKey);

    if (prior) {
      const conflict = prior.fingerprint !== fingerprint;
      const replayOrder = this.orders.get(prior.orderId);
      const receiptInvalid = !replayOrder || replayOrder.version < prior.resultVersion;
      const audit = this.audit(actor, idempotencyKey, command, fingerprint,
        conflict || receiptInvalid ? "refused" : "replayed",
        conflict || receiptInvalid ? "idempotency_conflict" : null);
      return conflict || receiptInvalid
        ? { ok: false, code: "idempotency_conflict", audit }
        : { ok: true, order: replayOrder, replayed: true, audit };
    }

    const basicFailure = this.validateEnvelope(actor, idempotencyKey, command);
    if (basicFailure) return this.refuse(actor, idempotencyKey, command, fingerprint, basicFailure);

    const applied = this.apply(actor, command, current);
    if (!applied.ok) return this.refuse(actor, idempotencyKey, command, fingerprint, applied.code);

    this.orders.set(applied.order.orderId, applied.order);
    this.receipts.set(receiptKey, frozen({
      scope,
      key: idempotencyKey,
      fingerprint,
      orderId: applied.order.orderId,
      resultVersion: applied.order.version,
    }));
    const audit = this.audit(actor, idempotencyKey, command, fingerprint, "accepted", null);
    return frozen({ ok: true, order: applied.order, replayed: false, audit });
  }

  getForActor(actor: OrderActor, orderId: string): OrderWorkflow | null {
    const order = this.orders.get(orderId);
    return order && actorCanView(actor, order.owner) ? order : null;
  }

  customerTimeline(actor: OrderActor, orderId: string): CustomerOrderTimeline | null {
    const order = this.orders.get(orderId);
    if (!order || !actorCanOwn(actor, order.owner)) return null;
    return frozen({
      orderId,
      stage: order.stage,
      ownerKind: order.owner.kind,
      invoiceRef: order.invoice?.invoiceRef ?? null,
      amountCents: order.invoice?.amountCents ?? null,
      currency: order.invoice?.currency ?? null,
      tracking: order.tracking.map(({ carrier, trackingNumber, recordedAt }) => ({
        carrier,
        trackingNumber,
        recordedAt,
      })),
      events: order.events
        .filter((item) => item.customerVisible)
        .map(({ kind, occurredAt, detail }) => ({ kind, occurredAt, detail })),
    });
  }

  audits(): readonly OrderAuditEntry[] {
    return frozen([...this.auditTrail]);
  }

  /**
   * Whole immutable reference state for an atomic persistence adapter.
   * Production adapters persist the normalized write bundle, but this snapshot
   * lets the unmounted reference adapter prove restart and concurrency behavior.
   */
  snapshot(): OrderWorkflowEngineSnapshot {
    return frozen({
      orders: Array.from(this.orders.values()).sort((a, b) => a.orderId.localeCompare(b.orderId)),
      receipts: Array.from(this.receipts.values()).sort((a, b) =>
        `${a.scope}:${a.key}`.localeCompare(`${b.scope}:${b.key}`)),
      auditTrail: [...this.auditTrail],
    });
  }

  private validateEnvelope(
    actor: OrderActor,
    idempotencyKey: string,
    command: OrderCommand,
  ): OrderWorkflowFailureCode | null {
    if (!safeId(actor.actorId) || !IDEMPOTENCY_KEY.test(idempotencyKey) || !safeId(command.orderId)
      || !timestamp(command.occurredAt)) return "validation_failed";
    return trustFailure(command, actor);
  }

  private apply(
    actor: OrderActor,
    command: OrderCommand,
    current: OrderWorkflow | null,
  ): { ok: true; order: OrderWorkflow } | { ok: false; code: OrderWorkflowFailureCode } {
    if (command.kind === "create_request") {
      if (current) return { ok: false, code: "order_already_exists" };
      if (!validateOwner(command.owner) || !validateRequest(command.request)) {
        return { ok: false, code: "validation_failed" };
      }
      if (!actorCanOwn(actor, command.owner)) return { ok: false, code: "ownership_mismatch" };
      const shell: OrderWorkflow = frozen({
        orderId: command.orderId,
        owner: frozen({ ...command.owner }),
        request: frozen({ ...command.request, lines: command.request.lines.map((line) => frozen({ ...line })) }),
        stage: "request_pending",
        approvedAt: null,
        approvedBy: null,
        invoice: null,
        paymentEvidence: [],
        verification: null,
        settlement: null,
        supplierHandoff: null,
        tracking: [],
        version: 0,
        createdAt: command.occurredAt,
        updatedAt: command.occurredAt,
        events: [],
      });
      const created = event(shell, command, actor, "buyer_request_created", true, {
        lineCount: command.request.lines.length,
      });
      return { ok: true, order: nextOrder(shell, command, actor, {}, created) };
    }

    if (!current) return { ok: false, code: "order_not_found" };
    if (isTerminal(current.stage)) return { ok: false, code: "stage_invalid" };

    switch (command.kind) {
      case "approve_request": {
        if (actor.role !== "admin") return { ok: false, code: "not_permitted" };
        if (current.stage !== "request_pending") return { ok: false, code: "stage_invalid" };
        const item = event(current, command, actor, "request_approved", true);
        return { ok: true, order: nextOrder(current, command, actor, {
          stage: "approved",
          approvedAt: command.occurredAt,
          approvedBy: actor.actorId,
        }, item) };
      }
      case "reject_request": {
        if (actor.role !== "admin") return { ok: false, code: "not_permitted" };
        if (current.stage !== "request_pending" || !nonBlank(command.reason, 500)) {
          return { ok: false, code: current.stage === "request_pending" ? "validation_failed" : "stage_invalid" };
        }
        const item = event(current, command, actor, "request_rejected", true, { reason: command.reason });
        return { ok: true, order: nextOrder(current, command, actor, { stage: "request_rejected" }, item) };
      }
      case "issue_invoice": {
        if (!adminLike(actor)) return { ok: false, code: "not_permitted" };
        if (!current.approvedAt) return { ok: false, code: "approval_required" };
        if (current.stage !== "approved") return { ok: false, code: "stage_invalid" };
        if (!validateInvoice(command.invoice, current)) return { ok: false, code: "validation_failed" };
        const item = event(current, command, actor, "invoice_issued", true, {
          invoiceRef: command.invoice.invoiceRef,
          amountCents: command.invoice.amountCents,
          currency: command.invoice.currency,
        });
        return { ok: true, order: nextOrder(current, command, actor, {
          stage: "invoiced",
          invoice: command.invoice,
        }, item) };
      }
      case "submit_payment_evidence": {
        if (!actorCanOwn(actor, current.owner)) return { ok: false, code: "ownership_mismatch" };
        if (!current.invoice) return { ok: false, code: "invoice_required" };
        if (!(current.stage === "invoiced" || current.stage === "payment_evidence_submitted")) {
          return { ok: false, code: "stage_invalid" };
        }
        if (!validateReport(command.report, current)) return { ok: false, code: "validation_failed" };
        if (current.paymentEvidence.some((report) => report.reportFingerprint === command.report.reportFingerprint)) {
          return { ok: false, code: "idempotency_conflict" };
        }
        const item = event(current, command, actor, "payment_evidence_submitted", true);
        return { ok: true, order: nextOrder(current, command, actor, {
          stage: "payment_evidence_submitted",
          paymentEvidence: [...current.paymentEvidence, command.report],
        }, item) };
      }
      case "verify_payment": {
        if (!adminLike(actor)) return { ok: false, code: "not_permitted" };
        if (!current.approvedAt) return { ok: false, code: "approval_required" };
        if (!current.invoice) return { ok: false, code: "invoice_required" };
        if (current.paymentEvidence.length === 0) return { ok: false, code: "payment_evidence_required" };
        if (current.stage !== "payment_evidence_submitted") return { ok: false, code: "stage_invalid" };
        if (!validateVerification(command.verification, current)) return { ok: false, code: "validation_failed" };
        const item = event(current, command, actor, "payment_verified", true, {
          amountCents: command.verification.verifiedAmountCents,
          currency: command.verification.currency,
        });
        return { ok: true, order: nextOrder(current, command, actor, {
          stage: "payment_verified",
          verification: command.verification,
          settlement: frozen({
            settlementRef: command.verification.commitRef,
            externalTransactionRef: command.verification.externalTransactionRef,
            amountCents: command.verification.verifiedAmountCents,
            currency: command.verification.currency,
            settledAt: command.verification.verifiedAt,
          }),
        }, item) };
      }
      case "queue_supplier_handoff": {
        if (actor.role !== "admin") return { ok: false, code: "not_permitted" };
        if (!current.approvedAt) return { ok: false, code: "approval_required" };
        if (!current.verification || !current.settlement) {
          return { ok: false, code: "payment_verification_required" };
        }
        if (current.stage !== "payment_verified") return { ok: false, code: "stage_invalid" };
        if (!safeId(command.handoffRef) || !safeId(command.supplierId)) {
          return { ok: false, code: "validation_failed" };
        }
        const handoff = frozen({
          handoffRef: command.handoffRef,
          supplierId: command.supplierId,
          queuedAt: command.occurredAt,
          queuedBy: actor.actorId,
          releasedAt: null,
          releasedBy: null,
        });
        const item = event(current, command, actor, "supplier_handoff_queued", true);
        return { ok: true, order: nextOrder(current, command, actor, {
          stage: "supplier_handoff_queued",
          supplierHandoff: handoff,
        }, item) };
      }
      case "release_supplier_handoff": {
        if (actor.role !== "admin") return { ok: false, code: "not_permitted" };
        if (!current.approvedAt) return { ok: false, code: "approval_required" };
        if (!current.verification || !current.settlement) {
          return { ok: false, code: "payment_verification_required" };
        }
        if (!current.supplierHandoff) return { ok: false, code: "supplier_handoff_required" };
        if (current.stage !== "supplier_handoff_queued") return { ok: false, code: "stage_invalid" };
        const item = event(current, command, actor, "supplier_handoff_released", true);
        return { ok: true, order: nextOrder(current, command, actor, {
          stage: "supplier_handoff_released",
          supplierHandoff: frozen({
            ...current.supplierHandoff,
            releasedAt: command.occurredAt,
            releasedBy: actor.actorId,
          }),
        }, item) };
      }
      case "start_fulfillment": {
        if (!this.supplierOrAdmin(actor, current)) return { ok: false, code: "not_permitted" };
        if (!current.approvedAt) return { ok: false, code: "approval_required" };
        if (!current.verification || !current.settlement) {
          return { ok: false, code: "payment_verification_required" };
        }
        if (!current.supplierHandoff?.releasedAt) return { ok: false, code: "supplier_handoff_required" };
        if (current.stage !== "supplier_handoff_released") return { ok: false, code: "stage_invalid" };
        const item = event(current, command, actor, "fulfillment_started", true);
        return { ok: true, order: nextOrder(current, command, actor, { stage: "fulfilling" }, item) };
      }
      case "add_tracking": {
        if (!this.supplierOrAdmin(actor, current)) return { ok: false, code: "not_permitted" };
        if (!(current.stage === "fulfilling" || current.stage === "shipped")) {
          return { ok: false, code: "stage_invalid" };
        }
        if (!safeId(command.trackingRef) || !nonBlank(command.carrier, 80)
          || !nonBlank(command.trackingNumber, 160)) return { ok: false, code: "validation_failed" };
        if (current.tracking.some((fact) => fact.trackingRef === command.trackingRef)) {
          return { ok: false, code: "idempotency_conflict" };
        }
        const fact = frozen({
          trackingRef: command.trackingRef,
          carrier: command.carrier,
          trackingNumber: command.trackingNumber,
          recordedAt: command.occurredAt,
          recordedBy: actor.actorId,
        });
        const item = event(current, command, actor, "tracking_added", true, {
          carrier: command.carrier,
          trackingNumber: command.trackingNumber,
        });
        return { ok: true, order: nextOrder(current, command, actor, {
          tracking: [...current.tracking, fact],
        }, item) };
      }
      case "mark_shipped": {
        if (!this.supplierOrAdmin(actor, current)) return { ok: false, code: "not_permitted" };
        if (current.stage !== "fulfilling") return { ok: false, code: "stage_invalid" };
        if (current.tracking.length === 0) return { ok: false, code: "tracking_required" };
        const item = event(current, command, actor, "order_shipped", true);
        return { ok: true, order: nextOrder(current, command, actor, { stage: "shipped" }, item) };
      }
      case "mark_delivered": {
        if (!this.supplierOrAdmin(actor, current)) return { ok: false, code: "not_permitted" };
        if (current.stage !== "shipped") return { ok: false, code: "stage_invalid" };
        const item = event(current, command, actor, "order_delivered", true);
        return { ok: true, order: nextOrder(current, command, actor, { stage: "delivered" }, item) };
      }
      case "cancel_order": {
        const isOwner = actorCanOwn(actor, current.owner);
        if (!isOwner && actor.role !== "admin") return { ok: false, code: "not_permitted" };
        if (!nonBlank(command.reason, 500)) return { ok: false, code: "validation_failed" };
        if (current.stage === "supplier_handoff_released" || current.stage === "fulfilling"
          || current.stage === "shipped") return { ok: false, code: "stage_invalid" };
        const item = event(current, command, actor, "order_cancelled", true, { reason: command.reason });
        return { ok: true, order: nextOrder(current, command, actor, { stage: "cancelled" }, item) };
      }
    }
  }

  private supplierOrAdmin(actor: OrderActor, order: OrderWorkflow): boolean {
    return actor.role === "admin"
      || (actor.role === "supplier" && safeId(actor.supplierId)
        && actor.supplierId === order.supplierHandoff?.supplierId);
  }

  private refuse(
    actor: OrderActor,
    key: string,
    command: OrderCommand,
    fingerprint: string,
    code: OrderWorkflowFailureCode,
  ): OrderWorkflowResult {
    return frozen({ ok: false, code, audit: this.audit(actor, key, command, fingerprint, "refused", code) });
  }

  private audit(
    actor: OrderActor,
    key: string,
    command: OrderCommand,
    fingerprint: string,
    outcome: OrderAuditOutcome,
    reason: OrderWorkflowFailureCode | null,
  ): OrderAuditEntry {
    const entry = frozen({
      auditId: `owa_${digest([this.auditTrail.length + 1, actor.actorId, key, outcome, command.occurredAt]).slice(0, 32)}`,
      orderId: safeId(command.orderId) ? command.orderId : null,
      actorId: actor.actorId,
      actorRole: actor.role,
      command: command.kind,
      idempotencyKey: key,
      fingerprint,
      outcome,
      reason,
      occurredAt: command.occurredAt,
      trustMode: CONSEQUENTIAL.has(command.kind) ? (actor.trustMode ?? "queue") : null,
      trustApprovalRef: actor.trustApprovalRef ?? null,
    });
    this.auditTrail.push(entry);
    return entry;
  }
}
