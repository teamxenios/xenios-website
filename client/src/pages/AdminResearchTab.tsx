import { useCallback, useEffect, useState } from "react";
import type { ApplicationStatus } from "@shared/research/membership-types";

// Research membership review queue (spec section 11), rendered as a tab inside
// the existing /admin dashboard. Talks to /api/admin/research/* with the same
// Supabase Bearer token as the other tabs.

type AdminApplication = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  country: string;
  region: string | null;
  city: string | null;
  applicant_type: string;
  occupation: string | null;
  organization: string | null;
  interests: string[];
  goals_text: string | null;
  fit_text: string | null;
  referral_source: string | null;
  referral_code: string | null;
  status: ApplicationStatus;
  submitted_at: string;
  approval_expires_at: string | null;
};

type AdminEvent = {
  id: string;
  previous_status: string | null;
  new_status: string | null;
  actor_type: string;
  actor_id: string | null;
  reason_code: string | null;
  internal_note: string | null;
  member_visible_note: string | null;
  created_at: string;
};

const QUEUES: Array<{ key: string; label: string }> = [
  { key: "new", label: "New" },
  { key: "under_review", label: "Under review" },
  { key: "needs_information", label: "Needs info" },
  { key: "approved_awaiting_payment", label: "Approved" },
  { key: "active", label: "Active" },
  { key: "declined", label: "Declined" },
  { key: "all", label: "All" },
];

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  resubmitted: "Resubmitted",
  under_review: "Under review",
  more_information_requested: "Needs information",
  approved_pending_payment: "Approved, awaiting activation",
  payment_pending: "Activation in progress",
  active: "Active",
  paused: "Paused",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

function fmtDate(value?: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

async function adminFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(body?.message || "The request failed.");
  return body as T;
}

export default function ResearchApplicationsTab({ token }: { token: string }) {
  const [queue, setQueue] = useState("new");
  const [apps, setApps] = useState<AdminApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setListError(null);
    adminFetch<{ applications: AdminApplication[] }>(token, `/api/admin/research/applications?queue=${queue}`)
      .then((body) => setApps(body.applications))
      .catch((err: any) => setListError(err?.message || "Could not load applications."))
      .finally(() => setLoading(false));
  }, [token, queue]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-8" role="tablist" aria-label="Application queues">
        {QUEUES.map((q) => (
          <button
            key={q.key}
            type="button"
            role="tab"
            aria-selected={queue === q.key}
            onClick={() => { setQueue(q.key); setSelectedId(null); }}
            className={`chip ${queue === q.key ? "bg-ink text-paper" : "text-ink-2"}`}
            data-testid={`tab-research-queue-${q.key}`}
          >
            {q.label}
          </button>
        ))}
      </div>

      {loading && <p className="body-s text-ink-mute">Loading...</p>}
      {listError && <p className="body-s" style={{ color: "var(--error)" }}>{listError}</p>}
      {!loading && !listError && apps.length === 0 && (
        <p className="body-m text-ink-mute">Nothing in this queue.</p>
      )}

      <div className="space-y-4">
        {apps.map((app) => (
          <div key={app.id}>
            <button
              type="button"
              onClick={() => setSelectedId(selectedId === app.id ? null : app.id)}
              className="card w-full text-left flex flex-wrap items-center justify-between gap-3 hover:border-[color:var(--ink)] transition-colors"
              aria-expanded={selectedId === app.id}
              data-testid={`row-application-${app.id}`}
            >
              <div style={{ minWidth: 0 }}>
                <p className="body-m font-700">{app.first_name} {app.last_name}</p>
                <p className="body-s text-ink-mute" style={{ overflowWrap: "anywhere" }}>
                  {app.email} · {app.applicant_type} · {[app.city, app.country].filter(Boolean).join(", ")}
                </p>
              </div>
              <div className="text-right">
                <p className="mono-label text-ink">{STATUS_LABEL[app.status] ?? app.status}</p>
                <p className="mono-label text-ink-mute mt-1">{fmtDate(app.submitted_at)}</p>
              </div>
            </button>
            {selectedId === app.id && (
              <ApplicationDetail token={token} id={app.id} onChanged={() => { load(); }} />
            )}
          </div>
        ))}
      </div>

      <ReferralFraudQueue token={token} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Referral fraud review queue (V3 section 71). Signals flag for review, never
