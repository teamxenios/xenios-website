import type { NextFunction, Request, Response } from "express";
import {
  MASTER_OFFERING_MAX_CATEGORY_FILTERS,
  isMasterOfferingCategorySlug,
  isMasterOfferingFamily,
  isMasterOfferingSort,
  type MasterOfferingCatalogQuery,
  type MasterOfferingFamily,
  type MasterOfferingSort,
} from "@shared/research/master-offerings/contract";
import type {
  PublicStorefrontCatalogResponse,
  PublicStorefrontDetailResponse,
  PublicStorefrontErrorResponse,
} from "@shared/research/storefront/contract";
import type { VisibilityEnv } from "../catalog-display/visibility";
import { toPublicStorefrontDetail, toPublicStorefrontPage } from "./projection";
import {
  authorizePublicStorefrontCandidates,
  authorizePublicStorefrontDetail,
  findCurrentPublicStorefrontPublication,
  isPublicStorefrontPublicationSnapshotCurrent,
  parsePublicStorefrontCatalogCandidateSnapshot,
  parsePublicStorefrontPublicationSnapshot,
  publicStorefrontPublicationSnapshotFingerprint,
  publicStorefrontPublicationScope,
  selectPublishedPublicStorefront,
  type PublicCatalogReadService,
  type PublicStorefrontPublicationAuthority,
} from "./publication";

export type { PublicCatalogReadService } from "./publication";

/**
 * The public storefront HTTP layer: two read-only doors for a signed-out
 * visitor, fail closed behind one default-off flag.
 *
 * NO AUTHENTICATION ON PURPOSE. Every response does require a fresh durable
 * approved-copy publication snapshot, then reads the canonical catalog at the
 * exact revision that snapshot names for a viewer with no pricing grant. It
 * sells nothing, mounts no cart, and carries no session.
 *
 * Setting RESEARCH_PUBLIC_STOREFRONT_ENABLED=true in any production
 * environment is a production mutation and requires Samuel's current explicit
 * approval, every time. Unset or anything but the exact string "true", every
 * door answers the closed refusal.
 */

export const PUBLIC_STOREFRONT_ENABLED_ENV_VAR =
  "RESEARCH_PUBLIC_STOREFRONT_ENABLED";

export function publicStorefrontEnabled(
  env: VisibilityEnv = process.env,
): boolean {
  return env[PUBLIC_STOREFRONT_ENABLED_ENV_VAR] === "true";
}

/**
 * The two reads this surface needs, named structurally rather than by
 * importing the member catalog's service class.
 *
 * The repository pins a boundary (master-offerings/catalog-boundaries.test.ts)
 * that the catalog lane is imported only by the composition root, so a second
 * shipping door fails by name. This surface IS a second door, and it stays on
 * the right side of that boundary by depending on a shape instead of on the
 * lane: the composition root, which already owns the lane, supplies the real
 * service. Nothing here can reach the lane's internals.
 */
export interface PublicStorefrontApiDependencies {
  /**
   * A NEW catalog service per request, composed by the root for the one
   * synthetic no-grant viewer. Per-request matters: the service memoizes
   * prices and bindings for its own lifetime, and an instance that outlived
   * the request would serve yesterday's catalog.
   */
  serviceForVisitor():
    | Promise<PublicCatalogReadService>
    | PublicCatalogReadService;
  /**
   * Mandatory durable approved-copy authority. Omitting this dependency makes
   * handler construction fail, so the old no-authority source cannot be
   * mounted accidentally.
   */
  publicationAuthority: PublicStorefrontPublicationAuthority;
  /** Server clock seam for exact snapshot freshness tests. */
  now?: () => string;
  env?: VisibilityEnv;
}

export interface PublicStorefrontApiHandlers {
  publicHeaders(req: Request, res: Response, next: NextFunction): void;
  catalog(req: Request, res: Response): Promise<void>;
  detail(req: Request, res: Response): Promise<void>;
  options(req: Request, res: Response): void;
  error(err: unknown, req: Request, res: Response, next: NextFunction): void;
}

const RESPONSES = {
  closed: { ok: false, code: "storefront_closed" },
  invalid: { ok: false, code: "storefront_invalid_request" },
  notFound: { ok: false, code: "storefront_not_found" },
  unavailable: { ok: false, code: "storefront_unavailable" },
} as const satisfies Record<string, PublicStorefrontErrorResponse>;

/** The server's own slug shape, same as the v2 detail door. */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,191}$/;

/**
 * The closed public query surface: the member catalog's own filters minus the
 * display-state filter and the price list. A key outside this set is a 400,
 * never a silently ignored instruction.
 */
