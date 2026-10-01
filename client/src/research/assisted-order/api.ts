import type {
  AssistedOrderAdminDetail,
  AssistedOrderAdminListItem,
  AssistedOrderCatalogPage,
  AssistedOrderCatalogQuery,
  AssistedOrderReceipt,
  AssistedOrderStatus,
  AssistedOrderStatusUpdateInput,
  AssistedOrderStatusView,
  AssistedOrderSubmitInput,
  AssistedOrderUploadCompleteInput,
  AssistedOrderUploadRequest,
  AssistedOrderUploadTicket,
} from "../../../../shared/research/assisted-order/contract";
import {
  parseAssistedOrderConfig,
  type AssistedOrderWizardConfig,
} from "./wizard-state";

export const ASSISTED_ORDER_STATUS_TOKEN_HEADER =
  "x-xenios-order-status-token";

function requestOwnerHeaders(statusToken?: string, memberToken?: string | null): Record<string, string> {
  // Never combine a signed-in principal with a prior visitor's guest capability.
  return memberToken ? { Authorization: `Bearer ${memberToken}` }
    : statusToken ? { [ASSISTED_ORDER_STATUS_TOKEN_HEADER]: statusToken } : {};
}

export class AssistedOrderApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "AssistedOrderApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const body = (await response.json().catch(() => null)) as null | Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new AssistedOrderApiError(
      response.status,
      typeof body?.error === "string" ? body.error : "request_failed",
      typeof body?.message === "string"
        ? body.message
        : "The request could not be completed.",
      typeof body?.field === "string" ? body.field : undefined,
    );
  }
  return body as T;
}

function queryString(query: AssistedOrderCatalogQuery): string {
  const params = new URLSearchParams();
  if (query.search) params.set("q", query.search);
  if (query.family) params.set("family", query.family);
  if (query.channel) params.set("channel", query.channel);
  if (query.actionGroup) params.set("action", query.actionGroup);
  if (query.workflowMode) params.set("workflowMode", query.workflowMode);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const value = params.toString();
  return value ? `?${value}` : "";
}

export function loadAssistedOrderCatalog(
  query: AssistedOrderCatalogQuery,
  signal?: AbortSignal,
): Promise<AssistedOrderCatalogPage> {
  return request(
    `/api/research/early-access/assisted-orders/catalog${queryString(query)}`,
    { signal },
  );
}

/**
 * Loads the server-published assisted-order configuration: the exact legal
 * (kind, version) pairs AND the operational form acknowledgments this
 * deployment requires — the server verifies both independently at submission.
 * The wizard renders and submits only what this returns. Anything unusable
 * throws, so the caller fails closed with a retry state instead of falling
 * back to a built-in list.
 */
/**
 * ONE config request per page load, shared by every caller.
 *
 * Three components ask the server the same question: the storefront route (to
 * decide whether the full canonical catalog may render), the CTA (to decide
 * whether to offer the wizard), and the wizard itself (for the exact
 * acknowledgment versions). Measured in a browser, that was three separate
 * round trips for one unchanging answer — and worse, they were SEQUENTIAL,
 * because the wizard only mounts after the route's probe resolves, so the
 * catalog request could not even begin until two config round trips and a lazy
 * chunk had completed. On a phone that is seconds of spinner before the
 * expensive request starts.
 *
 * The promise is cached, not the value, so concurrent callers join the request
 * already in flight rather than starting their own. A REJECTION is not cached:
 * a failed probe must stay retryable, and a caller that retries would
 * otherwise get the original failure forever.
 *
 * Deliberately per page load and not time-based. The config is legal versions
 * and a feature flag; a customer who needs a changed value needs a reload
 * anyway, and a TTL here would be a cache-invalidation problem bought for
 * nothing.
 */
let inFlightConfig: Promise<Record<string, unknown> | null> | null = null;

export function requestAssistedOrderConfigBody(): Promise<Record<string, unknown> | null> {
  if (inFlightConfig === null) {
    inFlightConfig = request<Record<string, unknown> | null>(
      "/api/research/early-access/assisted-orders/config",
    ).catch((error: unknown) => {
      inFlightConfig = null;
      throw error;
    });
  }
  return inFlightConfig;
}

/** Test seam: drop the shared request so each test starts cold. */
export function resetAssistedOrderConfigCache(): void {
  inFlightConfig = null;
}

export async function loadAssistedOrderConfig(): Promise<AssistedOrderWizardConfig> {
  const body = await requestAssistedOrderConfigBody();
  if (body && body.enabled === false) {
    throw new AssistedOrderApiError(
      503,
      "assisted_orders_disabled",
      "Assisted ordering is not available right now. Please try again later.",
    );
  }
  const config = parseAssistedOrderConfig(body);
  if (!config) {
    throw new AssistedOrderApiError(
      502,
      "config_unusable",
      "The required acknowledgments could not be loaded. Please retry before submitting.",
    );
  }
  return config;
}

