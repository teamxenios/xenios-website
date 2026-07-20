import { useCallback } from "react";
import { Link, useParams } from "wouter";
import { getPlan } from "../../adapters/adminOps";
import { ResearchStatusBadge, ResearchTimeline } from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/plans/:id, one plan record. Publishes with membership
// billing; renders the live record and its change history when the API
// responds.
// ---------------------------------------------------------------------------

type AdminPlanDetail = {
  id: string;
  name: string;
  price_cents: number;
  cadence: string;
  status: string;
  member_count: number | null;
  created_at: string | null;
  updated_at: string | null;
  history: Array<{ at: string; title: string; detail?: string }>;
};

export default function PlanDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  return (
    <AdminScreen
      title="Plan"
      lead="One membership plan record and its change history."
      actions={
        <Link href={ADMIN_ROUTES.plans} className="btn btn-secondary">
          Back to plans
        </Link>
      }
    >
      {(token) => <PlanDetailBody token={token} id={id} />}
    </AdminScreen>
  );
}

function PlanDetailBody({ token, id }: { token: string; id: string }) {
  const loadPlan = useCallback((t: string) => getPlan<{ ok: boolean; plan: AdminPlanDetail }>(t, id), [id]);
  const resource = useAdminResource(token, loadPlan);
  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      onRetry={resource.reload}
      unavailableTitle="Plan records publish with membership billing."
      unavailableBody="This record renders live when the billing backend connects. The standing terms ($50 one-time activation, $25 monthly, no annual plan) are listed on the Plans page."
    >
      {(() => {
        const p = resource.data?.plan;
        if (!p) return null;
        return (
          <div className="grid gap-6">
            <section className="card" aria-label="Plan record">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <p className="body-l font-700">{p.name}</p>
                <ResearchStatusBadge label={p.status} tone={p.status === "active" ? "success" : "neutral"} />
              </div>
              <div className="grid gap-x-8 gap-y-3 mt-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <div>
                  <p className="mono-label text-ink-mute">Price</p>
                  <p className="body-s mt-1">${(p.price_cents / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="mono-label text-ink-mute">Cadence</p>
                  <p className="body-s mt-1">{p.cadence}</p>
                </div>
                <div>
                  <p className="mono-label text-ink-mute">Members</p>
                  <p className="body-s mt-1">{p.member_count == null ? "Not reported" : p.member_count}</p>
                </div>
                <div>
                  <p className="mono-label text-ink-mute">Updated</p>
                  <p className="body-s mt-1">{fmtDate(p.updated_at) || "Not recorded"}</p>
                </div>
              </div>
            </section>
            <section aria-label="Plan history">
              <h2 className="body-l font-700 mb-4">History</h2>
              <ResearchTimeline items={p.history ?? []} />
            </section>
          </div>
        );
      })()}
    </AdminBoundary>
  );
}
