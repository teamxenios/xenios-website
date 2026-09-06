// xenios research: the partner portal HTTP surface.
//
// This module publishes the partner-adapter paths that had no server route. It does
// not touch server/research/index.ts or the commerce route module, which own their
// own paths (/partner/me, /partner/dashboard, /partner/apply, /partner/links).
//
// REGISTRATION IS PENDING, DELIBERATELY. server/index.ts is a protected seam: its
// content hash is pinned in docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json, and the
// two must move in the SAME commit or the core-site protection tripwire fails. The
// manifest belongs to the release authority, so the one-line wiring ships with them
// rather than being smuggled in from a lane that cannot update the hash:
//
//   import { registerPartnerPortalApi } from "./research/partners/portal-routes";
//   import { partnerSubmissionsEnabled, resolvePartnerPortalPort }
//     from "./research/partners/portal-production";
//
//   // directly after registerCommerceApi(...)
//   registerPartnerPortalApi(
//     app,
//     { port: resolvePartnerPortalPort(), submissionsEnabled: partnerSubmissionsEnabled() },
//     { requireMember: adaptGuard(requireMember) },
//   );
//
// Until that lands the partner pages keep rendering the pending state they render
// today, which is why nothing here has to be defensive about being unregistered.
//
// The authorization model is the one the commerce lane already proved, applied
// without exception:
//
//   * The acting member comes ONLY from the guard (`subjectOf`). No handler here
//     reads an id from a body, a query, or a path parameter, so there is nothing in
//     a request an attacker can change to address another partner.
//   * The partner is resolved FROM that member. A member with no partner account
//     gets 404 partner_not_found, which the client maps to the page's honest
//     "being prepared" state.
//   * Organization-scoped reads (events, organizations) resolve the partner's own
//     organizations first. Cross-organization access is refused by construction,
//     not by a filter someone has to remember to write.
//
// PAYOUTS ARE READ ONLY. There is no route in this file that builds, submits,
// approves, retries, or settles a payout, and the read model computes no payable
// amount. It reports batch status that already exists.
//
// A surface with no table behind it answers honestly rather than plausibly: an
// empty list where the page has truthful empty copy, and a 503 capability_disabled
// where a write has nowhere durable to go. The client's envelope turns both into
// the pending state the pages already render, with the email path alongside.

import type { Express, Request, Response } from "express";
import {
  RESOURCE_HUB_PARTNER_DOWNLOAD_PATH,
  RESOURCE_HUB_PARTNER_LIBRARY_PATH,
} from "@shared/research/resource-hub/contract";
import { resolveResourceHubService } from "../resource-hub/production";
import type { ResourceHubService } from "../resource-hub/service";
import {
  createPartnerPortalService,
  type PartnerPortalPort,
  type PortalContentSubmissionInput,
  type PortalPartnerIdentity,
} from "./portal";

export interface PartnerPortalGuards {
  /** The merged member guard. Injected, so this module defines no parallel auth. */
  requireMember: (req: Request, res: Response, next: () => void) => void | Promise<void>;
}

/** Every path this module publishes. Exported so a test can assert the set exactly. */
export const PARTNER_PORTAL_PATHS = {
  onboarding: "/api/research/partner/onboarding",
  training: "/api/research/partner/training",
  leads: "/api/research/partner/leads",
  conversions: "/api/research/partner/conversions",
  commissions: "/api/research/partner/commissions",
  payouts: "/api/research/partner/payouts",
  // The Resource Hub library and its authorized delivery door. Both literals
  // are pinned equal to the shared resource-hub contract by a test; the
  // download path is a server-authorized application path, never a storage URL.
  resources: "/api/research/partner/resources",
  resourceDownload: "/api/research/partner/resources/:resourceId/download",
  campaigns: "/api/research/partner/campaigns",
  campaignRequest: "/api/research/partner/campaigns/request",
  events: "/api/research/partner/events",
  eventRequest: "/api/research/partner/events/request",
  organizations: "/api/research/partner/organizations",
  organizationRequest: "/api/research/partner/organizations/request",
  compliance: "/api/research/partner/compliance",
  complianceSubmissions: "/api/research/partner/compliance/submissions",
  securitySessions: "/api/research/partner/security/sessions",
} as const;

// ---------------------------------------------------------------------------
// Response helpers, matching the commerce lane's envelope exactly so the client
// needs no second parser: { ok: true, ...payload } / { ok: false, code, message? }.
// ---------------------------------------------------------------------------

function secure(res: Response): Response {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  return res;
}

function ok<T extends object>(res: Response, payload: T): void {
  secure(res).json({ ok: true, ...payload });
}

function deny(res: Response, status: number, code: string, message?: string): void {
  secure(res)
    .status(status)
    .json({ ok: false, code, ...(message ? { message } : {}) });
}

