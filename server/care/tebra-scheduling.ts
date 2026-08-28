import type { CareCapabilityStatus } from "@shared/care/contracts";
import {
  isSafeTebraPopupScriptUrl,
  isSafeTebraPublicUrl,
  TEBRA_REQUEST_SEMANTICS,
  TEBRA_SCHEDULING_MODES,
  type TebraPortalConfiguration,
  type TebraPublicConfiguration,
  type TebraSchedulingConfiguration,
  type TebraSchedulingMode,
} from "@shared/care/tebra-experience";

export const TEBRA_ENVIRONMENT_VARIABLES = {
  schedulingEnabled: "TEBRA_SCHEDULING_ENABLED",
  schedulingMode: "TEBRA_SCHEDULING_MODE",
  schedulingUrl: "TEBRA_SCHEDULING_URL",
  schedulingEmbedScriptUrl: "TEBRA_SCHEDULING_EMBED_SCRIPT_URL",
  patientPortalUrl: "TEBRA_PATIENT_PORTAL_URL",
  allowedOrigins: "TEBRA_ALLOWED_ORIGINS",
  telehealthEnabled: "TEBRA_TELEHEALTH_ENABLED",
  practiceName: "TEBRA_PRACTICE_NAME",
  locationLabel: "TEBRA_LOCATION_LABEL",
  providerLabel: "TEBRA_PROVIDER_LABEL",
  environment: "TEBRA_ENVIRONMENT",
} as const;

export const TEBRA_ENVIRONMENTS = ["review", "production"] as const;
export type TebraEnvironment = (typeof TEBRA_ENVIRONMENTS)[number];

type ParsedValue<T> =
  | { state: "missing" }
  | { state: "invalid" }
  | { state: "value"; value: T };

export type TebraAllowedOriginsResult =
  | { state: "missing"; origins: readonly [] }
  | { state: "invalid"; origins: readonly [] }
  | { state: "ready"; origins: readonly string[] };

export interface ResolvedTebraExperienceConfiguration {
  publicConfiguration: TebraPublicConfiguration;
  environment: TebraEnvironment | null;
  allowedOrigins: readonly string[];
}

function parseExactBoolean(value: string | undefined): ParsedValue<boolean> {
  if (value === undefined || value === "") return { state: "missing" };
  if (value === "true") return { state: "value", value: true };
  if (value === "false") return { state: "value", value: false };
  return { state: "invalid" };
}

function parseMode(value: string | undefined): ParsedValue<TebraSchedulingMode> {
  if (value === undefined || value === "") return { state: "missing" };
  return (TEBRA_SCHEDULING_MODES as readonly string[]).includes(value)
    ? { state: "value", value: value as TebraSchedulingMode }
    : { state: "invalid" };
}

function parseEnvironment(value: string | undefined): ParsedValue<TebraEnvironment> {
  if (value === undefined || value === "") return { state: "missing" };
  return (TEBRA_ENVIRONMENTS as readonly string[]).includes(value)
    ? { state: "value", value: value as TebraEnvironment }
    : { state: "invalid" };
}

function parsePublicUrl(value: string | undefined): ParsedValue<string> {
  if (value === undefined || value === "") return { state: "missing" };
  return isSafeTebraPublicUrl(value)
    ? { state: "value", value }
    : { state: "invalid" };
}

function parsePopupScriptUrl(value: string | undefined): ParsedValue<string> {
  if (value === undefined || value === "") return { state: "missing" };
  return isSafeTebraPopupScriptUrl(value)
    ? { state: "value", value }
    : { state: "invalid" };
}

function parseDisplayLabel(value: string | undefined): ParsedValue<string> {
  if (value === undefined || value.trim() === "") return { state: "missing" };
  const normalized = value.trim();
  return normalized.length <= 160 && !/[\u0000-\u001f\u007f]/u.test(normalized)
    ? { state: "value", value: normalized }
    : { state: "invalid" };
}