export function submitAssistedOrder(
  input: AssistedOrderSubmitInput,
): Promise<AssistedOrderReceipt> {
  return request("/api/research/early-access/assisted-orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loadAssistedOrderStatus(
  publicReference: string,
  statusToken?: string,
  memberToken?: string | null,
): Promise<AssistedOrderStatusView> {
  return request(
    `/api/research/early-access/assisted-orders/${encodeURIComponent(
      publicReference,
    )}`,
    {
      cache: "no-store",
      redirect: "error",
      // A signed-in owner read must not inherit another visitor's stored
      // guest status capability. Neither credential ever enters the URL.
      headers: requestOwnerHeaders(statusToken, memberToken),
    },
  );
}

/** Customer-safe projection from the owner-bound quote RPC, not price authority. */
export type AssistedOrderCustomerQuote = Readonly<{
  requestId: string;
  publicReference: string;
  quoteId: string;
  version: number;
  state: "issued" | "accepted" | "superseded" | "withdrawn" | "expired";
  lines: readonly Readonly<{
    lineId: string;
    productName: string;
    specification: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    currency: "USD";
  }>[];
  totalCents: number;
  currency: "USD";
  validUntil: string;
  customerNote: string | null;
  acceptanceId: string | null;
  acceptedAt: string | null;
}>;

export type AssistedOrderQuoteAcceptance = Readonly<{
  quoteId: string;
  version: number;
  totalCents: number;
  currency: "USD";
  acceptanceId: string;
  acceptedAt: string;
}>;

const QUOTE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const quoteRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const quoteId = (value: unknown): value is string => typeof value === "string" && QUOTE_UUID.test(value);
const quoteInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const quoteDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const quoteText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
const quoteNote = (value: unknown): value is string => typeof value === "string" && value.length <= 1000 &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);

function invalidQuote(): never {
  throw new AssistedOrderApiError(502, "quote_unusable", "The quote could not be verified. Please refresh it.");
}

function customerQuote(value: unknown, publicReference: string): AssistedOrderCustomerQuote {
  if (!quoteRecord(value) || !quoteId(value.requestId) || value.publicReference !== publicReference ||
      !quoteId(value.quoteId) || !quoteInteger(value.version) || !quoteInteger(value.totalCents) ||
      value.totalCents > 100000000 || value.currency !== "USD" || !quoteDate(value.validUntil) ||
      !["issued", "accepted", "superseded", "withdrawn", "expired"].includes(String(value.state)) ||
      !Array.isArray(value.lines) || value.lines.length === 0 || value.lines.length > 100 ||
      !(value.customerNote === null || quoteNote(value.customerNote))) invalidQuote();
  const lines = value.lines.map((line: unknown) => {
    if (!quoteRecord(line) || !quoteId(line.lineId) || !quoteText(line.productName, 500) ||
        !line.productName.trim() || !(line.specification === null || quoteText(line.specification, 1000)) ||
        !quoteInteger(line.quantity) || line.quantity > 100 || !quoteInteger(line.unitPriceCents) ||
        !quoteInteger(line.lineTotalCents) || line.lineTotalCents !== line.unitPriceCents * line.quantity ||
        line.currency !== value.currency) invalidQuote();
    return { lineId: line.lineId, productName: line.productName, specification: line.specification ?? "",
      quantity: line.quantity, unitPriceCents: line.unitPriceCents, lineTotalCents: line.lineTotalCents,
      currency: "USD" as const };
  });
  if (new Set(lines.map((line) => line.lineId)).size !== lines.length ||
      lines.reduce((sum, line) => sum + line.lineTotalCents, 0) !== value.totalCents) invalidQuote();
  if (value.state === "accepted"
    ? !quoteId(value.acceptanceId) || !quoteDate(value.acceptedAt)
    : value.acceptanceId !== null || value.acceptedAt !== null) invalidQuote();
  return { requestId: value.requestId, publicReference, quoteId: value.quoteId, version: value.version,
    state: value.state as AssistedOrderCustomerQuote["state"], lines, totalCents: value.totalCents,
    currency: "USD", validUntil: value.validUntil, customerNote: value.customerNote as string | null,
    acceptanceId: value.acceptanceId as string | null, acceptedAt: value.acceptedAt as string | null };
}

export async function loadAssistedOrderQuote(
  publicReference: string,
  statusToken?: string,
  memberToken?: string | null,
  signal?: AbortSignal,
): Promise<AssistedOrderCustomerQuote> {
  const value = await request<unknown>(
    `/api/research/early-access/assisted-orders/${encodeURIComponent(publicReference)}/quote`,
    { cache: "no-store", redirect: "error", signal, headers: requestOwnerHeaders(statusToken, memberToken) },
  );
  return customerQuote(value, publicReference);
}

