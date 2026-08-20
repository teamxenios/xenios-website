import type {
  AssistedOrderAdminDetail,
  AssistedOrderAdminListItem,
  AssistedOrderDocumentView,
  AssistedOrderLineSnapshot,
  AssistedOrderReceipt,
  AssistedOrderStatus,
  AssistedOrderStatusEventView,
  AssistedOrderStatusView,
} from "../../../shared/research/assisted-order/contract";
import type {
  AssistedOrderAdminListPage,
  AssistedOrderCreateRecord,
  AssistedOrderDocumentRecord,
  AssistedOrderRepository,
  AssistedOrderStatusAuthorization,
  AssistedOrderStoredSubmission,
} from "./ports";
import { AssistedOrderConflictError } from "./service";

export type SupabaseRpcResponse = Readonly<{
  data: unknown;
  error: null | Readonly<{ message: string; code?: string; details?: string }>;
}>;

export type SupabaseRpcClient = Readonly<{
  rpc(name: string, args?: Readonly<Record<string, unknown>>): Promise<SupabaseRpcResponse>;
}>;

function assertObject(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} did not return an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function assertArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} did not return an array.`);
  }
  return value;
}

function text(object: Readonly<Record<string, unknown>>, key: string): string {
  const value = object[key];
  if (typeof value !== "string") {
    throw new Error(`Missing string field ${key}.`);
  }
  return value;
}

function nullableText(
  object: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = object[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid optional string field ${key}.`);
  }
  return value;
}

function integer(object: Readonly<Record<string, unknown>>, key: string): number {
  const value = object[key];
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Missing integer field ${key}.`);
  }
  return value as number;
}

function nullableInteger(
  object: Readonly<Record<string, unknown>>,
  key: string,
): number | null {
  const value = object[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid optional integer field ${key}.`);
  }
  return value as number;
}

function status(value: unknown): AssistedOrderStatus {
  if (typeof value !== "string") {
    throw new Error("Missing assisted order status.");
  }
  return value as AssistedOrderStatus;
}

function decodeLines(value: unknown): readonly AssistedOrderLineSnapshot[] {
  return assertArray(value, "lines").map((raw) => {
    const item = assertObject(raw, "line");
    return Object.freeze({
      lineId: text(item, "lineId"),
      productId: text(item, "productId"),
      variantId: text(item, "variantId"),
      productName: text(item, "productName"),
      specification: nullableText(item, "specification"),
      format: nullableText(item, "format"),
      packBasis: nullableText(item, "packBasis"),
      quantity: integer(item, "quantity"),
      minimumQuantity: integer(item, "minimumQuantity"),
      maximumQuantity: nullableInteger(item, "maximumQuantity"),
      quantityIncrement: integer(item, "quantityIncrement"),
      workflowMode: text(item, "workflowMode") as AssistedOrderLineSnapshot["workflowMode"],
      customerActionLabel: text(item, "customerActionLabel"),
      unitPriceCents: nullableInteger(item, "unitPriceCents"),
      lineEstimateCents: nullableInteger(item, "lineEstimateCents"),
      currency: "USD" as const,
      catalogVersion: text(item, "catalogVersion"),
      priceVersion: nullableText(item, "priceVersion"),
      accessNotice: nullableText(item, "accessNotice"),
      researchUseOnly: item.researchUseOnly === true,
    });
  });
}

function decodeTimeline(value: unknown): readonly AssistedOrderStatusEventView[] {
  return assertArray(value, "timeline").map((raw) => {
    const item = assertObject(raw, "timeline item");
    return Object.freeze({
      status: status(item.status),
      occurredAt: text(item, "occurredAt"),
      customerMessage: nullableText(item, "customerMessage"),
    });
  });
}

