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
      if (!deps.available) throw new Error("partner reads unavailable");
      const partner = await deps.members().findByMemberId(memberId);
      if (!partner) return null;
      return { partnerId: partner.partnerId, role: partner.role, state: partner.state,
        certifiedAt: partner.certifiedAt, activatedAt: partner.activatedAt, training: [], agreements: [] };
    },
    async dashboardFor(partner): Promise<PartnerDashboardDto> {
      if (!deps.available) throw new Error("partner reads unavailable");
      const stats = await createLedgerPartnerStatsSource({ ledger: deps.ledger() }).statsFor(partner.partnerId);
      return { partnerId: partner.partnerId, role: partner.role, state: partner.state,
        leadCount: stats.leadCount, conversionCount: stats.conversionCount,
        totalCommissionCents: stats.totalCommissionCents, payableCents: stats.payableCents,
        conversions: stats.conversions.map((entry) => ({ ...entry })), outstandingTraining: [] };
    },
  };
}
