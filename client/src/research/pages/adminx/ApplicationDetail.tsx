import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { getApplication, postApplicationAction } from "../../adapters/adminOps";
import {
  ResearchConfirmation,
  ResearchEmptyState,
  ResearchErrorState,
  ResearchLoadingState,
  ResearchStatusBadge,
  ResearchTimeline,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { denialPresentation } from "../../lib/denials";
import { fmtDate, fmtDateTime } from "./auth";
import { AdminScreen, APPLICATION_STATUS_LABEL, type AdminApplication } from "./AdminResearchHome";
import { statusTone } from "./Applications";

// ---------------------------------------------------------------------------
// /admin/research/applications/:id, the full application file. Mirrors the
// state machine the server enforces: begin review, request information,
// approve (confirmed), decline (confirmed, internal note), begin activation,
// and activation. The canonical economics: $50 due at activation, which
// includes the first 30 days of membership; then $25 per additional 30-day
// period; nothing else is due at activation. Every action posts to the real
// admin API and re-reads the file; the timeline renders the audit events the
// server returns.
// ---------------------------------------------------------------------------

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

type DetailState =
  | { kind: "loading" }
  | { kind: "error"; message?: string }
  | { kind: "unavailable" }
  | { kind: "denied"; message?: string }
  | { kind: "ok"; application: AdminApplication; events: AdminEvent[] };

export default function ApplicationDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  return (
    <AdminScreen
      title="Application"
      lead="The full file: applicant details, review actions, and the audit timeline."
      actions={
        <Link href={ADMIN_ROUTES.applications} className="btn btn-secondary">
          Back to the queue
        </Link>
      }
    >
      {(token) => <DetailBody token={token} id={id} />}
    </AdminScreen>
  );
}

