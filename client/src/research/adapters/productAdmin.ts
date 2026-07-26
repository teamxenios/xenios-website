import type {
  AdminProductDetail,
  AdminProductListFilters,
  AdminProductSummary,
  CreateAdminPriceInput,
  CreateAdminProductInput,
  CreateAdminVariantInput,
  DuplicateAdminProductInput,
  PrepareAdminMediaInput,
  UpdateAdminProductInput,
  UpdateAdminVariantInput,
} from "@shared/research/product-admin";
import { apiGet, type ApiResult } from "../lib/api";
import { uploadFileToGrant } from "./activation";

const BASE = "/api/admin/research/products";
const enc = encodeURIComponent;

function query(filters: AdminProductListFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.lane) params.set("lane", filters.lane);
  if (filters.visibility) params.set("visibility", filters.visibility);
  if (filters.status) params.set("status", filters.status);
  if (filters.commerceApproval) {
    params.set("commerceApproval", filters.commerceApproval);
  }
  if (filters.qualityDocumentState) {
    params.set("qualityDocumentState", filters.qualityDocumentState);
  }
  if (filters.missingInputsOnly) params.set("missingInputs", "true");
  const value = params.toString();
  return value ? `?${value}` : "";
}

export function listAdminProducts(
  token: string,
  filters: AdminProductListFilters = {},
): Promise<ApiResult<{ ok: true; products: AdminProductSummary[] }>> {
  return apiGet(`${BASE}${query(filters)}`, token);
}

export function getAdminProduct(
  token: string,
  productId: string,
): Promise<ApiResult<{ ok: true; product: AdminProductDetail }>> {
  return apiGet(`${BASE}/${enc(productId)}`, token);
}

async function mutate<T>(
  token: string,
  method: "POST" | "PUT",
  path: string,
  body: unknown,
  idempotencyKey: string,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (response.status === 401) {
      return { kind: "unauthorized", code: payload?.code };
    }
    if (response.status === 403) {
      return typeof payload?.code === "string"
        ? {
            kind: "denied",
            code: payload.code,
            message: payload.message,
          }
        : { kind: "forbidden", message: payload?.message };
    }
    if (response.status === 404 || response.status === 501 || response.status === 503) {
      return { kind: "unavailable" };
    }
    if (payload?.ok === false && typeof payload.code === "string") {
      return {
        kind: "denied",
        code: payload.code,
        message: payload.message,
      };
    }
    if (!response.ok || !payload) {
      return {
        kind: "error",
        code: payload?.code,
        message: payload?.message ?? "The product update could not be saved.",
      };
    }
    return { kind: "ok", data: payload as T };
  } catch {
    return {
      kind: "error",
      message: "The connection failed. Please try again.",
    };
  }
}

export function createAdminProduct(
  token: string,
  input: CreateAdminProductInput,
  idempotencyKey: string,
): Promise<ApiResult<{ ok: true; product: AdminProductDetail }>> {
  return mutate(token, "POST", BASE, input, idempotencyKey);
}

export function updateAdminProduct(
  token: string,
  productId: string,
  input: UpdateAdminProductInput,
  idempotencyKey: string,
): Promise<ApiResult<{ ok: true; product: AdminProductDetail }>> {
  return mutate(
    token,
    "PUT",
    `${BASE}/${enc(productId)}`,
    input,
    idempotencyKey,
  );
}

export function transitionAdminProduct(
  token: string,
  productId: string,
  action: "archive" | "restore" | "publish" | "unpublish",
  reason: string,
  idempotencyKey: string,
): Promise<ApiResult<{ ok: true; product: AdminProductDetail }>> {
  return mutate(
    token,
    "POST",
    `${BASE}/${enc(productId)}/${action}`,
    { reason },
    idempotencyKey,
  );
}

export function duplicateAdminProduct(
  token: string,
  productId: string,
  input: DuplicateAdminProductInput,
  idempotencyKey: string,
): Promise<ApiResult<{ ok: true; product: AdminProductDetail }>> {
  return mutate(
    token,
    "POST",
    `${BASE}/${enc(productId)}/duplicate`,
    input,
    idempotencyKey,
  );
}

export function createAdminVariant(
  token: string,
  productId: string,
  input: CreateAdminVariantInput,
  idempotencyKey: string,
): Promise<ApiResult<{ ok: true; product: AdminProductDetail }>> {
  return mutate(
    token,
    "POST",
    `${BASE}/${enc(productId)}/variants`,
    input,
    idempotencyKey,
  );
}

export function updateAdminVariant(
  token: string,
  productId: string,
  variantId: string,
  input: UpdateAdminVariantInput,
  idempotencyKey: string,
): Promise<ApiResult<{ ok: true; product: AdminProductDetail }>> {
  return mutate(
    token,
    "PUT",
    `${BASE}/${enc(productId)}/variants/${enc(variantId)}`,
    input,
    idempotencyKey,
  );
}

export function createAdminPrice(
  token: string,
  productId: string,
  input: CreateAdminPriceInput,
  idempotencyKey: string,
): Promise<ApiResult<{ ok: true; product: AdminProductDetail }>> {
  return mutate(
    token,
    "POST",
    `${BASE}/${enc(productId)}/prices`,
    input,
    idempotencyKey,
  );
}

export function approveAdminPrice(
  token: string,
  productId: string,
  priceId: string,
  idempotencyKey: string,
): Promise<ApiResult<{ ok: true; product: AdminProductDetail }>> {
  return mutate(
    token,
    "POST",
    `${BASE}/${enc(productId)}/prices/${enc(priceId)}/approve`,
    {},
    idempotencyKey,
  );
}

export function updateAdminMedia(
  token: string,
  productId: string,
  mediaId: string,
  input: {
    state: "in_review" | "approved" | "rejected" | "archived";
    altText: string;
    sortOrder: number;
    reason?: string | null;
  },
  idempotencyKey: string,
): Promise<ApiResult<{ ok: true; product: AdminProductDetail }>> {
  return mutate(
    token,
    "PUT",
    `${BASE}/${enc(productId)}/media/${enc(mediaId)}`,
    input,
    idempotencyKey,
  );
}

export async function uploadAdminMedia(
  token: string,
  productId: string,
  file: File,
  input: Omit<PrepareAdminMediaInput, "filename" | "contentType" | "sizeBytes">,
): Promise<ApiResult<{ ok: true; product: AdminProductDetail }>> {
  const prepared = await mutate<{
    ok: true;
    media: { id: string };
    uploadUrl: string;
    expiresAt: string;
  }>(
    token,
    "POST",
    `${BASE}/${enc(productId)}/media/upload`,
    {
      ...input,
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    },
    newMutationKey("prepare-media"),
  );
  if (prepared.kind !== "ok") return prepared;

  const uploaded = await uploadFileToGrant(
    prepared.data.uploadUrl,
    file,
    file.type,
  );
  if (!uploaded) {
    return {
      kind: "error",
      code: "private_upload_failed",
      message: "The private product image upload did not complete. Try again.",
    };
  }

  return mutate(
    token,
    "POST",
    `${BASE}/${enc(productId)}/media/${enc(prepared.data.media.id)}/confirm`,
    {},
    newMutationKey("confirm-media"),
  );
}

export function newMutationKey(scope: string): string {
  return `${scope}:${crypto.randomUUID()}`;
}
