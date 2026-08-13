/**
 * The HTTP surface for Launch A: two GET doors, read only, private, noindex.
 *
 * ORDER OF REFUSALS, AND WHY IT IS NOT THE SIBLING'S ORDER
 * -------------------------------------------------------
 * The master-offerings lane parses the query before it authenticates, which is
 * fine for a catalog whose existence is not itself confidential. Launch A is a
 * partner price sheet, so the order here is deliberately: flag, then identity,
 * then entitlement, then query. An anonymous caller learns only that the door
 * exists; it cannot learn which query keys are allowlisted, and no refusal path
 * touches the dataset at all.
 *
 * WHAT AN ERROR BODY MAY CONTAIN
 * ------------------------------
 * `{ ok: false, code }` and nothing else. No product, no price, no count, no
 * echo of what was asked for, no reason beyond the code. A 403 in particular
 * must be indistinguishable whether the catalog holds 420 items or none.
 */

import type { NextFunction, Request, Response } from "express";
import {
  isKrisChannel,
  isKrisFamily,
  isKrisSort,
  type KrisCatalogErrorResponse,
  type KrisCatalogQuery,
  type KrisChannel,
  type KrisFamily,
  type KrisPriceProfile,
  type KrisSort,
} from "@shared/research/kris-launch-a/contract";
import { resolveKrisEntitlement } from "./entitlement";
import type { KrisCatalogService } from "./service";
import { krisLaunchAEnabled, type KrisLaunchAEnv } from "./visibility-policy";

/**
 * The authenticated viewer, as the SERVER resolved it.
 *
 * `memberId` and `email` must come from the member row the canonical member
 * auth chain looked up (server/research/catalog-display-viewer.ts resolves the
 * same identity for the sibling surface). Nothing here may be a value the
 * browser supplied: entitlement to a confidential price sheet cannot be
 * something a caller can assert about itself.
 */
export interface KrisCatalogViewer {
  audience: "member" | "admin";
  email: string;
  /** The canonical member id when the account exists, null before activation. */
  memberId: string | null;
}

export interface KrisCatalogApiDependencies {
  authorizeViewer(
    req: Request,
  ): Promise<KrisCatalogViewer | null> | KrisCatalogViewer | null;
  /**
   * Build the service for an ENTITLED viewer.
   *
   * It takes the resolved profile rather than the viewer choosing one, so the
   * only way to reach a price is to have been entitled to that exact profile
   * first. Throwing (an unreadable artifact, an unpriceable profile) is a 503,
   * never an empty catalog.
   */
  serviceForProfile(
    profile: KrisPriceProfile,
    viewer: KrisCatalogViewer,
  ): Promise<KrisCatalogService> | KrisCatalogService;
  env?: KrisLaunchAEnv;
}

export interface KrisCatalogApiHandlers {
  privateHeaders(req: Request, res: Response, next: NextFunction): void;
  list(req: Request, res: Response): Promise<void>;
  detail(req: Request, res: Response): Promise<void>;
  options(req: Request, res: Response): void;
  error(err: unknown, req: Request, res: Response, next: NextFunction): void;
}

export const KRIS_CATALOG_BASE_PATH = "/api/research/kris-launch-a/v1";
export const KRIS_CATALOG_LIST_ROUTE = `${KRIS_CATALOG_BASE_PATH}/catalog`;
export const KRIS_CATALOG_DETAIL_ROUTE = `${KRIS_CATALOG_BASE_PATH}/products/:slug`;

const RESPONSES = {
  disabled: { ok: false, code: "kris_catalog_disabled" },
  auth: { ok: false, code: "kris_catalog_auth_required" },
  forbidden: { ok: false, code: "kris_catalog_forbidden" },
  invalid: { ok: false, code: "kris_catalog_invalid_request" },
  notFound: { ok: false, code: "kris_catalog_not_found" },
  unavailable: { ok: false, code: "kris_catalog_unavailable" },
} as const satisfies Record<string, KrisCatalogErrorResponse>;

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,191}$/;

/**
 * The closed query-key allowlist. A key that is not on it is a 400, which makes
 * an unrecognized parameter a refusal rather than a silently ignored
 * instruction. Every new capability joins this set explicitly.
 */
const LIST_QUERY_KEYS = new Set(["q", "families", "channels", "sort", "page", "pageSize"]);

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

