/**
 * PREVIEW ONLY. Real-browser release gate for Resource Hub V1.
 * Lives under scripts/ (like preview-account-portal.ts) so the release route
 * scanner, which censuses server/** and shared/**, never counts its doors.
 *
 * What is REAL here: the production SPA bundle (dist/public), the research
 * page gate and API wall (registerResearchApi, which also mounts the Resource
 * Hub admin doors behind the REAL requireSupabaseAdmin guard), the REAL partner
 * portal registrar (the Resource Hub library and delivery doors ride the same
 * withPartner resolution production uses), the response envelopes and private
 * headers, the upload transport, and the in-memory hub composition that the
 * non-production resolver returns (the exact service production composes over
 * Supabase once the migration is applied and the flag is on).
 *
 * What is SYNTHETIC: identity (a local GoTrue-shaped stub issuing opaque
 * preview tokens for fixed personas, which the REAL admin guard verifies
 * through SUPABASE_URL pointed at this process), the partner records (an
 * in-memory portal port), and the two member probes the SPA performs on every
 * sign-in (/member/me, /catalog). No provider, email, storage, database, or
 * Supabase request can leave this process. Nothing here is production
 * evidence of a partner, a resource, or an approval.
 *
 * Refuses NODE_ENV=production outright.
 */

import express, { type Request, type RequestHandler, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PartnerRole, PartnerState } from "../shared/research/distribution";
import { requireSupabaseAdmin } from "../server/routes";
import { registerResearchApi, researchPageGate } from "../server/research/index";
import { createInMemoryPartnerPortalPort, type PortalPartnerIdentity } from "../server/research/partners/portal";
import { registerPartnerPortalApi } from "../server/research/partners/portal-routes";

export const RESOURCE_HUB_PREVIEW_PASSWORD = "preview-password";

export interface ResourceHubPreviewPersona {
  email: string;
  token: string;
  memberKey: string;
  firstName: string;
  admin: boolean;
  partner: { partnerId: string; role: PartnerRole; state: PartnerState } | null;
}

export const RESOURCE_HUB_PREVIEW_PERSONAS: readonly ResourceHubPreviewPersona[] = Object.freeze([
  // The one admin. ADMIN_EMAIL is set to this address so the REAL guard admits it.
  { email: "admin@preview.invalid", token: "preview-token-admin", memberKey: "member-admin", firstName: "Ada", admin: true, partner: null },
  // An active Research Rep: in the audience of rep-only and all-partner material.
  { email: "rep@preview.invalid", token: "preview-token-rep", memberKey: "member-rep", firstName: "Riley", admin: false, partner: { partnerId: "partner-rep", role: "research_rep", state: "active" } },
  // An active affiliate: sees all-partner material only.
  { email: "affiliate@preview.invalid", token: "preview-token-affiliate", memberKey: "member-affiliate", firstName: "Avery", admin: false, partner: { partnerId: "partner-affiliate", role: "affiliate", state: "active" } },
  // A suspended rep: sees nothing and can download nothing.
  { email: "suspended@preview.invalid", token: "preview-token-suspended", memberKey: "member-suspended", firstName: "Sam", admin: false, partner: { partnerId: "partner-suspended", role: "research_rep", state: "suspended" } },
  // A member with no partner record: the honest "being prepared" state.
  { email: "member@preview.invalid", token: "preview-token-member", memberKey: "member-plain", firstName: "Morgan", admin: false, partner: null },
]);

