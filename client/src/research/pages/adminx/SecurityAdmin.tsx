import { useCallback, useState } from "react";
import { Link } from "wouter";
import { getSystemStatus, listOutbox, retryOutboxItem, runOutbox, sendTestEmail } from "../../adapters/adminOps";
import {
  ResearchConfirmation,
  ResearchDataTable,
  ResearchSecureNotice,
  ResearchStatusBadge,
  ResearchTabs,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { denialPresentation } from "../../lib/denials";
import { fmtDateTime, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/security: the live system posture page. Everything on the
// top half is real today: system status (safe booleans and counts, never
// secret values), the email outbox with per-message requeue, the manual
// drain, and the admin-only provider test. The bottom half names the
// security work that publishes later (step-up verification, session
// controls) without pretending it exists.
// ---------------------------------------------------------------------------

type SystemStatus = {
  supabaseConfigured: boolean;
  emailProvider: string;
  emailConfigured: boolean;
  verifiedSenderConfigured: boolean;
  adminRecipientCount: number;
  outbox: Record<string, number>;
  lastSuccessfulSend: string | null;
  workerRunning: boolean;
  driveExportsEnabled: boolean;
};

type OutboxRow = {
  id: string;
  event_key: string;
  event_type: string;
  template_key: string;
  recipient: string;
  status: string;
  attempt_count: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  provider_message_id: string | null;
  last_error_summary: string | null;
  application_id: string | null;
  created_at: string;
  completed_at: string | null;
};

const OUTBOX_FILTERS = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "processing", label: "Processing" },
  { key: "failed_retryable", label: "Failed, retryable" },
  { key: "failed_permanent", label: "Failed, permanent" },
  { key: "sent", label: "Sent" },
];

export default function SecurityAdmin() {
  return (
    <AdminScreen
      title="Security and system"
      lead="System posture, email delivery, and the outbox. Status shows safe booleans and counts only, never secret values."
    >
      {(token) => <SecurityBody token={token} />}
    </AdminScreen>
  );
}

function SecurityBody({ token }: { token: string }) {
  return (
    <div className="grid gap-10">
      <SystemStatusPanel token={token} />
      <OutboxPanel token={token} />
      <TestEmailPanel token={token} />
      <PostureRoadmap />
    </div>
  );
}

function SystemStatusPanel({ token }: { token: string }) {
  const resource = useAdminResource<{ ok: boolean; system: SystemStatus }>(token, getSystemStatus);
  return (
    <section aria-label="System status">
      <h2 className="body-l font-700 mb-4">System status</h2>
      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="System status is not reachable."
        unavailableBody="The system status API is not responding in this environment."
      >
        {(() => {
          const s = resource.data?.system;
          if (!s) return null;
          const checks: Array<{ label: string; ok: boolean; detail: string }> = [
            { label: "Storage", ok: s.supabaseConfigured, detail: s.supabaseConfigured ? "Configured" : "Not configured" },
            {
              label: "Email provider",
              ok: s.emailConfigured,
              detail: s.emailConfigured ? s.emailProvider : "Not configured",
            },
            {
              label: "Verified sender",
              ok: s.verifiedSenderConfigured,
              detail: s.verifiedSenderConfigured ? "Configured" : "Missing",
            },
            {
              label: "Admin recipients",
              ok: s.adminRecipientCount > 0,
              detail: `${s.adminRecipientCount} configured`,
            },
            { label: "Outbox worker", ok: s.workerRunning, detail: s.workerRunning ? "Running" : "Stopped" },
            {
              label: "Drive exports",
              ok: true,
              detail: s.driveExportsEnabled ? "Enabled" : "Disabled",
            },
          ];
          return (
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {checks.map((c) => (
                <div key={c.label} className="card">
                  <div className="flex items-center justify-between gap-3">
                    <p className="mono-label text-ink-mute">{c.label}</p>
                    <ResearchStatusBadge label={c.ok ? "OK" : "Attention"} tone={c.ok ? "success" : "warning"} />
                  </div>
                  <p className="body-s text-ink-2 mt-2">{c.detail}</p>
                </div>
              ))}
              <div className="card">
                <p className="mono-label text-ink-mute">Last successful send</p>
                <p className="body-s text-ink-2 mt-2">
                  {s.lastSuccessfulSend ? fmtDateTime(s.lastSuccessfulSend) : "None recorded"}
                </p>
              </div>
            </div>
          );
        })()}
      </AdminBoundary>
    </section>
  );
}

