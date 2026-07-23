import { Link } from "wouter";
import { listPlans } from "../../adapters/adminOps";
import { ResearchDataTable, ResearchMetricCard, ResearchStatusBadge } from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/plans: membership plan administration. The standing terms
// are fixed and stated here as fact: ONE Founding Membership, $50 due at
// activation including the first 30 days, then $25 per additional 30-day
// period, no annual plan, no $25 at activation. Live plan rows and billing
// state publish with membership billing.
// ---------------------------------------------------------------------------

type AdminPlanRow = {
  id: string;
  name: string;
  price_cents: number;
  cadence: string;
  status: string;
  member_count: number | null;
  updated_at: string | null;
};

export default function Plans() {
  return (
    <AdminScreen
      title="Plans"
      lead="Membership terms and, once billing connects, the live plan records behind them."
    >
      {(token) => <PlansBody token={token} />}
    </AdminScreen>
  );
}

function PlansBody({ token }: { token: string }) {
  const resource = useAdminResource<{ ok: boolean; plans: AdminPlanRow[] }>(token, listPlans);
  return (
    <div className="grid gap-8">
      <section aria-label="Standing membership terms">
        <h2 className="body-l font-700 mb-4">Standing terms</h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <ResearchMetricCard
            label="Founding Membership"
            value="$50 due today"
            summary="Includes the activation and first 30 days of membership. Verified by a person before anything activates."
          />
          <ResearchMetricCard
            label="After the first 30 days"
            value="$25 / 30 days"
            summary="Each additional 30-day membership period. Member-initiated; nothing is due at activation and there is no annual plan."
          />
        </div>
        <p className="body-s text-ink-mute mt-4 max-w-[64ch]">
          These terms are the source of truth for approval and activation copy across the site. Changing them is a
          product decision, not a settings toggle.
        </p>
      </section>

      <section aria-label="Plan records">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <h2 className="body-l font-700">Plan records</h2>
          <ResearchStatusBadge label="Billing pending" tone="pending" />
        </div>
        <AdminBoundary
          state={resource.state}
          message={resource.message}
          deniedCode={resource.deniedCode}
          onRetry={resource.reload}
          unavailableTitle="Plan records publish with membership billing."
          unavailableBody="When the billing backend connects, each plan renders here with its live member count and billing state. The standing terms above are already in force through the manual activation flow."
        >
          <ResearchDataTable<AdminPlanRow>
            caption="Membership plans"
            columns={[
              {
                key: "name",
                header: "Plan",
                render: (p) => (
                  <Link href={`${ADMIN_ROUTES.plans}/${p.id}`} className="font-700 underline">
                    {p.name}
                  </Link>
                ),
              },
              { key: "price", header: "Price", render: (p) => `$${(p.price_cents / 100).toFixed(2)}` },
              { key: "cadence", header: "Cadence", render: (p) => p.cadence },
              {
                key: "status",
                header: "Status",
                render: (p) => <ResearchStatusBadge label={p.status} tone={p.status === "active" ? "success" : "neutral"} />,
              },
              { key: "members", header: "Members", render: (p) => (p.member_count == null ? "" : String(p.member_count)) },
              { key: "updated", header: "Updated", render: (p) => fmtDate(p.updated_at) },
            ]}
            rows={resource.data?.plans ?? []}
            rowKey={(p) => p.id}
            empty="No plan records yet."
          />
        </AdminBoundary>
      </section>
    </div>
  );
}
