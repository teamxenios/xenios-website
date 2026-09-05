/**
 * PREVIEW ONLY. Real-browser release gate for the customer account portal.
 *
 * What is REAL here: the production SPA bundle, the research page gate, the
 * /api/research allowlist wall (registerResearchApi), the customer-account
 * route table, the response envelopes, the returnTo/sign-in journey, and the
 * audited catalog-priority overlay projection (read from the real config
 * files). What is SYNTHETIC: member authentication (a local GoTrue-shaped
 * stub issuing opaque preview tokens for fixed fixture personas), the
 * account data (the shared synthetic memory seeds), and owned partner self /
 * dashboard responses (explicit preview fixtures, NOT production evidence).
 * No provider, email,
 * storage, database, or Supabase request can leave this process.
 *
 * Refuses NODE_ENV=production outright.
 */

import express, { type Request, type RequestHandler, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerResearchApi, researchPageGate } from "../server/research/index";
import { registerCustomerAccountApi } from "../server/research/customer-account/routes";
import {
  createMemoryCustomerAccountPorts,
  defaultMemorySeeds,
} from "../server/research/customer-account/memory-adapters";
import { createCatalogPriorityPort } from "../server/research/product-activation/catalog-projection";
import type { CustomerAccountPorts } from "../server/research/customer-account/ports";
import type { PartnerSelfDto } from "../server/research/commerce/routes";
import type { PartnerDashboardDto } from "../shared/research/commerce-api";

export const ACCOUNT_PORTAL_PREVIEW_PASSWORD = "preview-password";

type PreviewPersona = Readonly<{
  email: string;
  token: string;
  memberKey: string;
  firstName: string;
  status: string;
}>;

export const PREVIEW_PERSONAS: readonly PreviewPersona[] = Object.freeze([
  // Partner A: rich account plus an owned synthetic partner ledger.
  Object.freeze({
    email: "fixture1@preview.invalid",
    token: "preview-member-token-1",
    memberKey: "member-fixture-1",
    firstName: "Jordan",
    status: "active",
  }),
  // The empty fixture: active membership, honest empty states everywhere.
  Object.freeze({
    email: "fixture2@preview.invalid",
    token: "preview-member-token-2",
    memberKey: "member-fixture-2",
    firstName: "Riley",
    status: "active",
  }),
  // Inactive membership: the client must route to the access-state screen,
  // never into portal content.
  Object.freeze({
    email: "inactive@preview.invalid",
    token: "preview-member-token-3",
    memberKey: "member-fixture-inactive",
    firstName: "Casey",
    status: "paused",
  }),
  // Partner B: a distinct owner with a measured empty synthetic ledger.
  Object.freeze({
    email: "partner-b@preview.invalid",
    token: "preview-member-token-partner-b",
    memberKey: "member-fixture-partner-b",
    firstName: "Partner B",
    status: "active",
  }),
  // Org A owns only this relationship, never another partner's aggregate.
  Object.freeze({
    email: "org-a@preview.invalid",
    token: "preview-member-token-org-a",
    memberKey: "member-fixture-org-a",
    firstName: "Org A",
    status: "active",
  }),
]);

type PreviewPartnerFixture = Readonly<{
  self: PartnerSelfDto;
  dashboard: PartnerDashboardDto;
}>;

