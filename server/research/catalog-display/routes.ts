/**
 * The catalog display HTTP registration adapter. Server only, read only.
 *
 * This module wraps the catalog display projection in the smallest possible
 * Express surface, following server/research/pricing/routes.ts exactly: one
 * registration function, every collaborator injected, fail closed everywhere,
 * private no-store and noindex headers on every response, a closed error code
 * vocabulary, an explicit OPTIONS handler, and a path scoped error boundary. It
 * registers nothing by itself and needs no database, no network, and no
 * credential to test.
 *
 * Boundary rules enforced here:
 * - The browser never chooses its audience or its breadth. The adapter reads
 *   neither from a query parameter, a body, a header, or a cookie. The injected
 *   authorizer derives the viewer from the authenticated request on the server
 *   side (in production: requireActiveMember for a member, the ADMIN_EMAIL
 *   check for an admin), and the breadth is then computed from the server side
 *   allowlist in ./visibility.ts. A caller who sends ?breadth=full gets exactly
 *   what their allowlist entry grants, which by default is nothing extra.
 * - Fail closed everywhere. Missing dependencies refuse registration before any
 *   route mounts. The enablement flag defaults to disabled and a disabled
 *   surface answers 503 catalog_display_disabled uniformly. An unauthorized
 *   caller answers 401 and the projection is never built. A malformed lane or
 *   slug answers 400 with a closed code and never echoes the input. An
 *   unexpected failure answers 503 catalog_display_unavailable, never a 500
 *   with internal detail.
 * - The wire carries only each lane's own customer safe projection. See
 *   ./projection.ts for why that is structural rather than reviewed.
 * - The regulatory hold tier is never in a customer response. The three held
 *   records appear only in the `held` array, only for the admin audience, and
 *   only as a labelled notice with no price, no variants, and no offer mode.
 * - Read only. There is no mutation endpoint of any kind here.
 *
 * Closed wire codes: catalog_display_disabled (503),
 * catalog_display_auth_required (401), catalog_display_invalid_request (400),
 * catalog_display_not_found (404), catalog_display_unavailable (503).
 *
 * ---------------------------------------------------------------------------
 * WIRING (release manager; two files, both outside this lane's write zone,
 * this lane edits neither)
 * ---------------------------------------------------------------------------
 *
 * 1. server/index.ts: one import plus one registerCatalogDisplayApi(app, deps)
 *    call, placed with the other member facing research registrations, right
 *    after registerMemberCatalogApi.
 *
 *      import {
 *        registerCatalogDisplayApi,
 *        catalogDisplayEnabledFromEnv,
 *      } from "./research/catalog-display/routes";
 *
 *      registerCatalogDisplayApi(app, {
 *        authorizeViewer: authorizeCatalogDisplayViewer,
 *        enabled: catalogDisplayEnabledFromEnv,
 *      });
 *
 *    authorizeCatalogDisplayViewer is built on the repo's existing member auth
 *    (server/research/member-auth.ts): verify the Supabase JWT, resolve the
 *    member row, require ACTIVE status exactly as requireActiveMember does,
 *    and return { audience: "member", email: member.email }. The admin
 *    audience is the same resolution with the ADMIN_EMAIL comparison from
 *    server/routes.ts requireSupabaseAdmin (lowercased, trimmed, exact) and
 *    returns { audience: "admin", email }. Tests inject a fake, so this
 *    adapter needs no Supabase project to exercise.
 *
 * 2. server/research/index.ts (REQUIRED, or these routes are unreachable in
 *    the production posture): the /api/research gateway wall registered by
 *    registerResearchApi runs before this adapter and answers its own 401 to
 *    any caller without the shared review cookie unless the path is on a
 *    bypass list. "/catalog-display" is on no list today, so a valid active
 *    member Bearer JWT never reaches this adapter, and the disabled state
 *    answers the gateway's generic 401 instead of the uniform 503
 *    catalog_display_disabled. The one line fix, beside the existing
 *    `|| path.startsWith("/pricing/")`, is:
 *
 *      || path.startsWith("/catalog-display/")
 *
 *    That read predicate, not MEMBER_AUTHED_PREFIXES, is the right lever for
 *    the same three reasons the pricing adapter documented: it matches the
 *    gateway's stated intent for exactly this shape (GET and HEAD reads that
 *    own a stronger downstream member guard and private response headers, the
 *    same shape as /capabilities, /member/products, and /pricing/), it is
 *    scoped to GET and HEAD at the gateway so no future mutation surface could
 *    ride the bypass, and it lets every caller reach this adapter's uniform
 *    closed answers instead of the gateway's generic 401. Note also that the
 *    existing "/catalog" entry in MEMBER_AUTHED_PREFIXES does NOT cover these
 *    routes: that check matches the exact path "/catalog" or the prefix
 *    "/catalog/", and "/catalog-display/..." is neither. The gateway
 *    integration suite in routes.test.ts proves both today's trap and the post
 *    edit behavior.
 */

