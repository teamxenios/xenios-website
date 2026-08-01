import {
  CARE_REFERRAL_STATUS_LABELS,
  CARE_SERVICE_CATEGORY_LABELS,
  projectCareReferral,
  type CareReferral,
} from "@shared/care/referral";
import {
  CARE_CONCIERGE_HANDOFF,
  type CareHandoffConfig,
} from "@shared/care/referral-handoff";

/**
 * Every state a care referral surface can be in. There is no implicit success
 * state: a response that does not parse is an error, not an empty list.
 */
export type CareReferralViewState =
  | { kind: "loading" }
  | { kind: "unauthorized" }
  | { kind: "disabled"; message: string }
  | { kind: "not_configured"; handoff: CareHandoffConfig }
  | { kind: "empty"; handoff: CareHandoffConfig }
  | { kind: "ready"; referrals: readonly CareReferral[]; handoff: CareHandoffConfig }
  | { kind: "error" };

function handoffFrom(body: unknown): CareHandoffConfig {
  const candidate = (body as { handoff?: unknown } | null)?.handoff;
  if (!candidate || typeof candidate !== "object") return CARE_CONCIERGE_HANDOFF;
  const value = candidate as Record<string, unknown>;
  const mode = value.mode;
  if (mode === "direct_url" && typeof value.schedulingUrl === "string") {
    return {
      mode: "direct_url",
      schedulingUrl: value.schedulingUrl,
      widgetScriptUrl:
        typeof value.widgetScriptUrl === "string" ? value.widgetScriptUrl : null,
      configured: true,
    };
  }
  if (mode === "widget" && typeof value.widgetScriptUrl === "string") {
    return {
      mode: "widget",
      schedulingUrl: null,
      widgetScriptUrl: value.widgetScriptUrl,
      configured: true,
    };
  }
  return CARE_CONCIERGE_HANDOFF;
}

/**
 * Map one API response to a view state. Pure, so the whole surface can be
 * exercised without a network. Referrals are projected through the shared
 * closed field set, so a clinical value cannot reach a rendered component even
 * if the server somehow returned one.
 */
export function careReferralViewFromResponse(
  status: number,
  body: unknown,
): CareReferralViewState {
  if (status === 401) return { kind: "unauthorized" };
  if (status === 503) {
    const code = (body as { code?: unknown } | null)?.code;
    const message =
      code === "care_referrals_disabled" || code === "care_disabled"
        ? "Care referrals are being prepared. Nothing can be requested yet."
        : "Care status is temporarily unavailable.";
    return { kind: "disabled", message };
  }
  if (status !== 200) return { kind: "error" };

  const payload = body as { ok?: unknown; referrals?: unknown } | null;
  if (!payload || payload.ok !== true || !Array.isArray(payload.referrals)) {
    return { kind: "error" };
  }

  const handoff = handoffFrom(body);
  const referrals: CareReferral[] = [];
  for (const row of payload.referrals) {
    const projected = projectCareReferral(row);
    if (projected) referrals.push(projected);
  }
  if (referrals.length === 0) {
    return handoff.configured
      ? { kind: "empty", handoff }
      : { kind: "not_configured", handoff };
  }
  return { kind: "ready", referrals, handoff };
}

/** The thin, non clinical fields a card or a queue row may show. */
export interface CareReferralRowView {
  referralId: string;
  serviceLabel: string;
  statusLabel: string;
  stateCode: string;
  appointment: string;
  owner: string;
  updated: string;
  needsAttention: boolean;
}

function displayTimestamp(value: string | null): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not set" : parsed.toISOString();
}

/**
 * Build the row a surface renders. Only the closed field set is read, so there
 * is no code path from a stored clinical value to a pixel.
 */
export function careReferralRowView(referral: CareReferral): CareReferralRowView {
  return {
    referralId: referral.referralId,
    serviceLabel: CARE_SERVICE_CATEGORY_LABELS[referral.serviceCategory],
    statusLabel: CARE_REFERRAL_STATUS_LABELS[referral.status],
    stateCode: referral.stateCode,
    appointment:
      referral.status === "scheduled" && referral.appointmentAt
        ? displayTimestamp(referral.appointmentAt)
        : "Not scheduled",
    owner: referral.operationsOwner ?? "Unassigned",
    updated: displayTimestamp(referral.updatedAt),
    needsAttention: referral.status === "error" || referral.errorCode !== null,
  };
}
