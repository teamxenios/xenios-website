export const TEBRA_PUBLIC_CONFIGURATION_PATH =
  "/api/care/tebra/configuration" as const;

export const TEBRA_SCHEDULING_MODES = [
  "disabled",
  "direct_link",
  "iframe",
  "popup_widget",
] as const;

export type TebraSchedulingMode = (typeof TEBRA_SCHEDULING_MODES)[number];

export const TEBRA_SCHEDULING_STATUSES = [
  "care_unavailable",
  "disabled",
  "unconfigured",
  "configuration_invalid",
  "ready",
] as const;

export type TebraSchedulingStatus =
  (typeof TEBRA_SCHEDULING_STATUSES)[number];

export const TEBRA_PORTAL_STATUSES = [
  "care_unavailable",
  "unconfigured",
  "configuration_invalid",
  "ready",
] as const;

export type TebraPortalStatus = (typeof TEBRA_PORTAL_STATUSES)[number];

export const TEBRA_REQUEST_SEMANTICS =
  "appointment_request_pending_confirmation" as const;

interface TebraSchedulingCommon {
  telehealthEnabled: boolean;
  practiceName?: string;
  locationLabel?: string;
  providerLabel?: string;
  requestSemantics: typeof TEBRA_REQUEST_SEMANTICS;
}

export type TebraSchedulingConfiguration =
  | (TebraSchedulingCommon & {
      status: Exclude<TebraSchedulingStatus, "ready">;
      mode: TebraSchedulingMode;
      url?: never;
      popupScriptUrl?: never;
    })
  | (TebraSchedulingCommon & {
      status: "ready";
      mode: "direct_link" | "iframe";
      url: string;
      popupScriptUrl?: never;
    })
  | (TebraSchedulingCommon & {
      status: "ready";
      mode: "popup_widget";
      url: string;
      popupScriptUrl: string;
    });

export type TebraPortalConfiguration =
  | { status: Exclude<TebraPortalStatus, "ready">; url?: never }
  | { status: "ready"; url: string };

export interface TebraPublicConfiguration {
  schemaVersion: 1;
  authority: "tebra";
  careAvailable: boolean;
  scheduling: TebraSchedulingConfiguration;
  portal: TebraPortalConfiguration;
}

const SCHEDULING_KEYS = new Set([
  "status",
  "mode",
  "url",
  "popupScriptUrl",
  "telehealthEnabled",
  "practiceName",
  "locationLabel",
  "providerLabel",
  "requestSemantics",
]);
const ROOT_KEYS = new Set([
  "schemaVersion",
  "authority",
  "careAvailable",
  "scheduling",
  "portal",
]);
const PORTAL_KEYS = new Set(["status", "url"]);
const SENSITIVE_QUERY_KEY_TOKENS = new Set([
  "token",
  "key",
  "secret",
  "auth",
  "authorization",
  "session",
  "patient",
  "member",
  "customer",
  "email",
  "phone",
  "product",
  "signature",
  "sig",
  "password",
  "passcode",
  "medical",
  "diagnosis",
  "prescription",
  "medication",
  "dob",
  "birth",
  "address",
  "insurance",
  "visit",
  "appointment",
  "portal",
  "record",
  "chart",
  "mrn",
  "name",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isOptionalDisplayLabel(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= 160 &&
      value === value.trim() &&
      !/[\u0000-\u001f\u007f]/u.test(value))
  );
}

function hasSensitiveQueryKey(url: URL): boolean {
  for (const rawKey of url.searchParams.keys()) {
    const tokenized = rawKey.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
    const tokens = tokenized.split(/[^a-z0-9]+/u).filter(Boolean);
    const compact = tokenized.replace(/[^a-z0-9]/gu, "");
    if (tokens.some((token) => SENSITIVE_QUERY_KEY_TOKENS.has(token))) return true;
    if (
      /^(?:(?:api|access|refresh|auth|authorization|session)?(?:token|key|secret|signature|sig))$/u.test(
        compact,
      )
    ) {
      return true;
    }
    if (
      /^(?:patient|member|customer|user|product|session|portal|record|chart|medicalrecord)(?:id|identifier|email|emailaddress|phone|phonenumber|name|fullname|record|recordid|recordidentifier|mrn)$/u.test(
        compact,
      ) ||
      /^(?:auth|authorization|email|emailaddress|phone|phonenumber|password|passcode|name|dateofbirth|birthdate|firstname|lastname|fullname|visitreason|insurance|insuranceid|appointmentid|appointmentidentifier|portalid|portalidentifier|recordid|recordidentifier|medicalrecordnumber|mrn)$/u.test(
        compact,
      )
    ) {
      return true;
    }
  }
  return false;
}

