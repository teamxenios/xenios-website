import { Link, useParams } from "wouter";
import { ResearchStatusBadge, ResearchTimeline } from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/partners/:id, one partner account: status, referral code,
// qualified referrals, commission state, and history. Publishes with the
// partner backend. Payout execution additionally depends on the
// affiliate_payouts capability (see Capabilities).
// ---------------------------------------------------------------------------

type PartnerDetail = {
  id: string;
  name: string;
  email: string;
  status: string;
  referral_code: string | null;
  qualified_referrals: number | null;
  pending_commission_cents: number | null;
  paid_commission_cents: number | null;
  joined_at: string | null;
  history: Array<{ at: string; title: string; detail?: string }>;
};

export default function PartnerAdminDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  return (
    <AdminScreen
      title="Partner"
      lead="One partner account: referrals, commissions, and history."
      actions={
        <Link href={ADMIN_ROUTES.partners} className="btn btn-secondary">
          Back to partners
        </Link>
      }
    >
      {(token) => <PartnerDetailBody token={token} id={id} />}
    </AdminScreen>
  );
}

function PartnerDetailBody({ token, id }: { token: string; id: string }) {
  const resource = useAdminResource<{ ok: boolean; partner: PartnerDetail }>(
    token,
    `/api/admin/research/partners/${encodeURIComponent(id)}`,
  );
  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      onRetry={resource.reload}
      unavailableTitle="Partner records publish with the partner backend."
      unavailableBody="This account renders live when the partners admin API responds. Referral integrity flags are already reviewable from the Partners page."
    >
      {(() => {
        const p = resource.data?.partner;
        if (!p) return null;
        return (
          <div className="grid gap-6">
            <section className="card" aria-label="Partner account">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div style={{ minWidth: 0 }}>
                  <p className="body-l font-700">{p.name}</p>
                  <p className="body-s text-ink-mute mt-1" style={{ overflowWrap: "anywhere" }}>
                    {p.email}
                  </p>
                </div>
                <ResearchStatusBadge label={p.status} tone={p.status === "active" ? "success" : "neutral"} />
              </div>
              <div className="grid gap-x-8 gap-y-3 mt-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <div>
                  <p className="mono-label text-ink-mute">Referral code</p>
                  <p className="body-s mt-1">{p.referral_code ?? "Not assigned"}</p>
                </div>
                <div>
                  <p className="mono-label text-ink-mute">Qualified referrals</p>
                  <p className="body-s mt-1 tabular">{p.qualified_referrals ?? 0}</p>
                </div>
                <div>
                  <p className="mono-label text-ink-mute">Pending commission</p>
                  <p className="body-s mt-1">
                    {p.pending_commission_cents == null ? "Not reported" : `$${(p.pending_commission_cents / 100).toFixed(2)}`}
                  </p>
                </div>
                <div>
                  <p className="mono-label text-ink-mute">Paid to date</p>
                  <p className="body-s mt-1">
                    {p.paid_commission_cents == null ? "Not reported" : `$${(p.paid_commission_cents / 100).toFixed(2)}`}
                  </p>
                </div>
                <div>
                  <p className="mono-label text-ink-mute">Joined</p>
                  <p className="body-s mt-1">{fmtDate(p.joined_at) || "Not recorded"}</p>
                </div>
              </div>
              <p className="body-s text-ink-mute mt-4 max-w-[64ch]">
                Payout execution depends on the affiliate payouts capability. Its configuration state is on the
                Capabilities page; no payout runs from this screen.
              </p>
            </section>
            <section aria-label="Partner history">
              <h2 className="body-l font-700 mb-4">History</h2>
              <ResearchTimeline items={p.history ?? []} />
            </section>
          </div>
        );
      })()}
    </AdminBoundary>
  );
}