/** The acting member, taken only from what the guard authenticated. Fails closed. */
export function memberIdOf(req: Request): string | null {
  const member = (req as unknown as { researchMember?: Record<string, unknown> }).researchMember;
  if (!member) return null;
  const id = member.id ?? member.member_id ?? member.memberId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * The reason every request-style form in this file refuses.
 *
 * There is no campaign-request, event-request, or organization-request table in the
 * shipped schema, and this lane does not author migrations. Recording the request in
 * a table that means something else would be inventing a business fact, so the
 * surface refuses truthfully and the page shows its email path. The refusal is a
 * typed contract, not a missing route: the client can tell "not switched on" from
 * "broken" and never reports a false success.
 */
const REQUEST_INTAKE_PENDING =
  "Requests are not being recorded through this form yet, so nothing was submitted. Email the team and it will be carried over.";

export interface PartnerPortalDependencies {
  port: PartnerPortalPort;
  /**
   * Whether the compliance submission write has durable storage behind it. False
   * answers capability_disabled rather than accepting content into nowhere.
   */
  submissionsEnabled: boolean;
  /**
   * The Resource Hub: Xenios-published materials, role-scoped. Injected for
   * tests; production composition resolves the flag-gated service, which is
   * dark (empty library, no delivery) until RESEARCH_RESOURCE_HUB_ENABLED=true.
   */
  resourceHub?: ResourceHubService;
}

export function registerPartnerPortalApi(
  app: Express,
  deps: PartnerPortalDependencies,
  guards: PartnerPortalGuards,
): void {
  const member = guards.requireMember;
  const service = createPartnerPortalService(deps.port);
  const resourceHub = deps.resourceHub ?? resolveResourceHubService();
  if (
    PARTNER_PORTAL_PATHS.resources !== RESOURCE_HUB_PARTNER_LIBRARY_PATH ||
    PARTNER_PORTAL_PATHS.resourceDownload !== RESOURCE_HUB_PARTNER_DOWNLOAD_PATH
  ) {
    throw new Error("partner portal resource paths drifted from the resource-hub contract");
  }

  /**
   * Resolves the acting member's own partner, or answers for the caller.
   *
   * Every partner route runs through this, so partner resolution has exactly one
   * implementation. A member without a partner account is 404 partner_not_found,
   * matching /partner/dashboard, and the client renders the pending panel.
   */
  const withPartner =
    (handler: (partner: PortalPartnerIdentity, req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response): Promise<void> => {
      const memberId = memberIdOf(req);
      if (memberId === null) {
        deny(res, 403, "forbidden", "This area requires a signed-in member.");
        return;
      }
      let partner: PortalPartnerIdentity | null;
      try {
        partner = await deps.port.findPartnerForMember(memberId);
      } catch {
        deny(res, 503, "capability_disabled", "Partner records are not reachable right now.");
        return;
      }
      if (partner === null) {
        deny(res, 404, "partner_not_found");
        return;
      }
      try {
        await handler(partner, req, res);
      } catch {
        deny(res, 503, "capability_disabled", "This partner surface is not reachable right now.");
      }
    };

  // ---- onboarding and training -------------------------------------------

  app.get(
    PARTNER_PORTAL_PATHS.onboarding,
    member,
    withPartner(async (partner, _req, res) => {
      ok(res, await service.onboarding(partner));
    }),
  );

  app.get(
    PARTNER_PORTAL_PATHS.training,
    member,
    withPartner(async (partner, _req, res) => {
      ok(res, await service.training(partner));
    }),
  );

  // ---- performance: counts, never people ----------------------------------

  app.get(
    PARTNER_PORTAL_PATHS.leads,
    member,
    withPartner(async (partner, _req, res) => {
      ok(res, await service.leads(partner.partnerId));
    }),
  );

  app.get(
    PARTNER_PORTAL_PATHS.conversions,
    member,
    withPartner(async (partner, _req, res) => {
      ok(res, await service.conversions(partner.partnerId));
    }),
  );

  // ---- money: the affiliate commission ledger, and payout STATUS -----------

  app.get(
    PARTNER_PORTAL_PATHS.commissions,
    member,
    withPartner(async (partner, _req, res) => {
      ok(res, await service.commissions(partner.partnerId));
    }),
  );

  // Read only. Nothing on this path computes, builds, or moves a payout.
  app.get(
    PARTNER_PORTAL_PATHS.payouts,
    member,
    withPartner(async (partner, _req, res) => {
      ok(res, await service.payouts(partner));
    }),
  );

  // ---- content and program ------------------------------------------------

  // The Resource Hub library for THIS partner's role and state. The service
  // answers only current published versions whose audience includes the
  // partner, projected by explicit construction (no storage key, no signed
  // storage URL, no admin identity). A suspended or terminated partner sees
  // an empty library, not an error.
  app.get(
    PARTNER_PORTAL_PATHS.resources,
    member,
    withPartner(async (partner, _req, res) => {
      const resources = await resourceHub.libraryFor({ role: partner.role, state: partner.state });
      ok(res, { resources, asOf: new Date().toISOString() });
    }),
  );

  // Authorized delivery. Entitlement is re-read at use time inside the hub
  // (published, audience, policy) and every attempt is recorded with its
  // outcome. A resource the partner may not receive answers 404, never 403,
  // so the door is not an existence oracle. The bytes stream from the server
  // with no-store; the filename carries the resource id and version only.
  app.get(
    PARTNER_PORTAL_PATHS.resourceDownload,
    member,
    withPartner(async (partner, req, res) => {
      const resourceId = String(req.params.resourceId ?? "");
      const result = await resourceHub.deliverToPartner(
        { memberId: partner.memberId, role: partner.role, state: partner.state },
        resourceId,
      );
      if (!result.ok) {
        if (result.code === "not_found") {
          deny(res, 404, "not_found", "This resource is not available to you.");
          return;
        }
        deny(res, 503, "capability_disabled", "Resource delivery is not available right now.");
        return;
      }
      secure(res);
      res.set("Content-Type", result.contentType);
      res.set("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.set("X-Content-Type-Options", "nosniff");
      res.send(Buffer.from(result.bytes));
    }),
  );

  app.get(
    PARTNER_PORTAL_PATHS.campaigns,
    member,
    withPartner(async (partner, _req, res) => {
      ok(res, await service.campaigns(partner.partnerId));
    }),
  );

  app.post(
    PARTNER_PORTAL_PATHS.campaignRequest,
    member,
    withPartner(async (_partner, _req, res) => {
      deny(res, 503, "capability_disabled", REQUEST_INTAKE_PENDING);
    }),
  );

  app.get(
    PARTNER_PORTAL_PATHS.events,
    member,
    withPartner(async (partner, _req, res) => {
      ok(res, await service.events(partner.partnerId));
    }),
  );

  app.post(
    PARTNER_PORTAL_PATHS.eventRequest,
    member,
    withPartner(async (_partner, _req, res) => {
      deny(res, 503, "capability_disabled", REQUEST_INTAKE_PENDING);
    }),
  );

  app.get(
    PARTNER_PORTAL_PATHS.organizations,
    member,
    withPartner(async (partner, _req, res) => {
      ok(res, await service.organizations(partner.partnerId));
    }),
  );

  app.post(
    PARTNER_PORTAL_PATHS.organizationRequest,
    member,
    withPartner(async (_partner, _req, res) => {
      deny(res, 503, "capability_disabled", REQUEST_INTAKE_PENDING);
    }),
  );

  // ---- compliance ---------------------------------------------------------

  app.get(
    PARTNER_PORTAL_PATHS.compliance,
    member,
    withPartner(async (partner, _req, res) => {
      ok(res, await service.compliance(partner.partnerId));
    }),
  );

  app.post(
    PARTNER_PORTAL_PATHS.complianceSubmissions,
    member,
    withPartner(async (partner, req, res) => {
      if (!deps.submissionsEnabled) {
        deny(
          res,
          503,
          "capability_disabled",
          "Content submissions are not being accepted through this form yet, so nothing was submitted.",
        );
        return;
      }
      const input = parseSubmission(req.body);
      if (input === null) {
        deny(res, 400, "forbidden", "A submission needs a title and a description of the content.");
        return;
      }
      const result = await service.submitCompliance(partner.partnerId, input);
      if (result.ok) {
        ok(res, { message: "Received. Compliance reviews submissions in the order they arrive." });
        return;
      }
      if (result.code === "capability_disabled") {
        deny(res, 503, "capability_disabled", result.message);
        return;
      }
      deny(res, 400, "forbidden", result.message);
    }),
  );

  // ---- account security ---------------------------------------------------

  app.get(
    PARTNER_PORTAL_PATHS.securitySessions,
    member,
    withPartner(async (partner, _req, res) => {
      ok(res, await service.sessions(partner.partnerId));
    }),
  );
}

/**
 * The submission body, read by explicit field. Anything else a client sends is
 * dropped rather than forwarded, so an unexpected key cannot reach storage.
 */
export function parseSubmission(body: unknown): PortalContentSubmissionInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (title.length === 0 || description.length === 0) return null;
  if (title.length > 200 || description.length > 5000) return null;
  const link = typeof raw.link === "string" && raw.link.trim().length > 0 ? raw.link.trim() : null;
  if (link !== null && link.length > 500) return null;
  return { title, description, link };
}