function decodeDocuments(value: unknown): readonly AssistedOrderDocumentView[] {
  return assertArray(value, "documents").map((raw) => {
    const item = assertObject(raw, "document");
    return Object.freeze({
      documentId: text(item, "documentId"),
      documentType: text(item, "documentType") as AssistedOrderDocumentView["documentType"],
      side: text(item, "side") as AssistedOrderDocumentView["side"],
      fileName: text(item, "fileName"),
      status: text(item, "status") as AssistedOrderDocumentView["status"],
      uploadedAt: nullableText(item, "uploadedAt"),
    });
  });
}

function decodeReceipt(value: unknown, rawStatusToken: string): AssistedOrderReceipt {
  const item = assertObject(value, "receipt");
  return Object.freeze({
    requestId: text(item, "requestId"),
    publicReference: text(item, "publicReference"),
    statusToken: rawStatusToken,
    status: "submitted" as const,
    createdAt: text(item, "createdAt"),
    estimatedTotalCents: nullableInteger(item, "estimatedTotalCents"),
    currency: "USD" as const,
    lines: decodeLines(item.lines),
    nextSteps: Object.freeze([]),
  });
}

function decodeStatusView(value: unknown): AssistedOrderStatusView {
  const item = assertObject(value, "status view");
  return Object.freeze({
    requestId: text(item, "requestId"),
    publicReference: text(item, "publicReference"),
    status: status(item.status),
    createdAt: text(item, "createdAt"),
    updatedAt: text(item, "updatedAt"),
    estimatedTotalCents: nullableInteger(item, "estimatedTotalCents"),
    currency: "USD" as const,
    lines: decodeLines(item.lines),
    timeline: decodeTimeline(item.timeline),
    documents: decodeDocuments(item.documents),
    actionRequired: nullableText(item, "actionRequired"),
  });
}

function decodeAdminDetail(value: unknown): AssistedOrderAdminDetail {
  const item = assertObject(value, "admin detail");
  return Object.freeze({
    requestId: text(item, "requestId"),
    publicReference: text(item, "publicReference"),
    status: status(item.status),
    source: "early_access_manual_order_bridge" as const,
    actorMemberId: nullableText(item, "actorMemberId"),
    fullLegalName: text(item, "fullLegalName"),
    email: text(item, "email"),
    mobilePhone: text(item, "mobilePhone"),
    organizationName: nullableText(item, "organizationName"),
    shippingAddress: assertObject(item.shippingAddress, "shipping address") as AssistedOrderAdminDetail["shippingAddress"],
    billingAddress: assertObject(item.billingAddress, "billing address") as AssistedOrderAdminDetail["billingAddress"],
    lines: decodeLines(item.lines),
    estimatedTotalCents: nullableInteger(item, "estimatedTotalCents"),
    currency: "USD" as const,
    generalNotes: nullableText(item, "generalNotes"),
    agreements: assertArray(item.agreements, "agreements") as AssistedOrderAdminDetail["agreements"],
    affiliateAttributionRef: nullableText(item, "affiliateAttributionRef"),
    declaredAffiliateCode: nullableText(item, "declaredAffiliateCode"),
    // A row written before the column existed reports not_provided rather than
    // a null state, so an operator console never has to render an absent value.
    declaredAffiliateCodeState:
      (nullableText(item, "declaredAffiliateCodeState") as
        | "not_provided"
        | "captured_unmatched"
        | "matched_manual"
        | "invalid_ignored"
        | null) ?? "not_provided",
    timeline: decodeTimeline(item.timeline),
    documents: decodeDocuments(item.documents),
    createdAt: text(item, "createdAt"),
    updatedAt: text(item, "updatedAt"),
  });
}

function fail(response: SupabaseRpcResponse, operation: string): never {
  const error = response.error;
  const message = error?.message ?? "unknown database error";
  const code = error?.code;
  // Unique violations, including the submit RPC's idempotency-conflict signal
  // (raised with errcode 23505), are client-resolvable conflicts and must
  // surface as the 409 conflict error, never as a generic 500.
  if (code === "23505") {
    throw new AssistedOrderConflictError(
      message.toLowerCase().includes("idempotency")
        ? "idempotency_conflict"
        : "duplicate_record",
      message,
    );
  }
  // Serialization failures are retryable conflicts, not server faults.
  if (code === "40001") {
    throw new AssistedOrderConflictError(
      "serialization_conflict",
      `${operation} could not be serialized against a concurrent change. Retry the request.`,
    );
  }
  throw new Error(`${operation} failed: ${message}`);
}

