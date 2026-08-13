/**
 * Pack 05 contract for the unmounted Xenios Admin CRM and Supplier Operations
 * workspace. This is operational metadata only: health, assessment, biometric,
 * prescription, and clinical fields are intentionally absent.
 */

export const RESEARCH_INTAKE_ADDRESS = "research@xeniostechnology.com" as const;

export type TrustDialMode = "auto" | "queue" | "ask" | "never";
export type QueueTone = "neutral" | "info" | "success" | "warning" | "danger";

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
  state: "pending" | "assigned" | "acknowledged" | "picking" | "packed" | "shipped" | "delivered" | "exception";
  carrier: string | null;
  trackingNumber: string | null;
  lastTrackingAt: string | null;
  targetShipAt: string | null;
}

export interface OperationsExceptionItem {
  exceptionId: string;
  domain: "buyer" | "organization" | "availability" | "price" | "invoice" | "payment" | "supplier" | "fulfillment" | "tracking" | "intake";
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
  outcome: "queued" | "approval_required" | "refused" | "completed" | "observed";
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

export interface AdminCrmSupplierOperationsSnapshot {
  generatedAt: string;
  trustDial: TrustDialMode;
  buyerQueue: BuyerQueueItem[];
  organizations: B2BOrganization[];
  customers: Customer360Record[];
  availabilityReviews: AvailabilityReviewItem[];
  priceReviews: PriceReviewItem[];
  invoices: InvoicePaymentItem[];
  supplierAssignments: SupplierAssignmentItem[];
  fulfillment: FulfillmentItem[];
  exceptions: OperationsExceptionItem[];
  audit: AdminAuditEvent[];
  intake: ResearchIntakeItem[];
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
  "exception_review",
  "intake_triage",
] as const;

export type AdminCrmAction = (typeof ADMIN_CRM_ACTIONS)[number];

export interface QueueAdminCrmActionInput {
  action: AdminCrmAction;
  targetType: string;
  targetId: string;
  reason: string;
  idempotencyKey: string;
}

export interface QueuedAdminCrmAction {
  queueId: string;
  action: AdminCrmAction;
  targetType: string;
  targetId: string;
  state: "queued" | "awaiting_approval";
  trustDial: TrustDialMode;
  createdAt: string;
  idempotentReplay: boolean;
}
