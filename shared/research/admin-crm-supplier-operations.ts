import type { FulfillmentState } from "./fulfillment/contracts";

/**
 * Xenios Admin CRM and Supplier Operations contract. This is operational
 * metadata only: health, assessment, biometric, prescription, and clinical
 * fields are intentionally absent.
 */

export const RESEARCH_INTAKE_ADDRESS = "research@xeniostechnology.com" as const;

export type TrustDialMode = "auto" | "queue" | "ask" | "never";
export type QueueTone = "neutral" | "info" | "success" | "warning" | "danger";

export const ADMIN_OPERATIONS_AVAILABILITY = [
  "available",
  "partial",
  "unavailable",
] as const;
export type AdminOperationsAvailability = (typeof ADMIN_OPERATIONS_AVAILABILITY)[number];

export const ADMIN_OPERATIONS_SOURCE_KEYS = [
  "buyerQueue",
  "organizations",
  "customers",
  "availabilityReviews",
  "priceReviews",
  "invoices",
  "supplierAssignments",
  "fulfillment",
  "returnsReships",
  "supportCases",
  "reports",
  "exceptions",
  "controls",
  "audit",
  "intake",
] as const;
export type AdminOperationsSourceKey = (typeof ADMIN_OPERATIONS_SOURCE_KEYS)[number];

/**
 * Evidence status for the exact runtime reader that produced one snapshot
 * collection. `partial` and `unavailable` never authorize a definitive zero.
 */
export interface AdminOperationsSourceStatus {
  availability: AdminOperationsAvailability;
  /** Stable machine code. Available sources use null. Never include raw errors. */
  code: string | null;
  /** Static operator-safe explanation with no upstream error or record data. */
  message: string;
  /** Stable logical reader label, never a host, URL, credential, or table name. */
  provenance: string;
  checkedAt: string;
}

/**
 * A source envelope makes unavailable evidence structurally different from an
 * authoritative empty collection. Partial items are visible records only and
 * never represent a total. Unavailable sources must carry `items: null`.
 */
export type AdminOperationsSource<Item> =
  | (AdminOperationsSourceStatus & {
      availability: "available";
      code: null;
      items: Item[];
    })
  | (AdminOperationsSourceStatus & {
      availability: "partial";
      code: string;
      items: Item[];
    })
  | (AdminOperationsSourceStatus & {
      availability: "unavailable";
      code: string;
      items: null;
    });

export const ADMIN_OPERATIONAL_CONTROL_AREAS = [
  "catalog_activation",
  "supplier_readiness",
  "pharmacy_documentation",
  "tebra_configuration",
  "lot_registry",
  "testing_queue",
  "inventory",
  "orders_fulfillment",
  "returns_reships",
  "support_sla",
  "quality_incidents",
  "partner_attribution",
  "release_status",
  "feature_flags",
] as const;
export type AdminOperationalControlArea = (typeof ADMIN_OPERATIONAL_CONTROL_AREAS)[number];

export interface AdminOperationalControlStatus {
  area: AdminOperationalControlArea;
  label: string;
  state: "ready" | "attention" | "blocked" | "disabled" | "unknown";
  summary: string;
  ownerLabel: string | null;
  dueAt: string | null;
  nextAction: string;
  evidenceUpdatedAt: string | null;
}

export interface BuyerQueueItem {
  buyerId: string;
  displayName: string;
  email: string;
  buyerType: "individual" | "b2b";
  organizationId: string | null;
  stage: "new" | "qualified" | "quote_requested" | "invoice_ready" | "payment_review" | "active" | "paused";
  ownerLabel: string | null;
  nextAction: string;
  lastActivityAt: string;
}

export interface B2BOrganization {
  organizationId: string;
  legalName: string;
  accountState: "prospect" | "diligence" | "commercial_review" | "active" | "paused" | "closed";
  buyerCount: number;
  ownerLabel: string | null;
  paymentTermsLabel: string | null;
  openInvoiceCents: number;
  currency: string;
  updatedAt: string;
}

export interface Customer360Record {
  customerId: string;
  displayName: string;
  email: string;
  organizationId: string | null;
  accountState: string;
  orderCount: number;
  openInvoiceCount: number;
  openExceptionCount: number;
  lastOrderAt: string | null;
  lastContactAt: string | null;
  tags: string[];
}