export class SupabaseAssistedOrderRepository implements AssistedOrderRepository {
  public constructor(private readonly client: SupabaseRpcClient) {}

  public async createOrReplay(
    record: AssistedOrderCreateRecord,
    rawStatusToken: string,
  ): Promise<AssistedOrderStoredSubmission> {
    const response = await this.client.rpc("research_assisted_order_submit", {
      p_request: {
        requestId: record.requestId,
        publicReference: record.publicReference,
        statusTokenHash: record.statusTokenHash,
        requestFingerprint: record.requestFingerprint,
        idempotencyKeyHash: record.idempotencyKeyHash,
        actorMemberId: record.actorMemberId,
        earlyAccessSessionHash: record.earlyAccessSessionHash,
        normalizedEmail: record.normalizedEmail,
        fullLegalName: record.fullLegalName,
        mobilePhone: record.mobilePhone,
        organizationName: record.organizationName,
        shippingAddress: record.shippingAddress,
        billingAddress: record.billingAddress,
        ageConfirmed: record.ageConfirmed,
        agreements: record.agreements,
        generalNotes: record.generalNotes,
        affiliateAttributionRef: record.affiliateAttributionRef,
        // Sent under names the RPC reads explicitly. A key the function does not
        // read is silently null, so these two must stay in step with the
        // migration that added them.
        declaredAffiliateCode: record.declaredAffiliateCode,
        declaredAffiliateCodeState: record.declaredAffiliateCodeState,
        estimatedTotalCents: record.estimatedTotalCents,
        currency: record.currency,
        source: record.source,
        lines: record.lines,
        createdAt: record.createdAt,
      },
    });
    if (response.error) {
      fail(response, "research_assisted_order_submit");
    }
    const data = assertObject(response.data, "submit response");
    const receipt = decodeReceipt(data.receipt, rawStatusToken);
    return Object.freeze({
      receipt,
      requestFingerprint: text(data, "requestFingerprint"),
      statusTokenHash: text(data, "statusTokenHash"),
      // The RPC returns the stored row's id. A differing id proves the
      // idempotency key matched an earlier submission (an idempotent replay).
      replayed: receipt.requestId !== record.requestId,
    });
  }

  public async getStatus(
    authorization: AssistedOrderStatusAuthorization,
  ): Promise<AssistedOrderStatusView | null> {
    const response = await this.client.rpc("research_assisted_order_status", {
      p_public_reference: authorization.publicReference,
      p_member_id: authorization.memberId,
      p_early_access_session_hash: authorization.earlyAccessSessionHash,
      p_status_token_hash: authorization.statusTokenHash,
    });
    if (response.error) {
      fail(response, "research_assisted_order_status");
    }
    return response.data === null ? null : decodeStatusView(response.data);
  }

  public async getAdmin(requestId: string): Promise<AssistedOrderAdminDetail | null> {
    const response = await this.client.rpc("research_assisted_order_admin_get", {
      p_request_id: requestId,
    });
    if (response.error) {
      fail(response, "research_assisted_order_admin_get");
    }
    return response.data === null ? null : decodeAdminDetail(response.data);
  }