import type { Express, NextFunction, Request, Response } from "express";
import {
  isCatalogDisplayLane,
  type CatalogDisplayAudience,
  type CatalogDisplayListResponse,
  type CatalogDisplayDetailResponse,
} from "@shared/research/catalog-display/contract";
import {
  allDisplayableCards,
  displayCatalog,
  displayProductDetail,
  excludedRegulatoryHoldCount,
  heldProductNotices,
} from "./projection";
import { resolveViewerVisibilityBreadth, type VisibilityEnv } from "./visibility";

/**
 * The server derived facts for one authenticated request.
 *
 * The email is the identity the FULL_CATALOG_VISIBILITY allowlist is compared
 * against. It comes from the verified session (the Supabase user's email, or
 * the resolved member row), never from a header or a query parameter.
 */
export interface CatalogDisplayViewer {
  audience: CatalogDisplayAudience;
  email: string;
  /**
   * The membership status the authorizer VERIFIED, when it verified one.
   * Optional so alternate authorizers stay valid; the breadth policy treats
   * absence as not-active and falls back to the named-email allowlist.
   */
  memberStatus?: string | null;
}

/**
 * Derives the viewer from the request, server side only. Return null for an
 * unauthenticated or unrecognized caller; the adapter answers 401 and never
 * builds a projection.
 */
export type CatalogDisplayAuthorizer = (
  req: Request,
) => Promise<CatalogDisplayViewer | null> | CatalogDisplayViewer | null;

export interface CatalogDisplayApiDependencies {
  authorizeViewer: CatalogDisplayAuthorizer;
  /**
   * Enablement flag, evaluated per request. Omitted means disabled: every
   * endpoint answers 503 catalog_display_disabled until the wiring opts in. A
   * flag that throws reads as disabled.
   */
  enabled?: () => boolean;
  /** Environment seam for the visibility allowlist. Defaults to process.env. */
  env?: VisibilityEnv;
}

export const CATALOG_DISPLAY_BASE_PATH = "/api/research/catalog-display";
export const CATALOG_DISPLAY_LIST_ROUTE = `${CATALOG_DISPLAY_BASE_PATH}/catalog`;
export const CATALOG_DISPLAY_DETAIL_ROUTE = `${CATALOG_DISPLAY_BASE_PATH}/products/:lane/:slug`;

export const CATALOG_DISPLAY_DISABLED_RESPONSE = {
  ok: false,
  code: "catalog_display_disabled",
  message: "The catalog is not available right now.",
} as const;

export const CATALOG_DISPLAY_AUTH_REQUIRED_RESPONSE = {
  ok: false,
  code: "catalog_display_auth_required",
} as const;

export const CATALOG_DISPLAY_INVALID_REQUEST_RESPONSE = {
  ok: false,
  code: "catalog_display_invalid_request",
} as const;