// Fixed bearer -> member -> owned relation is the ONLY selection path. These
// fixture aggregates contain no customer identity, order, clinical, or cost
// fields. The numeric leadCount is retained solely to match the current wire
// contract. It is not evidence that the production application-count source is
// connected: the client must keep unsupported application counts unavailable.
const PREVIEW_PARTNERS: Readonly<Record<string, PreviewPartnerFixture>> = Object.freeze({
  "member-fixture-1": {
    self: {
      partnerId: "partner-fixture-a", role: "affiliate", state: "active",
      certified: true, active: true, training: [], agreements: [],
    },
    dashboard: {
      partnerId: "partner-fixture-a", role: "affiliate", state: "active",
      leadCount: 0, conversionCount: 2, totalCommissionCents: 7000, payableCents: 2000,
      conversions: [
        { attributedAt: "2026-08-20T12:00:00.000Z", eligibleNetCents: 50000, commissionCents: 5000, state: "held" },
        { attributedAt: "2026-08-21T12:00:00.000Z", eligibleNetCents: 20000, commissionCents: 2000, state: "payable" },
      ],
      outstandingTraining: [],
    },
  },
  "member-fixture-partner-b": {
    self: {
      partnerId: "partner-fixture-b", role: "research_rep", state: "active",
      certified: true, active: true, training: [], agreements: [],
    },
    dashboard: {
      partnerId: "partner-fixture-b", role: "research_rep", state: "active",
      leadCount: 0, conversionCount: 0, totalCommissionCents: 0, payableCents: 0,
      conversions: [], outstandingTraining: [],
    },
  },
  "member-fixture-org-a": {
    self: {
      partnerId: "partner-fixture-org-a", role: "organization_partner", state: "training_pending",
      certified: false, active: false, training: [], agreements: [],
    },
    dashboard: {
      partnerId: "partner-fixture-org-a", role: "organization_partner", state: "training_pending",
      leadCount: 0, conversionCount: 0, totalCommissionCents: 0, payableCents: 0,
      conversions: [], outstandingTraining: [{ moduleKey: "preview-compliance", version: "preview-v1" }],
    },
  },
});

function personaByEmail(email: string): PreviewPersona | null {
  return PREVIEW_PERSONAS.find((p) => p.email === email.toLowerCase().trim()) ?? null;
}

function personaByToken(token: string): PreviewPersona | null {
  return PREVIEW_PERSONAS.find((p) => p.token === token) ?? null;
}

function bearerOf(req: Request): string | null {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

function refusePreviewInProduction(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === "production") {
    throw new Error("account-portal preview refuses to run under NODE_ENV=production");
  }
}

function goTrueUser(persona: PreviewPersona) {
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

function goTrueSession(persona: PreviewPersona) {
  return {
    access_token: persona.token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `preview-refresh-${persona.memberKey}`,
    user: goTrueUser(persona),
  };
}

// One clearly synthetic PDF so the authorized byte download can be proven in a
// real browser for the OWNING member. The second fixture document has no
// bytes on purpose: clicking it must surface the honest error state.
const PREVIEW_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 80]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n%%EOF\n",
  "utf8",
);

// Production document ids are gen_random_uuid() primary keys and the REAL
// wall admits exactly the canonical-UUID shape, so the preview presents its
// synthetic documents under deterministic UUIDs — the browser journey then
// exercises the real admission anchor instead of bypassing it.
export const PREVIEW_DOCUMENT_UUIDS: Readonly<Record<string, string>> = Object.freeze({
  "doc-fixture-0001": "00000000-0000-4000-8000-000000000d01",
  "doc-fixture-0002": "00000000-0000-4000-8000-000000000d02",
});

// Resolve the repo root from this file, not process.cwd(), so the preview
// reads the real overlay/projection config no matter where it is launched.
const PREVIEW_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function previewPorts(): CustomerAccountPorts {
  const memory = createMemoryCustomerAccountPorts([
    ...defaultMemorySeeds(),
    ...PREVIEW_PERSONAS.filter((persona) =>
      persona.memberKey === "member-fixture-partner-b" || persona.memberKey === "member-fixture-org-a",
    ).map((persona) => ({
      identity: {
        memberKey: persona.memberKey,
        displayName: persona.firstName,
        email: persona.email,
        accountStatus: "active" as const,
        memberSince: null,
      },
    })),
  ]);
  return {
    ...memory,
    documents: {
      async documentsFor(memberKey) {
        const documents = await memory.documents.documentsFor(memberKey);
        return documents.map((document) => {
          const uuid = PREVIEW_DOCUMENT_UUIDS[document.id];
          return uuid
            ? {
                ...document,
                id: uuid,
                downloadPath: `/api/research/customer-account/documents/${uuid}`,
              }
            : document;
        });
      },
      async openDocument(memberKey, documentId) {
        // Ownership stays inside the read: only the rich fixture's first
        // document has bytes; everything else is indistinguishable from
        // missing, exactly like production.
        if (
          memberKey === "member-fixture-1" &&
          documentId === PREVIEW_DOCUMENT_UUIDS["doc-fixture-0001"]
        ) {
          return {
            bytes: new Uint8Array(PREVIEW_PDF),
            contentType: "application/pdf",
            filename: "Preview synthetic document.pdf",
          };
        }
        return null;
      },
    },
    catalogPriority: createCatalogPriorityPort(PREVIEW_REPO_ROOT),
  };
}