function personaByEmail(email: string): ResourceHubPreviewPersona | null {
  return RESOURCE_HUB_PREVIEW_PERSONAS.find((p) => p.email === email.toLowerCase().trim()) ?? null;
}
function personaByToken(token: string): ResourceHubPreviewPersona | null {
  return RESOURCE_HUB_PREVIEW_PERSONAS.find((p) => p.token === token) ?? null;
}
function bearerOf(req: Request): string | null {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

function goTrueUser(persona: ResourceHubPreviewPersona) {
  const stamp = "2026-08-01T00:00:00.000Z";
  return {
    id: `preview-auth-${persona.memberKey}`,
    aud: "authenticated",
    role: "authenticated",
    email: persona.email,
    email_confirmed_at: stamp,
    created_at: stamp,
    updated_at: stamp,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
  };
}
function goTrueSession(persona: ResourceHubPreviewPersona) {
  return {
    access_token: persona.token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `preview-refresh-${persona.memberKey}`,
    user: goTrueUser(persona),
  };
}

function portalIdentity(persona: ResourceHubPreviewPersona): PortalPartnerIdentity | null {
  if (!persona.partner) return null;
  return {
    partnerId: persona.partner.partnerId,
    memberId: persona.memberKey,
    role: persona.partner.role,
    state: persona.partner.state,
    identityVerified: true,
    taxStatus: "verified",
    payoutStatus: "verified",
    certifiedAt: "2026-08-01T00:00:00.000Z",
    activatedAt: "2026-08-02T00:00:00.000Z",
  };
}

export function buildResourceHubPreviewApp(port: number, previewEnv: NodeJS.ProcessEnv = process.env) {
  if (previewEnv.NODE_ENV === "production") {
    throw new Error("resource-hub preview refuses to run under NODE_ENV=production");
  }
  process.env.RESEARCH_ACCESS_PASSWORD = "preview-resource-hub-review-password";
  process.env.RESEARCH_SESSION_SECRET = "preview-resource-hub-secret-not-production";
  process.env.RESEARCH_PUBLIC = "true";
  // The REAL admin guard verifies bearer tokens through this URL, which is the
  // GoTrue-shaped stub below. Nothing else in this process talks to it.
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}/preview-auth`;
  process.env.SUPABASE_ANON_KEY = "preview-anon-key-not-a-secret";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "preview-service-key-not-a-secret";
  process.env.ADMIN_EMAIL = RESOURCE_HUB_PREVIEW_PERSONAS.find((p) => p.admin)!.email;
  // Outside production the resolver composes the in-memory hub regardless of
  // the flag; unsetting it makes that explicit for anyone reading the log.
  delete process.env.RESEARCH_RESOURCE_HUB_ENABLED;

  const app = express();
  // Mirror production's global JSON limit exactly, so the upload transport is
  // proven against the same constraint it will meet in production.
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/config", (req, res) => {
    const origin = `http://${req.headers.host ?? "localhost"}`;
    res.json({
      metaPixelId: null,
      turnstileSiteKey: null,
      calendlyUrl: "https://calendly.com/example/preview",
      supabaseUrl: `${origin}/preview-auth`,
      supabaseAnonKey: "preview-anon-key-not-a-secret",
    });
  });

  // --- GoTrue-shaped preview auth stub -------------------------------------
  app.post("/preview-auth/auth/v1/token", (req, res) => {
    const grant = String(req.query.grant_type ?? "");
    if (grant === "password") {
      const body = (req.body ?? {}) as { email?: string; password?: string };
      const persona = personaByEmail(String(body.email ?? ""));
      if (!persona || body.password !== RESOURCE_HUB_PREVIEW_PASSWORD) {
        res.status(400).json({ error: "invalid_grant", error_description: "Invalid login credentials" });
        return;
      }
      res.json(goTrueSession(persona));
      return;
    }
    if (grant === "refresh_token") {
      const body = (req.body ?? {}) as { refresh_token?: string };
      const persona = RESOURCE_HUB_PREVIEW_PERSONAS.find((p) => `preview-refresh-${p.memberKey}` === String(body.refresh_token ?? ""));
      if (!persona) {
        res.status(400).json({ error: "invalid_grant", error_description: "Refresh token not found" });
        return;
      }
      res.json(goTrueSession(persona));
      return;
    }
    res.status(400).json({ error: "unsupported_grant_type", error_description: grant });
  });
  app.get("/preview-auth/auth/v1/user", (req, res) => {
    const persona = personaByToken(bearerOf(req) ?? "");
    if (!persona) {
      res.status(401).json({ error: "invalid_token", error_description: "Unknown preview token" });
      return;
    }
    res.json(goTrueUser(persona));
  });
  app.post("/preview-auth/auth/v1/logout", (_req, res) => {
    res.status(204).end();
  });

  // The display-only identity probe the admin shell performs, behind the REAL
  // admin guard (same shape as production's /api/admin/me).
  app.get("/api/admin/me", requireSupabaseAdmin, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ success: true, email: (req as unknown as { adminEmail?: string }).adminEmail });
  });

  // The two member probes the SPA performs after every sign-in.
  app.get("/api/research/member/me", (req, res) => {
    const persona = personaByToken(bearerOf(req) ?? "");
    if (!persona) {
      res.status(401).json({ ok: false, message: "Sign in required." });
      return;
    }
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, member: { firstName: persona.firstName, status: "active", applicationStatus: "approved" } });
  });
  app.get("/api/research/catalog", (req, res) => {
    const persona = personaByToken(bearerOf(req) ?? "");
    if (!persona) {
      res.status(401).json({ ok: false, message: "Preview member required." });
      return;
    }
    res.set("Cache-Control", "no-store");
    res.json({ products: [], commerce: { research: false, consumer: false }, email: "research@xeniostechnology.com" });
  });

  app.use(researchPageGate);

  // Preview API boundaries: only the doors this preview is FOR stay reachable.
  const RESEARCH_DOORS = new Set(["/me", "/catalog", "/member/me", "/partner/me", "/partner/dashboard", "/partner/resources"]);
  const RESEARCH_DOWNLOAD_DOOR = /^\/partner\/resources\/[A-Za-z0-9-]+\/download$/u;
  const researchBoundary: RequestHandler = (req, res, next) => {
    const method = req.method.toUpperCase();
    if ((method === "GET" || method === "HEAD") && (RESEARCH_DOORS.has(req.path) || RESEARCH_DOWNLOAD_DOOR.test(req.path))) return next();
    res.status(404).json({ error: "resource_hub_preview_route_not_available", message: "This API is outside the local Resource Hub browser gate." });
  };
  app.use("/api/research", researchBoundary);
  const adminBoundary: RequestHandler = (req, res, next) => {
    if (req.path === "/me" || req.path.startsWith("/research/resource-hub/")) return next();
    res.status(404).json({ error: "resource_hub_preview_route_not_available", message: "This API is outside the local Resource Hub browser gate." });
  };
  app.use("/api/admin", adminBoundary);

  // The REAL research registration: wall, private headers, and the Resource
  // Hub admin doors behind the REAL requireSupabaseAdmin guard.
  registerResearchApi(app);

  // Partner self/dashboard fixtures (owned by the commerce lane in production;
  // here a persona-scoped read so the partner shell renders). No selector is
  // honoured: the persona comes only from the bearer.
  app.get(["/api/research/partner/me", "/api/research/partner/dashboard"], (req, res) => {
    res.set("Cache-Control", "no-store");
    const persona = personaByToken(bearerOf(req) ?? "");
    if (!persona) {
      res.status(401).json({ ok: false, code: "member_required" });
      return;
    }
    if (!persona.partner) {
      res.status(404).json({ ok: false, code: "partner_not_found" });
      return;
    }
    const base = { partnerId: persona.partner.partnerId, role: persona.partner.role, state: persona.partner.state };
    res.json({
      ok: true,
      partner:
        req.path.endsWith("/me")
          ? { ...base, certified: true, active: persona.partner.state === "active", training: [], agreements: [] }
          : { ...base, leadCount: 0, conversionCount: 0, totalCommissionCents: 0, payableCents: 0, conversions: [], outstandingTraining: [] },
    });
  });

  // The REAL partner portal registrar over an in-memory port, with the
  // production guard shape: the member comes only from the bearer.
  const previewRequireMember = (req: Request, res: Response, next: () => void) => {
    const persona = personaByToken(bearerOf(req) ?? "");
    if (!persona) {
      res.status(401).json({ ok: false, code: "member_required" });
      return;
    }
    (req as { researchMember?: { id: string } }).researchMember = { id: persona.memberKey };
    next();
  };
  const partners = RESOURCE_HUB_PREVIEW_PERSONAS.map(portalIdentity).filter((p): p is PortalPartnerIdentity => p !== null);
  registerPartnerPortalApi(app, { port: createInMemoryPartnerPortalPort({ partners }), submissionsEnabled: false }, { requireMember: previewRequireMember });

  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, "..", "dist", "public");
  app.use(express.static(clientDist));
  app.get(/.*/u, (_req, res) => res.sendFile(path.resolve(clientDist, "index.html")));
  return Object.freeze({ app, clientDist });
}

const isDirectRun = process.argv[1]?.replace(/\\/gu, "/").endsWith("preview-resource-hub.ts");
if (isDirectRun) {
  const port = Number(process.env.PORT ?? 5231);
  try {
    const { app, clientDist } = buildResourceHubPreviewApp(port);
    app.listen(port, "127.0.0.1", () => {
      // eslint-disable-next-line no-console
      console.log(
        `[resource-hub-preview] listening on http://127.0.0.1:${port} serving ${clientDist}; ` +
          `personas: ${RESOURCE_HUB_PREVIEW_PERSONAS.map((p) => p.email).join(", ")}; password "${RESOURCE_HUB_PREVIEW_PASSWORD}"`,
      );
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[resource-hub-preview] failed to start:", error);
    process.exit(1);
  }
}
