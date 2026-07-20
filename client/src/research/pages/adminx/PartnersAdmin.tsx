import { useMemo, useState } from "react";
import { Link } from "wouter";
import { apiPost } from "../../lib/api";
import {
  ResearchDataTable,
  ResearchFilterBar,
  ResearchSearch,
  ResearchSecureNotice,
  ResearchStatusBadge,
  ResearchTabs,
  useDebounced,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/partners: the partner program from the operations side.
// Two halves: the partner roster (publishes with the partner backend) and
// the REAL referral fraud review queue, live today. Fraud signals only flag
// for human review, never auto-penalize, and every action records an audit
// reason.
// ---------------------------------------------------------------------------

type PartnerRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  referral_code: string | null;
  qualified_referrals: number | null;
  joined_at: string | null;
};

type FraudFlag = {
  id: string;
  reason: string;
  status: string;
  attribution_id: string | null;
  identity_id: string | null;
  application_id: string | null;
  detail: string | null;
  resolution_action: string | null;
  resolution_reason: string | null;
  created_at: string;
};

const FRAUD_STATUSES = [
  { key: "open", label: "Open" },
  { key: "information-requested", label: "Information requested" },
  { key: "escalated", label: "Escalated" },
  { key: "resolved", label: "Resolved" },
];

export default function PartnersAdmin() {
  return (
    <AdminScreen
      title="Partners"
      lead="The partner roster and the referral integrity queue. Flags are reviewed by a person; nothing is penalized automatically."
    >
      {(token) => <PartnersBody token={token} />}
    </AdminScreen>
  );
}

function PartnersBody({ token }: { token: string }) {
  return (
    <div className="grid gap-10">
      <PartnerRoster token={token} />
      <FraudQueue token={token} />
    </div>
  );
}