/** Parses a comma-separated list as exact HTTPS origins, never host prefixes. */
export function parseTebraAllowedOrigins(
  value: string | undefined,
): TebraAllowedOriginsResult {
  if (value === undefined || value.trim() === "") {
    return { state: "missing", origins: [] };
  }
  if (value.length > 8192) return { state: "invalid", origins: [] };

  const entries = value.split(",").map((entry) => entry.trim());
  if (
    entries.length > 32 ||
    entries.some((entry) => entry.length === 0 || entry.length > 2048)
  ) {
    return { state: "invalid", origins: [] };
  }

  const origins: string[] = [];
  try {
    for (const entry of entries) {
      const url = new URL(entry);
      if (
        url.protocol !== "https:" ||
        url.username !== "" ||
        url.password !== "" ||
        url.pathname !== "/" ||
        url.search !== "" ||
        url.hash !== "" ||
        url.hostname.includes("*") ||
        origins.includes(url.origin)
      ) {
        return { state: "invalid", origins: [] };
      }
      origins.push(url.origin);
    }
  } catch {
    return { state: "invalid", origins: [] };
  }

  return { state: "ready", origins };
}

function careIsAvailable(capability: CareCapabilityStatus): boolean {
  return (
    capability?.rail === "care" &&
    capability.state === "enabled" &&
    capability.enabled === true
  );
}

