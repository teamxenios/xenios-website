import { z } from "zod";

export const CARE_MANUAL_ACCESS_ADMIN_LIST_PATH =
  "/api/admin/care/access-requests";

export const CARE_MANUAL_ACCESS_ADMIN_STATUSES = [
  "New",
  "Contacted",
  "Secure intake sent",
  "Provider handoff",
  "Closed",
  "Not moving forward",
] as const;

export type CareManualAccessAdminStatus =
  (typeof CARE_MANUAL_ACCESS_ADMIN_STATUSES)[number];

export const careManualAccessAdminStatusSchema = z.enum(
  CARE_MANUAL_ACCESS_ADMIN_STATUSES,
);

export const careManualAccessAdminStatusUpdateSchema = z
  .object({
    status: careManualAccessAdminStatusSchema,
  })
  .strict();

export function careManualAccessAdminDetailPath(id: string): string {
  return `${CARE_MANUAL_ACCESS_ADMIN_LIST_PATH}/${encodeURIComponent(id)}`;
}

export function careManualAccessAdminStatusPath(id: string): string {
  return `${careManualAccessAdminDetailPath(id)}/status`;
}

export type CareManualAccessAdminDataQuality = "valid" | "malformed";

export type CareManualAccessAdminAttentionReason =
  | "new_request"
  | "notification_failed"
  | "notification_state_unknown"
  | "malformed_operational_payload";

export type CareManualAccessAdminRecord = Readonly<{
  id: string;
  reference: string;
  fullName: string;
  email: string;
  phone: string | null;
  locationState: string | null;
  locationStateLabel: string;
  careGoal: string | null;
  careGoalLabel: string;
  contactMethod: string | null;
  contactMethodLabel: string;
  contactWindow: string | null;
  contactWindowLabel: string;
  status: string;
  emailStatus: string | null;
  createdAt: string;
  dataQuality: CareManualAccessAdminDataQuality;
  attentionRequired: boolean;
  attentionReasons: CareManualAccessAdminAttentionReason[];
}>;

export type CareManualAccessAdminSummary = Readonly<{
  total: number;
  newCount: number;
  notificationFailureCount: number;
  notificationUnknownCount: number;
  dataQualityIssueCount: number;
  attentionRequiredCount: number;
}>;

export type CareManualAccessAdminListResponse = Readonly<{
  ok: true;
  requests: CareManualAccessAdminRecord[];
  summary: CareManualAccessAdminSummary;
}>;

export type CareManualAccessAdminDetailResponse = Readonly<{
  ok: true;
  request: CareManualAccessAdminRecord;
}>;
