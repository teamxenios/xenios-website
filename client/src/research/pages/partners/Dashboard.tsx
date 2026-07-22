import { Link } from "wouter";
import { useResearch, formatMoney } from "../../core";
import { PARTNER_ROUTES } from "../../lib/routes";
import { ResearchPartnerShell } from "../../ui/shells";
import {
  ResearchDataTable,
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchMetricCard,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  type BadgeTone,
} from "../../ui/kit";
import { getPartnerDashboard } from "../../adapters/partner";
import { usePartnerResource, type BoundaryState } from "./shared";
import type { PartnerDashboardDto } from "@shared/research/commerce-api";
import type { CommissionState } from "@shared/research/distribution";

// ---------------------------------------------------------------------------
// Partner dashboard (/research/partners/dashboard). Aggregates only, straight
// from the frozen PartnerDashboardDto (GET /api/research/partner/dashboard):
// counts, totals, and the partner-visible conversion rows. No member-level
// field exists in the payload and none is invented here. While the endpoint
// is unpublished the cards show an honest "appears when tracking begins"
// state (never a fabricated zero, never a fake trend). A machine denial
// (partner_not_found, partner_not_active) renders its designed state.
// ---------------------------------------------------------------------------

const PENDING_VALUE = "Pending";
const PENDING_SUMMARY = "Appears when tracking begins.";

const ROLE_LABEL: Record<PartnerDashboardDto["role"], string> = {
  member_referral: "Member referral",
  affiliate: "Affiliate",
  research_rep: "Research Rep",
  senior_research_rep: "Senior Research Rep",
  organization_partner: "Organization partner",
  private_community_partner: "Private community partner",
  professional_partner: "Professional partner",
  future_wholesale: "Wholesale (future)",
  future_institutional: "Institutional (future)",
};

const COMMISSION_STATE_TONES: Record<CommissionState, BadgeTone> = {
  pending: "pending",
  held: "warning",
  approved: "info",
  payable: "info",
  paid: "success",
  reversed: "danger",
  disputed: "warning",
  forfeited: "danger",
};

type ConversionRow = PartnerDashboardDto["conversions"][number] & { key: string };

