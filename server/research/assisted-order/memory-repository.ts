import type {
  AssistedOrderAdminDetail,
  AssistedOrderAdminListItem,
  AssistedOrderDocumentView,
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

/** Test/dev adapter only. Production composition must use the durable repository. */
export class InMemoryAssistedOrderRepository implements AssistedOrderRepository {
  private readonly submissions = new Map<string, AssistedOrderStoredSubmission>();
  private readonly requests = new Map<string, AssistedOrderCreateRecord>();
  private readonly tokens = new Map<string, string>();
  private readonly statuses = new Map<string, AssistedOrderStatus>();
  private readonly events = new Map<string, AssistedOrderStatusEventView[]>();
  private readonly documents = new Map<string, AssistedOrderDocumentRecord>();

  public async createOrReplay(
    record: AssistedOrderCreateRecord,
    rawStatusToken: string,
  ): Promise<AssistedOrderStoredSubmission> {
    const existing = this.submissions.get(record.idempotencyKeyHash);
    if (existing) {
      this.tokens.set(record.statusTokenHash, existing.receipt.requestId);
      // Replay identity mirrors the RPC: the receipt keeps the ORIGINAL
      // requestId and the result is marked as a replay.
      return Object.freeze({
        ...existing,
        receipt: Object.freeze({
          ...existing.receipt,
          statusToken: rawStatusToken,
        }),
        statusTokenHash: record.statusTokenHash,
        replayed: true,
      });
    }
    const receipt: AssistedOrderReceipt = Object.freeze({
      requestId: record.requestId,
      publicReference: record.publicReference,
      statusToken: rawStatusToken,
      status: "submitted",
      createdAt: record.createdAt,
      estimatedTotalCents: record.estimatedTotalCents,
      currency: record.currency,
      lines: record.lines,
      nextSteps: Object.freeze([]),
    });
    const stored = Object.freeze({
      receipt,
      requestFingerprint: record.requestFingerprint,
      statusTokenHash: record.statusTokenHash,
      replayed: false,
    });
    this.submissions.set(record.idempotencyKeyHash, stored);
    this.requests.set(record.requestId, record);
    this.tokens.set(record.statusTokenHash, record.requestId);
    this.statuses.set(record.requestId, "submitted");
    this.events.set(record.requestId, [
      Object.freeze({
        status: "submitted" as const,
        occurredAt: record.createdAt,
        customerMessage: "Your request has been received.",
      }),
    ]);
    return stored;
  }

  public async getStatus(
    authorization: AssistedOrderStatusAuthorization,
  ): Promise<AssistedOrderStatusView | null> {
    const record = Array.from(this.requests.values()).find(
      (item) => item.publicReference === authorization.publicReference,
    );
    if (!record) return null;
    const tokenRequest = authorization.statusTokenHash
      ? this.tokens.get(authorization.statusTokenHash)
      : undefined;
    const authorized =
      (authorization.memberId !== null && record.actorMemberId === authorization.memberId) ||
      (authorization.earlyAccessSessionHash !== null &&
        record.earlyAccessSessionHash === authorization.earlyAccessSessionHash) ||
      tokenRequest === record.requestId;
    if (!authorized) return null;
    return this.statusView(record);
  }

  public async getAdmin(requestId: string): Promise<AssistedOrderAdminDetail | null> {
    const record = this.requests.get(requestId);
    return record ? this.adminDetail(record) : null;
  }

  public async listAdmin(query: {
    status?: AssistedOrderStatus;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<AssistedOrderAdminListPage> {
    let records = Array.from(this.requests.values());
    if (query.status) {
      records = records.filter((record) => this.statuses.get(record.requestId) === query.status);
    }
    if (query.search) {
      const search = query.search.toLowerCase();
      records = records.filter((record) =>
        [record.publicReference, record.fullLegalName, record.normalizedEmail, record.organizationName ?? ""]
          .some((value) => value.toLowerCase().includes(search)),
      );
    }
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = records.length;
    const start = (query.page - 1) * query.pageSize;
    const pageRecords = records.slice(start, start + query.pageSize);
    const items: AssistedOrderAdminListItem[] = pageRecords.map((record) => {
      const documents = this.documentViews(record.requestId);
      return Object.freeze({
        requestId: record.requestId,
        publicReference: record.publicReference,
        status: this.statuses.get(record.requestId) ?? "submitted",
        fullLegalName: record.fullLegalName,
        email: record.normalizedEmail,
        mobilePhone: record.mobilePhone,
        organizationName: record.organizationName,
        lineCount: record.lines.length,
        totalQuantity: record.lines.reduce((sum, line) => sum + line.quantity, 0),
        estimatedTotalCents: record.estimatedTotalCents,
        workflowModes: Object.freeze(Array.from(new Set(record.lines.map((line) => line.workflowMode)))),
        identityDocumentStatus:
          documents.find((document) => document.documentType === "government_id")?.status ?? null,
        createdAt: record.createdAt,
        updatedAt: this.events.get(record.requestId)?.at(-1)?.occurredAt ?? record.createdAt,
      });
    });
    return Object.freeze({ items: Object.freeze(items), total, page: query.page, pageSize: query.pageSize });
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
    const current = this.statuses.get(input.requestId);
    if (current !== input.fromStatus) {
      throw new Error("concurrent status update");
    }
    this.statuses.set(input.requestId, input.toStatus);
    const timeline = this.events.get(input.requestId) ?? [];
    timeline.push(
      Object.freeze({
        status: input.toStatus,
        occurredAt: input.occurredAt,
        customerMessage: input.customerMessage,
      }),
    );
    this.events.set(input.requestId, timeline);
    const record = this.requests.get(input.requestId);
    if (!record) throw new Error("request not found");
    return this.adminDetail(record);
  }

  public async createDocument(record: AssistedOrderDocumentRecord): Promise<void> {
    if (this.documents.has(record.documentId)) throw new Error("document exists");
    this.documents.set(record.documentId, record);
  }

  public async completeDocument(input: {
    requestId: string;
    documentId: string;
    objectPath: string;
    uploadedAt: string;
  }): Promise<AssistedOrderDocumentView> {
    const current = this.documents.get(input.documentId);
    if (!current || current.requestId !== input.requestId || current.objectPath !== input.objectPath) {
      throw new Error("document not found");
    }
    const updated = Object.freeze({ ...current, status: "uploaded" as const });
    this.documents.set(input.documentId, updated);
    return Object.freeze({
      documentId: updated.documentId,
      documentType: updated.documentType,
      side: updated.side,
      fileName: updated.fileName,
      status: updated.status,
      uploadedAt: input.uploadedAt,
    });
  }

  public async getDocument(input: {
    requestId: string;
    documentId: string;
  }): Promise<AssistedOrderDocumentRecord | null> {
    const record = this.documents.get(input.documentId);
    return record?.requestId === input.requestId ? record : null;
  }

  private statusView(record: AssistedOrderCreateRecord): AssistedOrderStatusView {
    // Freeze a copy: freezing the stored array in place would make every
    // later status append fail once a status view has been read.
    const timeline = Object.freeze(Array.from(this.events.get(record.requestId) ?? []));
    return Object.freeze({
      requestId: record.requestId,
      publicReference: record.publicReference,
      status: this.statuses.get(record.requestId) ?? "submitted",
      createdAt: record.createdAt,
      updatedAt: timeline.at(-1)?.occurredAt ?? record.createdAt,
      estimatedTotalCents: record.estimatedTotalCents,
      currency: "USD" as const,
      lines: record.lines,
      timeline,
      documents: this.documentViews(record.requestId),
      actionRequired: null,
    });
  }

  private adminDetail(record: AssistedOrderCreateRecord): AssistedOrderAdminDetail {
    const view = this.statusView(record);
    return Object.freeze({
      requestId: record.requestId,
      publicReference: record.publicReference,
      status: view.status,
      source: "early_access_manual_order_bridge" as const,
      actorMemberId: record.actorMemberId,
      fullLegalName: record.fullLegalName,
      email: record.normalizedEmail,
      mobilePhone: record.mobilePhone,
      organizationName: record.organizationName,
      shippingAddress: record.shippingAddress,
      billingAddress: record.billingAddress,
      lines: record.lines,
      estimatedTotalCents: record.estimatedTotalCents,
      currency: "USD" as const,
      generalNotes: record.generalNotes,
      agreements: record.agreements,
      affiliateAttributionRef: record.affiliateAttributionRef,
      timeline: view.timeline,
      documents: view.documents,
      createdAt: record.createdAt,
      updatedAt: view.updatedAt,
    });
  }

  private documentViews(requestId: string): readonly AssistedOrderDocumentView[] {
    return Object.freeze(
      Array.from(this.documents.values())
        .filter((document) => document.requestId === requestId)
        .map((document) =>
          Object.freeze({
            documentId: document.documentId,
            documentType: document.documentType,
            side: document.side,
            fileName: document.fileName,
            status: document.status,
            uploadedAt: null,
          }),
        ),
    );
  }
}
