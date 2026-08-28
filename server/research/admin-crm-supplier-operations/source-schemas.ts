import { z } from "zod";
import {
  ADMIN_OPERATIONAL_CONTROL_AREAS,
  type AdminOperationsCollectionMap,
  type AdminOperationsSourceKey,
} from "@shared/research/admin-crm-supplier-operations";
import { FULFILLMENT_STATES } from "@shared/research/fulfillment/contracts";

const id = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9:_.\/-]{0,199}$/);
const text = z.string().min(1).max(500).regex(/\S/);
const label = z.string().min(1).max(200).regex(/\S/);
const nullableLabel = label.nullable();
const timestamp = z.string().datetime({ offset: true });
const nullableTimestamp = timestamp.nullable();
const nonnegativeInteger = z.number().int().nonnegative().safe();
const cents = nonnegativeInteger;
const currency = z.string().regex(/^[A-Z]{3}$/);

const buyerQueue = z.object({
  buyerId: id,
  displayName: label,
  email: z.string().email().max(254),
  buyerType: z.enum(["individual", "b2b"]),
  organizationId: id.nullable(),
  stage: z.enum(["new", "qualified", "quote_requested", "invoice_ready", "payment_review", "active", "paused"]),
  ownerLabel: nullableLabel,
  nextAction: text,
  lastActivityAt: timestamp,
}).strict();

const organizations = z.object({
  organizationId: id,
  legalName: label,
  accountState: z.enum(["prospect", "diligence", "commercial_review", "active", "paused", "closed"]),
  buyerCount: nonnegativeInteger,
  ownerLabel: nullableLabel,
  paymentTermsLabel: nullableLabel,
  openInvoiceCents: cents,
  currency,
  updatedAt: timestamp,
}).strict();

const customers = z.object({
  customerId: id,
  displayName: label,
  email: z.string().email().max(254),
  organizationId: id.nullable(),
  accountState: label,
  orderCount: nonnegativeInteger,
  openInvoiceCount: nonnegativeInteger,
  openExceptionCount: nonnegativeInteger,
  lastOrderAt: nullableTimestamp,
  lastContactAt: nullableTimestamp,
  tags: z.array(label).max(50),
}).strict();

const availabilityReviews = z.object({
  reviewId: id,
  productId: id,
  productLabel: label,
  requestedUnits: z.number().int().positive().safe(),
  availableUnits: nonnegativeInteger.nullable(),
  supplierId: id.nullable(),
  supplierLabel: nullableLabel,
  state: z.enum(["awaiting_supplier", "needs_reconciliation", "ready", "blocked"]),
  evidenceUpdatedAt: nullableTimestamp,
}).strict();

const priceReviews = z.object({
  reviewId: id,
  productId: id,
  productLabel: label,
  currency,
  currentUnitCents: cents.nullable(),
  proposedUnitCents: cents,
  sourceCostCents: cents.nullable(),
  state: z.enum(["needs_cost_evidence", "margin_review", "founder_review", "approved", "rejected"]),
  requestedAt: timestamp,
}).strict();

const invoices = z.object({
  invoiceId: id,
  orderId: id,
  customerId: id,
  customerLabel: label,
  invoiceNumber: label,
  amountCents: cents,
  currency,
  invoiceState: z.enum(["draft", "issued", "overdue", "void", "paid"]),
  paymentState: z.enum(["not_reported", "reported", "needs_review", "verified", "rejected", "refunded"]),
  dueAt: nullableTimestamp,
  updatedAt: timestamp,
}).strict();

const supplierAssignments = z.object({
  assignmentId: id,
  orderId: id,
  orderReference: label,
  supplierId: id.nullable(),
  supplierLabel: nullableLabel,
  state: z.enum(["unassigned", "proposed", "awaiting_approval", "assigned", "declined"]),
  lineCount: z.number().int().positive().safe(),
  targetShipAt: nullableTimestamp,
  updatedAt: timestamp,
}).strict();

const fulfillment = z.object({
  fulfillmentId: id,
  orderId: id,
  orderReference: label,
  supplierLabel: nullableLabel,
  state: z.enum(FULFILLMENT_STATES),
  carrier: nullableLabel,
  trackingNumber: nullableLabel,
  lastTrackingAt: nullableTimestamp,
  targetShipAt: nullableTimestamp,
}).strict();

