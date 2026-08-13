import { useResearch } from "../core";
import { MasterOfferingCatalogSurface } from "./MasterOfferingCatalogSurface";

/**
 * The routed entry point for the full catalog.
 *
 * It exists so the section router stays one lazy line, and so the surface can
 * keep taking its token as a prop rather than reaching for a session of its
 * own. This is the only place the member token is read, and it is read from
 * the same research context every other member page uses.
 *
 * WHY THERE IS NO CLIENT FEATURE FLAG HERE
 * ----------------------------------------
 * The authority is the server, and it fails closed:
 * RESEARCH_MASTER_OFFERINGS_ENABLED must be exactly "true" or every v2 route
 * answers a refusal, and the launch scope is founder and admin until
 * RESEARCH_MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY is set to "false". With the
 * server unenabled this route still renders, and the surface shows its
 * "not available yet" copy, which is the state that copy was written for.
 *
 * A second switch in the browser could only hide a surface the server had
 * already opened. That is a preference, not a gate, and shared/research/flags.ts
 * records what happens when a flag nobody reads is mistaken for one: the
 * capability looks shut and is not. So the gate stays in one place.
 */
export default function FullCatalogRoute() {
  const { memberToken } = useResearch();
  return <MasterOfferingCatalogSurface memberToken={memberToken} />;
}