function one(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function list(value: unknown): string[] | null {
  if (value === undefined) return [];
  const raw = Array.isArray(value) ? value : [value];
  if (!raw.every((entry) => typeof entry === "string")) return null;
  return raw
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function positiveInteger(value: unknown, maximum: number): number | null {
  if (value === undefined) return 0;
  const raw = one(value);
  if (raw === null || !/^[1-9]\d*$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

/**
 * Parse the list query, or refuse it.
 *
 * `pageSize` above the ceiling is a 400 rather than a silent clamp: a caller
 * asking for 500 rows and receiving 100 without being told has been answered
 * with something it did not ask for. The service clamps as well, so the ceiling
 * holds even if a future caller bypasses this parser.
 *
 * Families and channels need no count cap. Both vocabularies are closed and
 * validated by the shared guards, so the list is self limiting: a caller can
 * send at most five channels and seven families that mean anything.
 */
export function parseKrisCatalogQuery(
  req: Pick<Request, "query">,
): KrisCatalogQuery | null {
  if (Object.keys(req.query).some((key) => !LIST_QUERY_KEYS.has(key))) return null;
  const q = req.query.q === undefined ? "" : one(req.query.q);
  const families = list(req.query.families);
  const channels = list(req.query.channels);
  const sort = req.query.sort === undefined ? "" : one(req.query.sort);
  const page = positiveInteger(req.query.page, Number.MAX_SAFE_INTEGER);
  const pageSize = positiveInteger(req.query.pageSize, 100);
  if (
    q === null ||
    q.length > 160 ||
    families === null ||
    channels === null ||
    sort === null ||
    page === null ||
    pageSize === null ||
    !families.every(isKrisFamily) ||
    !channels.every(isKrisChannel) ||
    (sort !== "" && !isKrisSort(sort))
  ) {
    return null;
  }
  return {
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(families.length ? { families: families as KrisFamily[] } : {}),
    ...(channels.length ? { channels: channels as KrisChannel[] } : {}),
    ...(sort ? { sort: sort as KrisSort } : {}),
    ...(page > 0 ? { page } : {}),
    ...(pageSize > 0 ? { pageSize } : {}),
  };
}

export function createKrisCatalogApiHandlers(
  dependencies: KrisCatalogApiDependencies,
): KrisCatalogApiHandlers {
  if (
    !dependencies ||
    typeof dependencies.authorizeViewer !== "function" ||
    typeof dependencies.serviceForProfile !== "function"
  ) {
    throw new Error("createKrisCatalogApiHandlers refused: dependencies required");
  }
  const env = dependencies.env ?? process.env;

  /**
   * Flag, identity, entitlement. Returns the viewer and the profile they are
   * entitled to, or writes the refusal and returns null.
   *
   * There is no fallback profile and no unpriced catalog for a viewer without
   * entitlement. A non-entitled member is refused outright, because "the
   * catalog without the prices" would still disclose the partner's assortment.
   * That holds for an admin too: entitlement is the only grant on this surface,
   * so an operator cannot become the audience for a confidential sheet by
   * virtue of being an operator.
   */
  const open = async (
    req: Request,
    res: Response,
  ): Promise<{ viewer: KrisCatalogViewer; profile: KrisPriceProfile } | null> => {
    if (!krisLaunchAEnabled(env)) {
      res.status(503).json(RESPONSES.disabled);
      return null;
    }
    const viewer = await dependencies.authorizeViewer(req);
    if (
      viewer === null ||
      (viewer.audience !== "member" && viewer.audience !== "admin") ||
      typeof viewer.email !== "string" ||
      viewer.email.trim() === ""
    ) {
      res.status(401).json(RESPONSES.auth);
      return null;
    }
    const entitlement = resolveKrisEntitlement(
      { memberId: viewer.memberId ?? null, email: viewer.email },
      env,
    );
    if (!entitlement.entitled) {
      res.status(403).json(RESPONSES.forbidden);
      return null;
    }
    return { viewer, profile: entitlement.profile };
  };

  const listHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const opened = await open(req, res);
      if (opened === null) return;
      const query = parseKrisCatalogQuery(req);
      if (query === null) {
        res.status(400).json(RESPONSES.invalid);
        return;
      }
      const service = await dependencies.serviceForProfile(
        opened.profile,
        opened.viewer,
      );
      res.json(service.list(query));
    } catch {
      // An unreadable artifact, an unpriceable profile, a failed authorizer:
      // all of them are "we cannot serve this", never an empty catalog and
      // never a 500 carrying a stack.
      res.status(503).json(RESPONSES.unavailable);
    }
  };

  const detailHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const opened = await open(req, res);
      if (opened === null) return;
      // A detail door takes no query at all, so an unexpected key is a refusal
      // rather than something quietly dropped.
      if (Object.keys(req.query).length > 0) {
        res.status(400).json(RESPONSES.invalid);
        return;
      }
      const slug = String(req.params.slug ?? "");
      if (!SAFE_SLUG.test(slug)) {
        res.status(400).json(RESPONSES.invalid);
        return;
      }
      const service = await dependencies.serviceForProfile(
        opened.profile,
        opened.viewer,
      );
      const product = service.detail(slug);
      if (product === null) {
        res.status(404).json(RESPONSES.notFound);
        return;
      }
      res.json({ ok: true, profile: opened.profile, product });
    } catch {
      res.status(503).json(RESPONSES.unavailable);
    }
  };

  const options = (_req: Request, res: Response): void => {
    if (!krisLaunchAEnabled(env)) {
      res.status(503).json(RESPONSES.disabled);
      return;
    }
    res.set("Allow", "GET, HEAD, OPTIONS");
    res.status(204).end();
  };

  /**
   * The path-scoped error handler. Scoped on purpose: a global one here would
   * swallow failures from every other route in the application.
   */
  const error = (
    err: unknown,
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (res.headersSent) {
      next(err);
      return;
    }
    setPrivateHeaders(res);
    res
      .status(err instanceof URIError ? 400 : 503)
      .json(err instanceof URIError ? RESPONSES.invalid : RESPONSES.unavailable);
  };

  return { privateHeaders, list: listHandler, detail: detailHandler, options, error };
}