export const CATALOG_DISPLAY_NOT_FOUND_RESPONSE = {
  ok: false,
  code: "catalog_display_not_found",
} as const;

export const CATALOG_DISPLAY_UNAVAILABLE_RESPONSE = {
  ok: false,
  code: "catalog_display_unavailable",
} as const;

/**
 * The only slug shape the adapter forwards: one leading alphanumeric, then up
 * to 127 alphanumerics or hyphens. This covers every slug the three catalogs
 * mint while rejecting whitespace, path tricks, and control characters before
 * any collaborator runs.
 */
const SAFE_SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/;

/**
 * The production enablement flag. Display rides its own switch rather than the
 * commerce flag, because showing a catalog and selling from it are different
 * decisions: this surface can be on while every record is still gated at
 * request access only.
 */
export function catalogDisplayEnabledFromEnv(env: VisibilityEnv = process.env): boolean {
  return env.RESEARCH_CATALOG_DISPLAY_ENABLED === "true";
}

/** The catalog is member specific and must never be cached or indexed. */
function setPrivateHeaders(res: Response): void {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex, nofollow");
}

function privateHeaders(_req: Request, res: Response, next: NextFunction): void {
  setPrivateHeaders(res);
  next();
}

function requireFunction(value: unknown, what: string): void {
  if (typeof value !== "function") {
    throw new Error(`registerCatalogDisplayApi refused: ${what} is required`);
  }
}

/**
 * Mounts the read only catalog display endpoints. Throws before mounting
 * anything if a dependency is missing or malformed, so the API is never half
 * mounted: either both endpoints exist with a full dependency set, or neither
 * does.
 */
