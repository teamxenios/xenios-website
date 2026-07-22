// Tracker API adapters: the /api/research/member/tracker/* endpoints used by
// the Tracker page (daily log plus the export and deletion data-rights
// requests). Same discipline as member.ts: one function per endpoint, URLs
// and body shapes owned here, results in the shared ApiResult envelope.

import { apiPost, type ApiResult } from "../lib/api";

const BASE = "/api/research/member/tracker";

export type TrackerLogEntry = {
  sleepHours: number | null;
  energy: number | null;
  trainingDone: boolean;
  notes: string | null;
  loggedAt: string;
};

export function logTrackerEntry(
  entry: TrackerLogEntry,
  token?: string | null,
): Promise<ApiResult<{ logged?: boolean }>> {
  return apiPost<{ logged?: boolean }>(`${BASE}/log`, entry, token);
}

export function requestTrackerExport(
  requestedAt: string,
  token?: string | null,
): Promise<ApiResult<{ requested?: boolean }>> {
  return apiPost<{ requested?: boolean }>(`${BASE}/export-request`, { requestedAt }, token);
}

export function requestTrackerDeletion(
  requestedAt: string,
  token?: string | null,
): Promise<ApiResult<{ requested?: boolean }>> {
  return apiPost<{ requested?: boolean }>(`${BASE}/delete-request`, { requestedAt }, token);
}