export async function acceptAssistedOrderQuote(
  publicReference: string,
  quote: Pick<AssistedOrderCustomerQuote, "quoteId" | "version" | "totalCents" | "currency">,
  statusToken?: string,
  memberToken?: string | null,
  signal?: AbortSignal,
): Promise<AssistedOrderQuoteAcceptance> {
  const value = await request<unknown>(
    `/api/research/early-access/assisted-orders/${encodeURIComponent(publicReference)}/quote/accept`,
    { method: "POST", cache: "no-store", redirect: "error", signal,
      headers: requestOwnerHeaders(statusToken, memberToken),
      // An echo of the displayed quote only. The server rechecks ownership and
      // immutable quote terms; this is neither a price override nor payment.
      body: JSON.stringify({ quoteId: quote.quoteId, version: quote.version, expectedTotalCents: quote.totalCents }) },
  );
  if (!quoteRecord(value) || value.quoteId !== quote.quoteId || value.version !== quote.version ||
      value.totalCents !== quote.totalCents || value.currency !== quote.currency ||
      !quoteId(value.acceptanceId) || !quoteDate(value.acceptedAt)) invalidQuote();
  return { quoteId: quote.quoteId, version: quote.version, totalCents: quote.totalCents,
    currency: quote.currency, acceptanceId: value.acceptanceId, acceptedAt: value.acceptedAt };
}

export function createAssistedOrderUploadTicket(
  requestId: string,
  input: AssistedOrderUploadRequest,
  statusToken?: string,
  memberToken?: string | null,
): Promise<AssistedOrderUploadTicket> {
  return request(
    `/api/research/early-access/assisted-orders/${encodeURIComponent(
      requestId,
    )}/documents/upload-url`,
    {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      body: JSON.stringify(input),
      headers: requestOwnerHeaders(statusToken, memberToken),
    },
  );
}

export async function uploadAssistedOrderDocument(
  ticket: AssistedOrderUploadTicket,
  file: File,
  completion: AssistedOrderUploadCompleteInput,
  statusToken?: string,
  memberToken?: string | null,
): Promise<void> {
  const storageHeaders = new Headers(ticket.requiredHeaders);
  // A presigned storage capability is distinct from Research identity, even
  // if a malformed ticket accidentally includes an application credential.
  storageHeaders.delete("Authorization");
  storageHeaders.delete(ASSISTED_ORDER_STATUS_TOKEN_HEADER);
  storageHeaders.set("content-type", file.type);
  const response = await fetch(ticket.uploadUrl, {
    method: "PUT",
    credentials: "omit",
    redirect: "error",
    headers: storageHeaders,
    body: file,
  });
  if (!response.ok) {
    throw new AssistedOrderApiError(
      response.status,
      "document_upload_failed",
      "The secure document upload failed.",
    );
  }
  await request(
    `/api/research/early-access/assisted-orders/${encodeURIComponent(
      ticket.objectPath.split("/")[0],
    )}/documents/${encodeURIComponent(ticket.documentId)}/complete`,
    {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      body: JSON.stringify(completion),
      headers: requestOwnerHeaders(statusToken, memberToken),
    },
  );
}

export type AssistedOrderAdminListPage = Readonly<{
  items: readonly AssistedOrderAdminListItem[];
  total: number;
  page: number;
  pageSize: number;
}>;

// Every admin call carries the Supabase session's Bearer token, mirroring the
// repo's admin doors (pages/adminx/auth.ts): the browser never grants
// authority, the server checks the token on each request.
function adminHeaders(token: string): Readonly<Record<string, string>> {
  return { authorization: `Bearer ${token}` };
}

export function loadAssistedOrderAdminList(
  token: string,
  input: {
    status?: AssistedOrderStatus;
    search?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<AssistedOrderAdminListPage> {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  if (input.search) params.set("q", input.search);
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  return request(`/api/admin/research/assisted-orders?${params.toString()}`, {
    headers: adminHeaders(token),
  });
}

export function loadAssistedOrderAdminDetail(
  token: string,
  requestId: string,
): Promise<AssistedOrderAdminDetail> {
  return request(
    `/api/admin/research/assisted-orders/${encodeURIComponent(requestId)}`,
    { headers: adminHeaders(token) },
  );
}

export function updateAssistedOrderStatus(
  token: string,
  requestId: string,
  input: AssistedOrderStatusUpdateInput,
): Promise<AssistedOrderAdminDetail> {
  return request(
    `/api/admin/research/assisted-orders/${encodeURIComponent(
      requestId,
    )}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
      headers: adminHeaders(token),
    },
  );
}

export function createAssistedOrderDocumentDownload(
  token: string,
  requestId: string,
  documentId: string,
): Promise<{ url: string; expiresAt: string }> {
  return request(
    `/api/admin/research/assisted-orders/${encodeURIComponent(
      requestId,
    )}/documents/${encodeURIComponent(documentId)}/download-url`,
    {
      method: "POST",
      body: JSON.stringify({}),
      headers: adminHeaders(token),
    },
  );
}
