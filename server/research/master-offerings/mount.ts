import type { ErrorRequestHandler, RequestHandler } from "express";
import {
  MASTER_OFFERING_CATALOG_BASE_PATH,
  MASTER_OFFERING_CATALOG_DETAIL_ROUTE,
  MASTER_OFFERING_CATALOG_LIST_ROUTE,
  MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
  createMasterOfferingCatalogApiHandlers,
  type MasterOfferingCatalogApiDependencies,
} from "./routes";

/**
 * The catalog's route table, as data.
 *
 * WHY THIS IS A TABLE AND NOT A `mount(app)` FUNCTION
 * ---------------------------------------------------
 * The first version of this file called `app.get(...)` directly, which is the
 * obvious convenience. It was wrong, and the repository's own route census
 * caught it: `server/release-control-plane.test.ts` pins the exact number of
 * static Express registration call sites in the worktree, and four literal
 * registrations here moved that count whether or not anything ever called the
 * function.
 *
 * That pin is a protected release-control hub owned by another lane, and the
 * integration collision audit has already faulted a lane for editing it.
 * Writing the registrations here and then bumping the pinned number would be
 * the same violation, and hiding the calls from the static scan to keep the
 * number steady would be worse: it would defeat a census whose whole job is to
 * know what this application serves.
 *
 * So the boundary is this. **This lane describes its routes. The composition
 * root registers them**, and the census moves at exactly the moment the catalog
 * genuinely becomes reachable, which is what it is there to measure.
 *
 * The composition root's side is still two lines:
 *
 *     for (const route of masterOfferingCatalogRouteTable(deps)) {
 *       app[route.method](route.path, ...route.handlers);
 *     }
 *     app.use(MASTER_OFFERING_CATALOG_BASE_PATH, masterOfferingCatalogErrorHandler(deps));
 *
 * Every route is GET or OPTIONS, private, and noindex. The display flag, the
 * viewer check and the launch scope are enforced inside the handlers, so
 * mounting grants reachability and nothing else. It creates no commerce
 * authority: the catalog can be fully mounted and still sell nothing until
 * Product Control binds an exact variant.
 */

export const MASTER_OFFERING_CATALOG_ROUTES = [
  MASTER_OFFERING_CATALOG_LIST_ROUTE,
  MASTER_OFFERING_CATALOG_DETAIL_ROUTE,
  MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
] as const;

export interface MasterOfferingCatalogRoute {
  method: "get" | "options";
  path: string;
  /** Middleware first, terminal handler last, in registration order. */
  handlers: readonly RequestHandler[];
}

/**
 * Every route this lane needs, in the order it must be registered.
 *
 * Read-only by construction: the union of methods admits nothing that writes.
 */
export function masterOfferingCatalogRouteTable(
  dependencies: MasterOfferingCatalogApiDependencies,
): readonly MasterOfferingCatalogRoute[] {
  const handlers = createMasterOfferingCatalogApiHandlers(dependencies);
  return [
    {
      method: "get",
      path: MASTER_OFFERING_CATALOG_LIST_ROUTE,
      handlers: [handlers.privateHeaders, handlers.list],
    },
    {
      method: "get",
      path: MASTER_OFFERING_CATALOG_DETAIL_ROUTE,
      handlers: [handlers.privateHeaders, handlers.detail],
    },
    {
      method: "get",
      path: MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
      handlers: [handlers.privateHeaders, handlers.priceList],
    },
    ...MASTER_OFFERING_CATALOG_ROUTES.map(
      (path): MasterOfferingCatalogRoute => ({
        method: "options",
        path,
        handlers: [handlers.privateHeaders, handlers.options],
      }),
    ),
  ];
}

/**
 * The path-scoped error handler. Scoped on purpose: a global one here would
 * swallow failures from every other route in the application.
 */
export function masterOfferingCatalogErrorHandler(
  dependencies: MasterOfferingCatalogApiDependencies,
): ErrorRequestHandler {
  return createMasterOfferingCatalogApiHandlers(dependencies).error;
}

export const MASTER_OFFERING_CATALOG_ERROR_BASE_PATH =
  MASTER_OFFERING_CATALOG_BASE_PATH;
