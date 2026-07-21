// ---------------------------------------------------------------------------
// Partner API adapter (pages/partners/*). Every /api/research/partner/* path
// the partner family touches lives HERE and nowhere else: data surfaces load
// through the typed GET functions (handed to the shared usePartnerResource
// hook as stable loaders), and every form submission goes through a named
// submit function. All requests flow through the one envelope in lib/api
// (no-store, optional member bearer token, honest ApiResult mapping), so a
// missing endpoint stays { kind: "unavailable" } and nothing on a partner
// surface is ever invented.
// ---------------------------------------------------------------------------

import { apiGet, apiPost, type ApiResult } from "../lib/api";
import { denialPresentation } from "../lib/denials";
import type { PartnerDashboardDto, PartnerLinkDto } from "@shared/research/commerce-api";

export type PartnerToken = string | null;

// The shape usePartnerResource loads through: a stable, module-level function
// from this adapter (pages never construct paths).
export type PartnerLoader<T> = (token: PartnerToken) => Promise<ApiResult<T>>;

export const PARTNER_API = {
  apply: "/api/research/partner/apply",
  dashboard: "/api/research/partner/dashboard",
  links: "/api/research/partner/links",
  conversions: "/api/research/partner/conversions",
  leads: "/api/research/partner/leads",
  commissions: "/api/research/partner/commissions",
  payouts: "/api/research/partner/payouts",
  resources: "/api/research/partner/resources",
  training: "/api/research/partner/training",
  campaigns: "/api/research/partner/campaigns",
  campaignRequest: "/api/research/partner/campaigns/request",
  events: "/api/research/partner/events",
  eventRequest: "/api/research/partner/events/request",
  organizations: "/api/research/partner/organizations",
  organizationRequest: "/api/research/partner/organizations/request",
  compliance: "/api/research/partner/compliance",
  complianceSubmissions: "/api/research/partner/compliance/submissions",
  onboarding: "/api/research/partner/onboarding",
  securitySessions: "/api/research/partner/security/sessions",
} as const;

// --------------------------- data surfaces (GET) ---------------------------
// Generic in T because each page owns its payload interface; the adapter owns
// the endpoint. Every function is a stable module reference, safe to hand to
// usePartnerResource directly.

// Frozen surface (docs/research-commerce/API_CONTRACTS_COMMERCE.md): the
// dashboard and links payloads are typed by the authoritative contract.
// Aggregates only; the server never puts member identity in these shapes.
export function getPartnerDashboard(token: PartnerToken): Promise<ApiResult<{ partner: PartnerDashboardDto }>> {
  return apiGet(PARTNER_API.dashboard, token);
}

export function getPartnerLinks(token: PartnerToken): Promise<ApiResult<{ links: PartnerLinkDto[] }>> {
  return apiGet(PARTNER_API.links, token);
}

export function getPartnerConversions<T>(token: PartnerToken): Promise<ApiResult<T>> {
  return apiGet<T>(PARTNER_API.conversions, token);
}

export function getPartnerLeads<T>(token: PartnerToken): Promise<ApiResult<T>> {
  return apiGet<T>(PARTNER_API.leads, token);
}

export function getPartnerCommissions<T>(token: PartnerToken): Promise<ApiResult<T>> {
  return apiGet<T>(PARTNER_API.commissions, token);
}

export function getPartnerPayouts<T>(token: PartnerToken): Promise<ApiResult<T>> {
  return apiGet<T>(PARTNER_API.payouts, token);
}

export function getPartnerResources<T>(token: PartnerToken): Promise<ApiResult<T>> {
  return apiGet<T>(PARTNER_API.resources, token);
}

export function getPartnerTraining<T>(token: PartnerToken): Promise<ApiResult<T>> {
  return apiGet<T>(PARTNER_API.training, token);
}

export function getPartnerCampaigns<T>(token: PartnerToken): Promise<ApiResult<T>> {
  return apiGet<T>(PARTNER_API.campaigns, token);
}

export function getPartnerEvents<T>(token: PartnerToken): Promise<ApiResult<T>> {
  return apiGet<T>(PARTNER_API.events, token);
}

export function getPartnerOrganizations<T>(token: PartnerToken): Promise<ApiResult<T>> {
  return apiGet<T>(PARTNER_API.organizations, token);
}

export function getPartnerCompliance<T>(token: PartnerToken): Promise<ApiResult<T>> {
  return apiGet<T>(PARTNER_API.compliance, token);
}

export function getPartnerOnboarding<T>(token: PartnerToken): Promise<ApiResult<T>> {
  return apiGet<T>(PARTNER_API.onboarding, token);
}

export function getPartnerSecuritySessions<T>(token: PartnerToken): Promise<ApiResult<T>> {
  return apiGet<T>(PARTNER_API.securitySessions, token);
}

// --------------------------- submissions (POST) ----------------------------
// Unavailable-tolerant form submission. An unpublished endpoint produces an
// honest "nothing was submitted" outcome (never a fake success), with the
// support email as the working path.

export type SubmitOutcome =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "accepted"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

export async function submitPartnerRequest(
  path: string,
  body: unknown,
  token: PartnerToken,
  unavailableMessage: string,
): Promise<SubmitOutcome> {
  const result = await apiPost<{ message?: string }>(path, body, token);
  if (result.kind === "ok") {
    return { kind: "accepted", message: result.data?.message ?? "Received. The team will follow up by email." };
  }
  if (result.kind === "unavailable" || result.kind === "forbidden") {
    return { kind: "unavailable", message: unavailableMessage };
  }
  if (result.kind === "unauthorized") {
    return { kind: "error", message: "Your session has ended. Please sign in again and retry." };
  }
  if (result.kind === "denied") {
    // Route on the machine code (via the shared copy table), never on the
    // server message. A pending-tone denial means the capability is simply
    // not switched on, which is the honest unavailable outcome for a form.
    const p = denialPresentation(result.code, result.message);
    if (p.tone === "pending") return { kind: "unavailable", message: p.body };
    return { kind: "error", message: `${p.title} ${p.body}` };
  }
  return { kind: "error", message: result.message };
}

export function applyAsPartner(body: unknown, token: PartnerToken, unavailableMessage: string): Promise<SubmitOutcome> {
  return submitPartnerRequest(PARTNER_API.apply, body, token, unavailableMessage);
}

export function requestCampaign(body: unknown, token: PartnerToken, unavailableMessage: string): Promise<SubmitOutcome> {
  return submitPartnerRequest(PARTNER_API.campaignRequest, body, token, unavailableMessage);
}

export function requestEvent(body: unknown, token: PartnerToken, unavailableMessage: string): Promise<SubmitOutcome> {
  return submitPartnerRequest(PARTNER_API.eventRequest, body, token, unavailableMessage);
}

export function requestOrganization(body: unknown, token: PartnerToken, unavailableMessage: string): Promise<SubmitOutcome> {
  return submitPartnerRequest(PARTNER_API.organizationRequest, body, token, unavailableMessage);
}

export function submitComplianceContent(
  body: unknown,
  token: PartnerToken,
  unavailableMessage: string,
): Promise<SubmitOutcome> {
  return submitPartnerRequest(PARTNER_API.complianceSubmissions, body, token, unavailableMessage);
}
