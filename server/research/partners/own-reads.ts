import type { CommerceDependencies, PartnerSelfSource } from "../commerce/routes";
import type { PartnerDashboardDto } from "@shared/research/commerce-api";
import type { AsyncPartnerMemberStore } from "../commerce/persistence/partners-store";
import type { CommissionLedgerRepository } from "./commissions";
import { createLedgerPartnerStatsSource } from "./member-linkage";

/**
 * Whether a live producer writes the commission ledger that the dashboard
 * figures aggregate. At this source none does: the early-access cart lane keeps
 * its own settlement commission records, and nothing else appends to this
 * ledger. Its figures are therefore unknown, not zero. This changes only in the
 * change that constructs a real producer for this ledger; ledger rows, an empty
 * ledger or zero totals never establish one.
 */
export const PARTNER_COMMISSION_LEDGER_PRODUCER_CONNECTED = false;

/** Every ledger-derived figure, reported as unknown rather than as a measured zero. */
const NOT_CONNECTED = {
  financialReporting: "not_connected",
  conversionCount: null,
  totalCommissionCents: null,
  payableCents: null,
  conversions: null,
} as const;

/** Read-only partner workspace; purchasing and payout switches grant no identity. */
export function createOwnPartnerReads(deps: {
  available: boolean;
  members(): AsyncPartnerMemberStore;
  ledger(): CommissionLedgerRepository;
  /** Set only where a real ledger producer is constructed. Defaults to the source fact above. */
  ledgerProducerConnected?: boolean;
}): Pick<CommerceDependencies["partners"], "readAvailable" | "findByMemberId" | "dashboardFor"> {
  const ledgerConnected = deps.ledgerProducerConnected ?? PARTNER_COMMISSION_LEDGER_PRODUCER_CONNECTED;
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
      // Without a connected producer the ledger is never read: its rows or its
      // emptiness would otherwise be shown as measured commission activity.
      if (!deps.available || !ledgerConnected) {
        return { partnerId: partner.partnerId, role: partner.role, state: partner.state,
          leadCount: 0, ...NOT_CONNECTED, outstandingTraining: [] };
      }
      const stats = await createLedgerPartnerStatsSource({ ledger: deps.ledger() }).statsFor(partner.partnerId);
      return { partnerId: partner.partnerId, role: partner.role, state: partner.state,
        leadCount: stats.leadCount, financialReporting: "connected", conversionCount: stats.conversionCount,
        totalCommissionCents: stats.totalCommissionCents, payableCents: stats.payableCents,
        conversions: stats.conversions.map((entry) => ({ ...entry })), outstandingTraining: [] };
    },
  };
}
