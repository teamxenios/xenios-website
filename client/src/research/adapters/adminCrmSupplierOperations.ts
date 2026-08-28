import { apiGet, apiPost, type ApiResult } from "../lib/api";
import type {
  AdminCrmAction,
  AdminCrmActionRecommendation,
  AdminCrmSupplierOperationsSnapshot,
  AdminCrmRecommendationInput,
} from "@shared/research/admin-crm-supplier-operations";

export const ADMIN_CRM_SUPPLIER_OPERATIONS_PATH = "/api/admin/research/crm-supplier-operations";

export function getAdminCrmSupplierOperations(
  token: string,
): Promise<ApiResult<{ ok: true; snapshot: AdminCrmSupplierOperationsSnapshot }>> {
  return apiGet(ADMIN_CRM_SUPPLIER_OPERATIONS_PATH, token);
}

export function recordAdminCrmRecommendation(
  token: string,
  input: AdminCrmRecommendationInput,
): Promise<ApiResult<{ ok: true; recommendation: AdminCrmActionRecommendation }>> {
  return apiPost(`${ADMIN_CRM_SUPPLIER_OPERATIONS_PATH}/actions`, input, token);
}

export function adminCrmIdempotencyKey(action: AdminCrmAction, targetId: string): string {
  const nonce = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < targetId.length; index += 1) {
    hash ^= targetId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const fingerprint = (hash >>> 0).toString(16).padStart(8, "0");
  return `admin-crm:${action}:${targetId.slice(0, 48)}:${fingerprint}:${nonce}`;
}
