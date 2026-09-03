import type { Express, RequestHandler, Response } from "express";
import { z } from "zod";
import {
  CARE_CONTACT_METHOD_LABELS,
  CARE_CONTACT_METHOD_VALUES,
  CARE_CONTACT_WINDOW_LABELS,
  CARE_CONTACT_WINDOW_VALUES,
  CARE_GOAL_LABELS,
  CARE_GOAL_VALUES,
  CARE_MANUAL_ACCESS_SOURCE_PAGE,
  CARE_US_STATE_LABELS,
  CARE_US_STATE_VALUES,
  type CareContactMethod,
  type CareContactWindow,
  type CareGoal,
} from "@shared/care/manual-access";
import {
  CARE_MANUAL_ACCESS_ADMIN_LIST_PATH,
  careManualAccessAdminStatusUpdateSchema,
  type CareManualAccessAdminAttentionReason,
  type CareManualAccessAdminDetailResponse,
  type CareManualAccessAdminListResponse,
  type CareManualAccessAdminRecord,
  type CareManualAccessAdminSummary,
} from "@shared/care/manual-access-admin";
import {
  listLoi,
  updateLoiStatus,
  type LoiRow,
} from "../supabase-store";
import { careManualAccessReference } from "./manual-access";

const CARE_ACCESS_BUSINESS_NAME = "Xenios Care access request";
const CARE_ACCESS_SCHEMA = "xenios_care_manual_access_v1";

const careOperationsPayloadSchema = z
  .object({
    schema: z.literal(CARE_ACCESS_SCHEMA),
    locationState: z.enum(CARE_US_STATE_VALUES),
    careGoal: z.enum(CARE_GOAL_VALUES),
    contactMethod: z.enum(CARE_CONTACT_METHOD_VALUES),
    contactWindow: z.enum(CARE_CONTACT_WINDOW_VALUES),
    adultConfirmation: z.literal(true),
    boundaryAcknowledgement: z.literal(true),
    medicalFreeTextCollected: z.literal(false),
  })
  .passthrough();

type CareOperationsPayload = z.infer<typeof careOperationsPayloadSchema>;

export interface CareManualAccessAdminDependencies {
  listRequests(): Promise<LoiRow[]>;
  updateStatus(id: string, status: string): Promise<void>;
}

export function buildCareManualAccessAdminProductionDependencies(): CareManualAccessAdminDependencies {
  return {
    listRequests: listLoi,
    updateStatus: updateLoiStatus,
  };
}

function noStore(res: Response): void {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex, nofollow");
}

function adminUnavailable(res: Response) {
  return res.status(503).json({
    ok: false,
    code: "care_access_admin_unavailable",
    message: "The Care request queue is temporarily unavailable.",
  });
}