const PUBLIC_QUERY_KEYS = new Set([
  "q",
  "families",
  "categories",
  "sort",
  "page",
  "pageSize",
]);

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
 * The public query surface, parsed here rather than borrowed from the member
 * door.
 *
 * The two surfaces are deliberately NOT the same vocabulary: `states` is a
 * member filter and has no public equivalent, so borrowing the member parser
 * would mean accepting a key this surface then has to strip. Both parsers
 * validate against the same closed shared vocabularies
 * (`isMasterOfferingFamily`, `isMasterOfferingSort`,
 * `isMasterOfferingCategorySlug`), which is where "the two can never disagree
 * about what a filter means" actually comes from.
 *
 * A key outside the set is a 400, never a silently ignored instruction.
 */
export function parsePublicStorefrontQuery(
  req: Pick<Request, "query">,
): MasterOfferingCatalogQuery | null {
  if (Object.keys(req.query).some((key) => !PUBLIC_QUERY_KEYS.has(key))) {
    return null;
  }
  const q = req.query.q === undefined ? "" : one(req.query.q);
  const families = list(req.query.families);
  const categories = list(req.query.categories);
  const sort = req.query.sort === undefined ? "" : one(req.query.sort);
  const page = positiveInteger(req.query.page, Number.MAX_SAFE_INTEGER);
  const pageSize = positiveInteger(req.query.pageSize, 100);
  if (
    q === null ||
    q.length > 160 ||
    families === null ||
    categories === null ||
    sort === null ||
    page === null ||
    pageSize === null ||
    !families.every(isMasterOfferingFamily) ||
    // The category vocabulary is data owned and only shape checked, so it
    // gets an explicit ceiling: without one a caller could post an unbounded
    // list of well formed tokens and make the server hold it.
    categories.length > MASTER_OFFERING_MAX_CATEGORY_FILTERS ||
    !categories.every(isMasterOfferingCategorySlug) ||
    (sort !== "" && !isMasterOfferingSort(sort))
  ) {
    return null;
  }
  return {
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(families.length ? { families: families as MasterOfferingFamily[] } : {}),
    ...(categories.length ? { categories } : {}),
    ...(sort ? { sort: sort as MasterOfferingSort } : {}),
    ...(page > 0 ? { page } : {}),
    ...(pageSize > 0 ? { pageSize } : {}),
  };
}

function setPublicHeaders(res: Response): void {
  // Still a private, unindexed tree (SEN-0027): production sends the same
  // x-robots-tag on every /research route, and this surface must not
  // contradict it. no-store keeps a shared or kiosk browser from replaying a
  // stale catalog after the founder changes availability.
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex, nofollow");
}

