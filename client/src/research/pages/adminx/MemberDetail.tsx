import { Link, useParams } from "wouter";
import { ResearchSecureNotice, ResearchStatusBadge, ResearchTimeline } from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/members/:id, one member account. Publishes with the member
// platform; the layout is ready and renders live data the moment the API
// responds. Deliberate omission: no assessment answers, tracker entries, or
// question threads render here. This page is account and membership state
// only, so a quick admin glance can never casually expose health data.
// ---------------------------------------------------------------------------

type AdminMemberDetail = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  plan: string | null;
  activated_at: string | null;
  application_id: string | null;
  consent: Array<{ kind: string; granted_at: string | null; version: string | null }>;
  events: Array<{ at: string; title: string; detail?: string }>;
};

export default function MemberDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  return (
    <AdminScreen
      title="Member"
      lead="Account and membership state for one member."
      actions={
        <Link href={ADMIN_ROUTES.members} className="btn btn-secondary">
          Back to members
        </Link>
      }
    >
      {(token) => <MemberDetailBody token={token} id={id} />}
    </AdminScreen>
  );
}

function MemberDetailBody({ token, id }: { token: string; id: string }) {
  const resource = useAdminResource<{ ok: boolean; member: AdminMemberDetail }>(
    token,
    `/api/admin/research/members/${encodeURIComponent(id)}`,
  );

  return (
    <div className="grid gap-6">
      <AdminBoundary
        state={resource.state}
        message={resource.message}
        onRetry={resource.reload}
        unavailableTitle="Member records publish with the member platform."
        unavailableBody="This page renders the account, membership, consent, and account timeline the moment the members API responds. If this member came through an application, their application file already holds the review history."
      >
        {(() => {
          const m = resource.data?.member;
          if (!m) return null;
          return (
            <>
              <section className="card" aria-label="Account">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div style={{ minWidth: 0 }}>
                    <p className="body-l font-700">{[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email}</p>
                    <p className="body-s text-ink-mute mt-1" style={{ overflowWrap: "anywhere" }}>
                      {m.email}
                    </p>
                  </div>
                  <ResearchStatusBadge label={m.status} tone={m.status === "active" ? "success" : "neutral"} />
                </div>
                <div className="grid gap-x-8 gap-y-3 mt-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                  <div>
                    <p className="mono-label text-ink-mute">Plan</p>
                    <p className="body-s mt-1">{m.plan ?? "Monthly, $25"}</p>
                  </div>
                  <div>
                    <p className="mono-label text-ink-mute">Activated</p>
                    <p className="body-s mt-1">{fmtDate(m.activated_at) || "Not recorded"}</p>
                  </div>
                  <div>
                    <p className="mono-label text-ink-mute">Application</p>
                    {m.application_id ? (
                      <Link href={`${ADMIN_ROUTES.applications}/${m.application_id}`} className="body-s underline mt-1 inline-block">
                        Open the application file
                      </Link>
                    ) : (
                      <p className="body-s mt-1">Not linked</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="card" aria-label="Consent">
                <p className="mono-label text-ink-mute mb-3">Consent</p>
                {m.consent.length === 0 ? (
                  <p className="body-s text-ink-2">No consent records returned.</p>
                ) : (
                  <ul className="grid gap-2">
                    {m.consent.map((c) => (
                      <li key={c.kind} className="body-s text-ink-2 flex items-center gap-3 flex-wrap">
                        <ResearchStatusBadge label={c.granted_at ? "Granted" : "Not granted"} tone={c.granted_at ? "success" : "warning"} />
                        {c.kind}
                        {c.version ? ` (v${c.version})` : ""}
                        {c.granted_at ? `, ${fmtDate(c.granted_at)}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-label="Account timeline">
                <h2 className="body-l font-700 mb-4">Account timeline</h2>
                <ResearchTimeline items={m.events ?? []} />
              </section>
            </>
          );
        })()}
      </AdminBoundary>

      <ResearchSecureNotice>
        By design, this page never shows assessment answers, tracker entries, or question content. Those live in the
        member's own record; operations sees account and membership state only.
      </ResearchSecureNotice>
    </div>
  );
}