const returnsReships = z.object({
  requestId: id,
  orderId: id,
  orderReference: label,
  requestType: z.enum(["return", "reship"]),
  state: z.enum(["requested", "reviewing", "approved", "declined", "in_progress", "completed"]),
  reason: text,
  ownerLabel: nullableLabel,
  dueAt: nullableTimestamp,
  nextAction: text,
  updatedAt: timestamp,
}).strict();

const supportCases = z.object({
  caseId: id,
  referenceId: id.nullable(),
  subject: label,
  priority: z.enum(["routine", "priority", "critical"]),
  state: z.enum(["open", "investigating", "waiting_customer", "waiting_internal", "resolved", "closed"]),
  slaState: z.enum(["on_track", "due_soon", "overdue", "paused", "not_configured"]),
  ownerLabel: nullableLabel,
  dueAt: nullableTimestamp,
  nextAction: text,
  openedAt: timestamp,
  updatedAt: timestamp,
}).strict();

const reports = z.object({
  reportId: id,
  label,
  periodLabel: label,
  state: z.enum(["ready", "generating", "blocked", "unavailable"]),
  exceptionCount: nonnegativeInteger.nullable(),
  generatedAt: nullableTimestamp,
  nextAction: text,
}).strict();

const exceptions = z.object({
  exceptionId: id,
  domain: z.enum([
    "buyer", "organization", "catalog", "activation", "availability", "price", "invoice", "payment",
    "supplier", "pharmacy", "tebra", "lot", "testing", "inventory", "fulfillment", "tracking",
    "return", "support", "quality", "feature_flags", "release", "intake",
  ]),
  referenceId: id,
  title: label,
  severity: z.enum(["low", "medium", "high", "critical"]),
  state: z.enum(["open", "investigating", "waiting_external", "resolved"]),
  ownerLabel: nullableLabel,
  openedAt: timestamp,
  dueAt: nullableTimestamp,
}).strict();

const controls = z.object({
  area: z.enum(ADMIN_OPERATIONAL_CONTROL_AREAS),
  label,
  state: z.enum(["ready", "attention", "blocked", "disabled", "unknown"]),
  summary: text,
  ownerLabel: nullableLabel,
  dueAt: nullableTimestamp,
  nextAction: text,
  evidenceUpdatedAt: nullableTimestamp,
}).strict();

const audit = z.object({
  auditId: id,
  actorLabel: label,
  action: label,
  targetType: id,
  targetId: id,
  outcome: z.enum([
    "recommendation_recorded", "human_review_required", "queued", "approval_required", "refused", "completed", "observed",
  ]),
  reason: z.string().min(1).max(1000).nullable(),
  occurredAt: timestamp,
}).strict();

const intake = z.object({
  intakeId: id,
  sourceAddress: z.literal("research@xeniostechnology.com"),
  senderAddress: z.string().email().max(254),
  subject: label,
  category: z.enum([
    "buyer", "b2b_organization", "availability", "price", "invoice_payment", "supplier_fulfillment",
    "tracking", "operations_exception", "safety_escalation", "unclassified",
  ]),
  urgency: z.enum(["routine", "priority", "critical"]),
  state: z.enum(["needs_human_review", "linked", "closed"]),
  linkedType: id.nullable(),
  linkedId: id.nullable(),
  receivedAt: timestamp,
}).strict();

const SOURCE_SCHEMAS = {
  buyerQueue,
  organizations,
  customers,
  availabilityReviews,
  priceReviews,
  invoices,
  supplierAssignments,
  fulfillment,
  returnsReships,
  supportCases,
  reports,
  exceptions,
  controls,
  audit,
  intake,
} as const;

export class AdminOperationsItemEvidenceError extends Error {
  constructor(public readonly source: AdminOperationsSourceKey) {
    super(`Invalid ${source} source evidence.`);
  }
}

export function parseAdminOperationsItems<Key extends AdminOperationsSourceKey>(
  key: Key,
  value: unknown,
): Array<AdminOperationsCollectionMap[Key]> {
  const schema: z.ZodTypeAny = SOURCE_SCHEMAS[key];
  const parsed = z.array(schema).safeParse(value);
  if (!parsed.success) throw new AdminOperationsItemEvidenceError(key);
  return parsed.data as Array<AdminOperationsCollectionMap[Key]>;
}