/** Validates a configured public Tebra destination without rewriting it. */
export function isSafeTebraPublicUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 4096 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f\\]/u.test(value)
  ) {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hash === "" &&
      url.hostname.length > 0 &&
      !url.hostname.includes("*") &&
      !hasSensitiveQueryKey(url)
    );
  } catch {
    return false;
  }
}

/**
 * A popup script must resolve to one exact CSP-representable resource path.
 * Root and directory paths would make a trailing-slash CSP source a prefix;
 * semicolons and commas are not valid in CSP Level 3 path-part expressions.
 */
export function isSafeTebraPopupScriptUrl(value: unknown): value is string {
  if (!isSafeTebraPublicUrl(value)) return false;
  try {
    const pathname = new URL(value).pathname;
    return (
      pathname !== "/" &&
      !pathname.endsWith("/") &&
      !/[;,]/u.test(pathname)
    );
  } catch {
    return false;
  }
}

export function isTebraPublicConfiguration(
  value: unknown,
): value is TebraPublicConfiguration {
  if (!isRecord(value) || !hasOnlyKeys(value, ROOT_KEYS)) return false;
  if (
    value.schemaVersion !== 1 ||
    value.authority !== "tebra" ||
    typeof value.careAvailable !== "boolean" ||
    !isRecord(value.scheduling) ||
    !isRecord(value.portal)
  ) {
    return false;
  }

  const scheduling = value.scheduling;
  const portal = value.portal;
  if (
    !hasOnlyKeys(scheduling, SCHEDULING_KEYS) ||
    !hasOnlyKeys(portal, PORTAL_KEYS) ||
    !(TEBRA_SCHEDULING_STATUSES as readonly unknown[]).includes(scheduling.status) ||
    !(TEBRA_SCHEDULING_MODES as readonly unknown[]).includes(scheduling.mode) ||
    typeof scheduling.telehealthEnabled !== "boolean" ||
    scheduling.requestSemantics !== TEBRA_REQUEST_SEMANTICS ||
    !isOptionalDisplayLabel(scheduling.practiceName) ||
    !isOptionalDisplayLabel(scheduling.locationLabel) ||
    !isOptionalDisplayLabel(scheduling.providerLabel) ||
    !(TEBRA_PORTAL_STATUSES as readonly unknown[]).includes(portal.status)
  ) {
    return false;
  }

  const schedulingReady = scheduling.status === "ready";
  const hasSchedulingUrl = hasOwn(scheduling, "url");
  const hasPopupScriptUrl = hasOwn(scheduling, "popupScriptUrl");
  if (schedulingReady) {
    if (
      !value.careAvailable ||
      scheduling.mode === "disabled" ||
      !hasSchedulingUrl ||
      !isSafeTebraPublicUrl(scheduling.url)
    ) {
      return false;
    }
    if (
      scheduling.mode === "popup_widget"
        ? !hasPopupScriptUrl || !isSafeTebraPopupScriptUrl(scheduling.popupScriptUrl)
        : hasPopupScriptUrl
    ) {
      return false;
    }
  } else if (
    hasSchedulingUrl ||
    hasPopupScriptUrl ||
    scheduling.telehealthEnabled ||
    (scheduling.status === "disabled" && scheduling.mode !== "disabled") ||
    (scheduling.status === "care_unavailable") !== !value.careAvailable
  ) {
    return false;
  }

  const portalReady = portal.status === "ready";
  const hasPortalUrl = hasOwn(portal, "url");
  if (
    portalReady
      ? !value.careAvailable || !hasPortalUrl || !isSafeTebraPublicUrl(portal.url)
      : hasPortalUrl || (portal.status === "care_unavailable") !== !value.careAvailable
  ) {
    return false;
  }

  return true;
}