function originIsAllowed(url: string, origins: readonly string[]): boolean {
  try {
    return origins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

function unavailableScheduling(
  status: Exclude<TebraSchedulingConfiguration["status"], "ready">,
  mode: TebraSchedulingMode,
): TebraSchedulingConfiguration {
  return {
    status,
    mode: status === "disabled" ? "disabled" : mode,
    telehealthEnabled: false,
    requestSemantics: TEBRA_REQUEST_SEMANTICS,
  };
}

function resolveScheduling(input: {
  env: NodeJS.ProcessEnv;
  careAvailable: boolean;
  allowedOrigins: TebraAllowedOriginsResult;
  environment: ParsedValue<TebraEnvironment>;
}): TebraSchedulingConfiguration {
  const enabled = parseExactBoolean(input.env.TEBRA_SCHEDULING_ENABLED);
  const mode = parseMode(input.env.TEBRA_SCHEDULING_MODE);
  const requestedMode = mode.state === "value" ? mode.value : "disabled";

  if (!input.careAvailable) {
    return unavailableScheduling(
      "care_unavailable",
      enabled.state === "value" && enabled.value === false ? "disabled" : requestedMode,
    );
  }
  if (enabled.state === "missing") {
    return unavailableScheduling("unconfigured", requestedMode);
  }
  if (enabled.state === "invalid") {
    return unavailableScheduling("configuration_invalid", requestedMode);
  }
  if (!enabled.value) return unavailableScheduling("disabled", "disabled");
  if (mode.state === "missing") return unavailableScheduling("unconfigured", "disabled");
  if (mode.state === "invalid") {
    return unavailableScheduling("configuration_invalid", "disabled");
  }
  if (mode.value === "disabled") return unavailableScheduling("disabled", "disabled");
  if (input.environment.state === "missing") {
    return unavailableScheduling("unconfigured", mode.value);
  }
  if (input.environment.state === "invalid") {
    return unavailableScheduling("configuration_invalid", mode.value);
  }

  const schedulingUrl = parsePublicUrl(input.env.TEBRA_SCHEDULING_URL);
  if (schedulingUrl.state === "missing" || input.allowedOrigins.state === "missing") {
    return unavailableScheduling("unconfigured", mode.value);
  }
  if (
    schedulingUrl.state === "invalid" ||
    input.allowedOrigins.state === "invalid" ||
    !originIsAllowed(schedulingUrl.value, input.allowedOrigins.origins)
  ) {
    return unavailableScheduling("configuration_invalid", mode.value);
  }

  const telehealth = parseExactBoolean(input.env.TEBRA_TELEHEALTH_ENABLED);
  const practiceName = parseDisplayLabel(input.env.TEBRA_PRACTICE_NAME);
  const locationLabel = parseDisplayLabel(input.env.TEBRA_LOCATION_LABEL);
  const providerLabel = parseDisplayLabel(input.env.TEBRA_PROVIDER_LABEL);
  if (
    telehealth.state === "invalid" ||
    practiceName.state === "invalid" ||
    locationLabel.state === "invalid" ||
    providerLabel.state === "invalid"
  ) {
    return unavailableScheduling("configuration_invalid", mode.value);
  }

  const common = {
    status: "ready" as const,
    url: schedulingUrl.value,
    telehealthEnabled: telehealth.state === "value" ? telehealth.value : false,
    requestSemantics: TEBRA_REQUEST_SEMANTICS,
    ...(practiceName.state === "value" ? { practiceName: practiceName.value } : {}),
    ...(locationLabel.state === "value" ? { locationLabel: locationLabel.value } : {}),
    ...(providerLabel.state === "value" ? { providerLabel: providerLabel.value } : {}),
  };

  if (mode.value !== "popup_widget") {
    return { ...common, mode: mode.value };
  }

  const popupScriptUrl = parsePopupScriptUrl(
    input.env.TEBRA_SCHEDULING_EMBED_SCRIPT_URL,
  );
  if (popupScriptUrl.state === "missing") {
    return unavailableScheduling("unconfigured", mode.value);
  }
  if (
    popupScriptUrl.state === "invalid" ||
    !originIsAllowed(popupScriptUrl.value, input.allowedOrigins.origins)
  ) {
    return unavailableScheduling("configuration_invalid", mode.value);
  }

  return {
    ...common,
    mode: "popup_widget",
    popupScriptUrl: popupScriptUrl.value,
  };
}

function resolvePortal(input: {
  env: NodeJS.ProcessEnv;
  careAvailable: boolean;
  allowedOrigins: TebraAllowedOriginsResult;
  environment: ParsedValue<TebraEnvironment>;
}): TebraPortalConfiguration {
  if (!input.careAvailable) return { status: "care_unavailable" };

  const portalUrl = parsePublicUrl(input.env.TEBRA_PATIENT_PORTAL_URL);
  if (
    portalUrl.state === "missing" ||
    input.allowedOrigins.state === "missing" ||
    input.environment.state === "missing"
  ) {
    return { status: "unconfigured" };
  }
  if (
    portalUrl.state === "invalid" ||
    input.allowedOrigins.state === "invalid" ||
    input.environment.state === "invalid" ||
    !originIsAllowed(portalUrl.value, input.allowedOrigins.origins)
  ) {
    return { status: "configuration_invalid" };
  }
  return { status: "ready", url: portalUrl.value };
}

export function resolveTebraExperienceConfiguration(input: {
  env?: NodeJS.ProcessEnv;
  careCapability: CareCapabilityStatus;
}): ResolvedTebraExperienceConfiguration {
  const env = input.env ?? process.env;
  const careAvailable = careIsAvailable(input.careCapability);
  const allowedOrigins = parseTebraAllowedOrigins(env.TEBRA_ALLOWED_ORIGINS);
  const environment = parseEnvironment(env.TEBRA_ENVIRONMENT);
  const publicConfiguration: TebraPublicConfiguration = {
    schemaVersion: 1,
    authority: "tebra",
    careAvailable,
    scheduling: resolveScheduling({ env, careAvailable, allowedOrigins, environment }),
    portal: resolvePortal({ env, careAvailable, allowedOrigins, environment }),
  };

  return {
    publicConfiguration,
    environment: environment.state === "value" ? environment.value : null,
    allowedOrigins:
      careAvailable && allowedOrigins.state === "ready" ? allowedOrigins.origins : [],
  };
}

export function resolveTebraPublicConfiguration(input: {
  env?: NodeJS.ProcessEnv;
  careCapability: CareCapabilityStatus;
}): TebraPublicConfiguration {
  return resolveTebraExperienceConfiguration(input).publicConfiguration;
}
