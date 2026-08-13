import { apiGet, apiPost, type ApiResult } from "../lib/api";
import type {
  AdminCrmSupplierOperationsSnapshot,
  QueueAdminCrmActionInput,
  QueuedAdminCrmAction,
} from "@shared/research/admin-crm-supplier-operations";

export const ADMIN_CRM_SUPPLIER_OPERATIONS_PATH = "/api/admin/research/crm-supplier-operations";

export function getAdminCrmSupplierOperations(
  token: string,
): Promise<ApiResult<{ ok: true; snapshot: AdminCrmSupplierOperationsSnapshot }>> {
  return apiGet(ADMIN_CRM_SUPPLIER_OPERATIONS_PATH, token);
}

export function queueAdminCrmSupplierAction(
  token: string,
  input: QueueAdminCrmActionInput,
): Promise<ApiResult<{ ok: true; queued: QueuedAdminCrmAction }>> {
  return apiPost(`${ADMIN_CRM_SUPPLIER_OPERATIONS_PATH}/actions`, input, token);
}

export function adminCrmIdempotencyKey(action: string, targetId: string): string {
  const nonce = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `admin-crm:${action}:${targetId}:${nonce}`;
}
