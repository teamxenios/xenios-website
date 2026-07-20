import { useResearch } from "../../core";
import { formatMoney } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchMetricCard, ResearchRouteBoundary, ResearchSecureNotice, ResearchTimeline } from "../../ui/kit";
import { getPartnerDashboard } from "../../adapters/partner";
import { usePartnerResource, type BoundaryState } from "./shared";

// ---------------------------------------------------------------------------
// Partner dashboard (/research/partners/dashboard). Aggregate metrics only.
// Numbers come exclusively from GET /api/research/partner/dashboard; while
// that endpoint is unpublished the cards show an honest "appears when
// tracking begins" state (never a fabricated zero, never a fake trend).
// ---------------------------------------------------------------------------

interface DashboardPayload {
  metrics?: {
    clicks?: number;
    leads?: number;
    conversions?: number;
    commissionsCents?: number;
  } | null;
  activity?: Array<{ at: string; title: string; detail?: string }> | null;
}

const PENDING_VALUE = "Pending";
const PENDING_SUMMARY = "Appears when tracking begins.";

export default function Dashboard() {
  const { memberToken } = useResearch();
  const { state, errorMessage, data, reload } = usePartnerResource<DashboardPayload>(
    getPartnerDashboard,
    memberToken,
  );

  // Unavailable renders the honest pending presentation of the same cards
  // (the boundary still owns loading, error, and unauthorized).
  const boundaryState: BoundaryState = state === "unavailable" ? "ok" : state;
  const metrics = state === "ok" ? data?.metrics ?? null : null;

  const cards = [
    {
      label: "Link clicks",
      value: metrics?.clicks != null ? String(metrics.clicks) : PENDING_VALUE,
      summary: metrics?.clicks != null ? "Total clicks on your unique link, all time." : PENDING_SUMMARY,
    },
    {
      label: "Leads",
      value: metrics?.leads != null ? String(metrics.leads) : PENDING_VALUE,
      summary: metrics?.leads != null ? "Applications started from your link, in aggregate." : PENDING_SUMMARY,
    },
    {
      label: "Conversions",
      value: metrics?.conversions != null ? String(metrics.conversions) : PENDING_VALUE,
      summary:
        metrics?.conversions != null ? "Memberships activated from your referrals, in aggregate." : PENDING_SUMMARY,
    },
    {
      label: "Commissions",
      value: metrics?.commissionsCents != null ? formatMoney(metrics.commissionsCents) : PENDING_VALUE,
      summary:
        metrics?.commissionsCents != null
          ? "Lifetime commissions recorded, before holds and reversals."
          : PENDING_SUMMARY,
    },
  ];

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
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {cards.map((c) => (
            <ResearchMetricCard key={c.label} label={c.label} value={c.value} summary={c.summary} />
          ))}
        </div>

        <section aria-labelledby="pd-activity" className="mt-10">
          <h2 id="pd-activity" className="mono-cap text-ink-mute">
            Recent activity
          </h2>
          <div className="mt-4">
            <ResearchTimeline items={state === "ok" ? data?.activity ?? [] : []} />
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
