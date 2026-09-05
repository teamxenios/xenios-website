import type { CommerceDependencies, PartnerSelfSource } from "../commerce/routes";
import type { PartnerDashboardDto } from "@shared/research/commerce-api";
import type { AsyncPartnerMemberStore } from "../commerce/persistence/partners-store";
import type { CommissionLedgerRepository } from "./commissions";
import { createLedgerPartnerStatsSource } from "./member-linkage";

/** Read-only partner workspace; purchasing and payout switches grant no identity. */
export function createOwnPartnerReads(deps: {
  available: boolean;
  members(): AsyncPartnerMemberStore;
  ledger(): CommissionLedgerRepository;
}): Pick<CommerceDependencies["partners"], "readAvailable" | "findByMemberId" | "dashboardFor"> {
  return {
    readAvailable: () => deps.available,
    async findByMemberId(memberId): Promise<PartnerSelfSource | null> {
      // Unavailable is a truthful empty read for direct dependency consumers.
      // The HTTP routes check readAvailable first and retain their explicit
      // capability_disabled 503 boundary, so this path never resolves a store
      // or fabricates a partner relationship while the capability is off.
      if (!deps.available) return null;
      const partner = await deps.members().findByMemberId(memberId);
      if (!partner) return null;
      return { partnerId: partner.partnerId, role: partner.role, state: partner.state,
        certifiedAt: partner.certifiedAt, activatedAt: partner.activatedAt, training: [], agreements: [] };
    },
    async dashboardFor(partner): Promise<PartnerDashboardDto> {
      if (!deps.available) {
        return { partnerId: partner.partnerId, role: partner.role, state: partner.state,
          leadCount: 0, conversionCount: 0, totalCommissionCents: 0, payableCents: 0,
          conversions: [], outstandingTraining: [] };
      }
      const stats = await createLedgerPartnerStatsSource({ ledger: deps.ledger() }).statsFor(partner.partnerId);
      return { partnerId: partner.partnerId, role: partner.role, state: partner.state,
        leadCount: stats.leadCount, conversionCount: stats.conversionCount,
        totalCommissionCents: stats.totalCommissionCents, payableCents: stats.payableCents,
        conversions: stats.conversions.map((entry) => ({ ...entry })), outstandingTraining: [] };
    },
  };
}
