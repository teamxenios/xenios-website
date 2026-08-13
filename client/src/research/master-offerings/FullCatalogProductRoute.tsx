import { useParams } from "wouter";
import { isMasterOfferingFamily } from "@shared/research/master-offerings/contract";
import { useResearch } from "../core";
import { ResearchEmptyState } from "../ui/kit";
import { MASTER_OFFERING_STATE_COPY } from "./catalogApi";
import { MasterOfferingDetailSurface } from "./MasterOfferingDetailSurface";

/**
 * The routed entry point for one v2 offering.
 *
 * BOTH SEGMENTS ARE THE ADDRESS. The v2 detail API is
 * `/products/:family/:slug`, so a link carrying only a slug cannot restore the
 * product it points at. That is why this route is `:family/:slug` and why the
 * card's href carries both.
 *
 * Everything a deep link needs is in the URL. The surface arrives cold, reads
 * the two params, and fetches: there is no list state to inherit and no cache
 * to warm, so a shared link, a bookmark and a hard reload all land on the same
 * page.
 *
 * A family outside the closed vocabulary is answered here rather than sent to
 * the server, which would refuse it as an invalid request. The member sees the
 * honest "not in the catalog" copy instead of a generic error.
 */
export default function FullCatalogProductRoute() {
  const { family = "", slug = "" } = useParams<{
    family: string;
    slug: string;
  }>();
  const { memberToken } = useResearch();

  if (!isMasterOfferingFamily(family) || slug.trim() === "") {
    const copy = MASTER_OFFERING_STATE_COPY.not_found;
    return (
      <main className="grid min-w-0 gap-6">
        <ResearchEmptyState title={copy.title} body={copy.body} />
      </main>
    );
  }

  return (
    <MasterOfferingDetailSurface
      memberToken={memberToken}
      family={family}
      slug={slug}
    />
  );
}