export default function Dashboard() {
  const { memberToken } = useResearch();
  const { state, errorMessage, denied, data, reload } = usePartnerResource<{ partner: PartnerDashboardDto }>(
    getPartnerDashboard,
    memberToken,
  );

  // The two partner denial codes have designed states of their own; any other
  // denial falls through to the shared boundary handling in usePartnerResource.
  if (denied && (denied.code === "partner_not_found" || denied.code === "partner_not_active")) {
    return (
      <ResearchPartnerShell
        title="Dashboard"
        lead="Your aggregate activity at a glance. Everything here is a count or a total; individual members are never shown."
      >
        <ResearchDenialNotice code={denied.code} message={denied.message} />
      </ResearchPartnerShell>
    );
  }

  // Unavailable renders the honest pending presentation of the same cards
  // (the boundary still owns loading, error, and unauthorized).
  const boundaryState: BoundaryState = state === "unavailable" ? "ok" : state;
  const partner = state === "ok" ? data?.partner ?? null : null;

  const cards = [
    {
      label: "Leads",
      value: partner ? String(partner.leadCount) : PENDING_VALUE,
      summary: partner ? "Applications started from your link, in aggregate." : PENDING_SUMMARY,
    },
    {
      label: "Conversions",
      value: partner ? String(partner.conversionCount) : PENDING_VALUE,
      summary: partner ? "Attributed conversions, in aggregate." : PENDING_SUMMARY,
    },
    {
      label: "Total commissions",
      value: partner ? formatMoney(partner.totalCommissionCents) : PENDING_VALUE,
      summary: partner ? "Lifetime commissions recorded, before holds and reversals." : PENDING_SUMMARY,
    },
    {
      label: "Payable now",
      value: partner ? formatMoney(partner.payableCents) : PENDING_VALUE,
      summary: partner ? "Cleared hold and queued for your next payout." : PENDING_SUMMARY,
    },
  ];

  const conversions: ConversionRow[] = (partner?.conversions ?? []).map((c, i) => ({ ...c, key: `${c.attributedAt}-${i}` }));

  return (
    <ResearchPartnerShell
      title="Dashboard"
      lead="Your aggregate activity at a glance. Everything here is a count or a total; individual members are never shown."
    >
      <ResearchRouteBoundary state={boundaryState} errorMessage={errorMessage} onRetry={() => void reload()}>
        {state === "unavailable" && (
          <p className="mono-label text-ink-mute mb-4" role="status" aria-live="polite">
            The partner platform is being prepared. Metrics begin recording when your link is issued.
          </p>
        )}

        {partner && (
          <div className="flex items-center gap-3 flex-wrap mb-4" data-testid="pd-identity">
            <ResearchStatusBadge label={ROLE_LABEL[partner.role] ?? partner.role} tone="neutral" />
            <ResearchStatusBadge
              label={partner.state.replace(/_/g, " ")}
              tone={partner.state === "active" ? "success" : "pending"}
            />
          </div>
        )}

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {cards.map((c) => (
            <ResearchMetricCard key={c.label} label={c.label} value={c.value} summary={c.summary} />
          ))}
        </div>

        {partner && partner.outstandingTraining.length > 0 && (
          <section aria-labelledby="pd-training" className="mt-10">
            <h2 id="pd-training" className="mono-cap text-ink-mute">
              Training to complete
            </h2>
            <div className="card mt-4" style={{ maxWidth: 640 }}>
              <ul className="body-s text-ink-2 grid gap-2" style={{ paddingLeft: 18, margin: 0 }}>
                {partner.outstandingTraining.map((t) => (
                  <li key={`${t.moduleKey}-${t.version}`}>
                    <span className="font-700">{t.moduleKey.replace(/[-_]/g, " ")}</span>
                    <span className="text-ink-mute"> (version {t.version})</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <Link href={PARTNER_ROUTES.training} className="btn btn-secondary">
                  Open training
                </Link>
              </div>
            </div>
          </section>
        )}

        <section aria-labelledby="pd-conversions" className="mt-10">
          <h2 id="pd-conversions" className="mono-cap text-ink-mute">
            Conversions
          </h2>
          <div className="mt-4">
            {state === "ok" ? (
              <ResearchDataTable<ConversionRow>
                caption="Attributed conversions with date, eligible net, commission, and state"
                columns={[
                  { key: "attributedAt", header: "Attributed", render: (r) => <span className="tabular">{r.attributedAt}</span> },
                  {
                    key: "eligibleNet",
                    header: "Eligible net",
                    render: (r) => <span className="tabular">{formatMoney(r.eligibleNetCents)}</span>,
                  },
                  {
                    key: "commission",
                    header: "Commission",
                    render: (r) => <span className="tabular">{formatMoney(r.commissionCents)}</span>,
                  },
                  {
                    key: "state",
                    header: "State",
                    render: (r) => (
                      <ResearchStatusBadge label={r.state} tone={COMMISSION_STATE_TONES[r.state] ?? "neutral"} />
                    ),
                  },
                ]}
                rows={conversions}
                rowKey={(r) => r.key}
                empty="No conversions yet. Attributed conversions appear here as they happen."
              />
            ) : (
              <ResearchEmptyState
                title="Conversions appear when tracking begins."
                body="Each row will show only the attribution date, the eligible net amount, the commission, and its state."
              />
            )}
          </div>
        </section>

        <div className="mt-8">
          <ResearchSecureNotice>
            Dashboard figures are aggregates computed by the server. You will never see member names, contact details,
            purchases, or any health information here or anywhere in the partner portal.
          </ResearchSecureNotice>
        </div>
      </ResearchRouteBoundary>
    </ResearchPartnerShell>
  );
}