  public async listAdmin(query: {
    status?: AssistedOrderStatus;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<AssistedOrderAdminListPage> {
    const response = await this.client.rpc("research_assisted_order_admin_list", {
      p_status: query.status ?? null,
      p_search: query.search ?? null,
      p_page: query.page,
      p_page_size: query.pageSize,
    });
    if (response.error) {
      fail(response, "research_assisted_order_admin_list");
    }
    const data = assertObject(response.data, "admin list");
    const items = assertArray(data.items, "admin list items").map((raw) => {
      const item = assertObject(raw, "admin list item");
      return Object.freeze({
        requestId: text(item, "requestId"),
        publicReference: text(item, "publicReference"),
        status: status(item.status),
        fullLegalName: text(item, "fullLegalName"),
        email: text(item, "email"),
        mobilePhone: text(item, "mobilePhone"),
        organizationName: nullableText(item, "organizationName"),
        lineCount: integer(item, "lineCount"),
        totalQuantity: integer(item, "totalQuantity"),
        estimatedTotalCents: nullableInteger(item, "estimatedTotalCents"),
        workflowModes: assertArray(item.workflowModes, "workflow modes") as AssistedOrderAdminListItem["workflowModes"],
        identityDocumentStatus: nullableText(item, "identityDocumentStatus") as AssistedOrderAdminListItem["identityDocumentStatus"],
        createdAt: text(item, "createdAt"),
        updatedAt: text(item, "updatedAt"),
      });
    });
    return Object.freeze({
      items: Object.freeze(items),
      total: integer(data, "total"),
      page: integer(data, "page"),
      pageSize: integer(data, "pageSize"),
    });
  }

  public async updateStatus(input: {
    requestId: string;
    fromStatus: AssistedOrderStatus;
    toStatus: AssistedOrderStatus;
    actorId: string;
    actorType: "admin" | "system";
    customerMessage: string | null;
    internalNote: string | null;
    evidence: Readonly<Record<string, unknown>>;
    occurredAt: string;
  }): Promise<AssistedOrderAdminDetail> {
    const response = await this.client.rpc("research_assisted_order_set_status", {
      p_request_id: input.requestId,
      p_expected_status: input.fromStatus,
      p_new_status: input.toStatus,
      p_actor_id: input.actorId,
      p_actor_type: input.actorType,
      p_customer_message: input.customerMessage,
      p_internal_note: input.internalNote,
      p_evidence: input.evidence,
      p_occurred_at: input.occurredAt,
    });
    if (response.error) {
      fail(response, "research_assisted_order_set_status");
    }
    return decodeAdminDetail(response.data);
  }

  public async createDocument(record: AssistedOrderDocumentRecord): Promise<void> {
    const response = await this.client.rpc("research_assisted_order_document_create", {
      p_document: record,
    });
    if (response.error) {
      fail(response, "research_assisted_order_document_create");
    }
  }

  public async completeDocument(input: {
    requestId: string;
    documentId: string;
    objectPath: string;
    uploadedAt: string;
  }): Promise<AssistedOrderDocumentView> {
    const response = await this.client.rpc("research_assisted_order_document_complete", {
      p_request_id: input.requestId,
      p_document_id: input.documentId,
      p_object_path: input.objectPath,
      p_uploaded_at: input.uploadedAt,
    });
    if (response.error) {
      fail(response, "research_assisted_order_document_complete");
    }
    return decodeDocuments([response.data])[0];
  }

  public async getDocument(input: {
    requestId: string;
    documentId: string;
  }): Promise<AssistedOrderDocumentRecord | null> {
    const response = await this.client.rpc("research_assisted_order_document_get", {
      p_request_id: input.requestId,
      p_document_id: input.documentId,
    });
    if (response.error) {
      fail(response, "research_assisted_order_document_get");
    }
    if (response.data === null) {
      return null;
    }
    const item = assertObject(response.data, "document record");
    return Object.freeze({
      documentId: text(item, "documentId"),
      requestId: text(item, "requestId"),
      objectPath: text(item, "objectPath"),
      documentType: text(item, "documentType") as AssistedOrderDocumentRecord["documentType"],
      side: text(item, "side") as AssistedOrderDocumentRecord["side"],
      fileName: text(item, "fileName"),
      mimeType: text(item, "mimeType"),
      sizeBytes: integer(item, "sizeBytes"),
      status: text(item, "status") as AssistedOrderDocumentRecord["status"],
      createdAt: text(item, "createdAt"),
      retentionExpiresAt: text(item, "retentionExpiresAt"),
    });
  }
}
