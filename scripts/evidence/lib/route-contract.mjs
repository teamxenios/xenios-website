export const EXTERNAL_MICROSITE_PATH = "/hino";

export function isExternalHinoMicrosite(route) {
  return route?.path === EXTERNAL_MICROSITE_PATH && route?.externalMicrosite === true;
}

export function externalMicrositeInventoryIsScoped(routes) {
  return Array.isArray(routes) && routes.every(
    (route) => route?.externalMicrosite !== true || route?.path === EXTERNAL_MICROSITE_PATH,
  );
}

export function assertExternalMicrositeInventory(routes) {
  if (!externalMicrositeInventoryIsScoped(routes)) {
    const invalidPaths = (routes ?? [])
      .filter((route) => route?.externalMicrosite === true && route?.path !== EXTERNAL_MICROSITE_PATH)
      .map((route) => route?.path ?? "(missing path)");
    throw new Error(
      `externalMicrosite is reserved for the exact ${EXTERNAL_MICROSITE_PATH} route: ${invalidPaths.join(", ")}`,
    );
  }
  return routes;
}

export function assertExternalMicrositeRoute(route) {
  assertExternalMicrositeInventory([route]);
  return isExternalHinoMicrosite(route);
}