export function createPublicStorefrontApiHandlers(
  dependencies: PublicStorefrontApiDependencies,
): PublicStorefrontApiHandlers {
  if (
    !dependencies ||
    typeof dependencies.serviceForVisitor !== "function" ||
    !dependencies.publicationAuthority ||
    typeof dependencies.publicationAuthority.readCurrentSnapshot !== "function"
  ) {
    throw new Error(
      "createPublicStorefrontApiHandlers refused: durable publication dependencies required",
    );
  }
  const env = dependencies.env ?? process.env;
  const now = dependencies.now ?? (() => new Date().toISOString());

  const publicHeaders = (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    setPublicHeaders(res);
    next();
  };

  const catalog = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!publicStorefrontEnabled(env)) {
        res.status(503).json(RESPONSES.closed);
        return;
      }
      const query = parsePublicStorefrontQuery(req);
      if (query === null) {
        res.status(400).json(RESPONSES.invalid);
        return;
      }
      const publicationValue =
        await dependencies.publicationAuthority.readCurrentSnapshot();
      const publicationReadAt = now();
      const publication = parsePublicStorefrontPublicationSnapshot(
        publicationValue,
        publicationReadAt,
      );
      if (publication === null) throw new Error("publication unavailable");
      const service = await dependencies.serviceForVisitor();
      if (!service || typeof service.readCandidates !== "function") {
        throw new Error("catalog source unavailable");
      }
      const candidates = parsePublicStorefrontCatalogCandidateSnapshot(
        await service.readCandidates(
          publicStorefrontPublicationScope(publication),
        ),
        publication.catalogRevisionId,
      );
      if (candidates === null) throw new Error("catalog snapshot invalid");
      const currentPublicationValue =
        await dependencies.publicationAuthority.readCurrentSnapshot();
      const currentReadAt = now();
      const currentPublication = parsePublicStorefrontPublicationSnapshot(
        currentPublicationValue,
        currentReadAt,
      );
      if (
        currentPublication === null ||
        currentPublication.authorityRevisionId !==
          publication.authorityRevisionId ||
        currentPublication.catalogRevisionId !== publication.catalogRevisionId ||
        publicStorefrontPublicationSnapshotFingerprint(currentPublication) !==
          publicStorefrontPublicationSnapshotFingerprint(publication)
      ) {
        throw new Error("publication changed during read");
      }
      const authorized = authorizePublicStorefrontCandidates(
        currentPublication,
        candidates,
        currentReadAt,
      );
      if (
        authorized === null ||
        !isPublicStorefrontPublicationSnapshotCurrent(
          currentPublication,
          currentReadAt,
        )
      ) {
        throw new Error("publication changed during read");
      }
      const body: PublicStorefrontCatalogResponse = {
        ok: true,
        catalog: toPublicStorefrontPage(
          selectPublishedPublicStorefront(authorized, query),
        ),
      };
      res.json(body);
    } catch {
      res.status(503).json(RESPONSES.unavailable);
    }
  };

  const detail = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!publicStorefrontEnabled(env)) {
        res.status(503).json(RESPONSES.closed);
        return;
      }
      const family = String(req.params.family ?? "");
      const slug = String(req.params.slug ?? "");
      if (!isMasterOfferingFamily(family) || !SAFE_SLUG.test(slug)) {
        res.status(400).json(RESPONSES.invalid);
        return;
      }
      const publicationValue =
        await dependencies.publicationAuthority.readCurrentSnapshot();
      const publicationReadAt = now();
      const publication = parsePublicStorefrontPublicationSnapshot(
        publicationValue,
        publicationReadAt,
      );
      if (publication === null) throw new Error("publication unavailable");
      const published = findCurrentPublicStorefrontPublication(
        publication,
        family,
        slug,
        publicationReadAt,
      );
      // Publication is checked before the catalog detail source is touched.
      // An unpublished and an absent address therefore have the same response
      // and neither becomes a direct-lookup oracle.
      if (published === null) {
        res.status(404).json(RESPONSES.notFound);
        return;
      }
      const service = await dependencies.serviceForVisitor();
      if (!service || typeof service.readDetail !== "function") {
        throw new Error("catalog source unavailable");
      }
      const candidate = await service.readDetail({
        ...publicStorefrontPublicationScope(publication),
        offeringId: published.offeringId,
        family: published.family,
        slug: published.slug,
        publicationRevisionId: published.publicationRevisionId,
        copyRevisionId: published.copyRevisionId,
      });
      const currentPublicationValue =
        await dependencies.publicationAuthority.readCurrentSnapshot();
      const currentReadAt = now();
      const currentPublication = parsePublicStorefrontPublicationSnapshot(
        currentPublicationValue,
        currentReadAt,
      );
      if (
        currentPublication === null ||
        currentPublication.authorityRevisionId !==
          publication.authorityRevisionId ||
        currentPublication.catalogRevisionId !== publication.catalogRevisionId ||
        publicStorefrontPublicationSnapshotFingerprint(currentPublication) !==
          publicStorefrontPublicationSnapshotFingerprint(publication)
      ) {
        throw new Error("publication changed during detail read");
      }
      const currentPublished = findCurrentPublicStorefrontPublication(
        currentPublication,
        family,
        slug,
        currentReadAt,
      );
      if (
        currentPublished === null ||
        currentPublished.publicationRevisionId !==
          published.publicationRevisionId ||
        currentPublished.copyRevisionId !== published.copyRevisionId
      ) {
        throw new Error("publication changed during detail read");
      }
      const product = authorizePublicStorefrontDetail(
        candidate,
        currentPublished,
      );
      if (
        product === null ||
        !isPublicStorefrontPublicationSnapshotCurrent(
          currentPublication,
          currentReadAt,
        )
      ) {
        throw new Error("published detail mismatch");
      }
      const body: PublicStorefrontDetailResponse = {
        ok: true,
        product: toPublicStorefrontDetail(product),
      };
      res.json(body);
    } catch {
      res.status(503).json(RESPONSES.unavailable);
    }
  };

  const options = (_req: Request, res: Response): void => {
    if (!publicStorefrontEnabled(env)) {
      res.status(503).json(RESPONSES.closed);
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
    setPublicHeaders(res);
    res
      .status(err instanceof URIError ? 400 : 503)
      .json(err instanceof URIError ? RESPONSES.invalid : RESPONSES.unavailable);
  };

  return { publicHeaders, catalog, detail, options, error };
}
