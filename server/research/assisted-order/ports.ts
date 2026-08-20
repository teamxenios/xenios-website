import type { DeclaredAffiliateCodeState } from "../partners/declared-affiliate-code";
import type {
  AssistedOrderAdminDetail,
  AssistedOrderAdminListItem,
  AssistedOrderCatalogPage,
  AssistedOrderCatalogQuery,
  AssistedOrderDocumentSide,
  AssistedOrderDocumentStatus,
  AssistedOrderDocumentType,
  AssistedOrderDocumentView,
  AssistedOrderLineInput,
  AssistedOrderLineSnapshot,
  AssistedOrderReceipt,
  AssistedOrderStatus,
  AssistedOrderStatusEvidence,
  AssistedOrderStatusEventView,
  AssistedOrderStatusView,
  AssistedOrderSubmitInput,
  AssistedOrderUploadTicket,
  AssistedOrderWorkflowMode,
} from "../../../shared/research/assisted-order/contract";

export type AssistedOrderViewer = Readonly<{
  actorType: "member" | "early_access_session" | "admin";
  memberId: string | null;
  earlyAccessSessionHash: string | null;
  normalizedEmail: string | null;
  // Admin identities can be Supabase JWT email identities with no member row.
  // This label is the recordable actor for such viewers.
  actorLabel?: string | null;
  /**
   * Opaque server-derived master-offerings pricing viewer, set ONLY by the
   * composition root from the authenticated member row — never from browser
   * input. Absent or null means no price grant: the canonical price authority
   * fails closed and every price renders "Price on request", never $0.
   */
  pricingViewer?: unknown;
  capabilities: ReadonlySet<
    | "assisted_orders:submit"
    | "assisted_orders:read_own"
    | "assisted_orders:read_all"
    | "assisted_orders:manage"
    | "assisted_orders:documents_manage"
  >;
}>;

export type ResolvedAssistedOrderLine = AssistedOrderLineSnapshot &
  Readonly<{
    authoritativeFingerprint: string;
  }>;

export type AssistedOrderCatalogPort = Readonly<{
  list(
    viewer: AssistedOrderViewer,
    query: AssistedOrderCatalogQuery,
  ): Promise<AssistedOrderCatalogPage>;
  resolveLine(
    viewer: AssistedOrderViewer,
    line: AssistedOrderLineInput,
  ): Promise<ResolvedAssistedOrderLine>;
}>;

// The authoritative required agreement set for a submission. Versions are
// exact identifiers, never aliases such as "current".
export type AssistedOrderRequiredAgreement = Readonly<{
  kind: string;
  version: string;
}>;

export type AssistedOrderLegalPort = Readonly<{
  requiredAgreements(): Promise<ReadonlyArray<AssistedOrderRequiredAgreement>>;
}>;

export type AssistedOrderCreateRecord = Readonly<{
  requestId: string;
  publicReference: string;
  statusTokenHash: string;
  requestFingerprint: string;
  idempotencyKeyHash: string;
  actorMemberId: string | null;
  earlyAccessSessionHash: string | null;
  normalizedEmail: string;
  fullLegalName: string;
  mobilePhone: string;
  organizationName: string | null;
  shippingAddress: AssistedOrderSubmitInput["contact"]["shippingAddress"];
  billingAddress: AssistedOrderSubmitInput["contact"]["shippingAddress"];
  ageConfirmed: true;
  agreements: AssistedOrderSubmitInput["agreements"];
  generalNotes: string | null;
  affiliateAttributionRef: string | null;
  /**
   * The affiliate code the CUSTOMER TYPED, and how far it has travelled.
   *
   * A separate field from the verified attribution above on purpose. That one
   * is proof the server derived; this one is a claim a stranger typed, and it
   * stays unmatched until a human matches it. Writing a typed string into the
   * verified field would hand the browser the power to choose which partner an
   * order pays, which the submit path refuses by design.
   */
  declaredAffiliateCode: string | null;
  declaredAffiliateCodeState: DeclaredAffiliateCodeState;
  estimatedTotalCents: number | null;
  currency: "USD";
  source: "early_access_manual_order_bridge";
  lines: readonly ResolvedAssistedOrderLine[];
  createdAt: string;
}>;

