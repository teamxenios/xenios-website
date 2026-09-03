import {
  CARE_MANUAL_ACCESS_ADMIN_LIST_PATH,
  careManualAccessAdminStatusPath,
  type CareManualAccessAdminDetailResponse,
  type CareManualAccessAdminListResponse,
  type CareManualAccessAdminStatus,
} from "@shared/care/manual-access-admin";
import { apiGet, apiPatch, type ApiResult } from "../lib/api";

export function listCareAccessRequests(
  token: string,
): Promise<ApiResult<CareManualAccessAdminListResponse>> {
  return apiGet(CARE_MANUAL_ACCESS_ADMIN_LIST_PATH, token);
}

export function updateCareAccessRequestStatus(
  token: string,
  requestId: string,
  status: CareManualAccessAdminStatus,
): Promise<ApiResult<CareManualAccessAdminDetailResponse>> {
  return apiPatch(
    careManualAccessAdminStatusPath(requestId),
    { status },
    token,
  );
}
