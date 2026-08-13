import { useResearch } from "../core";
import { MasterOfferingCatalogSurface } from "./MasterOfferingCatalogSurface";

/** Member-gated composition wrapper for the v2 catalog list. */
export default function FullCatalogRoute() {
  const { memberToken } = useResearch();
  return (
    <div className="container-x py-10">
      <MasterOfferingCatalogSurface memberToken={memberToken} />
    </div>
  );
}
