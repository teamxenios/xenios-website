import type { IRouter } from "express";
import {
  MASTER_OFFERING_CATALOG_BASE_PATH,
  MASTER_OFFERING_CATALOG_DETAIL_ROUTE,
  MASTER_OFFERING_CATALOG_LIST_ROUTE,
  MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
  createMasterOfferingCatalogApiHandlers,
  type MasterOfferingCatalogApiDependencies,
} from "./routes";

/**
 * The whole mount, in one call.
 *
 * This exists so the composition root's diff is two lines rather than forty,
 * and so the route list, the middleware order, the OPTIONS handlers and the
 * path-scoped error handler cannot be got subtly wrong by being retyped.
 *
 * It does NOT mount anything by itself. Nothing in this repository imports it,
 * and `catalog-boundaries.test.ts` fails if anything starts to. Calling it is a
 * decision the one owner of the composition root makes, and that call is the
 * moment the catalog becomes reachable.
 *
 * Every route is GET only, private, and noindex. The display flag, the viewer
 * check and the launch scope are all enforced inside the handlers, so mounting
 * grants reachability and nothing else. It creates no commerce authority: the
 * catalog can be fully mounted and still sell nothing until Product Control
 * binds an exact variant.
 */

export const MASTER_OFFERING_CATALOG_ROUTES = [
  MASTER_OFFERING_CATALOG_LIST_ROUTE,
  MASTER_OFFERING_CATALOG_DETAIL_ROUTE,
  MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
] as const;

export interface MountedMasterOfferingCatalog {
  /** Exactly the paths that were registered, for the route census. */
  routes: readonly string[];
  basePath: string;
}

export function mountMasterOfferingCatalog(
  // IRouter, not Express: an Express application also has a settings getter
  // called `get`, and the union makes overload resolution pick the wrong one.
  // Every Express app satisfies IRouter, so nothing is lost by narrowing.
  app: IRouter,
  dependencies: MasterOfferingCatalogApiDependencies,
): MountedMasterOfferingCatalog {
  const handlers = createMasterOfferingCatalogApiHandlers(dependencies);

  app.get(
    MASTER_OFFERING_CATALOG_LIST_ROUTE,
    handlers.privateHeaders,
    handlers.list,
  );
  app.get(
    MASTER_OFFERING_CATALOG_DETAIL_ROUTE,
    handlers.privateHeaders,
    handlers.detail,
  );
  app.get(
    MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
    handlers.privateHeaders,
    handlers.priceList,
  );

  for (const route of MASTER_OFFERING_CATALOG_ROUTES) {
    app.options(route, handlers.privateHeaders, handlers.options);
  }

  // Path scoped on purpose. A global error handler here would swallow failures
  // from every other route in the application.
  app.use(MASTER_OFFERING_CATALOG_BASE_PATH, handlers.error);

  return {
    routes: [...MASTER_OFFERING_CATALOG_ROUTES],
    basePath: MASTER_OFFERING_CATALOG_BASE_PATH,
  };
}
