import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { CatalogResponse } from "@shared/research/types";
import {
  isResearchAccessStatePath,
  isResearchActivatePath,
  isResearchAdminPath,
  isResearchApplicationStatusPath,
  isResearchPath,
  isResearchResetPasswordPath,
} from "@shared/research/paths";
import { products } from "./products-data";
import { policies } from "./policies-data";
import { requireActiveMember } from "./member-auth";
import { EARLY_ACCESS_ORDER_NUMBER } from "./early-access/routes/order-number";

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

function setResearchPrivateHeaders(res: Response): void {
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
      setResearchPrivateHeaders(res);
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
  // req.ip, not the raw header. The leftmost X-Forwarded-For entry is whatever
  // the CLIENT sent — the edge appends to that header rather than replacing it
  // — so keying this bucket on it handed an attacker a fresh bucket for every
  // request and left the shared research password with no throttle at all in
  // front of a constant-time comparison that has no lockout of its own.
  const ip =
    (typeof req.ip === "string" && req.ip.length > 0 ? req.ip : req.socket.remoteAddress) ||
    "unknown";
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
    isResearchAccessStatePath(req.path) ||
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
  // Private Early Access owns a STRONGER gate than this wall: a scrypt password
  // with lockout on unlock, and a signed HttpOnly session cookie on every other
  // route. It must be reachable by someone who is NOT a research member, because
  // that is the entire point of the portal, so this earlier gateway cannot be the
  // thing that answers. Without this the password prompt is unreachable in
  // production and the feature looks broken rather than closed.
  //
  // Method-exact and path-exact. Each handler still refuses on its own terms, and
  // while RESEARCH_EARLY_ACCESS_ENABLED is false every one of them refuses.
  const EARLY_ACCESS_OPEN_READ_PATHS = new Set([
    "/early-access/session",
    "/early-access/catalog",
    // This session customer's OWN agreement standing, so a refresh does not
    // lose an acceptance and the browser is never the one remembering it. It
    // owns a STRONGER gate downstream: the durable Early Access session
    // resolves the customer, and the route reads no parameter of any kind, so
    // it cannot be asked about anyone else. Reaching it through the wall
    // without a session reaches a refusal, never a status.
    "/early-access/agreements",
    // The cart capability probe. The browser calls it before rendering
    // anything, so walling it makes the cart look ABSENT rather than off, which
    // is the one answer that cannot be recovered from in the UI. It reads no
    // parameter and reports only whether the cart is enabled.
    "/early-access/cart/capability",
    // The assisted-order doors (2026-08-15 founder directive). Both read no
    // parameter: config reports the feature state and the exact required
    // agreement versions, catalog is the same member-safe projection the
    // session-gated catalog serves. Each owns a STRONGER gate downstream: the
    // handler resolves the durable Early Access session or an active member,
    // and an unconfigured composition answers a refusal, never data. Walling
    // them makes the feature look ABSENT instead of closed.
    "/early-access/assisted-orders/config",
    "/early-access/assisted-orders/catalog",
  ]);
  const EARLY_ACCESS_OPEN_WRITE_PATHS = new Set([
    "/early-access/unlock",
    "/early-access/logout",
    "/early-access/orders",
    // Quote and checkout. Both own a STRONGER gate downstream: the durable
    // Early Access session resolves the customer, the quote is bound to that
    // customer, and checkout refuses a quote that is not theirs. Reaching them
    // through the wall reaches a refusal, never another customer's cart.
    "/early-access/cart/quote",
    "/early-access/cart/checkout",
    // The verification doors. Each owns a STRONGER downstream gate: both
    // require the durable Early Access session, and redemption additionally
    // requires the token minted for THIS session. Reaching them through the
    // wall reaches a refusal, never a binding.
    "/early-access/verification/request",
    "/early-access/verify",
    // Recording that a customer accepted the required agreement. It owns a
    // STRONGER gate downstream: the durable Early Access session resolves the
    // customer, and the handler refuses any (kind, version) this deployment did
    // not configure. Reaching it through the wall reaches a refusal, never an
    // acceptance. Without this entry the wall answers first and no customer can
    // ever agree, which reads as a broken checkout rather than a closed one.
    "/early-access/agreements/accept",
    // Assisted-order submission. It owns a STRONGER gate downstream: the
    // handler resolves the durable Early Access session or an active member,
    // re-reads every product and price authoritatively, and re-checks the
    // exact required agreement versions. Reaching it through the wall reaches
    // a refusal, never a stored request.
    "/early-access/assisted-orders",
  ]);
  // The order routes carry an order number, so they cannot be a Set entry. They
  // are ANCHORED against the exact generated shape instead of a bare prefix:
  // /early-access/orders/<XEA-...> and its two leaf paths, and nothing else.
  // A lookalike segment, an extra segment, and a wrong method all fail the match
  // and stay walled, so a future route under this namespace is walled by default
  // until it is listed here on purpose.
  //
  // Each handler still owns its own, STRONGER gate: the durable Early Access
  // session, then the resolved customer, then ownership of that exact order.
  // Getting through this wall reaches a refusal, never an order.
  const ORDER_NUMBER_SEGMENT = EARLY_ACCESS_ORDER_NUMBER.source.replace(/^\^|\$$/g, "");
  const EARLY_ACCESS_ORDER_READ = new RegExp(
    `^/early-access/orders/(?:${ORDER_NUMBER_SEGMENT})(?:/invoice)?$`,
  );
  const EARLY_ACCESS_ORDER_WRITE = new RegExp(
    `^/early-access/orders/(?:${ORDER_NUMBER_SEGMENT})/payment-proof$`,
  );

  // THE CART DOORS, ADMITTED ON THE EARLY ACCESS SESSION ALONE.
  //
  // Founder decision: a customer who has unlocked Private Early Access must not
  // be asked for the research gateway password as well. Early Access
  // authentication is the intended customer gate.
  //
  // Before this, every cart route was answered by this wall with 401 "Access
  // required." An executed probe confirmed it on all five existing routes while
  // an exempt control path answered 200, so the cart was unreachable by exactly
  // the people it exists for. It was never noticed because the cart route tests
  // register the Early Access API alone, without this wall in front of it.
  //
  // Admitted door by door, never by prefix. A prefix would admit every future
  // path added under this namespace, including one written before its ownership
  // check exists. The parameterized entries are anchored on the exact generated
  // checkout-number shape, so a lookalike segment stays walled.
  //
  // ADMISSION IS NOT AUTHORIZATION. Every door below still resolves the
  // customer from the durable Early Access session and still answers 404, not
  // 403, for a checkout belonging to someone else, so it cannot become an
  // existence oracle. Getting through this wall reaches a refusal, never
  // another customer's cart.
  //
  // The admin cart doors are NOT here and must never be: they live under
  // /api/admin/research and answer to requireSupabaseAdmin, outside this wall.
  const CART_NUMBER_SEGMENT = "XEC-[A-Z0-9]{16,40}";
  const EARLY_ACCESS_CART_READ = new RegExp(
    `^/early-access/cart/(?:${CART_NUMBER_SEGMENT})(?:/status|/payment-instructions)?$`,
  );
  const EARLY_ACCESS_CART_WRITE = new RegExp(
    `^/early-access/cart/(?:${CART_NUMBER_SEGMENT})/payment-proof$`,
  );

  // The assisted-order parameterized doors, anchored on the exact generated
  // shapes and nothing else: the public reference XRR-<8 digits>-<10 upper hex>
  // for the customer status read, and the lowercase v4 uuid ids for the two
  // document writes. A lookalike segment, an extra segment, and a wrong method
  // all fail the match and stay walled, so a future route under this namespace
  // is walled by default until it is listed on purpose. Each handler still
  // owns its own, STRONGER gate: the session or member viewer, then ownership
  // or the request's own hashed status token, then for documents the exact
  // identity_requested state. Getting through this wall reaches a refusal,
  // never another customer's request or document.
  const ASSISTED_ORDER_REFERENCE_SEGMENT = "XRR-\\d{8}-[0-9A-F]{10}";
  const ASSISTED_ORDER_UUID_SEGMENT =
    "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const EARLY_ACCESS_ASSISTED_ORDER_READ = new RegExp(
    `^/early-access/assisted-orders/(?:${ASSISTED_ORDER_REFERENCE_SEGMENT})$`,
  );
  const EARLY_ACCESS_ASSISTED_ORDER_WRITE = new RegExp(
    `^/early-access/assisted-orders/(?:${ASSISTED_ORDER_UUID_SEGMENT})/documents(?:/(?:${ASSISTED_ORDER_UUID_SEGMENT})/complete|/upload-url)$`,
  );

  // These exact read routes own their stronger downstream member guard and
  // private-response headers. Let them reach that canonical handler even when
  // the shared review cookie is absent; otherwise this earlier gateway would
  // shadow the route, omit its privacy headers, and reject a valid member JWT.
  const DOWNSTREAM_MEMBER_GUARDED_READ_PATHS = new Set([
    "/capabilities",
    "/cart",
    // A signed-in member's own claims and subscriptions. Both were shadowed by
    // this gateway while their siblings /cart and /orders were admitted, and the
    // consequence was not a missing page: the member subnav links Subscriptions
    // on every member screen, the page reads it on mount, and a 401 there is
    // rendered as "Your session has ended. Sign in again" — a false statement
    // about the customer's account while their session is perfectly valid. The
    // 401 looked like a legitimate answer, so nothing complained.
    //
    // Each owns a STRONGER gate than this one: registered with the active-member
    // guard and a withSubject wrapper that fails closed when no subject was
    // authenticated, so reaching the handler through this wall reaches a
    // refusal, never another member's claims or subscriptions. READS only —
    // creating a claim or a subscription stays walled here on purpose.
    "/claims",
    "/subscriptions",
    "/documents",
    "/member/me",
    "/plans/xenios30",
    "/profile",
    "/profile/sensitive",
    "/store-credit",
  ]);
  const downstreamMemberGuardedRead = (path: string): boolean =>
    DOWNSTREAM_MEMBER_GUARDED_READ_PATHS.has(path) ||
    path === "/member/products" ||
    path.startsWith("/member/products/") ||
    path.startsWith("/pricing/") ||
    // The master-offerings v2 catalog reads (GET/HEAD only at this gateway
    // shape) own a stronger downstream guard: display flag, canonical member
    // auth, and the fail-closed launch scope, with private response headers.
    // Deliberately narrower than the documented "/catalog-display/" fix:
    // only the MOUNTED v2 surface is admitted, so the unmounted v1 paths
    // stay walled with the gateway's 401, which SEN-0023 pins.
    path.startsWith("/catalog-display/v2/");
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
  // kebab-case, so that remains the existing admission anchor.
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
    // customer-account/routes.ts: the seven PER-MEMBER paths ride injected
    // requireMember (a customer with a billing problem must still read their
    // own account state, so the active-member guard is deliberately not the
    // door for those).
    "/customer-account/overview",
    "/customer-account/orders",
    "/customer-account/subscription",
    "/customer-account/care",
    "/customer-account/documents",
    "/customer-account/support",
    // customer-account/routes.ts: injected requireActiveMember (P1-2,
    // 2026-08-27) — the catalog-priority projection is GLOBAL availability
    // data, not the caller's own account state, so it carries the same door
    // as the member catalog. The wall only admits it to the route's guard.
    "/customer-account/catalog-priority",
    "/goals", // commerce/routes.ts: injected requireActiveMember
    "/guides", // commerce/routes.ts: injected requireActiveMember
    "/media", // media.ts: requireActiveMember
    "/questions", // questions.ts: requireActiveMember
    "/products", // commerce/routes.ts: injected requireActiveMember
    "/telegram", // questions.ts: requireActiveMember
    "/tracker", // tracker.ts: requireActiveMember
  ]);
  const MEMBER_SESSION_WRITE_PATHS = new Set([
    "/agreements", // agreements.ts: requireMember (signing precedes activation)
    "/customer-account/support", // customer-account/routes.ts: injected requireMember
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
  const CANONICAL_MEMBER_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const isOneRawPathSegment = (path: string, root: string): boolean => {
    if (!path.startsWith(`${root}/`)) return false;
    const segment = path.slice(root.length + 1);
    return segment.length > 0 && !segment.includes("/");
  };
  const isCanonicalProductPath = (path: string): boolean => {
    const product = /^\/products\/([^/]+)$/.exec(path);
    return product !== null && product[1].length <= 120 && CANONICAL_MEMBER_SLUG.test(product[1]);
  };
  const isKrisLaunchAReadPath = (path: string): boolean =>
    path === "/kris-launch-a/v1/catalog" ||
    /^\/kris-launch-a\/v1\/products\/[a-z0-9][a-z0-9-]{0,191}$/.test(path);
  const memberSessionRoute = (method: string, path: string): boolean => {
    if (method === "GET" || method === "HEAD") {
      if (MEMBER_SESSION_READ_PATHS.has(path)) return true;
      // Launch A remains an exact, bearer-only admission. The two anchored
      // shapes reach their own canonical active-member resolver; no namespace
      // prefix is opened and no write method is admitted.
      if (isKrisLaunchAReadPath(path)) return true;
      // GET /customer-account/documents/:documentId (customer-account/
      // routes.ts, injected requireMember + ownership-scoped byte read).
      // research_plan_documents.id is a gen_random_uuid() primary key, so the
      // canonical-UUID anchor is the correct admission shape.
      const customerAccountDocument = /^\/customer-account\/documents\/([^/]+)$/.exec(path);
      if (customerAccountDocument !== null) return canonicalUuid(customerAccountDocument[1]);
      // Product detail is an Express one-segment route; reject literal or
      // encoded separators so the bypass cannot grow into a namespace prefix.
      if (isCanonicalProductPath(path)) return true;
      // Preserve the pre-existing canonical Guide admission boundary exactly.
      const guide = /^\/guides\/([^/]+)$/.exec(path);
      return guide !== null && guide[1].length <= 80 && CANONICAL_MEMBER_SLUG.test(guide[1]);
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

  // Pack02 account identity owns a stronger downstream boundary: every exact
  // route resolves the Bearer credential through Supabase Auth and then scopes
  // account and organization reads in its service/store. Admit only the nine
  // registered method/path shapes here so the legacy review-password wall does
  // not shadow that canonical verifier. Lookalikes and future sibling routes
  // remain walled until explicitly reviewed.
  const accountIdentityRoute = (method: string, path: string): boolean => {
    if ((method === "GET" || method === "HEAD") && path === "/account/context") return true;
    if (method === "POST" && new Set([
      "/account/claims/request",
      "/account/claims/confirm",
      "/account/security/password-change-complete",
      "/account/organization-invitations/accept",
    ]).has(path)) return true;

    const organizationRoute = /^\/account\/organizations\/([^/]+)\/(dashboard|profile|users\/invitations|orders\/request-again)$/.exec(path);
    if (organizationRoute === null || !canonicalUuid(organizationRoute[1])) return false;
    const leaf = organizationRoute[2];
    return ((method === "GET" || method === "HEAD") && leaf === "dashboard")
      || (method === "PATCH" && leaf === "profile")
      || (method === "POST" && (leaf === "users/invitations" || leaf === "orders/request-again"));
  };

  app.use("/api/research", (req, res, next) => {
    // Path-exact GET/HEAD boundaries only: /member/catalog is the alias door
    // onto the same legacy array (guards.ts), while /member/me is the private
    // session probe. Their denials must carry the same private headers as their
    // 200s, so the set is applied here BEFORE any wall or member-guard response.
    // A lookalike path fails the equality and a wrong method fails the method
    // check, so their walling is unchanged.
    // Orders have one list path and one Express detail segment. Encoded content
    // remains one raw segment; empty or literal extra segments do not match.
    const privateOrderReadPath =
      req.path === "/orders" || /^\/orders\/[^/]+$/.test(req.path);
    const privateCatalogReadPath =
      req.path === "/products" ||
      isOneRawPathSegment(req.path, "/products") ||
      req.path === "/goals" ||
      req.path === "/guides" ||
      isOneRawPathSegment(req.path, "/guides");
    const privateMemberReadRoute =
      (req.method === "GET" || req.method === "HEAD") &&
      (req.path === "/catalog" ||
        req.path === "/member/catalog" ||
        req.path === "/member/me" ||
        privateOrderReadPath ||
        privateCatalogReadPath);
    if (privateMemberReadRoute) {
      setResearchPrivateHeaders(res);
    }
    if (publicMode()) return next();
    if (accountIdentityRoute(req.method, req.path)) return next();
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
        (EARLY_ACCESS_OPEN_READ_PATHS.has(req.path) ||
          EARLY_ACCESS_ORDER_READ.test(req.path) ||
          EARLY_ACCESS_CART_READ.test(req.path) ||
          EARLY_ACCESS_ASSISTED_ORDER_READ.test(req.path))) ||
      (req.method === "POST" &&
        (EARLY_ACCESS_OPEN_WRITE_PATHS.has(req.path) ||
          EARLY_ACCESS_ORDER_WRITE.test(req.path) ||
          EARLY_ACCESS_CART_WRITE.test(req.path) ||
          EARLY_ACCESS_ASSISTED_ORDER_WRITE.test(req.path)))
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