export type AssistedOrderStoredSubmission = Readonly<{
  receipt: AssistedOrderReceipt;
  requestFingerprint: string;
  statusTokenHash: string;
  // True when the idempotency key matched an earlier submission. The receipt
  // then carries the original stored requestId, not the caller's minted one,
  // and post-commit effects must not run again.
  replayed: boolean;
}>;

export type AssistedOrderStatusAuthorization = Readonly<{
  memberId: string | null;
  earlyAccessSessionHash: string | null;
  publicReference: string;
  statusTokenHash: string | null;
}>;

export type AssistedOrderAdminListQuery = Readonly<{
  status?: AssistedOrderStatus;
  search?: string;
  page: number;
  pageSize: number;
}>;

export type AssistedOrderAdminListPage = Readonly<{
  items: readonly AssistedOrderAdminListItem[];
  total: number;
  page: number;
  pageSize: number;
}>;

export type AssistedOrderDocumentRecord = Readonly<{
  documentId: string;
  requestId: string;
  objectPath: string;
  documentType: AssistedOrderDocumentType;
  side: AssistedOrderDocumentSide;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: AssistedOrderDocumentStatus;
  createdAt: string;
  retentionExpiresAt: string;
}>;

export type AssistedOrderRepository = Readonly<{
  createOrReplay(
    record: AssistedOrderCreateRecord,
    rawStatusToken: string,
  ): Promise<AssistedOrderStoredSubmission>;
  getStatus(
    authorization: AssistedOrderStatusAuthorization,
  ): Promise<AssistedOrderStatusView | null>;
  getAdmin(requestId: string): Promise<AssistedOrderAdminDetail | null>;
  listAdmin(
    query: AssistedOrderAdminListQuery,
  ): Promise<AssistedOrderAdminListPage>;
  updateStatus(input: {
    requestId: string;
    fromStatus: AssistedOrderStatus;
    toStatus: AssistedOrderStatus;
    actorId: string;
    actorType: "admin" | "system";
    customerMessage: string | null;
    internalNote: string | null;
    evidence: AssistedOrderStatusEvidence;
    occurredAt: string;
  }): Promise<AssistedOrderAdminDetail>;
  createDocument(record: AssistedOrderDocumentRecord): Promise<void>;
  completeDocument(input: {
    requestId: string;
    documentId: string;
    objectPath: string;
    uploadedAt: string;
  }): Promise<AssistedOrderDocumentView>;
  getDocument(input: {
    requestId: string;
    documentId: string;
  }): Promise<AssistedOrderDocumentRecord | null>;
}>;

export type AssistedOrderNotificationIntent = Readonly<{
  eventId: string;
  eventType:
    | "assisted_order.submitted"
    | "assisted_order.status_changed"
    | "assisted_order.document_uploaded";
  requestId: string;
  publicReference: string;
  recipientKind: "admin" | "customer";
  recipientAddress: string;
  templateKey: string;
  templateVersion: string;
  payload: Readonly<Record<string, unknown>>;
  dedupeKey: string;
  createdAt: string;
}>;

export type AssistedOrderOutbox = Readonly<{
  enqueue(intent: AssistedOrderNotificationIntent): Promise<void>;
}>;

export type AssistedOrderAuditEvent = Readonly<{
  eventId: string;
  eventType:
    | "assisted_order.submitted"
    | "assisted_order.status_changed"
    | "assisted_order.document_upload_requested"
    | "assisted_order.document_uploaded"
    | "assisted_order.document_downloaded";
  requestId: string;
  actorType: AssistedOrderViewer["actorType"] | "system";
  actorId: string | null;
  evidence: Readonly<Record<string, unknown>>;
  occurredAt: string;
}>;

