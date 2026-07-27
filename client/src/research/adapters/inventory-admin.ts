import type {
  CoaUploadGrant,
  CoaUploadCancellation,
  CoaUploadPreparation,
  InventoryLotAdmin,
  InventoryMovementAdmin,
  InventoryMovementCommand,
  LotQualityAccessPurpose,
  LotQualityDocumentAdmin,
  LotQualityTestAdmin,
} from "@shared/research/inventory-admin";
import { apiGet, apiPost, type ApiResult } from "../lib/api";

const BASE = "/api/admin/research";
const enc = encodeURIComponent;

export function listInventoryLots(
  token: string,
): Promise<ApiResult<{ ok: true; lots: InventoryLotAdmin[] }>> {
  return apiGet(`${BASE}/inventory/lots`, token);
}

export function createInventoryLot(
  token: string,
  body: unknown,
): Promise<ApiResult<{ ok: true; lot: InventoryLotAdmin }>> {
  return apiPost(`${BASE}/inventory/lots`, body, token);
}

export function listInventoryMovements(
  token: string,
  lotId?: string,
): Promise<ApiResult<{ ok: true; movements: InventoryMovementAdmin[] }>> {
  return apiGet(
    `${BASE}/inventory/movements${lotId ? `?lotId=${enc(lotId)}` : ""}`,
    token,
  );
}

export function applyInventoryMovement(
  token: string,
  lotId: string,
  body: InventoryMovementCommand,
): Promise<ApiResult<{ ok: true; result: Record<string, unknown> }>> {
  return apiPost(`${BASE}/inventory/lots/${enc(lotId)}/movements`, body, token);
}

export function setInventoryLotDisposition(
  token: string,
  lotId: string,
  body: unknown,
): Promise<ApiResult<{ ok: true; result: Record<string, unknown> }>> {
  return apiPost(`${BASE}/inventory/lots/${enc(lotId)}/disposition`, body, token);
}

export function listLotQualityDocuments(
  token: string,
): Promise<ApiResult<{ ok: true; documents: LotQualityDocumentAdmin[] }>> {
  return apiGet(`${BASE}/lot-quality-documents`, token);
}

export function prepareCoaUpload(
  token: string,
  body: CoaUploadPreparation,
): Promise<ApiResult<{ ok: true; upload: CoaUploadGrant }>> {
  return apiPost(`${BASE}/lot-quality-documents/upload`, body, token);
}

export function cancelCoaUpload(
  token: string,
  body: CoaUploadCancellation,
): Promise<ApiResult<{ ok: true; result: Record<string, unknown> }>> {
  return apiPost(`${BASE}/lot-quality-documents/upload/cancel`, body, token);
}

export async function putPrivateCoaFile(uploadUrl: string, file: File): Promise<boolean> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  });
  return response.ok;
}

export function confirmCoaUpload(
  token: string,
  documentId: string,
  body: { expectedVersion: number; idempotencyKey: string },
): Promise<ApiResult<{ ok: true; result: Record<string, unknown> }>> {
  return apiPost(
    `${BASE}/lot-quality-documents/${enc(documentId)}/confirm`,
    body,
    token,
  );
}

export function reviewLotQualityDocument(
  token: string,
  documentId: string,
  body: {
    action: "approve" | "reject" | "publish" | "withdraw";
    expectedVersion: number;
    idempotencyKey: string;
    reason: string;
    tests: LotQualityTestAdmin[];
  },
): Promise<ApiResult<{ ok: true; result: Record<string, unknown> }>> {
  return apiPost(
    `${BASE}/lot-quality-documents/${enc(documentId)}/review`,
    body,
    token,
  );
}

export function requestCoaReadGrant(
  token: string,
  documentId: string,
  purpose: LotQualityAccessPurpose,
): Promise<ApiResult<{ ok: true; grant: { signedUrl: string; expiresAt: string } }>> {
  return apiPost(
    `${BASE}/lot-quality-documents/${enc(documentId)}/file-access`,
    { purpose },
    token,
  );
}

export async function sha256Hex(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