function OutboxPanel({ token }: { token: string }) {
  const [filter, setFilter] = useState("");
  const loadOutbox = useCallback(
    (t: string) => listOutbox<{ ok: boolean; outbox: OutboxRow[] }>(t, filter || undefined),
    [filter],
  );
  const resource = useAdminResource(token, loadOutbox);
  const [drainOpen, setDrainOpen] = useState(false);
  const [retryTarget, setRetryTarget] = useState<OutboxRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const drain = async () => {
    setBusy(true);
    setMessage(null);
    const result = await runOutbox<{ ok: boolean; summary?: Record<string, number> }>(token);
    setBusy(false);
    setDrainOpen(false);
    if (result.kind === "ok") {
      const s = result.data.summary ?? {};
      setMessage(
        `Drain complete: ${s.sent ?? 0} sent, ${s.retried ?? 0} scheduled for retry, ${s.failed ?? 0} failed permanently.`,
      );
      resource.reload();
    } else if (result.kind === "denied") {
      // Route on the machine code; the copy is ours (lib/denials).
      const p = denialPresentation(result.code, result.message);
      setMessage(`${p.title} ${p.body}`);
    } else {
      setMessage(
        result.kind === "unavailable"
          ? "The drain endpoint is not available in this environment."
          : result.kind === "unauthorized"
            ? "Your admin session has ended. Sign in again."
            : result.kind === "forbidden"
              ? result.message ?? "This action is not allowed."
              : result.message,
      );
    }
  };

  const retry = async () => {
    if (!retryTarget) return;
    setBusy(true);
    setMessage(null);
    const result = await retryOutboxItem<{ ok: boolean }>(token, retryTarget.id);
    setBusy(false);
    setRetryTarget(null);
    if (result.kind === "ok") {
      setMessage("Requeued. The full backoff schedule applies again and the requeue is recorded as an attempt.");
      resource.reload();
    } else if (result.kind === "denied") {
      const p = denialPresentation(result.code, result.message);
      setMessage(`${p.title} ${p.body}`);
    } else {
      setMessage(
        result.kind === "unavailable"
          ? "The requeue endpoint is not available in this environment."
          : result.kind === "unauthorized"
            ? "Your admin session has ended. Sign in again."
            : result.kind === "forbidden"
              ? result.message ?? "This action is not allowed."
              : result.message,
      );
    }
  };

  const requeueable = (status: string) => ["failed_retryable", "failed_permanent", "processing"].includes(status);

  return (
    <section aria-label="Email outbox">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <h2 className="body-l font-700">Email outbox</h2>
        <button type="button" className="btn btn-secondary" onClick={() => setDrainOpen(true)} disabled={busy}>
          Run the outbox now
        </button>
      </div>
      <ResearchTabs tabs={OUTBOX_FILTERS} active={filter} onSelect={setFilter} label="Outbox status filter" />
      {message && (
        <p className="body-s text-ink-2 mt-4" role="status" aria-live="polite">
          {message}
        </p>
      )}
      <div className="mt-4">
        <AdminBoundary
          state={resource.state}
          message={resource.message}
          deniedCode={resource.deniedCode}
          onRetry={resource.reload}
          unavailableTitle="The outbox is not reachable."
          unavailableBody="The outbox API is not responding in this environment."
        >
          <ResearchDataTable<OutboxRow>
            caption="Outbox messages"
            columns={[
              { key: "type", header: "Type", render: (r) => <span className="mono-label">{r.event_type}</span> },
              {
                key: "recipient",
                header: "Recipient",
                render: (r) => <span style={{ overflowWrap: "anywhere" }}>{r.recipient}</span>,
              },
              {
                key: "status",
                header: "Status",
                render: (r) => (
                  <ResearchStatusBadge
                    label={r.status.replace(/_/g, " ")}
                    tone={r.status === "sent" ? "success" : r.status.startsWith("failed") ? "danger" : "info"}
                  />
                ),
              },
              { key: "attempts", header: "Attempts", render: (r) => <span className="tabular">{r.attempt_count}</span> },
              {
                key: "error",
                header: "Last error",
                render: (r) => <span className="text-ink-mute">{r.last_error_summary ?? ""}</span>,
              },
              { key: "created", header: "Created", render: (r) => fmtDateTime(r.created_at) },
              {
                key: "actions",
                header: "Actions",
                render: (r) =>
                  requeueable(r.status) ? (
                    <button type="button" className="btn btn-ghost" onClick={() => setRetryTarget(r)} disabled={busy}>
                      Requeue
                    </button>
                  ) : null,
              },
            ]}
            rows={resource.data?.outbox ?? []}
            rowKey={(r) => r.id}
            empty="No messages match this filter."
          />
        </AdminBoundary>
      </div>

      <ResearchConfirmation
        open={drainOpen}
        title="Run the outbox now"
        body={
          <p>
            This drains due messages immediately instead of waiting for the worker's next pass. Real emails go out to
            their recipients; nothing is re-sent that already succeeded.
          </p>
        }
        confirmLabel="Run now"
        busy={busy}
        onConfirm={() => void drain()}
        onCancel={() => setDrainOpen(false)}
      />

      <ResearchConfirmation
        open={retryTarget !== null}
        title="Requeue this message"
        body={
          <p>
            Requeue the {retryTarget?.event_type.replace(/_/g, " ")} email to {retryTarget?.recipient}? Attempts reset,
            the full backoff schedule applies again, and the requeue is recorded as an attempt attributed to you. A
            stuck processing row is only requeued once its claim is stale, so a duplicate send cannot race.
          </p>
        }
        confirmLabel="Requeue"
        busy={busy}
        onConfirm={() => void retry()}
        onCancel={() => setRetryTarget(null)}
      />
    </section>
  );
}

