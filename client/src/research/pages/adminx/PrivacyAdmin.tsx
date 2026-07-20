import { Link } from "wouter";
import { ResearchDataTable, ResearchSecureNotice, ResearchStatusBadge } from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/privacy: member privacy operations. The request queue
// (exports and deletions) publishes with the member platform; the standing
// discipline is stated here because it is already in force: requests reach a
// person by email today, nothing is deleted silently, and health data never
// renders in operations lists.
// ---------------------------------------------------------------------------

type PrivacyRequestRow = {
  id: string;
  member_email: string;
  kind: string;
  status: string;
  requested_at: string;
  resolved_at: string | null;
};

export default function PrivacyAdmin() {
  return (
    <AdminScreen
      title="Privacy"
      lead="Export and deletion requests, and the standing rules that govern member data."
    >
      {(token) => <PrivacyBody token={token} />}
    </AdminScreen>
  );
}

function PrivacyBody({ token }: { token: string }) {
  const resource = useAdminResource<{ ok: boolean; requests: PrivacyRequestRow[] }>(
    token,
    "/api/admin/research/privacy/requests",
  );
  return (
    <div className="grid gap-8">
      <section aria-label="Privacy requests">
        <h2 className="body-l font-700 mb-4">Request queue</h2>
        <AdminBoundary
          state={resource.state}
          message={resource.message}
          onRetry={resource.reload}
          unavailableTitle="The privacy request queue publishes with the member platform."
          unavailableBody="Member export and deletion requests currently arrive by email and are handled by a person. When the queue API responds, every request renders here with its state and resolution."
        >
          <ResearchDataTable<PrivacyRequestRow>
            caption="Privacy requests"
            columns={[
              {
                key: "member",
                header: "Member",
                render: (r) => <span style={{ overflowWrap: "anywhere" }}>{r.member_email}</span>,
              },
              { key: "kind", header: "Request", render: (r) => r.kind },
              {
                key: "status",
                header: "Status",
                render: (r) => (
                  <ResearchStatusBadge
                    label={r.status}
                    tone={r.status === "resolved" ? "success" : r.status === "open" ? "warning" : "neutral"}
                  />
                ),
              },
              { key: "requested", header: "Requested", render: (r) => fmtDate(r.requested_at) },
              { key: "resolved", header: "Resolved", render: (r) => fmtDate(r.resolved_at) },
            ]}
            rows={resource.data?.requests ?? []}
            rowKey={(r) => r.id}
            empty="No open privacy requests."
          />
        </AdminBoundary>
      </section>

      <section aria-label="Standing privacy rules">
        <h2 className="body-l font-700 mb-4">Standing rules</h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <div className="card">
            <p className="mono-label text-ink-mute">Deletion</p>
            <p className="body-s text-ink-2 mt-2">
              Nothing is deleted silently. A person confirms scope with the member before anything is removed, every
              time.
            </p>
          </div>
          <div className="card">
            <p className="mono-label text-ink-mute">Export</p>
            <p className="body-s text-ink-2 mt-2">
              Members can request everything they have logged, in a readable format, at any time. A person prepares and
              delivers it.
            </p>
          </div>
          <div className="card">
            <p className="mono-label text-ink-mute">Operational exposure</p>
            <p className="body-s text-ink-2 mt-2">
              Operations lists show account and workflow metadata only. Assessment answers, tracker entries, and
              question bodies open deliberately, one record at a time.
            </p>
          </div>
          <div className="card">
            <p className="mono-label text-ink-mute">No resale, no sharing</p>
            <p className="body-s text-ink-2 mt-2">
              Member data is never sold and never shared outside the program.
            </p>
          </div>
        </div>
      </section>

      <div className="flex gap-4 flex-wrap">
        <Link href={ADMIN_ROUTES.security} className="body-s underline text-ink-mute">
          Security and system
        </Link>
        <Link href={ADMIN_ROUTES.audit} className="body-s underline text-ink-mute">
          Audit
        </Link>
      </div>

      <ResearchSecureNotice>
        The member-facing privacy policy is the public statement of these rules; this page is the operational side of
        the same commitments.
      </ResearchSecureNotice>
    </div>
  );
}