export interface AvailabilityReviewItem {
  reviewId: string;
  productId: string;
  productLabel: string;
  requestedUnits: number;
  availableUnits: number | null;
  supplierId: string | null;
  supplierLabel: string | null;
  state: "awaiting_supplier" | "needs_reconciliation" | "ready" | "blocked";
  evidenceUpdatedAt: string | null;
}

export interface PriceReviewItem {
  reviewId: string;
  productId: string;
  productLabel: string;
  currency: string;
  currentUnitCents: number | null;
  proposedUnitCents: number;
  sourceCostCents: number | null;
  state: "needs_cost_evidence" | "margin_review" | "founder_review" | "approved" | "rejected";
  requestedAt: string;
}

export interface InvoicePaymentItem {
  invoiceId: string;
  orderId: string;
  customerId: string;
  customerLabel: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  invoiceState: "draft" | "issued" | "overdue" | "void" | "paid";
  paymentState: "not_reported" | "reported" | "needs_review" | "verified" | "rejected" | "refunded";
  dueAt: string | null;
  updatedAt: string;
}

export interface SupplierAssignmentItem {
  assignmentId: string;
  orderId: string;
  orderReference: string;
  supplierId: string | null;
  supplierLabel: string | null;
  state: "unassigned" | "proposed" | "awaiting_approval" | "assigned" | "declined";
  lineCount: number;
  targetShipAt: string | null;
  updatedAt: string;
}

export interface FulfillmentItem {
  fulfillmentId: string;
  orderId: string;
  orderReference: string;
  supplierLabel: string | null;
  state: FulfillmentState;
  carrier: string | null;
  trackingNumber: string | null;
  lastTrackingAt: string | null;
  targetShipAt: string | null;
}

export interface ReturnReshipItem {
  requestId: string;
  orderId: string;
  orderReference: string;
  requestType: "return" | "reship";
  state: "requested" | "reviewing" | "approved" | "declined" | "in_progress" | "completed";
  reason: string;
  ownerLabel: string | null;
  dueAt: string | null;
  nextAction: string;
  updatedAt: string;
}

export interface SupportCaseItem {
  caseId: string;
  referenceId: string | null;
  subject: string;
  priority: "routine" | "priority" | "critical";
  state: "open" | "investigating" | "waiting_customer" | "waiting_internal" | "resolved" | "closed";
  slaState: "on_track" | "due_soon" | "overdue" | "paused" | "not_configured";
  ownerLabel: string | null;
  dueAt: string | null;
  nextAction: string;
  openedAt: string;
  updatedAt: string;
}

export interface OperationsReportItem {
  reportId: string;
  label: string;
  periodLabel: string;
  state: "ready" | "generating" | "blocked" | "unavailable";
  exceptionCount: number | null;
  generatedAt: string | null;
  nextAction: string;
}

export interface OperationsExceptionItem {
  exceptionId: string;
  domain:
    | "buyer"
    | "organization"
    | "catalog"
    | "activation"
    | "availability"
    | "price"
    | "invoice"
    | "payment"
    | "supplier"
    | "pharmacy"
    | "tebra"
    | "lot"
    | "testing"
    | "inventory"
    | "fulfillment"
    | "tracking"
    | "return"
    | "support"
    | "quality"
    | "feature_flags"
    | "release"
    | "intake";
  referenceId: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  state: "open" | "investigating" | "waiting_external" | "resolved";
  ownerLabel: string | null;
  openedAt: string;
  dueAt: string | null;
}

export interface AdminAuditEvent {
  auditId: string;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string;
  outcome:
    | "recommendation_recorded"
    | "human_review_required"
    | "queued"
    | "approval_required"
    | "refused"
    | "completed"
    | "observed";
  reason: string | null;
  occurredAt: string;
}

export type ResearchIntakeCategory =
  | "buyer"
  | "b2b_organization"
  | "availability"
  | "price"
  | "invoice_payment"
  | "supplier_fulfillment"
  | "tracking"
  | "operations_exception"
  | "safety_escalation"
  | "unclassified";