function PartnerRoster({ token }: { token: string }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const resource = useAdminResource<{ ok: boolean; partners: PartnerRow[] }>(token, "/api/admin/research/partners");

  const filtered = useMemo(() => {
    const list = resource.data?.partners ?? [];
    const q = debounced.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  }, [resource.data, debounced]);

  return (
    <section aria-label="Partner roster">
      <h2 className="body-l font-700 mb-4">Roster</h2>
      <ResearchFilterBar>
        <ResearchSearch value={search} onChange={setSearch} label="Search partners" placeholder="Name or email" />
      </ResearchFilterBar>
      <div className="mt-4">
        <AdminBoundary
          state={resource.state}
          message={resource.message}
          onRetry={resource.reload}
          unavailableTitle="The partner roster publishes with the partner backend."
          unavailableBody="Partner accounts, links, and commission state render here when the partners admin API responds. Referral integrity review below is live today."
        >
          <ResearchDataTable<PartnerRow>
            caption="Partners"
            columns={[
              {
                key: "name",
                header: "Partner",
                render: (p) => (
                  <Link href={`${ADMIN_ROUTES.partners}/${p.id}`} className="font-700 underline">
                    {p.name}
                  </Link>
                ),
              },
              { key: "email", header: "Email", render: (p) => <span style={{ overflowWrap: "anywhere" }}>{p.email}</span> },
              {
                key: "status",
                header: "Status",
                render: (p) => <ResearchStatusBadge label={p.status} tone={p.status === "active" ? "success" : "neutral"} />,
              },
              { key: "code", header: "Referral code", render: (p) => p.referral_code ?? "" },
              {
                key: "qualified",
                header: "Qualified referrals",
                render: (p) => (p.qualified_referrals == null ? "" : String(p.qualified_referrals)),
              },
              { key: "joined", header: "Joined", render: (p) => fmtDate(p.joined_at) },
            ]}
            rows={filtered}
            rowKey={(p) => p.id}
            empty="No partner accounts yet."
          />
        </AdminBoundary>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The live referral fraud review queue.
// ---------------------------------------------------------------------------

function FraudQueue({ token }: { token: string }) {
  const [status, setStatus] = useState("open");
  const resource = useAdminResource<{ ok: boolean; flags: FraudFlag[]; actions: string[] }>(
    token,
    `/api/admin/research/referral-fraud?status=${encodeURIComponent(status)}`,
  );

  return (
    <section aria-label="Referral fraud review">
      <h2 className="body-l font-700 mb-2">Referral integrity review</h2>
      <p className="body-s text-ink-mute mb-4 max-w-[64ch]">
        Signals flag for human review and never auto-penalize. Every action requires an audit reason and is recorded.
      </p>
      <ResearchTabs tabs={FRAUD_STATUSES} active={status} onSelect={setStatus} label="Fraud queue status" />
      <div className="mt-4 grid gap-4">
        <AdminBoundary
          state={resource.state}
          message={resource.message}
          onRetry={resource.reload}
          unavailableTitle="The fraud queue is not reachable."
          unavailableBody="The referral fraud API is not responding in this environment."
        >
          {(resource.data?.flags ?? []).length === 0 ? (
            <p className="body-m text-ink-mute">Nothing in this queue.</p>
          ) : (
            (resource.data?.flags ?? []).map((flag) => (
              <FraudFlagCard
                key={flag.id}
                token={token}
                flag={flag}
                actions={resource.data?.actions ?? []}
                onChanged={resource.reload}
              />
            ))
          )}
        </AdminBoundary>
        <ManualReportForm token={token} onReported={resource.reload} />
      </div>
      <div className="mt-6">
        <ResearchSecureNotice>
          Flags reference attribution and application ids, not member health data. Resolution reasons become part of the
          permanent audit record.
        </ResearchSecureNotice>
      </div>
    </section>
  );
}

function FraudFlagCard({
  token,
  flag,
  actions,
  onChanged,
}: {
  token: string;
  flag: FraudFlag;
  actions: string[];
  onChanged: () => void;
}) {
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!action || reason.trim().length < 5 || busy) return;
    setBusy(true);
    setError(null);
    const result = await apiPost<{ ok: boolean }>(
      `/api/admin/research/referral-fraud/${encodeURIComponent(flag.id)}/action`,
      { action, reason: reason.trim() },
      token,
    );
    setBusy(false);
    if (result.kind === "ok") {
      onChanged();
    } else if (result.kind === "unauthorized") {
      setError("Your admin session has ended. Sign in again.");
    } else if (result.kind === "forbidden") {
      setError(result.message ?? "This action is not allowed for your account.");
    } else if (result.kind === "unavailable") {
      setError("The fraud action endpoint is not available in this environment.");
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="card" data-testid={`card-fraud-flag-${flag.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="body-m font-700">{flag.reason.replace(/-/g, " ")}</p>
        <p className="mono-label text-ink-mute">{fmtDate(flag.created_at)}</p>
      </div>
      {flag.detail && <p className="body-s text-ink-2 mt-2">{flag.detail}</p>}
      <p className="body-s text-ink-mute mt-2" style={{ overflowWrap: "anywhere" }}>
        {[
          flag.application_id ? `application ${flag.application_id}` : "",
          flag.attribution_id ? `attribution ${flag.attribution_id}` : "",
          flag.identity_id ? `identity ${flag.identity_id}` : "",
        ]
          .filter(Boolean)
          .join(" · ") || "No linked records"}
      </p>
      {flag.status === "resolved" ? (
        <p className="body-s text-ink-mute mt-3">
          Resolved: {flag.resolution_action?.replace(/-/g, " ")} ({flag.resolution_reason})
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3 mt-4">
          <div>
            <label htmlFor={`fraud-action-${flag.id}`} className="form-label">
              Reviewer action
            </label>
            <select
              id={`fraud-action-${flag.id}`}
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="input-field"
              style={{ maxWidth: 240 }}
            >
              <option value="">Choose an action</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a.replace(/-/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor={`fraud-reason-${flag.id}`} className="form-label">
              Audit reason (required)
            </label>
            <input
              id={`fraud-reason-${flag.id}`}
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field"
            />
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !action || reason.trim().length < 5}
            className="btn btn-primary"
          >
            {busy ? "Applying..." : "Apply"}
          </button>
        </div>
      )}
      {error && (
        <p className="body-s mt-2" role="alert" style={{ color: "var(--error)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function ManualReportForm({ token, onReported }: { token: string; onReported: () => void }) {
  const [detail, setDetail] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (busy || detail.trim().length < 5) return;
    setBusy(true);
    setMessage(null);
    const body: Record<string, unknown> = { detail: detail.trim() };
    if (applicationId.trim()) body.applicationId = applicationId.trim();
    const result = await apiPost<{ ok: boolean; flagId: string }>("/api/admin/research/referral-fraud/report", body, token);
    setBusy(false);
    if (result.kind === "ok") {
      setDetail("");
      setApplicationId("");
      setMessage("Flag opened for review.");
      onReported();
    } else if (result.kind === "unavailable") {
      setMessage("The manual report endpoint is not available in this environment.");
    } else if (result.kind === "unauthorized") {
      setMessage("Your admin session has ended. Sign in again.");
    } else {
      setMessage(result.kind === "forbidden" ? result.message ?? "This action is not allowed." : result.message);
    }
  };

  return (
    <section className="card" aria-label="Open a manual flag">
      <p className="mono-label text-ink-mute">Open a manual flag</p>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        Saw something the signals missed? Open a flag directly. It enters the same review queue with reason
        "manual report".
      </p>
      <div className="grid gap-4 mt-4">
        <div>
          <label htmlFor="fraud-report-detail" className="form-label">
            What did you see? (required)
          </label>
          <textarea
            id="fraud-report-detail"
            className="input-field"
            rows={2}
            maxLength={500}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="fraud-report-application" className="form-label">
            Application id (optional, UUID)
          </label>
          <input
            id="fraud-report-application"
            type="text"
            className="input-field"
            style={{ maxWidth: 400 }}
            value={applicationId}
            onChange={(e) => setApplicationId(e.target.value)}
          />
        </div>
      </div>
      {message && (
        <p className="body-s text-ink-2 mt-3" role="status" aria-live="polite">
          {message}
        </p>
      )}
      <div className="mt-4">
        <button type="button" className="btn btn-secondary" disabled={busy || detail.trim().length < 5} onClick={() => void submit()}>
          {busy ? "Opening..." : "Open flag"}
        </button>
      </div>
    </section>
  );
}
