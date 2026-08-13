import type { ErrorRequestHandler, RequestHandler } from "express";
import {
  KRIS_CATALOG_BASE_PATH,
  KRIS_CATALOG_DETAIL_ROUTE,
  KRIS_CATALOG_LIST_ROUTE,
  createKrisCatalogApiHandlers,
  type KrisCatalogApiDependencies,
} from "./routes";

/**
 * The Launch A route table, as data.
 *
 * WHY THIS IS A TABLE AND NOT A `mount(app)` FUNCTION
 * ---------------------------------------------------
 * `server/release-control-plane.test.ts` pins the exact number of static
 * Express registration call sites in the worktree. That pin is a protected
 * release-control hub owned by another lane, and the integration collision
 * audit has already faulted a lane for editing it. Writing `app.get(...)` here
 * would move the pinned count the moment this file existed, whether or not
 * anything ever called it, and then this lane would have to edit a file it does
 * not own to make its own tests pass. Hiding the calls from the static scan to
 * keep the number steady would be worse: it would defeat a census whose whole
 * job is to know what this application serves.
 *
 * So the boundary is: **this lane DESCRIBES its routes, the composition root
 * REGISTERS them**, and the census moves at exactly the moment Launch A becomes
 * reachable, which is what it is there to measure.
 *
 * The composition root's side is two lines:
 *
 *     for (const route of krisCatalogRouteTable(deps)) {
 *       app[route.method](route.path, ...route.handlers);
 *     }
 *     app.use(KRIS_CATALOG_ERROR_BASE_PATH, krisCatalogErrorHandler(deps));
 *
 * Registering the table adds 4 call sites and 4 routes to the census: 2 GET and
 * 2 OPTIONS. Every one of them is read only, private, noindex and behind
 * entitlement. Mounting grants reachability and nothing else: it creates no
 * commerce authority, because the browser contract has no purchase action for a
 * surface to reach for and the access policy is `purchasable: false` on every
 * channel.
 */

export const KRIS_CATALOG_ROUTES = [
  KRIS_CATALOG_LIST_ROUTE,
  KRIS_CATALOG_DETAIL_ROUTE,
] as const;

export interface KrisCatalogRoute {
  method: "get" | "options";
  path: string;
  /** Middleware first, terminal handler last, in registration order. */
  handlers: readonly RequestHandler[];
}

/**
 * Every route this lane needs, in the order it must be registered.
 *
 * Read only by construction: the union of methods admits nothing that writes,
 * so there is no shape of this table that could POST, PATCH or DELETE.
 */
export function krisCatalogRouteTable(
  dependencies: KrisCatalogApiDependencies,
): readonly KrisCatalogRoute[] {
  const handlers = createKrisCatalogApiHandlers(dependencies);
  return [
    {
      method: "get",
      path: KRIS_CATALOG_LIST_ROUTE,
      handlers: [handlers.privateHeaders, handlers.list],
    },
    {
      method: "get",
      path: KRIS_CATALOG_DETAIL_ROUTE,
      handlers: [handlers.privateHeaders, handlers.detail],
    },
    ...KRIS_CATALOG_ROUTES.map(
      (path): KrisCatalogRoute => ({
        method: "options",
        path,
        handlers: [handlers.privateHeaders, handlers.options],
      }),
    ),
  ];
}

export function krisCatalogErrorHandler(
  dependencies: KrisCatalogApiDependencies,
): ErrorRequestHandler {
  return createKrisCatalogApiHandlers(dependencies).error;
}

export const KRIS_CATALOG_ERROR_BASE_PATH = KRIS_CATALOG_BASE_PATH;
