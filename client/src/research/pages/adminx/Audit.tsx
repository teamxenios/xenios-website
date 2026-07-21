import { Link } from "wouter";
import { listAuditEvents } from "../../adapters/adminOps";
import { ResearchDataTable, ResearchSecureNotice, ResearchStatusBadge } from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDateTime, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/audit: the unified audit trail. The cross-surface audit
// API publishes with the member platform; until then this page states what
// is ALREADY recorded today and where to read it, instead of pretending a
// unified view exists.
// ---------------------------------------------------------------------------

type AuditRow = {
  id: string;
  at: string;
  actor: string;
  action: string;
  subject: string;
  detail: string | null;
};

export default function Audit() {
  return (
    <AdminScreen
      title="Audit"
      lead="Who did what, when, across research operations. Recorded events are permanent."
    >
      {(token) => <AuditBody token={token} />}
    </AdminScreen>
  );
}

function AuditBody({ token }: { token: string }) {
  const resource = useAdminResource<{ ok: boolean; events: AuditRow[] }>(token, listAuditEvents);
  return (
    <div className="grid gap-8">
      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="The unified audit view publishes with the member platform."
        unavailableBody="Auditable events are already being recorded where the surfaces are live; this page will unify them. Until then, read them at the sources listed below."
      >
        <ResearchDataTable<AuditRow>
          caption="Audit events"
          columns={[
            { key: "at", header: "When", render: (e) => fmtDateTime(e.at) },
            { key: "actor", header: "Actor", render: (e) => e.actor },
            { key: "action", header: "Action", render: (e) => e.action },
            { key: "subject", header: "Subject", render: (e) => <span style={{ overflowWrap: "anywhere" }}>{e.subject}</span> },
            { key: "detail", header: "Detail", render: (e) => <span className="text-ink-mute">{e.detail ?? ""}</span> },
          ]}
          rows={resource.data?.events ?? []}
          rowKey={(e) => e.id}
          empty="No audit events returned."
        />
      </AdminBoundary>

      <section aria-label="What is recorded today">
        <h2 className="body-l font-700 mb-4">Recorded today</h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <div className="card">
            <div className="flex items-center justify-between gap-3">
              <p className="mono-label text-ink-mute">Application decisions</p>
              <ResearchStatusBadge label="Live" tone="success" />
            </div>
            <p className="body-s text-ink-2 mt-2">
              Every review, approval, decline, and activation is recorded with actor and notes on the application's own
              timeline.
            </p>
            <Link href={ADMIN_ROUTES.applications} className="body-s underline text-ink-mute mt-3 inline-block">
              Applications
            </Link>
          </div>
          <div className="card">
            <div className="flex items-center justify-between gap-3">
              <p className="mono-label text-ink-mute">Fraud resolutions</p>
              <ResearchStatusBadge label="Live" tone="success" />
            </div>
            <p className="body-s text-ink-2 mt-2">
              Every referral flag action requires and records an audit reason, kept on the flag permanently.
            </p>
            <Link href={ADMIN_ROUTES.partners} className="body-s underline text-ink-mute mt-3 inline-block">
              Partners
            </Link>
          </div>
          <div className="card">
            <div className="flex items-center justify-between gap-3">
              <p className="mono-label text-ink-mute">Email attempts</p>
              <ResearchStatusBadge label="Live" tone="success" />
            </div>
            <p className="body-s text-ink-2 mt-2">
              Every outbox delivery attempt, including manual requeues attributed to the admin who ran them, is stored
              with the message.
            </p>
            <Link href={ADMIN_ROUTES.security} className="body-s underline text-ink-mute mt-3 inline-block">
              Security and system
            </Link>
          </div>
        </div>
      </section>

      <ResearchSecureNotice>
        Audit events are append-only and reference records by id. Member health data never appears in audit rows.
      </ResearchSecureNotice>
    </div>
  );
}
