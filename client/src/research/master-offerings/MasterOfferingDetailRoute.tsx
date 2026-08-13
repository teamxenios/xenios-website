import { Link, Redirect, useParams } from "wouter";
import { isMasterOfferingFamily } from "@shared/research/master-offerings/contract";
import { useResearch } from "../core";
import { MasterOfferingDetailSurface } from "./MasterOfferingDetailSurface";

/**
 * Member-gated composition wrapper for one cold-load-safe catalog detail.
 *
 * It reads only the canonical research member token and the family/slug route
 * parameters. Deliberately no cart or quantity capability is injected for
 * Launch A, so an `add_to_cart` server action remains informational here and
 * cannot enable commerce through the catalog mount.
 */
export default function MasterOfferingDetailRoute() {
  const { memberToken } = useResearch();
  const { family, slug } = useParams<{ family?: string; slug?: string }>();

  if (!isMasterOfferingFamily(family) || !slug) {
    return <Redirect to="/research/member/catalog" />;
  }

  return (
    <div className="container-x py-10">
      <Link
        href="/research/member/catalog"
        className="body-s text-ink-2 hover:text-pulse"
        data-testid="mo-back-to-catalog"
      >
        Back to catalog
      </Link>
      <div className="mt-6">
        <MasterOfferingDetailSurface
          memberToken={memberToken}
          family={family}
          slug={slug}
        />
      </div>
    </div>
  );
}