function parseRawPayload(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parsePayload(row: LoiRow): {
  parsed: CareOperationsPayload | null;
  raw: unknown;
} {
  const raw = parseRawPayload(row.why_interested);
  const parsed = careOperationsPayloadSchema.safeParse(raw);
  return { raw, parsed: parsed.success ? parsed.data : null };
}

function rawPayloadHasCareSchema(raw: unknown): boolean {
  return (
    typeof raw === "object" &&
    raw !== null &&
    !Array.isArray(raw) &&
    (raw as Record<string, unknown>).schema === CARE_ACCESS_SCHEMA
  );
}

/**
 * Current production writes all four markers. The admin projection accepts any
 * strong Care marker so a partial future schema drift becomes a visible data
 * quality warning instead of making a successfully saved request disappear.
 */
export function isCareManualAccessOperationsRow(row: LoiRow): boolean {
  const raw = parseRawPayload(row.why_interested);
  return (
    row.business_name === CARE_ACCESS_BUSINESS_NAME ||
    row.role?.startsWith("care_access:") === true ||
    rawPayloadHasCareSchema(raw) ||
    (row.source_page === CARE_MANUAL_ACCESS_SOURCE_PAGE &&
      row.landing_page === CARE_MANUAL_ACCESS_SOURCE_PAGE)
  );
}

function valueAfterPrefix(
  value: string | null | undefined,
  prefix: string,
): string | null {
  if (!value?.startsWith(prefix)) return null;
  const result = value.slice(prefix.length).trim();
  return result || null;
}

function asState(value: unknown): keyof typeof CARE_US_STATE_LABELS | null {
  return typeof value === "string" &&
    (CARE_US_STATE_VALUES as readonly string[]).includes(value)
    ? (value as keyof typeof CARE_US_STATE_LABELS)
    : null;
}

function asCareGoal(value: unknown): CareGoal | null {
  return typeof value === "string" &&
    (CARE_GOAL_VALUES as readonly string[]).includes(value)
    ? (value as CareGoal)
    : null;
}

function asContactMethod(value: unknown): CareContactMethod | null {
  return typeof value === "string" &&
    (CARE_CONTACT_METHOD_VALUES as readonly string[]).includes(value)
    ? (value as CareContactMethod)
    : null;
}

function asContactWindow(value: unknown): CareContactWindow | null {
  return typeof value === "string" &&
    (CARE_CONTACT_WINDOW_VALUES as readonly string[]).includes(value)
    ? (value as CareContactWindow)
    : null;
}

function safeReference(id: string): string {
  try {
    return careManualAccessReference(id);
  } catch {
    return `CARE-${id.slice(0, 8).toUpperCase()}`;
  }
}

export function projectCareManualAccessAdminRecord(
  row: LoiRow,
): CareManualAccessAdminRecord {
  const { parsed } = parsePayload(row);
  const locationState = asState(parsed?.locationState);
  const careGoal =
    asCareGoal(parsed?.careGoal) ??
    asCareGoal(valueAfterPrefix(row.role, "care_access:"));
  const contactMethod =
    asContactMethod(parsed?.contactMethod) ??
    asContactMethod(valueAfterPrefix(row.url_or_handle, "preferred_contact:"));
  const contactWindow =
    asContactWindow(parsed?.contactWindow) ??
    asContactWindow(valueAfterPrefix(row.client_count, "contact_window:"));

  const markersAreComplete =
    row.business_name === CARE_ACCESS_BUSINESS_NAME &&
    row.source_page === CARE_MANUAL_ACCESS_SOURCE_PAGE &&
    row.landing_page === CARE_MANUAL_ACCESS_SOURCE_PAGE &&
    row.role?.startsWith("care_access:") === true;
  const dataQuality = parsed && markersAreComplete ? "valid" : "malformed";
  const status = row.status?.trim() || "New";
  const emailStatus = row.email_status?.trim() || null;
  const attentionReasons: CareManualAccessAdminAttentionReason[] = [];

  if (status === "New") attentionReasons.push("new_request");
  if (emailStatus === "failed") attentionReasons.push("notification_failed");
  if (emailStatus !== "sent" && emailStatus !== "failed") {
    attentionReasons.push("notification_state_unknown");
  }
  if (dataQuality === "malformed") {
    attentionReasons.push("malformed_operational_payload");
  }

  return {
    id: row.id,
    reference: safeReference(row.id),
    fullName: row.name?.trim() || "Name unavailable",
    email: row.email?.trim().toLowerCase() || "",
    phone: row.phone?.trim() || null,
    locationState,
    locationStateLabel: locationState
      ? CARE_US_STATE_LABELS[locationState]
      : "Needs review",
    careGoal,
    careGoalLabel: careGoal ? CARE_GOAL_LABELS[careGoal] : "Needs review",
    contactMethod,
    contactMethodLabel: contactMethod
      ? CARE_CONTACT_METHOD_LABELS[contactMethod]
      : "Needs review",
    contactWindow,
    contactWindowLabel: contactWindow
      ? CARE_CONTACT_WINDOW_LABELS[contactWindow]
      : "Needs review",
    status,
    emailStatus,
    createdAt: row.created_at,
    dataQuality,
    attentionRequired: attentionReasons.length > 0,
    attentionReasons,
  };
}

export function summarizeCareManualAccessAdminRecords(
  requests: CareManualAccessAdminRecord[],
): CareManualAccessAdminSummary {
  return {
    total: requests.length,
    newCount: requests.filter((request) => request.status === "New").length,
    notificationFailureCount: requests.filter(
      (request) => request.emailStatus === "failed",
    ).length,
    notificationUnknownCount: requests.filter(
      (request) =>
        request.emailStatus !== "sent" && request.emailStatus !== "failed",
    ).length,
    dataQualityIssueCount: requests.filter(
      (request) => request.dataQuality === "malformed",
    ).length,
    attentionRequiredCount: requests.filter(
      (request) => request.attentionRequired,
    ).length,
  };
}

async function loadCareRows(
  deps: CareManualAccessAdminDependencies,
): Promise<Array<{ row: LoiRow; request: CareManualAccessAdminRecord }>> {
  const rows = await deps.listRequests();
  return rows
    .filter(isCareManualAccessOperationsRow)
    .map((row) => ({ row, request: projectCareManualAccessAdminRecord(row) }))
    .sort(
      (left, right) =>
        new Date(right.request.createdAt).getTime() -
        new Date(left.request.createdAt).getTime(),
    );
}

function findRequest(
  requests: Array<{ row: LoiRow; request: CareManualAccessAdminRecord }>,
  lookup: string,
) {
  const normalized = lookup.trim().toUpperCase();
  return requests.find(
    ({ row, request }) =>
      row.id === lookup || request.reference.toUpperCase() === normalized,
  );
}

export function registerCareManualAccessAdminApi(
  app: Express,
  requireAdmin: RequestHandler,
  deps: CareManualAccessAdminDependencies =
    buildCareManualAccessAdminProductionDependencies(),
): void {
  // Literal paths on purpose: the release route census scans source and must
  // see every reachable door; the shared constant is asserted equal in tests.
  app.get(
    "/api/admin/care/access-requests",
    requireAdmin,
    async (_req, res) => {
      noStore(res);
      try {
        const projected = await loadCareRows(deps);
        const requests = projected.map(({ request }) => request);
        const response: CareManualAccessAdminListResponse = {
          ok: true,
          requests,
          summary: summarizeCareManualAccessAdminRecords(requests),
        };
        return res.json(response);
      } catch (error) {
        console.error("[care-access-admin] failed to load request queue", {
          error: error instanceof Error ? error.message : "unknown_error",
        });
        return adminUnavailable(res);
      }
    },
  );

  app.get(
    "/api/admin/care/access-requests/:requestId",
    requireAdmin,
    async (req, res) => {
      noStore(res);
      try {
        const match = findRequest(await loadCareRows(deps), String(req.params.requestId));
        if (!match) {
          return res.status(404).json({
            ok: false,
            code: "care_access_request_not_found",
            message: "That Care request could not be found.",
          });
        }
        const response: CareManualAccessAdminDetailResponse = {
          ok: true,
          request: match.request,
        };
        return res.json(response);
      } catch (error) {
        console.error("[care-access-admin] failed to load request detail", {
          error: error instanceof Error ? error.message : "unknown_error",
        });
        return adminUnavailable(res);
      }
    },
  );

  app.patch(
    "/api/admin/care/access-requests/:requestId/status",
    requireAdmin,
    async (req, res) => {
      noStore(res);
      const parsed = careManualAccessAdminStatusUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          code: "invalid_care_access_status",
          message: "Choose an approved Care request status.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        });
      }

      try {
        const current = findRequest(
          await loadCareRows(deps),
          String(req.params.requestId),
        );
        if (!current) {
          return res.status(404).json({
            ok: false,
            code: "care_access_request_not_found",
            message: "That Care request could not be found.",
          });
        }

        await deps.updateStatus(current.row.id, parsed.data.status);
        const response: CareManualAccessAdminDetailResponse = {
          ok: true,
          request: projectCareManualAccessAdminRecord({
            ...current.row,
            status: parsed.data.status,
          }),
        };
        return res.json(response);
      } catch (error) {
        console.error("[care-access-admin] failed to update request status", {
          error: error instanceof Error ? error.message : "unknown_error",
        });
        return adminUnavailable(res);
      }
    },
  );
}