export function buildAccountPortalPreviewApp(previewEnv: NodeJS.ProcessEnv = process.env) {
  refusePreviewInProduction(previewEnv);
  process.env.RESEARCH_ACCESS_PASSWORD = "preview-account-portal-review-password";
  process.env.RESEARCH_SESSION_SECRET = "preview-account-portal-secret-not-production";
  process.env.RESEARCH_PUBLIC = "false";

  const app = express();
  app.use(express.json());

  // Runtime public config, pointed at the local GoTrue-shaped stub. The real
  // client reads this at runtime (client/src/lib/config.ts), so the shipped
  // bundle authenticates against the preview stub with no rebuild.
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
      if (!persona || body.password !== ACCOUNT_PORTAL_PREVIEW_PASSWORD) {
        res.status(400).json({ error: "invalid_grant", error_description: "Invalid login credentials" });
        return;
      }
      res.json(goTrueSession(persona));
      return;
    }
    if (grant === "refresh_token") {
      const body = (req.body ?? {}) as { refresh_token?: string };
      const persona = PREVIEW_PERSONAS.find(
        (p) => `preview-refresh-${p.memberKey}` === String(body.refresh_token ?? ""),
      );
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

  // The member session probe the SPA verifies EVERY member token against.
  // Registered before the wall on purpose: it stands in for the wall-admitted
  // production /member/me door with the preview personas.
  app.get("/api/research/member/me", (req, res) => {
    const persona = personaByToken(bearerOf(req) ?? "");
    if (!persona) {
      res.status(401).json({ ok: false, message: "Sign in required." });
      return;
    }
    res.json({
      ok: true,
      member: {
        firstName: persona.firstName,
        status: persona.status,
        applicationStatus: "approved",
      },
    });
  });

  // ResearchContext performs this active-member read after every successful
  // sign-in even when the customer navigates directly to the account portal.
  // Serve an intentionally empty, commerce-disabled preview projection so the
  // production bundle completes that read without invoking the real catalog
  // guard or any provider. This route is read-only and preview-persona gated.
  app.get("/api/research/catalog", (req, res) => {
    const persona = personaByToken(bearerOf(req) ?? "");
    if (!persona) {
      res.status(401).json({ ok: false, message: "Preview member required." });
      return;
    }
    if (persona.status !== "active") {
      res.status(403).json({ ok: false, message: "Preview active member required." });
      return;
    }
    res.set("Cache-Control", "no-store");
    res.json({
      products: [],
      commerce: { research: false, consumer: false },
      email: "research@xeniostechnology.com",
    });
  });

  app.use(researchPageGate);

  // Preview API boundary: only the doors this preview is FOR stay reachable;
  // every other /api/research surface answers a clearly-preview 404 before it
  // can touch a real dependency.
  const PREVIEW_GET_DOORS = new Set([
    "/me",
    "/catalog",
    "/customer-account/overview",
    "/customer-account/orders",
    "/customer-account/subscription",
    "/customer-account/care",
    "/customer-account/documents",
    "/customer-account/support",
    "/customer-account/catalog-priority",
    "/partner/me",
    "/partner/dashboard",
  ]);
  const PREVIEW_DOCUMENT_DOOR = /^\/customer-account\/documents\/[A-Za-z0-9-]+$/;
  const previewBoundary: RequestHandler = (req, res, next) => {
    const method = req.method.toUpperCase();
    if ((method === "GET" || method === "HEAD") && PREVIEW_GET_DOORS.has(req.path)) return next();
    if (method === "GET" && PREVIEW_DOCUMENT_DOOR.test(req.path)) return next();
    if (method === "POST" && req.path === "/customer-account/support") return next();
    res.status(404).json({
      error: "account_portal_preview_route_not_available",
      message: "This API is outside the local account-portal browser gate.",
    });
  };
  app.use("/api/research", previewBoundary);

  // The REAL research registration: the allowlist wall, private headers, and
  // the fail-closed public surface all come from production code.
  registerResearchApi(app);

  // These exact read-only fixture routes intentionally sit AFTER the real
  // research wall. The preview therefore cannot conceal a missing production
  // bearer admission. No preview credential or session cookie widens that wall.
  // There is no partner-id route parameter and any query/body selector is
  // refused, rather than used to select another persona's record.
  for (const [route, view] of [
    ["/api/research/partner/me", "self"],
    ["/api/research/partner/dashboard", "dashboard"],
  ] as const) {
    app.get(route, (req, res) => {
      res.set("Cache-Control", "private, no-store, max-age=0");
      res.set("Pragma", "no-cache");
      res.vary("Authorization");
      const persona = personaByToken(bearerOf(req) ?? "");
      if (!persona) {
        res.status(401).json({ ok: false, code: "member_required" });
        return;
      }
      if (Object.keys(req.query).length > 0 || (req.body && Object.keys(req.body).length > 0)) {
        res.status(400).json({ ok: false, code: "preview_request_selector_not_supported" });
        return;
      }
      const fixture = PREVIEW_PARTNERS[persona.memberKey];
      if (!fixture) {
        res.status(404).json({ ok: false, code: "partner_not_found" });
        return;
      }
      res.json({ ok: true, partner: fixture[view] });
    });
  }

  // The REAL customer-account route table over synthetic ports, guarded by
  // preview guards with the exact production guard shapes. requireActiveMember
  // mirrors the merged guard's status gate (P1-2): the paused persona can read
  // its own account state but never the global catalog-priority projection.
  const previewRequireMember = (req: Request, res: Response, next: () => void) => {
    const persona = personaByToken(bearerOf(req) ?? "");
    if (!persona) {
      res.status(401).json({ kind: "denied", reason: "member_required" });
      return;
    }
    (req as { researchMember?: { id: string } }).researchMember = { id: persona.memberKey };
    next();
  };
  registerCustomerAccountApi(app, previewPorts(), {
    requireMember: previewRequireMember,
    requireActiveMember: (req: Request, res: Response, next: () => void) => {
      previewRequireMember(req, res, () => {
        const persona = personaByToken(bearerOf(req) ?? "");
        if (!persona || persona.status !== "active") {
          res.status(403).json({ ok: false, code: "membership_inactive" });
          return;
        }
        next();
      });
    },
  });

  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, "..", "dist", "public");
  app.use(express.static(clientDist));
  app.get(/.*/, (_req, res) => res.sendFile(path.resolve(clientDist, "index.html")));
  return Object.freeze({ app });
}

const isDirectRun = process.argv[1]?.includes("preview-account-portal");
if (isDirectRun) {
  const port = Number(process.env.PORT ?? 5221);
  try {
    const { app } = buildAccountPortalPreviewApp();
    app.listen(port, "127.0.0.1", () => {
      // eslint-disable-next-line no-console
      console.log(
        `[preview-account-portal] listening on http://localhost:${port} — ` +
          `personas: ${PREVIEW_PERSONAS.map((p) => p.email).join(", ")}, ` +
          `password "${ACCOUNT_PORTAL_PREVIEW_PASSWORD}"`,
      );
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[preview-account-portal] failed to start:", error);
    process.exit(1);
  }
}
