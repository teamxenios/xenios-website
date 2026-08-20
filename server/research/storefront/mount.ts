import type { ErrorRequestHandler, RequestHandler } from "express";
import {
  PUBLIC_STOREFRONT_BASE_PATH,
  PUBLIC_STOREFRONT_CATALOG_ROUTE,
  PUBLIC_STOREFRONT_DETAIL_ROUTE,
} from "@shared/research/storefront/contract";
import {
  createPublicStorefrontApiHandlers,
  type PublicStorefrontApiDependencies,
} from "./routes";

/**
 * The storefront's route table, as data, for the same reason the v2 catalog's
 * is (server/research/master-offerings/mount.ts): the release census pins the
 * static Express registration call sites, so this lane DESCRIBES its routes
 * and the composition root REGISTERS them explicitly. The census then moves at
 * exactly the moment the storefront genuinely becomes reachable.
 *
 * Every route is GET or OPTIONS. Mounting grants reachability and nothing
 * else: the flag, the query surface, and the projection are enforced inside
 * the handlers, and the whole surface reads through a no-grant viewer, so a
 * mounted storefront still shows on-request prices and request-family actions
 * until stronger doors say otherwise.
 */

export const PUBLIC_STOREFRONT_ROUTES = [
  PUBLIC_STOREFRONT_CATALOG_ROUTE,
  PUBLIC_STOREFRONT_DETAIL_ROUTE,
] as const;

export interface PublicStorefrontRoute {
  method: "get" | "options";
  path: string;
  /** Middleware first, terminal handler last, in registration order. */
  handlers: readonly RequestHandler[];
}

export function publicStorefrontRouteTable(
  dependencies: PublicStorefrontApiDependencies,
): readonly PublicStorefrontRoute[] {
  const handlers = createPublicStorefrontApiHandlers(dependencies);
  return [
    {
      method: "get",
      path: PUBLIC_STOREFRONT_CATALOG_ROUTE,
      handlers: [handlers.publicHeaders, handlers.catalog],
    },
    {
      method: "get",
      path: PUBLIC_STOREFRONT_DETAIL_ROUTE,
      handlers: [handlers.publicHeaders, handlers.detail],
    },
    ...PUBLIC_STOREFRONT_ROUTES.map(
      (path): PublicStorefrontRoute => ({
        method: "options",
        path,
        handlers: [handlers.publicHeaders, handlers.options],
      }),
    ),
  ];
}

/** Path-scoped on purpose: a global handler would swallow other routes' errors. */
export function publicStorefrontErrorHandler(
  dependencies: PublicStorefrontApiDependencies,
): ErrorRequestHandler {
  return createPublicStorefrontApiHandlers(dependencies).error;
}

export const PUBLIC_STOREFRONT_ERROR_BASE_PATH = PUBLIC_STOREFRONT_BASE_PATH;
