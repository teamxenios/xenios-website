export const TEBRA_SCHEDULING_FAILURE_CODES = [
  "care_disabled",
  "tebra_unconfigured",
  "tebra_configuration_invalid",
  "tebra_unavailable",
] as const;

export type TebraSchedulingFailureCode =
  (typeof TEBRA_SCHEDULING_FAILURE_CODES)[number];

export interface TebraSchedulingRequest {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
}

export interface TebraSchedulingTransport {
  createAppointment(
    endpoint: URL,
    apiKey: string,
    request: TebraSchedulingRequest,
  ): Promise<{ externalAppointmentId: string }>;
}

export type LoadTebraCareCapability = () => Promise<CareCapabilityStatus>;

export type TebraSchedulingResult =
  | { ok: true; externalAppointmentId: string }
  | {
      ok: false;
      code: TebraSchedulingFailureCode;
      fallback: "concierge_required";
    };

interface ReadyConfiguration {
  state: "ready";
  endpoint: URL;
  apiKey: string;
}

type TebraSchedulingConfiguration =
  | ReadyConfiguration
  | { state: "care_disabled" | "unconfigured" | "invalid" };

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function parseConfiguration(env: NodeJS.ProcessEnv): TebraSchedulingConfiguration {
  if (env.CARE_ENABLED !== "true" || env.CARE_ENABLE_APPROVED !== "true") {
    return { state: "care_disabled" };
  }
  if (env.CARE_TEBRA_SCHEDULING_ENABLED !== "true") {
    return { state: "unconfigured" };
  }
  if (!env.CARE_TEBRA_BASE_URL || !env.CARE_TEBRA_API_KEY) {
    return { state: "unconfigured" };
  }

  try {
    const endpoint = new URL("/v1/appointments", env.CARE_TEBRA_BASE_URL);
    const configured = new URL(env.CARE_TEBRA_BASE_URL);
    if (
      configured.protocol !== "https:" ||
      configured.username ||
      configured.password ||
      configured.search ||
      configured.hash ||
      configured.pathname !== "/"
    ) {
      return { state: "invalid" };
    }
    return { state: "ready", endpoint, apiKey: env.CARE_TEBRA_API_KEY };
  } catch {
    return { state: "invalid" };
  }
}

function unavailable(code: TebraSchedulingFailureCode): TebraSchedulingResult {
  return { ok: false, code, fallback: "concierge_required" };
}

const RFC3339_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

function strictRfc3339Instant(value: string): number | null {
  const match = RFC3339_INSTANT.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > lastDay) return null;
  if (zone !== "Z") {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return null;
  }
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : null;
}

function validRequest(input: TebraSchedulingRequest): boolean {
  if (!OPAQUE_ID.test(input.appointmentId)) return false;
  const startsAt = strictRfc3339Instant(input.startsAt);
  const endsAt = strictRfc3339Instant(input.endsAt);
  return startsAt !== null && endsAt !== null && endsAt > startsAt;
}

/**
 * Credential-late Tebra seam. The default has no network transport, so checking
 * in configuration can never make a provider call by itself. Callers receive a
 * stable concierge fallback until Care, both approvals, valid credentials, and
 * an explicitly injected reviewed transport are all present.
 */
export function createTebraSchedulingAdapter(input: {
  env?: NodeJS.ProcessEnv;
  transport?: TebraSchedulingTransport;
  loadCareCapability?: LoadTebraCareCapability;
}) {
  const configuration = parseConfiguration(input.env ?? process.env);
  return {
    status:
      configuration.state === "ready" && input.transport
        ? "ready"
        : configuration.state,
    async schedule(request: TebraSchedulingRequest): Promise<TebraSchedulingResult> {
      if (configuration.state !== "ready") {
        const failureCode: TebraSchedulingFailureCode =
          configuration.state === "care_disabled"
            ? "care_disabled"
            : configuration.state === "unconfigured"
              ? "tebra_unconfigured"
              : "tebra_configuration_invalid";
        return unavailable(failureCode);
      }
      if (!input.transport || !validRequest(request)) {
        return unavailable("tebra_unavailable");
      }

      try {
        const capability = await input.loadCareCapability?.();
        if (capability?.state !== "enabled" || capability.enabled !== true) {
          return unavailable("care_disabled");
        }
      } catch {
        return unavailable("care_disabled");
      }

      try {
        const result = await input.transport.createAppointment(
          configuration.endpoint,
          configuration.apiKey,
          request,
        );
        if (!OPAQUE_ID.test(result.externalAppointmentId)) {
          return unavailable("tebra_unavailable");
        }
        return { ok: true, externalAppointmentId: result.externalAppointmentId };
      } catch {
        return unavailable("tebra_unavailable");
      }
    },
  };
}
import type { CareCapabilityStatus } from "@shared/care/contracts";