export interface ResearchIntakeItem {
  intakeId: string;
  sourceAddress: typeof RESEARCH_INTAKE_ADDRESS;
  senderAddress: string;
  subject: string;
  category: ResearchIntakeCategory;
  urgency: "routine" | "priority" | "critical";
  state: "needs_human_review" | "linked" | "closed";
  linkedType: string | null;
  linkedId: string | null;
  receivedAt: string;
}

export interface AdminOperationsCollectionMap {
  buyerQueue: BuyerQueueItem;
  organizations: B2BOrganization;
  customers: Customer360Record;
  availabilityReviews: AvailabilityReviewItem;
  priceReviews: PriceReviewItem;
  invoices: InvoicePaymentItem;
  supplierAssignments: SupplierAssignmentItem;
  fulfillment: FulfillmentItem;
  returnsReships: ReturnReshipItem;
  supportCases: SupportCaseItem;
  reports: OperationsReportItem;
  exceptions: OperationsExceptionItem;
  controls: AdminOperationalControlStatus;
  audit: AdminAuditEvent;
  intake: ResearchIntakeItem;
}

export type AdminOperationsSources = {
  [Key in AdminOperationsSourceKey]: AdminOperationsSource<AdminOperationsCollectionMap[Key]>;
};

export interface AdminCrmSupplierOperationsSnapshot {
  generatedAt: string;
  trustDial: TrustDialMode;
  sources: AdminOperationsSources;
}

export const ADMIN_CRM_ACTIONS = [
  "buyer_follow_up",
  "organization_review",
  "availability_review",
  "price_review",
  "invoice_payment_review",
  "supplier_assignment",
  "fulfillment_review",
  "tracking_follow_up",
  "return_reship_review",
  "support_case_review",
  "exception_review",
  "intake_triage",
] as const;

export type AdminCrmAction = (typeof ADMIN_CRM_ACTIONS)[number];

export const ADMIN_CRM_ACTION_TARGETS: Record<AdminCrmAction, string> = {
  buyer_follow_up: "buyer",
  organization_review: "organization",
  availability_review: "availability_review",
  price_review: "price_review",
  invoice_payment_review: "invoice",
  supplier_assignment: "supplier_assignment",
  fulfillment_review: "fulfillment",
  tracking_follow_up: "fulfillment",
  return_reship_review: "return_reship",
  support_case_review: "support_case",
  exception_review: "exception",
  intake_triage: "research_intake",
};

type AdminCrmEvidenceBinding = {
  [Source in AdminOperationsSourceKey]: {
    source: Source;
    idField: Extract<keyof AdminOperationsCollectionMap[Source], string>;
  };
}[AdminOperationsSourceKey];

export const ADMIN_CRM_ACTION_EVIDENCE = {
  buyer_follow_up: { source: "buyerQueue", idField: "buyerId" },
  organization_review: { source: "organizations", idField: "organizationId" },
  availability_review: { source: "availabilityReviews", idField: "reviewId" },
  price_review: { source: "priceReviews", idField: "reviewId" },
  invoice_payment_review: { source: "invoices", idField: "invoiceId" },
  supplier_assignment: { source: "supplierAssignments", idField: "assignmentId" },
  fulfillment_review: { source: "fulfillment", idField: "fulfillmentId" },
  tracking_follow_up: { source: "fulfillment", idField: "fulfillmentId" },
  return_reship_review: { source: "returnsReships", idField: "requestId" },
  support_case_review: { source: "supportCases", idField: "caseId" },
  exception_review: { source: "exceptions", idField: "exceptionId" },
  intake_triage: { source: "intake", idField: "intakeId" },
} as const satisfies Record<AdminCrmAction, AdminCrmEvidenceBinding>;

export interface AdminCrmRecommendationInput {
  action: AdminCrmAction;
  targetType: string;
  targetId: string;
  reason: string;
  idempotencyKey: string;
}

export interface AdminCrmActionRecommendation {
  recordId: string;
  action: AdminCrmAction;
  targetType: string;
  targetId: string;
  recordState: "recorded" | "awaiting_human_review";
  executionState: "not_executed";
  externalEffect: false;
  executor: null;
  requiresHumanApproval: true;
  configuredTrustDial: TrustDialMode;
  evidenceSource: AdminOperationsSourceKey;
  evidenceCheckedAt: string;
  createdAt: string;
  idempotentReplay: boolean;
}