export function registerCatalogDisplayApi(
  app: Express,
  deps: CatalogDisplayApiDependencies,
): void {
  if (!app || typeof app.get !== "function") {
    throw new Error("registerCatalogDisplayApi refused: an express app is required");
  }
  if (!deps || typeof deps !== "object") {
    throw new Error("registerCatalogDisplayApi refused: dependencies are required");
  }
  requireFunction(deps.authorizeViewer, "authorizeViewer");
  if (deps.enabled !== undefined) requireFunction(deps.enabled, "enabled");

  const authorizeViewer = deps.authorizeViewer;
  const enabled = deps.enabled ?? (() => false);
  const env = deps.env ?? process.env;

  /** A flag that throws reads as disabled. Fail closed. */
  const readEnabled = (): boolean => {
    try {
      return enabled() === true;
    } catch {
      return false;
    }
  };

  /**
   * The shared front half of every handler: enablement, then authorization,
   * then the server side breadth decision. Returns null when it has already
   * answered.
   */
  const openRequest = async (
    req: Request,
    res: Response,
  ): Promise<{ viewer: CatalogDisplayViewer; breadth: "standard" | "full" } | null> => {
    if (!readEnabled()) {
      res.status(503).json(CATALOG_DISPLAY_DISABLED_RESPONSE);
      return null;
    }
    const viewer = await authorizeViewer(req);
    if (
      viewer === null ||
      typeof viewer !== "object" ||
      (viewer.audience !== "member" && viewer.audience !== "admin")
    ) {
      res.status(401).json(CATALOG_DISPLAY_AUTH_REQUIRED_RESPONSE);
      return null;
    }
    // The breadth is decided here, server side, from the viewer the
    // authorizer verified: admin and active-member viewers see the full
    // displayable range, everyone else falls through to the named-email
    // allowlist. Nothing the browser sent participates.
    return { viewer, breadth: resolveViewerVisibilityBreadth(viewer, env) };
  };

  app.get(CATALOG_DISPLAY_LIST_ROUTE, privateHeaders, async (req, res) => {
    try {
      const opened = await openRequest(req, res);
      if (opened === null) return;
      const { viewer, breadth } = opened;
      const products = displayCatalog(breadth);
      const body: CatalogDisplayListResponse = {
        ok: true,
        audience: viewer.audience,
        breadth,
        counts: {
          listed: products.length,
          displayable: allDisplayableCards().length,
          excludedRegulatoryHold: excludedRegulatoryHoldCount(),
        },
        products,
      };
      // The held tier is an operator view. It is attached only for an admin,
      // and it is absent (not empty) for a member, so a member response has no
      // field a later client could learn to read.
      if (viewer.audience === "admin") body.held = heldProductNotices();
      res.json(body);
    } catch {
      res.status(503).json(CATALOG_DISPLAY_UNAVAILABLE_RESPONSE);
    }
  });

  app.get(CATALOG_DISPLAY_DETAIL_ROUTE, privateHeaders, async (req, res) => {
    try {
      const lane = String(req.params.lane ?? "");
      const slug = String(req.params.slug ?? "");
      // Shape validation runs before authorization so a malformed request
      // never reaches the authorizer, and the closed code never echoes input.
      if (!isCatalogDisplayLane(lane) || !SAFE_SLUG_PATTERN.test(slug)) {
        if (!readEnabled()) {
          res.status(503).json(CATALOG_DISPLAY_DISABLED_RESPONSE);
          return;
        }
        res.status(400).json(CATALOG_DISPLAY_INVALID_REQUEST_RESPONSE);
        return;
      }
      const opened = await openRequest(req, res);
      if (opened === null) return;
      const { viewer, breadth } = opened;
      const product = displayProductDetail(lane, slug, breadth);
      if (product === null) {
        // One answer for "no such product", "held", and "not visible at this
        // breadth". A distinct code would let a caller enumerate the records
        // their grant does not cover.
        res.status(404).json(CATALOG_DISPLAY_NOT_FOUND_RESPONSE);
        return;
      }
      const body: CatalogDisplayDetailResponse = {
        ok: true,
        audience: viewer.audience,
        breadth,
        product,
      };
      res.json(body);
    } catch {
      res.status(503).json(CATALOG_DISPLAY_UNAVAILABLE_RESPONSE);
    }
  });

  // Explicit OPTIONS: Express's default reflection would answer 200 with an
  // Allow header before the enablement flag or the private headers ran. Here
  // OPTIONS obeys the same flag as every other request and advertises only the
  // read methods this surface has.
  const handleOptions = (_req: Request, res: Response): void => {
    if (!readEnabled()) {
      res.status(503).json(CATALOG_DISPLAY_DISABLED_RESPONSE);
      return;
    }
    res.set("Allow", "GET, HEAD, OPTIONS");
    res.status(204).end();
  };

  app.options(CATALOG_DISPLAY_LIST_ROUTE, privateHeaders, handleOptions);
  app.options(CATALOG_DISPLAY_DETAIL_ROUTE, privateHeaders, handleOptions);

  // Path scoped error boundary. A percent escape that cannot be decoded in a
  // path segment (for example /products/peptide/%zz) fails inside the router
  // before any handler above runs, and would otherwise fall through to the
  // global error handler in server/index.ts, which answers with err.message
  // (echoing the malformed input, with no private headers). Everything that
  // errors under this prefix answers a closed code with the private headers
  // instead: a client shaped error reads as catalog_display_invalid_request,
  // anything else fails closed as catalog_display_unavailable.
  app.use(
    CATALOG_DISPLAY_BASE_PATH,
    (err: unknown, _req: Request, res: Response, next: NextFunction): void => {
      if (res.headersSent) {
        next(err);
        return;
      }
      setPrivateHeaders(res);
      const shaped = (typeof err === "object" && err !== null ? err : {}) as {
        status?: unknown;
        statusCode?: unknown;
      };
      const clientError =
        err instanceof URIError || shaped.status === 400 || shaped.statusCode === 400;
      if (clientError) {
        res.status(400).json(CATALOG_DISPLAY_INVALID_REQUEST_RESPONSE);
      } else {
        res.status(503).json(CATALOG_DISPLAY_UNAVAILABLE_RESPONSE);
      }
    },
  );
}
