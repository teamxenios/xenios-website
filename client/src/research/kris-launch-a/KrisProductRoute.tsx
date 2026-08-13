import { useParams } from "wouter";
import { isKrisFamily } from "@shared/research/kris-launch-a/contract";
import { useResearch } from "../core";
import { ResearchEmptyState } from "../ui/kit";
import { KRIS_STATE_COPY, getKrisDetail } from "./catalogApi";
import { KrisDetailSurface } from "./KrisDetailSurface";

/**
 * The routed entry point for one Launch A item.
 *
 * BOTH SEGMENTS ARE THE ADDRESS. The detail API is by family and slug, so a
 * link carrying only a slug cannot restore the item it points at. That is why
 * this route is `:family/:slug` and why every card href carries both.
 *
 * Everything a deep link needs is in the URL. The surface arrives cold, reads
 * the two params and fetches, so a shared link, a bookmark and a hard reload
 * all land on the same page.
 *
 * A family outside the closed vocabulary is answered here rather than sent to
 * the server, which would refuse it as an invalid request. The member sees the
 * honest "not in this catalog" copy instead of a generic error.
 */
export default function KrisProductRoute({
  /** Injected only by tests, so a deep link can be driven without a server. */
  fetchDetail = getKrisDetail,
}: {
  fetchDetail?: typeof getKrisDetail;
} = {}) {
  const { family = "", slug = "" } = useParams<{ family: string; slug: string }>();
  const { memberToken } = useResearch();

  if (!isKrisFamily(family) || slug.trim() === "") {
    const copy = KRIS_STATE_COPY.not_found;
    return (
      <main className="grid min-w-0 gap-6">
        <ResearchEmptyState title={copy.title} body={copy.body} />
      </main>
    );
  }

  return (
    <KrisDetailSurface
      memberToken={memberToken}
      family={family}
      slug={slug}
      fetchDetail={fetchDetail}
    />
  );
}