// auto-penalize; every action requires an audit reason.
// ---------------------------------------------------------------------------

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

const FRAUD_STATUSES = ["open", "information-requested", "escalated", "resolved"] as const;

function ReferralFraudQueue({ token }: { token: string }) {
  const [status, setStatus] = useState<string>("open");
  const [flags, setFlags] = useState<FraudFlag[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    adminFetch<{ flags: FraudFlag[]; actions: string[] }>(token, `/api/admin/research/referral-fraud?status=${status}`)
      .then((body) => { setFlags(body.flags); setActions(body.actions); })
      .catch((err: any) => setError(err?.message || "Could not load the fraud queue."))
      .finally(() => setLoading(false));
  }, [token, status]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="mt-16">
      <p className="mono-cap text-ink-mute mb-2">Referral fraud review</p>
      <p className="body-s text-ink-mute mb-6 max-w-[64ch]">
        Signals flag for human review and never auto-penalize. Every action records an audit reason.
      </p>
      <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Fraud queue status">
        {FRAUD_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={`chip ${status === s ? "bg-ink text-paper" : "text-ink-2"}`}
            data-testid={`tab-fraud-status-${s}`}
          >
            {s.replace(/-/g, " ")}
          </button>
        ))}
      </div>
      {loading && <p className="body-s text-ink-mute">Loading...</p>}
      {error && <p className="body-s" style={{ color: "var(--error)" }}>{error}</p>}
      {!loading && !error && flags.length === 0 && (
        <p className="body-m text-ink-mute">Nothing in this queue.</p>
      )}
      <div className="space-y-4">
        {flags.map((flag) => (
          <FraudFlagCard key={flag.id} token={token} flag={flag} actions={actions} onChanged={load} />
        ))}
      </div>
    </section>
  );
}

