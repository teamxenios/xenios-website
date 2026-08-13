import { useResearch } from "../core";
import { getKrisCatalog } from "./catalogApi";
import { KrisCatalogSurface } from "./KrisCatalogSurface";

/**
 * The routed entry point for the Launch A catalog.
 *
 * It exists so the section router stays one lazy line, and so the surface can
 * keep taking its token as a prop rather than reaching for a session of its
 * own. This is the only place the member token is read, and it is read from the
 * same research context every other member page uses.
 *
 * WHY THERE IS NO CLIENT FEATURE FLAG HERE
 * ----------------------------------------
 * The authority is the server and it fails closed: with the Launch A routes
 * unmounted or unconfigured, every request answers a refusal or the SPA shell,
 * both of which this surface renders as its "not available right now" copy.
 * That is the state that copy was written for. A second switch in the browser
 * could only hide a surface the server had already opened, which is a
 * preference and not a gate.
 */
export default function KrisCatalogRoute({
  /** Injected only by tests, so the routed page can be driven without a server. */
  fetchCatalog = getKrisCatalog,
}: {
  fetchCatalog?: typeof getKrisCatalog;
} = {}) {
  const { memberToken } = useResearch();
  return (
    <KrisCatalogSurface memberToken={memberToken} fetchCatalog={fetchCatalog} />
  );
}