function DetailBody({ token, id }: { token: string; id: string }) {
  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setState({ kind: "loading" });
    void getApplication<{ ok: boolean; application: AdminApplication; events: AdminEvent[] }>(token, id).then((result) => {
      if (result.kind === "ok") {
        setState({ kind: "ok", application: result.data.application, events: result.data.events ?? [] });
      } else if (result.kind === "unavailable") {
        setState({ kind: "unavailable" });
      } else if (result.kind === "unauthorized" || result.kind === "forbidden") {
        setState({ kind: "denied", message: result.kind === "forbidden" ? result.message : undefined });
      } else if (result.kind === "denied") {
        // Route on the machine code; the copy is ours (lib/denials).
        const p = denialPresentation(result.code, result.message);
        setState({ kind: "denied", message: `${p.title} ${p.body}` });
      } else {
        setState({ kind: "error", message: result.message });
      }
    });
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (path: string, body?: Record<string, unknown>): Promise<boolean> => {
      if (busy) return false;
      setBusy(true);
      setActionError(null);
      const result = await postApplicationAction<{ ok: boolean }>(token, id, path, body ?? {});
      setBusy(false);
      if (result.kind === "ok") {
        load();
        return true;
      }
      if (result.kind === "unauthorized") setActionError("Your admin session has ended. Sign in again.");
      else if (result.kind === "forbidden") setActionError(result.message ?? "This action is not allowed for your account.");
      else if (result.kind === "unavailable") setActionError("This action endpoint is not available in this environment.");
      else if (result.kind === "denied") {
        const p = denialPresentation(result.code, result.message);
        setActionError(`${p.title} ${p.body}`);
      } else setActionError(result.message);
      return false;
    },
    [busy, id, token, load],
  );

  if (state.kind === "loading") return <ResearchLoadingState label="Loading the application" />;
  if (state.kind === "error") return <ResearchErrorState message={state.message} onRetry={load} />;
  if (state.kind === "unavailable")
    return (
      <ResearchEmptyState
        title="This application could not be found."
        body="It may have been removed, or the applications API is not responding."
        action={
          <Link href={ADMIN_ROUTES.applications} className="btn btn-secondary">
            Back to the queue
          </Link>
        }
      />
    );
  if (state.kind === "denied")
    return (
      <ResearchEmptyState
        title="Access denied."
        body={state.message ?? "Your session has ended or this account is not authorized. Authority is checked by the server on every request."}
      />
    );

  const app = state.application;
  return (
    <div className="grid gap-8">
      <section className="card" aria-label="Applicant summary">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div style={{ minWidth: 0 }}>
            <p className="body-l font-700">
              {app.first_name} {app.last_name}
            </p>
            <p className="body-s text-ink-mute mt-1" style={{ overflowWrap: "anywhere" }}>
              {app.email}
            </p>
          </div>
          <ResearchStatusBadge label={APPLICATION_STATUS_LABEL[app.status] ?? app.status} tone={statusTone(app.status)} />
        </div>
        <div className="grid gap-x-8 gap-y-3 mt-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {(
            [
              ["Phone", app.phone || "Not provided"],
              ["Location", [app.city, app.region, app.country].filter(Boolean).join(", ") || "Not provided"],
              ["Type", app.applicant_type],
              ["Occupation", app.occupation || "Not provided"],
              ["Organization", app.organization || "Not provided"],
              ["Referral", [app.referral_source, app.referral_code].filter(Boolean).join(" / ") || "Not provided"],
              ["Submitted", fmtDate(app.submitted_at)],
              ["Approval expires", app.approval_expires_at ? fmtDate(app.approval_expires_at) : "Not set"],
            ] as const
          ).map(([label, value]) => (
            <div key={label} style={{ minWidth: 0 }}>
              <p className="mono-label text-ink-mute">{label}</p>
              <p className="body-s mt-1" style={{ overflowWrap: "anywhere" }}>
                {value}
              </p>
            </div>
          ))}
        </div>
        {(app.interests ?? []).length > 0 && (
          <div className="mt-5">
            <p className="mono-label text-ink-mute mb-2">Interests</p>
            <div className="flex flex-wrap gap-2">
              {app.interests.map((interest) => (
                <span key={interest} className="chip text-ink-2" style={{ height: 30, fontSize: 12 }}>
                  {interest}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="mt-5">
          <p className="mono-label text-ink-mute">90-day goals</p>
          <p className="body-s text-ink-2 mt-1">{app.goals_text || "Not provided"}</p>
        </div>
        <div className="mt-4">
          <p className="mono-label text-ink-mute">Why Xenios Research</p>
          <p className="body-s text-ink-2 mt-1">{app.fit_text || "Not provided"}</p>
        </div>
      </section>

      <ActionsPanel app={app} busy={busy} error={actionError} act={act} />

      <section aria-label="Application timeline">
        <h2 className="body-l font-700 mb-4">Timeline</h2>
        <ResearchTimeline
          items={state.events.map((event) => ({
            at: fmtDateTime(event.created_at),
            title: `${event.previous_status ? `${APPLICATION_STATUS_LABEL[event.previous_status] ?? event.previous_status} to ` : ""}${APPLICATION_STATUS_LABEL[event.new_status ?? ""] ?? event.new_status ?? "event"}`,
            detail:
              [
                `Actor: ${event.actor_type}${event.actor_id ? ` (${event.actor_id})` : ""}`,
                event.member_visible_note ? `To applicant: ${event.member_visible_note}` : "",
                event.internal_note ? `Internal: ${event.internal_note}` : "",
              ]
                .filter(Boolean)
                .join(" · ") || undefined,
          }))}
        />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The state-machine actions. The server enforces every transition; these
// forms only offer what the current status allows.
// ---------------------------------------------------------------------------

function ActionsPanel({
  app,
  busy,
  error,
  act,
}: {
  app: AdminApplication;
  busy: boolean;
  error: string | null;
  act: (path: string, body?: Record<string, unknown>) => Promise<boolean>;
}) {
  const [infoNote, setInfoNote] = useState("");
  const [declineNote, setDeclineNote] = useState("");
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [paymentRef, setPaymentRef] = useState("");
  const [subscriptionRef, setSubscriptionRef] = useState("");

  const canBeginReview = app.status === "submitted" || app.status === "resubmitted";
  const inReview = app.status === "under_review";
  const awaitingActivation = app.status === "approved_pending_payment";
  const paymentPending = app.status === "payment_pending";

  return (
    <section className="card" aria-label="Review actions">
      <p className="mono-label text-ink-mute mb-4">Actions</p>
      {error && (
        <p className="body-s mb-4" role="alert" style={{ color: "var(--error)" }} data-testid="text-application-action-error">
          {error}
        </p>
      )}

      {canBeginReview && (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act("review")} data-testid="button-begin-review">
          {busy ? "Working..." : "Begin review"}
        </button>
      )}

      {inReview && (
        <div className="grid gap-6">
          <div>
            <label htmlFor="app-info-note" className="form-label">
              Request more information (this note is sent to the applicant)
            </label>
            <textarea
              id="app-info-note"
              className="input-field"
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
              onClick={() =>
                void act("request-info", { memberVisibleNote: infoNote.trim() }).then((ok) => {
                  if (ok) setInfoNote("");
                })
              }
              data-testid="button-request-info"
            >
              Request information
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setConfirmApprove(true)} data-testid="button-approve">
              Approve
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmDecline(true)} data-testid="button-decline">
              Decline
            </button>
          </div>

          <ResearchConfirmation
            open={confirmApprove}
            title="Approve this application"
            body={
              <>
                <p>
                  Approving sends the approval email immediately and starts the approval window (default 14 days). The
                  Founding Membership is $50.00 due at activation, which includes the first 30 days; then $25.00 per
                  additional 30-day period.
                </p>
              </>
            }
            confirmLabel="Confirm approval"
            busy={busy}
            onConfirm={() =>
              void act("approve").then((ok) => {
                if (ok) setConfirmApprove(false);
              })
            }
            onCancel={() => setConfirmApprove(false)}
          />

          <ResearchConfirmation
            open={confirmDecline}
            title="Decline this application"
            danger
            body={
              <div className="grid gap-3">
                <p>
                  The applicant receives the respectful, non-specific decline email. The note below stays internal and is
                  recorded on the timeline. A step-up verification will be required here when it is enabled.
                </p>
                <div>
                  <label htmlFor="app-decline-note" className="form-label">
                    Internal note (never shown to the applicant)
                  </label>
                  <textarea
                    id="app-decline-note"
                    className="input-field"
                    rows={2}
                    maxLength={2000}
                    value={declineNote}
                    onChange={(e) => setDeclineNote(e.target.value)}
                  />
                </div>
              </div>
            }
            confirmLabel="Confirm decline"
            busy={busy}
            onConfirm={() =>
              void act("decline", declineNote.trim() ? { internalNote: declineNote.trim() } : {}).then((ok) => {
                if (ok) {
                  setConfirmDecline(false);
                  setDeclineNote("");
                }
              })
            }
            onCancel={() => setConfirmDecline(false)}
          />
        </div>
      )}

      {awaitingActivation && (
        <div className="grid gap-3">
          <p className="body-s text-ink-2 max-w-[64ch]">
            Approved and waiting on activation: $50 due at activation, which includes the first 30 days of
            membership. Nothing else is due today. When the applicant has paid, begin activation to record the
            references.
          </p>
          <div>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act("begin-activation")} data-testid="button-begin-activation">
              {busy ? "Working..." : "Begin activation"}
            </button>
          </div>
        </div>
      )}

      {paymentPending && (
        <div className="grid gap-4">
          <p className="body-s text-ink-2 max-w-[64ch]">
            Activation requires the verified $50 activation payment (it includes the first 30 days; no $25 is due at
            activation) plus the membership record reference. The applicant must have created their member account
            first (the link in their approval email). No member becomes active until verification completes;
            activation then triggers referral qualification automatically.
          </p>
          <div>
            <label htmlFor="app-payment-ref" className="form-label">
              Activation payment reference (required)
            </label>
            <input
              id="app-payment-ref"
              className="input-field"
              maxLength={120}
              placeholder="e.g. a receipt id for the verified $50 activation payment"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="app-subscription-ref" className="form-label">
              Membership record reference (required)
            </label>
            <input
              id="app-subscription-ref"
              className="input-field"
              maxLength={120}
              placeholder="e.g. the member's membership record id"
              value={subscriptionRef}
              onChange={(e) => setSubscriptionRef(e.target.value)}
            />
          </div>
          <div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !paymentRef.trim() || !subscriptionRef.trim()}
              onClick={() =>
                void act("activate", {
                  paymentReference: paymentRef.trim(),
                  subscriptionReference: subscriptionRef.trim(),
                })
              }
              data-testid="button-activate-membership"
            >
              {busy ? "Activating..." : "Mark activated"}
            </button>
          </div>
        </div>
      )}

      {!canBeginReview && !inReview && !awaitingActivation && !paymentPending && (
        <p className="body-s text-ink-mute max-w-[64ch]">
          No actions are available in the {APPLICATION_STATUS_LABEL[app.status] ?? app.status} state.
          {app.status === "more_information_requested" &&
            " The applicant was emailed; the application returns to the queue when they resubmit."}
        </p>
      )}
    </section>
  );
}
