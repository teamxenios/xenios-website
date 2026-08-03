import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { CatalogResponse } from "@shared/research/types";
import {
  isResearchActivatePath,
  isResearchAdminPath,
  isResearchApplicationStatusPath,
  isResearchPath,
  isResearchResetPasswordPath,
} from "@shared/research/paths";
import { products } from "./products-data";
import { policies } from "./policies-data";
import { requireActiveMember } from "./member-auth";

// ---------------------------------------------------------------------------
// xenios research: Express gate + APIs.
//
// Security model: this is a Vite SPA, so anything bundled into client JS is
// publicly fetchable. Therefore the catalog (products, prices) and ordering
// live ONLY behind gated APIs; the client bundle carries no product data.
// Applicant legal policies are a deliberately public, no-store projection
// that truthfully retains their operational-draft status. The legacy gate is
// a shared password (RESEARCH_ACCESS_PASSWORD) exchanged for a signed,
// HTTP-only cookie. Fail closed: with no password set,
// /research and its APIs serve nothing.
//
// Legacy commerce is held in code. Product Control is the only future source of
// authoritative prices and checkout state; this module must never dispatch an
// order or expose the historical hardcoded price fields.
// ---------------------------------------------------------------------------

const COOKIE_NAME = "xr_access";
const SESSION_HOURS = 12;

const password = () => process.env.RESEARCH_ACCESS_PASSWORD || "";
// Launch switch: RESEARCH_PUBLIC="true" opens the public research experience
// without the review password. Default is the private, password-gated mode.
export const publicMode = () => process.env.RESEARCH_PUBLIC === "true";
// RESEARCH_SESSION_SECRET is REQUIRED in production for every signed artifact
// (gate cookies, status tokens). It is never derived from the access password.
// Without it in production, the research surface fails closed.
export const sessionSecretOk = () =>
  Boolean(process.env.RESEARCH_SESSION_SECRET) || process.env.NODE_ENV !== "production";
const configured = () => (Boolean(password()) || publicMode()) && sessionSecretOk();
const indexable = () => process.env.RESEARCH_INDEXABLE === "true";

function setLegacyCommercePrivateHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
}

const legacyOrderContainmentApps = new WeakSet<Express>();

// This exact legacy order route must be registered before the application-wide
// JSON/urlencoded parsers. Authentication uses headers only, so neither a
// signed-out hostile body nor an active member's body is parsed or copied into
// req.rawBody while ordering is held. registerResearchApi calls this again as
// a compatibility fallback for isolated compositions; the WeakSet keeps the
// production registration singular and early.
export function registerLegacyResearchOrderContainment(app: Express): void {
  if (legacyOrderContainmentApps.has(app)) return;
  legacyOrderContainmentApps.add(app);
  app.post(
    "/api/research/orders",
    (_req, res, next) => {
      setLegacyCommercePrivateHeaders(res);
      if (!configured()) {
        return res.status(503).json({ ok: false, message: "The research section is not configured." });
      }
      next();
    },
    requireActiveMember,
    (_req, res) => {
      res.status(503).json({ ok: false, message: "Ordering is not open for this catalog." });
    },
  );
}

// Signing key. Production requires the dedicated secret (configured() already
// fails closed without it); development falls back to a fixed dev-only string,
// never the password. Never sent to the client.
function signingKey(): Buffer {
  const secret = process.env.RESEARCH_SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEARCH_SESSION_SECRET is required in production");
    }
    return crypto.createHash("sha256").update("xenios-research-dev-only-secret").digest();
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function sign(value: string): string {
  return crypto.createHmac("sha256", signingKey()).update(value).digest("base64url");
}

// The signed payload carries a "cookie." domain label so the gate-cookie MAC
// can never collide with the applicant status/claim token MAC, which shares
// the same signing secret (both derive sha256(RESEARCH_SESSION_SECRET)).
function makeToken(): string {
  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  return `${expires}.${sign(`cookie.${expires}`)}`;
}

function tokenValid(token: string | undefined): boolean {
  if (!token || !configured()) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const expires = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(`cookie.${expires}`);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(expires) > Date.now();
}

function readCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function setSessionCookie(res: Response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(makeToken())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${secure}`,
  );
}

function clearSessionCookie(res: Response) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function isAuthed(req: Request): boolean {
  return tokenValid(readCookie(req));
}

// Small fixed-window limiter on password attempts (per IP).
const attempts = new Map<string, { count: number; resetAt: number }>();
function allowAttempt(req: Request): boolean {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = attempts.get(ip);
  if (!bucket || bucket.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (bucket.count >= 20) return false;
  bucket.count += 1;
  return true;
}

// ---------------------------------------------------------------------------
// Page-level middleware for /research*: noindex while gated, and fail closed
// when the gate is unconfigured. Register BEFORE the SPA catch-all.
// ---------------------------------------------------------------------------
export function researchPageGate(req: Request, res: Response, next: NextFunction) {
  // The xenios homepage stays at the root domain in every mode. Research is a
  // private, password-gated section at /research and never takes over the
  // root (canonical decision, 2026-07-18).
  // Normalize exactly like the wouter router (decodeURI + lowercase, shared
  // helper): the SPA renders the research surface for /Research/... AND
  // /%72esearch/... too, so a raw case-sensitive comparison here would drop
  // noindex + the recovery-page security headers on those variants. The root
  // homepage stays unaffected (it never normalizes to /research).
  if (isResearchAdminPath(req.path)) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    return next();
  }
  if (!isResearchPath(req.path)) return next();
  if (!indexable()) res.setHeader("X-Robots-Tag", "noindex, nofollow");
  // Account-access pages are opened from email in a fresh browser and can
  // carry signed, purpose-scoped tokens. They are never cached, indexed, or
  // allowed to leak a referrer.
  if (
    isResearchResetPasswordPath(req.path) ||
    isResearchActivatePath(req.path) ||
    isResearchApplicationStatusPath(req.path)
  ) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  }
  if (!configured()) {
    return res
      .status(503)
      .type("text/plain")
      .send("The research section is not configured.");
  }
  next();
}

// ---------------------------------------------------------------------------
// APIs
// ---------------------------------------------------------------------------
const passwordSchema = z.object({ password: z.string().min(1).max(200) });

export function registerResearchApi(app: Express) {
  // Isolated test/server compositions historically register only this router.
  // Production already registered the same exact handler before body parsers,
  // so this is a WeakSet-protected no-op there.
  registerLegacyResearchOrderContainment(app);

  // Every /api/research/* route: fail closed when unconfigured.
  app.use("/api/research", (_req, res, next) => {
    if (!configured()) return res.status(503).json({ ok: false, message: "The research section is not configured." });
    next();
  });

  // Open: gate state (never reveals anything but booleans).
  app.get("/api/research/me", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ configured: configured(), authed: publicMode() || isAuthed(req), publicMode: publicMode() });
  });

  // Open: exchange the password for the signed session cookie.
  app.post("/api/research/access", (req, res) => {
    if (!allowAttempt(req)) {
      return res.status(429).json({ ok: false, message: "Too many attempts. Try again in a few minutes." });
    }
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, message: "Enter the access password." });
    const provided = crypto.createHash("sha256").update(parsed.data.password).digest();
    const expected = crypto.createHash("sha256").update(password()).digest();
    if (!crypto.timingSafeEqual(provided, expected)) {
      return res.status(401).json({ ok: false, message: "That password is not correct." });
    }
    setSessionCookie(res);
    res.json({ ok: true });
  });

  app.post("/api/research/logout", (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Access architecture: the public gateway, signed application-status
  // lookup, and applicant legal policies do not depend on the legacy shared
  // review password. Application submission remains behind the wall while
  // the published policy sources are operational drafts and no exact approved
  // policy version can be bound to an acceptance. Member content (catalog,
  // orders, member routes) still requires the member's own Supabase JWT,
  // verified server-side by requireMember. Everything else keeps the
  // session-cookie wall.
  const MEMBER_AUTHED_PREFIXES = ["/member", "/activation", "/catalog", "/orders"];
  const OPEN_PUBLIC_READ_PATHS = new Set([
    "/applications/status",
    "/policies",
  ]);
  const OPEN_PUBLIC_WRITE_PATHS = new Set([
    // Existing applicants may request a replacement signed status link.
    // The endpoint remains enumeration-resistant and creates no application.
    "/applications/resend-link",
  ]);
  // Account setup and recovery must work from a fresh browser without the
  // legacy review password. Keep the bypass method-exact: forgot-password is
  // enumeration-safe and rate-limited; claim consumes a one-time,
  // purpose-scoped token plus a new password. Wrong methods remain walled.
  const OPEN_ACCOUNT_WRITE_PATHS = new Set([
    "/member/forgot-password",
    "/member/claim",
  ]);
  // These exact read routes own their stronger downstream member guard and
  // private-response headers. Let them reach that canonical handler even when
  // the shared review cookie is absent; otherwise this earlier gateway would
  // shadow the route, omit its privacy headers, and reject a valid member JWT.
  const DOWNSTREAM_MEMBER_GUARDED_READ_PATHS = new Set([
    "/capabilities",
    "/documents",
    "/plans/xenios30",
    "/profile",
    "/profile/sensitive",
  ]);
  const downstreamMemberGuardedRead = (path: string): boolean =>
    DOWNSTREAM_MEMBER_GUARDED_READ_PATHS.has(path) ||
    path === "/member/products" ||
    path.startsWith("/member/products/") ||
    path.startsWith("/pricing/");
  const downstreamMemberGuardedWrite = (path: string): boolean => {
    const xenios30Match = /^\/plans\/xenios30\/([^/]+)\/acknowledge$/.exec(path);
    if (xenios30Match !== null && z.string().uuid().safeParse(xenios30Match[1]).success) {
      return true;
    }

    const documentsMatch = /^\/documents\/([^/]+)\/(access|acknowledge)$/.exec(path);
    if (documentsMatch === null) return false;
    const rawDocumentId = documentsMatch[1];
    return rawDocumentId === rawDocumentId.toLowerCase() && z.string().uuid().safeParse(rawDocumentId).success;
  };
  const downstreamMemberGuardedDownload = (req: Request): boolean => {
    const match = /^\/api\/research\/documents\/([^/?]+)\/download\?exp=(0|[1-9]\d*)&sig=([A-Za-z0-9_-]{43})$/.exec(
      req.originalUrl,
    );
    if (match === null) return false;
    const [, rawDocumentId, rawExpiresAt] = match;
    if (rawDocumentId !== rawDocumentId.toLowerCase() || !z.string().uuid().safeParse(rawDocumentId).success) {
      return false;
    }
    const expiresAt = Number(rawExpiresAt);
    return Number.isSafeInteger(expiresAt) && String(expiresAt) === rawExpiresAt;
  };

  // SEN-0023, the remaining half. The member-platform routes below are ALL
  // already owned by their own requireActiveMember / requireMember guard, but
  // this earlier gateway answered 401 "Access required." before that guard
  // could run, so a member who signed in with Member Login and never typed the
  // shared review password was locked out of their own account. It failed
  // closed, never open, but it is still a lockout.
  //
  // Two rules keep the widening as small as the routes themselves:
  //   1. Every entry is an EXACT path or an ANCHORED shape. No bare prefixes,
  //      so a future route added under any of these namespaces is walled by
  //      default until it is listed here on purpose.
  //   2. The branch is admitted only when the request actually carries a
  //      member bearer credential. Every downstream guard here resolves the
  //      Supabase JWT out of "Authorization: Bearer ..." and 401s immediately
  //      without one (member-auth.ts resolveResearchMember), so requiring the
  //      header costs a real member nothing and denies the wall-probing
  //      caller who has no credential at all.
  //
  // Ids are validated against the DDL, not against a route's own zod schema:
  // research_private_media.id and research_member_questions.id are both
  // "uuid primary key default gen_random_uuid()", so a lowercase-canonical
  // UUID is the correct anchor. Guide slugs are content directory names under
  // content/research-guides/{individual,blends}, which are lowercase
  // kebab-case, so that is the anchor there.
  const MEMBER_SESSION_READ_PATHS = new Set([
    // agreements.ts:337, requireResearchSubject. That guard is
    // resolveResearchMember(..., allowClosed: true): it demands the same
    // non-recovery Supabase JWT and the same member row as requireMember and
    // 401s without a Bearer, differing only in tolerating status "closed".
    // Reading the document is what makes signing it meaningful: POST
    // /agreements was already admitted below, so without this the member could
    // sign a consent form they were never able to read.
    "/agreements",
    "/assessment", // assessment.ts: requireActiveMember
    "/blueprint", // blueprint.ts: requireActiveMember
    "/guides", // commerce/routes.ts: injected requireActiveMember
    "/media", // media.ts: requireActiveMember
    "/questions", // questions.ts: requireActiveMember
    "/telegram", // questions.ts: requireActiveMember
    "/tracker", // tracker.ts: requireActiveMember
  ]);
  const MEMBER_SESSION_WRITE_PATHS = new Set([
    "/agreements", // agreements.ts: requireMember (signing precedes activation)
    // agreements.ts:349, requireResearchSubject. A fully literal path: the
    // agreement id XR-MEM-012 is hardcoded in the registration, so this needs
    // no pattern and admits exactly one shape. Withdrawing consent must stay
    // reachable for a member whose status has since closed, which is precisely
    // the case requireResearchSubject exists to allow.
    "/agreements/XR-MEM-012/withdraw",
    "/assessment/responses", // assessment.ts: requireActiveMember
    "/assessment/submit", // assessment.ts: requireActiveMember
    "/blueprint/acknowledge", // blueprint.ts: requireActiveMember
    "/media/intent", // media.ts: requireActiveMember
    "/questions", // questions.ts: requireActiveMember
    "/telegram/link", // questions.ts: requireActiveMember
    "/tracker", // tracker.ts: requireActiveMember
  ]);
  const MEMBER_SESSION_REPLACE_PATHS = new Set([
    "/media/retention-election", // media.ts: requireActiveMember
    "/profile", // profile.ts: requireActiveMember
  ]);
  const MEMBER_SESSION_REMOVE_PATHS = new Set([
    "/telegram/link", // questions.ts: requireActiveMember
  ]);
  // A canonical lowercase UUID. The lowercase check is not cosmetic: it keeps
  // one row addressable by exactly one path, so a case variant cannot be used
  // to probe for a differently-normalized bypass.
  const canonicalUuid = (value: string): boolean =>
    value === value.toLowerCase() && z.string().uuid().safeParse(value).success;
  const GUIDE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const memberSessionRoute = (method: string, path: string): boolean => {
    if (method === "GET" || method === "HEAD") {
      if (MEMBER_SESSION_READ_PATHS.has(path)) return true;
      // GET /guides/:slug (commerce/routes.ts, injected requireActiveMember).
      const guide = /^\/guides\/([^/]+)$/.exec(path);
      return guide !== null && guide[1].length <= 80 && GUIDE_SLUG.test(guide[1]);
    }
    if (method === "POST") {
      if (MEMBER_SESSION_WRITE_PATHS.has(path)) return true;
      // POST /media/:mediaId/access (media.ts, requireActiveMember).
      const mediaAccess = /^\/media\/([^/]+)\/access$/.exec(path);
      if (mediaAccess !== null) return canonicalUuid(mediaAccess[1]);
      // POST /questions/:questionId/rate (questions.ts, requireActiveMember).
      const questionRating = /^\/questions\/([^/]+)\/rate$/.exec(path);
      return questionRating !== null && canonicalUuid(questionRating[1]);
    }
    if (method === "PUT") return MEMBER_SESSION_REPLACE_PATHS.has(path);
    if (method === "DELETE") {
      if (MEMBER_SESSION_REMOVE_PATHS.has(path)) return true;
      // DELETE /media/:mediaId (media.ts, requireActiveMember). The UUID
      // anchor is what separates this from the sibling literal segment:
      // DELETE /media/retention-election is not a UUID and stays walled.
      const media = /^\/media\/([^/]+)$/.exec(path);
      return media !== null && canonicalUuid(media[1]);
    }
    return false;
  };

  app.use("/api/research", (req, res, next) => {
    // Path-exact GET/HEAD boundaries only: /member/catalog is the alias door
    // onto the same legacy array (guards.ts), and its denials must carry the
    // same private headers as its 200s, so the set is applied here BEFORE any
    // wall or member-guard response. A lookalike path fails the equality and
    // a wrong method fails the method check, so their walling is unchanged.
    const legacyPrivateRoute =
      (req.method === "GET" || req.method === "HEAD") &&
      (req.path === "/catalog" || req.path === "/member/catalog");
    if (legacyPrivateRoute) {
      setLegacyCommercePrivateHeaders(res);
    }
    if (publicMode()) return next();
    if (
      ((req.method === "GET" || req.method === "HEAD") &&
        OPEN_PUBLIC_READ_PATHS.has(req.path)) ||
      (req.method === "POST" &&
        (OPEN_PUBLIC_WRITE_PATHS.has(req.path) ||
          OPEN_ACCOUNT_WRITE_PATHS.has(req.path)))
    ) {
      return next();
    }
    if (
      ((req.method === "GET" || req.method === "HEAD") &&
        downstreamMemberGuardedRead(req.path)) ||
      (req.method === "POST" && downstreamMemberGuardedWrite(req.path)) ||
      (req.method === "GET" && downstreamMemberGuardedDownload(req))
    ) {
      return next();
    }
    const bearer = (req.headers.authorization ?? "").startsWith("Bearer ");
    if (bearer && memberSessionRoute(req.method, req.path)) {
      return next();
    }
    if (bearer && MEMBER_AUTHED_PREFIXES.some((p) => req.path === p || req.path.startsWith(p + "/"))) {
      return next();
    }
    if (!isAuthed(req)) return res.status(401).json({ ok: false, message: "Access required." });
    next();
  });

  // The catalog is ACTIVE-member content: the shared gateway password does
  // not unlock products, and neither does an approved-but-not-activated
  // membership. requireActiveMember verifies the JWT, the membership, and
  // the active status server-side.
  app.get("/api/research/catalog", requireActiveMember, (_req, res) => {
    res.set("Cache-Control", "no-store");
    const body: CatalogResponse = {
      products: products.map((product) => ({ ...product, priceCents: null, compareAtCents: null })),
      commerce: { research: false, consumer: false },
      email: "research@xeniostechnology.com",
    };
    res.json(body);
  });

  // Policies are public read-only applicant documentation. The source remains
  // visibly identified as an operational draft until approved policy
  // identities exist; no application acceptance is enabled from this route.
  app.get("/api/research/policies", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ policies });
  });

}