function TestEmailPanel({ token }: { token: string }) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const send = async () => {
    if (busy || !to.trim()) return;
    setBusy(true);
    setMessage(null);
    const result = await sendTestEmail<{ ok: boolean; message?: string }>(token, { to: to.trim() });
    setBusy(false);
    if (result.kind === "ok") {
      setMessage(result.data.message ?? "Test email handed to the provider.");
    } else if (result.kind === "unavailable") {
      setMessage("The test email endpoint is not available in this environment.");
    } else if (result.kind === "unauthorized") {
      setMessage("Your admin session has ended. Sign in again.");
    } else if (result.kind === "denied") {
      const p = denialPresentation(result.code, result.message);
      setMessage(`${p.title} ${p.body}`);
    } else {
      setMessage(result.kind === "forbidden" ? result.message ?? "This action is not allowed." : result.message);
    }
  };

  return (
    <section className="card" aria-label="Provider test email">
      <p className="mono-label text-ink-mute">Provider test</p>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        Proves the delivery path end to end. The recipient must be one of the configured admin addresses; the server
        rejects anything else, so this can never become an open relay.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div style={{ minWidth: 260 }}>
          <label htmlFor="test-email-to" className="form-label">
            Admin recipient
          </label>
          <input
            id="test-email-to"
            type="email"
            className="input-field"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="A configured admin address"
          />
        </div>
        <button type="button" className="btn btn-secondary" disabled={busy || !to.trim()} onClick={() => void send()}>
          {busy ? "Sending..." : "Send test email"}
        </button>
      </div>
      {message && (
        <p className="body-s text-ink-2 mt-3" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}

function PostureRoadmap() {
  const items: Array<{ label: string; body: string }> = [
    {
      label: "Step-up verification",
      body: "Destructive admin actions will require a fresh verification at the moment of action. Confirmations already carry the cue; enforcement publishes with the member platform.",
    },
    {
      label: "Session controls",
      body: "Admin session listing and remote revocation publish with the member platform.",
    },
    {
      label: "Audit trail",
      body: "Application timelines are already recorded per application. The unified audit view lives on the Audit page and fills in as more surfaces publish.",
    },
  ];
  return (
    <section aria-label="Security roadmap">
      <h2 className="body-l font-700 mb-4">Publishes later</h2>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {items.map((item) => (
          <div key={item.label} className="card">
            <div className="flex items-center justify-between gap-3">
              <p className="mono-label text-ink-mute">{item.label}</p>
              <ResearchStatusBadge label="Pending" tone="pending" />
            </div>
            <p className="body-s text-ink-2 mt-2">{item.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-4 flex-wrap">
        <Link href={ADMIN_ROUTES.audit} className="body-s underline text-ink-mute">
          Audit
        </Link>
        <Link href={ADMIN_ROUTES.capabilities} className="body-s underline text-ink-mute">
          Capabilities
        </Link>
      </div>
      <div className="mt-6">
        <ResearchSecureNotice>
          Status endpoints return safe booleans and counts only. Environment variable NAMES may appear on the
          Capabilities page; values never leave the server.
        </ResearchSecureNotice>
      </div>
    </section>
  );
}
