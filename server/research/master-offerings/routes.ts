import type { NextFunction, Request, Response } from "express";
import {
  isMasterOfferingDisplayState,
  isMasterOfferingFamily,
  type MasterOfferingCatalogErrorResponse,
  type MasterOfferingCatalogListResponse,
  type MasterOfferingCatalogDetailResponse,
  type MasterOfferingCatalogQuery,
  type MasterOfferingCatalogAudience,
  type MasterOfferingDisplayState,
  type MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import type { VisibilityEnv } from "../catalog-display/visibility";
import type { MasterOfferingCatalogService } from "./service";
import {
  masterOfferingsEnabled,
  masterOfferingsLaunchScope,
  mayViewMasterOfferings,
} from "./visibility-policy";

export interface MasterOfferingCatalogViewer {
  audience: MasterOfferingCatalogAudience;
  email: string;
}

export interface MasterOfferingCatalogApiDependencies {
  authorizeViewer(
    req: Request,
  ):
    | Promise<MasterOfferingCatalogViewer | null>
    | MasterOfferingCatalogViewer
    | null;
  serviceForViewer(
    viewer: MasterOfferingCatalogViewer,
  ): Promise<MasterOfferingCatalogService> | MasterOfferingCatalogService;
  env?: VisibilityEnv;
}

export interface MasterOfferingCatalogApiHandlers {
  privateHeaders(req: Request, res: Response, next: NextFunction): void;
  list(req: Request, res: Response): Promise<void>;
  detail(req: Request, res: Response): Promise<void>;
  options(req: Request, res: Response): void;
  error(
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void;
}

export const MASTER_OFFERING_CATALOG_BASE_PATH =
  "/api/research/catalog-display/v2";
export const MASTER_OFFERING_CATALOG_LIST_ROUTE =
  `${MASTER_OFFERING_CATALOG_BASE_PATH}/catalog`;
export const MASTER_OFFERING_CATALOG_DETAIL_ROUTE =
  `${MASTER_OFFERING_CATALOG_BASE_PATH}/products/:family/:slug`;

const RESPONSES = {
  disabled: { ok: false, code: "master_offerings_disabled" },
  auth: { ok: false, code: "master_offerings_auth_required" },
  restricted: { ok: false, code: "master_offerings_launch_restricted" },
  invalid: { ok: false, code: "master_offerings_invalid_request" },
  notFound: { ok: false, code: "master_offerings_not_found" },
  unavailable: { ok: false, code: "master_offerings_unavailable" },
} as const satisfies Record<string, MasterOfferingCatalogErrorResponse>;

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,191}$/;
const QUERY_KEYS = new Set(["q", "families", "states", "page", "pageSize"]);

function setPrivateHeaders(
  res: Response,
): void {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex, nofollow");
}

function privateHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
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

export function parseMasterOfferingCatalogQuery(
  req: Pick<Request, "query">,
): MasterOfferingCatalogQuery | null {
  if (Object.keys(req.query).some((key) => !QUERY_KEYS.has(key))) return null;
  const q = req.query.q === undefined ? "" : one(req.query.q);
  const families = list(req.query.families);
  const states = list(req.query.states);
  const page = positiveInteger(req.query.page, Number.MAX_SAFE_INTEGER);
  const pageSize = positiveInteger(req.query.pageSize, 100);
  if (
    q === null ||
    q.length > 160 ||
    families === null ||
    states === null ||
    page === null ||
    pageSize === null ||
    !families.every(isMasterOfferingFamily) ||
    !states.every(isMasterOfferingDisplayState)
  ) {
    return null;
  }
  return {
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(families.length
      ? { families: families as MasterOfferingFamily[] }
      : {}),
    ...(states.length
      ? { states: states as MasterOfferingDisplayState[] }
      : {}),
    ...(page > 0 ? { page } : {}),
    ...(pageSize > 0 ? { pageSize } : {}),
  };
}

export function createMasterOfferingCatalogApiHandlers(
  dependencies: MasterOfferingCatalogApiDependencies,
): MasterOfferingCatalogApiHandlers {
  if (
    !dependencies ||
    typeof dependencies.authorizeViewer !== "function" ||
    typeof dependencies.serviceForViewer !== "function"
  ) {
    throw new Error("createMasterOfferingCatalogApiHandlers refused: dependencies required");
  }
  const env = dependencies.env ?? process.env;

  const open = async (
    req: Request,
    res: Response,
  ): Promise<MasterOfferingCatalogViewer | null> => {
    if (!masterOfferingsEnabled(env)) {
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
    if (!mayViewMasterOfferings({ ...viewer, env })) {
      res.status(403).json(RESPONSES.restricted);
      return null;
    }
    return viewer;
  };

  const listHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!masterOfferingsEnabled(env)) {
        res.status(503).json(RESPONSES.disabled);
        return;
      }
      const query = parseMasterOfferingCatalogQuery(req);
      if (query === null) {
        res.status(400).json(RESPONSES.invalid);
        return;
      }
      const viewer = await open(req, res);
      if (viewer === null) return;
      const service = await dependencies.serviceForViewer(viewer);
      const body: MasterOfferingCatalogListResponse = {
        ok: true,
        audience: viewer.audience,
        launchScope: masterOfferingsLaunchScope(env),
        catalog: await service.list(query),
      };
      res.json(body);
    } catch {
      res.status(503).json(RESPONSES.unavailable);
    }
  };

  const detailHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!masterOfferingsEnabled(env)) {
        res.status(503).json(RESPONSES.disabled);
        return;
      }
      const family = String(req.params.family ?? "");
      const slug = String(req.params.slug ?? "");
      if (!isMasterOfferingFamily(family) || !SAFE_SLUG.test(slug)) {
        res.status(400).json(RESPONSES.invalid);
        return;
      }
      const viewer = await open(req, res);
      if (viewer === null) return;
      const service = await dependencies.serviceForViewer(viewer);
      const product = await service.detail(slug);
      if (product === null || product.family !== family) {
        res.status(404).json(RESPONSES.notFound);
        return;
      }
      const body: MasterOfferingCatalogDetailResponse = {
        ok: true,
        audience: viewer.audience,
        launchScope: masterOfferingsLaunchScope(env),
        product,
      };
      res.json(body);
    } catch {
      res.status(503).json(RESPONSES.unavailable);
    }
  };

  const options = (_req: Request, res: Response): void => {
    if (!masterOfferingsEnabled(env)) {
      res.status(503).json(RESPONSES.disabled);
      return;
    }
    res.set("Allow", "GET, HEAD, OPTIONS");
    res.status(204).end();
  };
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

  return {
    privateHeaders,
    list: listHandler,
    detail: detailHandler,
    options,
    error,
  };
}