export type AssistedOrderAuditSink = Readonly<{
  record(event: AssistedOrderAuditEvent): Promise<void>;
}>;

export type AssistedOrderDocumentStore = Readonly<{
  createUpload(input: {
    objectPath: string;
    mimeType: string;
    sizeBytes: number;
    expiresInSeconds: number;
  }): Promise<AssistedOrderUploadTicket>;
  createDownload(input: {
    objectPath: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: string }>;
}>;

export type AssistedOrderGoogleMirrorRow = Readonly<{
  publicReference: string;
  createdAt: string;
  fullLegalName: string;
  email: string;
  mobilePhone: string;
  organizationName: string | null;
  lineCount: number;
  totalQuantity: number;
  estimatedValue: string | null;
  identityStatus: string;
  agreementStatus: string;
  paymentStatus: string;
  supplierStatus: string;
  trackingStatus: string;
  overallStatus: string;
  adminPath: string;
}>;

export type AssistedOrderGoogleMirrorQueue = Readonly<{
  enqueue(row: AssistedOrderGoogleMirrorRow): Promise<void>;
}>;

export type AssistedOrderClock = Readonly<{
  now(): Date;
}>;

export type AssistedOrderIdGenerator = Readonly<{
  uuid(): string;
  publicReference(now: Date): string;
  opaqueToken(): string;
}>;

export type AssistedOrderHasher = Readonly<{
  hash(value: string): string;
  stableHash(value: unknown): string;
}>;

export type AssistedOrderLogger = Readonly<{
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(message: string, fields?: Readonly<Record<string, unknown>>): void;
}>;

export type AssistedOrderDependencies = Readonly<{
  catalog: AssistedOrderCatalogPort;
  // Optional so existing composition compiles, but submission fails closed
  // when the port is absent: no submit without a provable agreement set.
  legal?: AssistedOrderLegalPort | null;
  repository: AssistedOrderRepository;
  outbox: AssistedOrderOutbox;
  audit: AssistedOrderAuditSink;
  documents: AssistedOrderDocumentStore;
  googleMirror: AssistedOrderGoogleMirrorQueue | null;
  clock: AssistedOrderClock;
  ids: AssistedOrderIdGenerator;
  hasher: AssistedOrderHasher;
  logger: AssistedOrderLogger;
  adminNotificationEmail: string;
  documentBucketName: string;
}>;

export type AssistedOrderRouteViewerResolver<Request> = Readonly<{
  resolve(request: Request): Promise<AssistedOrderViewer>;
}>;

/**
 * Verifies the signed affiliate attribution cookie on an inbound submit and
 * yields the SERVER-derived attribution ref (the attributed partner id), or
 * null. The ref never comes from the request body: the browser carries the
 * HMAC-signed cookie the referral capture door set, but it cannot name a
 * partner directly. The composition root builds this over
 * verifiedAttributionRefFromCookieHeader (server/research/partners/
 * attribution-cookie.ts) with the partner link secret; absent wiring or an
 * absent secret both resolve to null, so attribution fails closed to
 * "no partner" rather than trusting anything the client sent.
 */
export type AssistedOrderAttributionResolver = Readonly<{
  resolve(cookieHeader: string | undefined): string | null;
}>;

export type AssistedOrderStatusTransition = Readonly<{
  from: AssistedOrderStatus;
  to: AssistedOrderStatus;
  customerMessage: string | null;
  internalNote: string | null;
  evidence: AssistedOrderStatusEvidence;
}>;

export type AssistedOrderResolvedActionSummary = Readonly<{
  workflowModes: readonly AssistedOrderWorkflowMode[];
  lineCount: number;
  totalQuantity: number;
}>;

export type AssistedOrderTimeline = readonly AssistedOrderStatusEventView[];
