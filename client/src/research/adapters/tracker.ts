import {
  OBSERVATION_SOURCES,
  TRACKER_METRIC_KEYS,
  type ObservationSource,
  type TrackerObservation,
  type TrackerObservationInput,
  type TrackerMetricKey,
  type TrackerProgressView,
} from "@shared/research/member-platform";
import { apiGet, apiPost, type ApiResult } from "../lib/api";

export type TrackerWindowDays = 7 | 30 | 90;

export type TrackerProgressResponse = {
  ok: true;
  progress: TrackerProgressView;
};

export type TrackerObservationResponse = {
  ok: true;
  observation: TrackerObservation;
};

const TRACKER_WINDOWS: readonly TrackerWindowDays[] = [7, 30, 90];
const TRACKER_CONFIDENCE = ["low", "medium", "high"] as const;

export async function getTrackerProgress(
  windowDays: TrackerWindowDays,
  token?: string | null,
): Promise<ApiResult<TrackerProgressResponse>> {
  const result = await apiGet<unknown>(
    `/api/research/tracker?windowDays=${windowDays}`,
    token,
  );
  if (result.kind !== "ok") return result;
  if (!progressResponseValid(result.data, windowDays)) {
    return invalidTrackerResponse();
  }
  return { kind: "ok", data: result.data };
}

export async function recordTrackerObservation(
  input: TrackerObservationInput,
  token?: string | null,
): Promise<ApiResult<TrackerObservationResponse>> {
  const result = await apiPost<unknown>(
    "/api/research/tracker",
    input,
    token,
  );
  if (result.kind !== "ok") return result;
  if (
    !observationResponseValid(result.data) ||
    result.data.observation.metricKey !== input.metricKey
  ) {
    return invalidTrackerResponse();
  }
  return { kind: "ok", data: result.data };
}

function invalidTrackerResponse(): ApiResult<never> {
  return {
    kind: "error",
    code: "invalid_tracker_response",
    message: "The tracker returned an invalid response.",
  };
}

function progressResponseValid(
  value: unknown,
  requestedWindow: TrackerWindowDays,
): value is TrackerProgressResponse {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.progress)) {
    return false;
  }
  const progress = value.progress;
  if (
    typeof progress.unlocked !== "boolean" ||
    !isTrackerWindow(progress.windowDays) ||
    progress.windowDays !== requestedWindow ||
    !Array.isArray(progress.metrics)
  ) {
    return false;
  }

  const metricKeys = new Set<TrackerMetricKey>();
  for (const metric of progress.metrics) {
    if (!isRecord(metric) || !isTrackerMetricKey(metric.metricKey)) {
      return false;
    }
    const metricKey = metric.metricKey;
    if (
      metricKeys.has(metricKey) ||
      typeof metric.textSummary !== "string" ||
      !Array.isArray(metric.observations) ||
      !metric.observations.every((observation) =>
        observationValid(observation, metricKey),
      )
    ) {
      return false;
    }
    metricKeys.add(metricKey);
  }
  return true;
}

function observationResponseValid(
  value: unknown,
): value is TrackerObservationResponse {
  return (
    isRecord(value) &&
    value.ok === true &&
    observationValid(value.observation)
  );
}

function observationValid(
  value: unknown,
  expectedMetricKey?: TrackerMetricKey,
): value is TrackerObservation {
  if (!isRecord(value) || !isTrackerMetricKey(value.metricKey)) return false;
  return (
    (expectedMetricKey === undefined || value.metricKey === expectedMetricKey) &&
    typeof value.observationId === "string" &&
    isObservationSource(value.source) &&
    typeof value.recordedAt === "string" &&
    typeof value.timezone === "string" &&
    nullableString(value.unit) &&
    (typeof value.originalValue === "string" ||
      finiteNumber(value.originalValue)) &&
    (value.normalizedValue === null || finiteNumber(value.normalizedValue)) &&
    isTrackerConfidence(value.confidence) &&
    nullableString(value.notes) &&
    nullableString(value.planId) &&
    typeof value.createdAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTrackerWindow(value: unknown): value is TrackerWindowDays {
  return TRACKER_WINDOWS.some((window) => window === value);
}

function isTrackerMetricKey(value: unknown): value is TrackerMetricKey {
  return TRACKER_METRIC_KEYS.some((metricKey) => metricKey === value);
}

function isObservationSource(value: unknown): value is ObservationSource {
  return OBSERVATION_SOURCES.some((source) => source === value);
}

function isTrackerConfidence(
  value: unknown,
): value is TrackerObservation["confidence"] {
  return TRACKER_CONFIDENCE.some((confidence) => confidence === value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
