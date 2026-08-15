import type {
  AssistedOrderRouteDescriptor,
  AssistedOrderHttpRequest,
  AssistedOrderHttpResponse,
} from "./http";

export type AssistedOrderRegistry = Readonly<{
  register(
    method: AssistedOrderRouteDescriptor["method"],
    path: string,
    handler: (
      request: AssistedOrderHttpRequest,
    ) => Promise<AssistedOrderHttpResponse>,
  ): void;
}>;

/**
 * Mounts every descriptor exactly once. The existing Research wall must decide
 * whether a request satisfies early-access/member or admin authorization before
 * it reaches these handlers.
 */
export function mountAssistedOrderRoutes(
  registry: AssistedOrderRegistry,
  routes: readonly AssistedOrderRouteDescriptor[],
): void {
  const seen = new Set<string>();
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate assisted order route: ${key}`);
    }
    seen.add(key);
    registry.register(route.method, route.path, route.handler);
  }
}
