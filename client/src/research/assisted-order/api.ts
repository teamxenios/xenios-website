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
  AssistedOrderUploadRequest,
  AssistedOrderUploadTicket,
} from "../../../../shared/research/assisted-order/contract";
import {
  parseAssistedOrderConfig,
  type AssistedOrderWizardConfig,
} from "./wizard-state";

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
  if (query.workflowMode) params.set("workflowMode", query.workflowMode);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const value = params.toString();
  return value ? `?${value}` : "";
}

export function loadAssistedOrderCatalog(
  query: AssistedOrderCatalogQuery,
): Promise<AssistedOrderCatalogPage> {
  return request(
    `/api/research/early-access/assisted-orders/catalog${queryString(query)}`,
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
): Promise<AssistedOrderStatusView> {
  const params = new URLSearchParams();
  if (statusToken) params.set("token", statusToken);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request(
    `/api/research/early-access/assisted-orders/${encodeURIComponent(
      publicReference,
    )}${suffix}`,
  );
}

export function createAssistedOrderUploadTicket(
  requestId: string,
  input: AssistedOrderUploadRequest,
): Promise<AssistedOrderUploadTicket> {
  return request(
    `/api/research/early-access/assisted-orders/${encodeURIComponent(
      requestId,
    )}/documents/upload-url`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function uploadAssistedOrderDocument(
  ticket: AssistedOrderUploadTicket,
  file: File,
  authorization: { publicReference: string; statusToken?: string },
): Promise<void> {
  const response = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: {
      ...ticket.requiredHeaders,
      "content-type": file.type,
    },
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
    { method: "POST", body: JSON.stringify(authorization) },
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