function FraudFlagCard({ token, flag, actions, onChanged }: { token: string; flag: FraudFlag; actions: string[]; onChanged: () => void }) {
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!action || reason.trim().length < 5 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(token, `/api/admin/research/referral-fraud/${flag.id}/action`, {
        method: "POST",
        body: JSON.stringify({ action, reason: reason.trim() }),
      });
      onChanged();
    } catch (err: any) {
      setError(err?.message || "The action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" data-testid={`row-fraud-flag-${flag.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="body-m font-700">{flag.reason.replace(/-/g, " ")}</p>
        <p className="mono-label text-ink-mute">{fmtDate(flag.created_at)}</p>
      </div>
      {flag.detail && <p className="body-s text-ink-2 mt-2">{flag.detail}</p>}
      {flag.status === "resolved" ? (
        <p className="body-s text-ink-mute mt-3">
          Resolved: {flag.resolution_action?.replace(/-/g, " ")} ({flag.resolution_reason})
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="input-field"
            style={{ maxWidth: 220 }}
            aria-label="Reviewer action"
            data-testid={`select-fraud-action-${flag.id}`}
          >
            <option value="">Choose an action</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a.replace(/-/g, " ")}</option>
            ))}
          </select>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Audit reason (required)"
            className="input-field"
            style={{ flex: 1, minWidth: 220 }}
            aria-label="Audit reason"
            data-testid={`input-fraud-reason-${flag.id}`}
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !action || reason.trim().length < 5}
            className="btn btn-primary"
            style={{ height: 40, padding: "0 14px", fontSize: 13 }}
            data-testid={`button-fraud-apply-${flag.id}`}
          >
            {busy ? "Applying" : "Apply"}
          </button>
        </div>
      )}
      {error && <p className="body-s mt-2" style={{ color: "var(--error)" }}>{error}</p>}
    </div>
  );
}

function ApplicationDetail({ token, id, onChanged }: { token: string; id: string; onChanged: () => void }) {
  const [app, setApp] = useState<AdminApplication | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [infoNote, setInfoNote] = useState("");
  const [declineNote, setDeclineNote] = useState("");
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [paymentRef, setPaymentRef] = useState("");
  const [subscriptionRef, setSubscriptionRef] = useState("");

  const loadDetail = useCallback(() => {
    adminFetch<{ application: AdminApplication; events: AdminEvent[] }>(token, `/api/admin/research/applications/${id}`)
      .then((body) => { setApp(body.application); setEvents(body.events); })
      .catch((err: any) => setError(err?.message || "Could not load the application."));
  }, [token, id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function act(path: string, body?: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await adminFetch(token, `/api/admin/research/applications/${id}/${path}`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
      setConfirmApprove(false);
      setConfirmDecline(false);
      setInfoNote("");
      setDeclineNote("");
      loadDetail();
      onChanged();
    } catch (err: any) {
      setActionError(err?.message || "The action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="body-s mt-3" style={{ color: "var(--error)" }}>{error}</p>;
  if (!app) return <p className="body-s text-ink-mute mt-3">Loading...</p>;

  const canBeginReview = app.status === "submitted" || app.status === "resubmitted";
  const inReview = app.status === "under_review";
  const awaitingActivation = app.status === "approved_pending_payment";
  const paymentPending = app.status === "payment_pending";

  return (
    <div className="card mt-2 bg-paper-2" data-testid={`detail-application-${app.id}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 mb-6">
        {([
          ["Email", app.email],
          ["Phone", app.phone || "Not provided"],
          ["Location", [app.city, app.region, app.country].filter(Boolean).join(", ")],
          ["Type", app.applicant_type],
          ["Occupation", app.occupation || "Not provided"],
          ["Organization", app.organization || "Not provided"],
          ["Referral", [app.referral_source, app.referral_code].filter(Boolean).join(" / ") || "Not provided"],
          ["Approval expires", app.approval_expires_at ? fmtDate(app.approval_expires_at) : "Not set"],
        ] as const).map(([label, value]) => (
          <div key={label} style={{ minWidth: 0 }}>
            <p className="mono-label text-ink-mute">{label}</p>
            <p className="body-s text-ink mt-1" style={{ overflowWrap: "anywhere" }}>{value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <p className="mono-label text-ink-mute mb-2">Interests</p>
        <div className="flex flex-wrap gap-2">
          {(app.interests ?? []).map((interest) => (
            <span key={interest} className="chip text-ink-2" style={{ height: 30, fontSize: 12 }}>{interest}</span>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <p className="mono-label text-ink-mute">90-day goals</p>
        <p className="body-s text-ink-2 mt-1">{app.goals_text || "Not provided"}</p>
      </div>
      <div className="mb-6">
        <p className="mono-label text-ink-mute">Why xenios research</p>
        <p className="body-s text-ink-2 mt-1">{app.fit_text || "Not provided"}</p>
      </div>

      {/* Actions, driven by the state machine */}
      <div className="rule-top pt-5">
        {actionError && <p className="body-s mb-3" style={{ color: "var(--error)" }} data-testid="text-action-error">{actionError}</p>}

        {canBeginReview && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act("review")} data-testid="button-begin-review">
            {busy ? "Working" : "Begin review"}
          </button>
        )}

        {inReview && (
          <div className="space-y-5">
            <div>
              <p className="mono-label text-ink-mute mb-2">Request more information (note is sent to the applicant)</p>
              <textarea
                className="input-field textarea-field"
                rows={2}
                maxLength={1000}
                value={infoNote}
                onChange={(e) => setInfoNote(e.target.value)}
                placeholder="What do you need from the applicant?"
              />
              <button
                type="button"
                className="btn btn-secondary mt-2"
                disabled={busy || infoNote.trim().length < 5}
                onClick={() => void act("request-info", { memberVisibleNote: infoNote.trim() })}
                data-testid="button-request-info"
              >
                Request information
              </button>
            </div>

            <div className="flex flex-wrap gap-3">
              {!confirmApprove ? (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setConfirmApprove(true)} data-testid="button-approve">
                  Approve
                </button>
              ) : (
                <div className="card w-full">
                  <p className="body-s text-ink-2 mb-3">
                    Approve this application? Activation fee: <strong>$50.00, one-time</strong>. The approval email goes out immediately and the approval window starts now (default 14 days).
                  </p>
                  <div className="flex gap-3">
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act("approve")} data-testid="button-approve-confirm">
                      {busy ? "Approving" : "Confirm approval"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirmApprove(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {!confirmDecline ? (
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmDecline(true)} data-testid="button-decline">
                  Decline
                </button>
              ) : (
                <div className="card w-full">
                  <p className="body-s text-ink-2 mb-2">
                    Decline this application? The applicant receives the respectful, non-specific decline email. The note below stays internal.
                  </p>
                  <textarea
                    className="input-field textarea-field"
                    rows={2}
                    maxLength={2000}
                    value={declineNote}
                    onChange={(e) => setDeclineNote(e.target.value)}
                    placeholder="Internal note (never shown to the applicant)"
                  />
                  <div className="flex gap-3 mt-3">
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void act("decline", declineNote.trim() ? { internalNote: declineNote.trim() } : {})} data-testid="button-decline-confirm">
                      {busy ? "Declining" : "Confirm decline"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirmDecline(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {awaitingActivation && (
          <div className="space-y-3">
            <p className="body-s text-ink-2">
              Approved and waiting on activation: the $50 one-time activation plus the $25 monthly membership. When billing is enabled and the applicant has paid, begin activation.
            </p>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act("begin-activation")} data-testid="button-begin-activation">
              {busy ? "Working" : "Begin activation"}
            </button>
          </div>
        )}

        {paymentPending && (
          <div className="space-y-3">
            <p className="body-s text-ink-2">
              Activation requires BOTH verified references: the $50 activation payment and the active $25 monthly membership. The applicant must have created their member account first (the link in their approval email). No member becomes active until both are verified; activation then triggers referral qualification automatically.
            </p>
            <div>
              <label htmlFor={`pay-ref-${app.id}`} className="mono-label text-ink-mute">Activation payment reference (required)</label>
              <input
                id={`pay-ref-${app.id}`}
                className="input-field mt-1"
                maxLength={120}
                placeholder="e.g. zelle-0718-SB or receipt id for the $50 activation"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`sub-ref-${app.id}`} className="mono-label text-ink-mute">Monthly membership reference (required)</label>
              <input
                id={`sub-ref-${app.id}`}
                className="input-field mt-1"
                maxLength={120}
                placeholder="e.g. the active $25 monthly subscription id"
                value={subscriptionRef}
                onChange={(e) => setSubscriptionRef(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !paymentRef.trim() || !subscriptionRef.trim()}
              onClick={() => void act("activate", { paymentReference: paymentRef.trim(), subscriptionReference: subscriptionRef.trim() })}
              data-testid="button-activate-membership"
            >
              {busy ? "Activating" : "Mark activated"}
            </button>
          </div>
        )}

        {!canBeginReview && !inReview && !awaitingActivation && !paymentPending && (
          <p className="body-s text-ink-mute">
            No actions available in the {STATUS_LABEL[app.status] ?? app.status} state.
            {app.status === "more_information_requested" && " The applicant was emailed; the application returns to the queue when they resubmit."}
          </p>
        )}
      </div>

      {/* Timeline */}
      {events.length > 0 && (
        <div className="rule-top mt-6 pt-5">
          <p className="mono-label text-ink-mute mb-3">Timeline</p>
          <ol className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="body-s text-ink-2">
                <span className="mono-label text-ink-mute mr-2">{fmtDate(event.created_at)}</span>
                {event.previous_status ? `${STATUS_LABEL[event.previous_status] ?? event.previous_status} to ` : ""}
                {STATUS_LABEL[event.new_status ?? ""] ?? event.new_status}
                <span className="text-ink-mute"> · {event.actor_type}{event.actor_id ? ` (${event.actor_id})` : ""}</span>
                {event.member_visible_note && <span className="block text-ink-mute mt-1">To applicant: {event.member_visible_note}</span>}
                {event.internal_note && <span className="block text-ink-mute mt-1">Internal: {event.internal_note}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
