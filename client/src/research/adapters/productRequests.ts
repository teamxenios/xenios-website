import type {
  AdminProductRequestSummary,
  MemberProductRequest,
  ProductRequestAnalytics,
  ProductRequestCreateInput,
  ProductRequestPriority,
  ProductRequestStatus,
} from "@shared/research/product-requests";
import { apiDelete, apiGet, apiPatch, apiPost, type ApiResult } from "../lib/api";

const MEMBER_BASE = "/api/research/member/product-requests";
const ADMIN_BASE = "/api/admin/research/product-requests";
const enc = encodeURIComponent;

export function listMemberProductRequests(
  token?: string | null,
): Promise<ApiResult<{ ok: boolean; requests: MemberProductRequest[] }>> {
  return apiGet(MEMBER_BASE, token);
}

export function getMemberProductRequest(
  reference: string,
  token?: string | null,
): Promise<ApiResult<{ ok: boolean; request: MemberProductRequest }>> {
  return apiGet(`${MEMBER_BASE}/${enc(reference)}`, token);
}

export function createProductRequest(
  input: ProductRequestCreateInput,
  token?: string | null,
): Promise<ApiResult<{ ok: boolean; request: MemberProductRequest }>> {
  return apiPost(MEMBER_BASE, input, token);
}

export function withdrawProductRequest(
  reference: string,
  expectedVersion: number,
  token?: string | null,
): Promise<ApiResult<{ ok: boolean; request: MemberProductRequest }>> {
  return apiPost(`${MEMBER_BASE}/${enc(reference)}/withdraw`, { expectedVersion }, token);
}

export function addProductRequestMessage(
  reference: string,
  expectedVersion: number,
  message: string,
  token?: string | null,
): Promise<ApiResult<{ ok: boolean; request: MemberProductRequest }>> {
  return apiPost(`${MEMBER_BASE}/${enc(reference)}/messages`, { expectedVersion, message }, token);
}

export type ProductRequestUploadGrant = {
  file: MemberProductRequest["files"][number];
  grant: { uploadUrl: string; expiresAt: string; maxBytes: number };
};

export function requestProductFileUpload(
  reference: string,
  file: File,
  token?: string | null,
): Promise<ApiResult<{ ok: boolean } & ProductRequestUploadGrant>> {
  return apiPost(
    `${MEMBER_BASE}/${enc(reference)}/files/upload`,
    {
      originalFilename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    },
    token,
  );
}

export async function uploadProductRequestFile(uploadUrl: string, file: File): Promise<boolean> {
  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function confirmProductRequestFile(
  reference: string,
  fileId: string,
  token?: string | null,
): Promise<ApiResult<{ ok: boolean; file: MemberProductRequest["files"][number] }>> {
  return apiPost(`${MEMBER_BASE}/${enc(reference)}/files/${enc(fileId)}/confirm`, {}, token);
}

export function removeProductRequestFile(
  reference: string,
  fileId: string,
  token?: string | null,
): Promise<ApiResult<{ ok: boolean }>> {
  return apiDelete(`${MEMBER_BASE}/${enc(reference)}/files/${enc(fileId)}`, token);
}

export function getProductRequestFileAccess(
  reference: string,
  fileId: string,
  token?: string | null,
): Promise<ApiResult<{ ok: boolean; signedUrl: string; expiresAt: string }>> {
  return apiGet(`${MEMBER_BASE}/${enc(reference)}/files/${enc(fileId)}/access`, token);
}

export type AdminProductRequestFilters = {
  status?: string;
  category?: string;
  priority?: string;
  owner?: string;
  search?: string;
};

export function listAdminProductRequests(
  token: string,
  filters: AdminProductRequestFilters = {},
): Promise<ApiResult<{ ok: boolean; requests: AdminProductRequestSummary[] }>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const suffix = query.size ? `?${query.toString()}` : "";
  return apiGet(`${ADMIN_BASE}${suffix}`, token);
}

export function getAdminProductRequest<T>(
  token: string,
  requestId: string,
): Promise<ApiResult<{ ok: boolean; request: T }>> {
  return apiGet(`${ADMIN_BASE}/${enc(requestId)}`, token);
}

export function updateAdminProductRequest(
  token: string,
  requestId: string,
  input: {
    expectedVersion: number;
    status?: ProductRequestStatus;
    priority?: ProductRequestPriority;
    assignedOwner?: string | null;
    memberVisibleUpdate?: string | null;
    internalNote?: string | null;
    linkedProductRef?: string | null;
    candidateId?: string | null;
  },
): Promise<ApiResult<{ ok: boolean; request: unknown; message: string }>> {
  return apiPatch(`${ADMIN_BASE}/${enc(requestId)}`, input, token);
}

export function getProductRequestAnalytics(
  token: string,
): Promise<ApiResult<{ ok: boolean; analytics: ProductRequestAnalytics }>> {
  return apiGet(`${ADMIN_BASE}/analytics`, token);
}

export function getAdminProductRequestFileAccess(
  token: string,
  requestId: string,
  fileId: string,
): Promise<ApiResult<{ ok: boolean; signedUrl: string; expiresAt: string }>> {
  return apiGet(`${ADMIN_BASE}/${enc(requestId)}/files/${enc(fileId)}/access`, token);
}
