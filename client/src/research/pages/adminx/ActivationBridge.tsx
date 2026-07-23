import { useState } from "react";
import {
  ResearchEmptyState,
  ResearchSecureNotice,
  ResearchStatusBadge,
  ResearchTimeline,
  type BadgeTone,
} from "../../ui/kit";
import {
  approveActivationMethod,
  createActivationMethod,
  disableActivationMethod,
  getActivationBridgeSettings,
  listActivationMethods,
  updateActivationBridgeSettings,
} from "../../adapters/adminOps";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { fmtDateTime, useAdminResource } from "./auth";

// ---------------------------------------------------------------------------
// /admin/research/activation-bridge: the manual payment bridge controls.
// The bridge is a deliberately temporary window (14 calendar days by
// default): this page shows the sunset countdown, the acceptance toggles,
// the audited extension form (reason AND expiry, both required, no silent
// extension), the emergency disable, and the payment method registry with
// expiring methods called out. Plaintext receiving instructions are typed
// ONLY into the create form and are encrypted at rest by the server; they
// are never echoed back and this page renders masked values only.
// ---------------------------------------------------------------------------

type BridgeSettings = {
  bridgeEnabled: boolean;
  startAt: string;
  endAt: string;
  timezone: string;
  acceptingNewActivationPayments: boolean;
  acceptingExistingObligationPayments: boolean;
  replacementProviderStatus: string;
  administratorEmergencyDisable: boolean;
  administratorExtensionReason: string | null;
  administratorExtensionExpiresAt: string | null;
};

type BridgeAuditEvent = { eventId: string; kind: string; actorId: string; reason: string; at: string };

type BridgeDto = {
  settings: BridgeSettings | null;
  phase: "before" | "active" | "sunset" | null;
  effectiveEndAt: string | null;
  auditEvents?: BridgeAuditEvent[];
};

type AdminMethod = {
  methodId: string;
  providerCode: string;
  memberFacingName: string;
  adminFacingName: string;
  enabled: boolean;
  duration: string;
  activeStartAt: string | null;
  activeEndAt: string | null;
  activationEligible: boolean;
  renewalEligible: boolean;
  settlementTime: string | null;
  receivingLegalEntity: string;
  ownershipClassification: string;
  approvalStatus: string;
  approvalDate: string | null;
  approvedBy: string | null;
  receivingInstructionsMasked: string;
  memoInstructions: string | null;
  disabledReason: string | null;
};

const PHASE_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  before: { label: "Not open yet", tone: "pending" },
  active: { label: "Active", tone: "success" },
  sunset: { label: "Sunset", tone: "danger" },
};

/** Days from now to an instant, floored at zero. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function ActivationBridge() {
  return (
    <AdminScreen
      title="Payment bridge"
      lead="The temporary manual-payment window for founding activations: its calendar, its acceptance switches, its audited extensions, and the payment method registry."
    >
      {(token) => <BridgeBody token={token} />}
    </AdminScreen>
  );
}

const loadBridge = (t: string) => getActivationBridgeSettings<BridgeDto>(t);
const loadMethods = (t: string) => listActivationMethods<{ ok: boolean; methods: AdminMethod[] }>(t);

function BridgeBody({ token }: { token: string }) {
  const bridge = useAdminResource(token, loadBridge);
  const methods = useAdminResource(token, loadMethods);
  const [notice, setNotice] = useState<string | null>(null);

  const reloadAll = (message: string) => {
    setNotice(message);
    bridge.reload();
    methods.reload();
  };

  return (
    <div className="grid gap-8">
      {notice && (
        <p className="body-s" role="status" aria-live="polite" data-testid="bridge-notice">
          {notice}
        </p>
      )}

      <section aria-label="Bridge settings" data-testid="section-bridge-settings">
        <h2 className="body-l font-700 mb-4">The bridge window</h2>
        <AdminBoundary
          state={bridge.state}
          message={bridge.message}
          deniedCode={bridge.deniedCode}
          onRetry={bridge.reload}
          unavailableTitle="The bridge is not open."
          unavailableBody="Founding membership activation is not enabled in this environment."
        >
          <BridgePanel token={token} dto={bridge.data} onChanged={reloadAll} />
        </AdminBoundary>
      </section>

      <section aria-label="Payment methods" data-testid="section-bridge-methods">
        <h2 className="body-l font-700 mb-4">Payment method registry</h2>
        <AdminBoundary
          state={methods.state}
          message={methods.message}
          deniedCode={methods.deniedCode}
          onRetry={methods.reload}
          unavailableTitle="The method registry is not open."
          unavailableBody="Founding membership activation is not enabled in this environment."
        >
          <MethodsPanel token={token} methods={methods.data?.methods ?? []} onChanged={reloadAll} />
        </AdminBoundary>
      </section>

      <ResearchSecureNotice>
        Receiving instructions are encrypted the moment they are created and never render again; only the
        masked tail is shown anywhere. This page never logs or echoes what you type into the create form.
      </ResearchSecureNotice>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The bridge settings panel.
// ---------------------------------------------------------------------------

function BridgePanel({
  token,
  dto,
  onChanged,
}: {
  token: string;
  dto: BridgeDto | null;
  onChanged: (message: string) => void;
}) {
  const settings = dto?.settings ?? null;
  if (!settings) return <InitializeForm token={token} onChanged={onChanged} />;
  const phase = dto?.phase ?? null;
  const badge = phase ? PHASE_BADGE[phase] : { label: "Unknown", tone: "neutral" as BadgeTone };
  const remaining = daysUntil(dto?.effectiveEndAt ?? null);

  return (
    <div className="grid gap-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="mono-label text-ink-mute">Bridge phase</p>
          <ResearchStatusBadge label={badge.label} tone={badge.tone} />
        </div>
        {remaining !== null && phase !== "sunset" && (
          <p className="display-s tabular mt-1" data-testid="bridge-countdown">
            {remaining} day{remaining === 1 ? "" : "s"} until sunset
          </p>
        )}
        {phase === "sunset" && (
          <p className="body-m font-700 mt-1" data-testid="bridge-countdown">
            The bridge has sunset. No new manual-payment obligations can be created.
          </p>
        )}
        <dl className="mt-4 grid gap-2">
          <SettingsRow label="Opens" value={fmtDateTime(settings.startAt)} />
          <SettingsRow label="Closes" value={fmtDateTime(settings.endAt)} />
          {dto?.effectiveEndAt && dto.effectiveEndAt !== settings.endAt && (
            <SettingsRow label="Extended to" value={fmtDateTime(dto.effectiveEndAt)} />
          )}
          <SettingsRow label="Timezone" value={settings.timezone} />
          <SettingsRow
            label="New activation payments"
            value={settings.acceptingNewActivationPayments ? "Accepting" : "Not accepting"}
          />
          <SettingsRow
            label="Existing obligation payments"
            value={settings.acceptingExistingObligationPayments ? "Accepting" : "Not accepting"}
          />
          <SettingsRow
            label="Replacement provider"
            value={settings.replacementProviderStatus.replace(/_/g, " ")}
          />
          {settings.administratorEmergencyDisable && (
            <SettingsRow label="Emergency disable" value="ENGAGED" />
          )}
          {settings.administratorExtensionReason && (
            <SettingsRow
              label="Extension on record"
              value={`${settings.administratorExtensionReason} (to ${fmtDateTime(settings.administratorExtensionExpiresAt)})`}
            />
          )}
        </dl>
      </div>

      <TogglesForm token={token} settings={settings} onChanged={onChanged} />
      <ExtensionForm token={token} onChanged={onChanged} />
      <EmergencyDisableForm token={token} onChanged={onChanged} />

      {(dto?.auditEvents?.length ?? 0) > 0 && (
        <div className="card" data-testid="bridge-audit">
          <p className="mono-label text-ink-mute mb-3">Bridge audit trail</p>
          <ResearchTimeline
            items={(dto?.auditEvents ?? []).map((event) => ({
              at: fmtDateTime(event.at),
              title: event.kind.replace(/_/g, " "),
              detail: `${event.actorId} · ${event.reason}`,
            }))}
          />
        </div>
      )}
    </div>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="body-s text-ink-2">{label}</dt>
      <dd className="body-s tabular">{value}</dd>
    </div>
  );
}

function InitializeForm({ token, onChanged }: { token: string; onChanged: (message: string) => void }) {
  const [startAt, setStartAt] = useState("");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!startAt.trim() || !timezone.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await updateActivationBridgeSettings<{ ok: boolean; phase: string }>(token, {
      action: "initialize",
      startAt: startAt.trim(),
      timezone: timezone.trim(),
    });
    setBusy(false);
    if (res.kind === "ok") onChanged(`Bridge initialized (phase: ${res.data.phase}).`);
    else
      setError(
        res.kind === "denied" || res.kind === "error"
          ? (res.message ?? "The initialization was refused.")
          : "The initialization was refused.",
      );
  }

  return (
    <div className="card" data-testid="bridge-initialize">
      <p className="body-m font-700">The bridge is not configured yet.</p>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        Initializing opens the 14-calendar-day manual payment window. Until then every member payment step
        refuses fail-closed.
      </p>
      <div className="mt-4 grid gap-3" style={{ maxWidth: 420 }}>
        <div>
          <label htmlFor="bridge-start" className="form-label">
            Opens at (ISO instant, e.g. 2026-07-25T00:00:00Z)
          </label>
          <input
            id="bridge-start"
            className="input-field"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            data-testid="bridge-init-start"
          />
        </div>
        <div>
          <label htmlFor="bridge-tz" className="form-label">
            IANA timezone
          </label>
          <input
            id="bridge-tz"
            className="input-field"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            data-testid="bridge-init-timezone"
          />
        </div>
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !startAt.trim() || !timezone.trim()}
            onClick={() => void submit()}
            data-testid="bridge-init-submit"
          >
            {busy ? "Working..." : "Initialize the bridge"}
          </button>
        </div>
        {error && (
          <p className="body-s" role="alert" style={{ color: "var(--error)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function TogglesForm({
  token,
  settings,
  onChanged,
}: {
  token: string;
  settings: BridgeSettings;
  onChanged: (message: string) => void;
}) {
  const [acceptingNew, setAcceptingNew] = useState(settings.acceptingNewActivationPayments);
  const [acceptingExisting, setAcceptingExisting] = useState(settings.acceptingExistingObligationPayments);
  const [providerStatus, setProviderStatus] = useState(settings.replacementProviderStatus);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await updateActivationBridgeSettings<{ ok: boolean }>(token, {
      action: "update",
      reason: reason.trim(),
      patch: {
        acceptingNewActivationPayments: acceptingNew,
        acceptingExistingObligationPayments: acceptingExisting,
        replacementProviderStatus: providerStatus,
      },
    });
    setBusy(false);
    if (res.kind === "ok") {
      setReason("");
      onChanged("Bridge settings updated.");
    } else
      setError(
        res.kind === "denied" || res.kind === "error"
          ? (res.message ?? "The update was refused.")
          : "The update was refused.",
      );
  }

  return (
    <div className="card" data-testid="bridge-toggles">
      <p className="body-m font-700">Acceptance switches</p>
      <div className="mt-3 grid gap-3">
        <label className="flex items-start gap-3 body-s text-ink-2" htmlFor="toggle-new">
          <input
            id="toggle-new"
            type="checkbox"
            checked={acceptingNew}
            onChange={(e) => setAcceptingNew(e.target.checked)}
            data-testid="bridge-toggle-new"
          />
          <span>Accept NEW activation payments (new obligations can be created).</span>
        </label>
        <label className="flex items-start gap-3 body-s text-ink-2" htmlFor="toggle-existing">
          <input
            id="toggle-existing"
            type="checkbox"
            checked={acceptingExisting}
            onChange={(e) => setAcceptingExisting(e.target.checked)}
            data-testid="bridge-toggle-existing"
          />
          <span>Accept payments on EXISTING obligations.</span>
        </label>
        <div>
          <label htmlFor="provider-status" className="form-label">
            Replacement provider status
          </label>
          <select
            id="provider-status"
            className="input-field"
            value={providerStatus}
            onChange={(e) => setProviderStatus(e.target.value)}
            data-testid="bridge-provider-status"
          >
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="testing">Testing</option>
            <option value="ready">Ready</option>
            <option value="live">Live</option>
          </select>
        </div>
        <div>
          <label htmlFor="toggle-reason" className="form-label">
            Reason (required, recorded on the audit trail)
          </label>
          <input
            id="toggle-reason"
            className="input-field"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid="bridge-toggle-reason"
          />
        </div>
        <div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !reason.trim()}
            onClick={() => void submit()}
            data-testid="bridge-toggle-submit"
          >
            {busy ? "Working..." : "Save switches"}
          </button>
        </div>
        {error && (
          <p className="body-s" role="alert" style={{ color: "var(--error)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ExtensionForm({ token, onChanged }: { token: string; onChanged: (message: string) => void }) {
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // BOTH fields are required; there is no silent extension.
  const ready = reason.trim().length > 0 && expiresAt.trim().length > 0;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const res = await updateActivationBridgeSettings<{ ok: boolean; effectiveEndAt: string }>(token, {
      action: "extend",
      reason: reason.trim(),
      expiresAt: expiresAt.trim(),
    });
    setBusy(false);
    if (res.kind === "ok") {
      setReason("");
      setExpiresAt("");
      onChanged(`Bridge extended to ${fmtDateTime(res.data.effectiveEndAt)}.`);
    } else
      setError(
        res.kind === "denied" || res.kind === "error"
          ? (res.message ?? "The extension was refused.")
          : "The extension was refused.",
      );
  }

  return (
    <div className="card" data-testid="bridge-extension">
      <p className="body-m font-700">Extend the window</p>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        An extension needs a written reason and an explicit expiry; both are recorded on the audit trail with
        your identity.
      </p>
      <div className="mt-3 grid gap-3" style={{ maxWidth: 420 }}>
        <div>
          <label htmlFor="ext-reason" className="form-label">
            Reason (required)
          </label>
          <input
            id="ext-reason"
            className="input-field"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid="bridge-extend-reason"
          />
        </div>
        <div>
          <label htmlFor="ext-expiry" className="form-label">
            New expiry (ISO instant, required)
          </label>
          <input
            id="ext-expiry"
            className="input-field"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            data-testid="bridge-extend-expiry"
          />
        </div>
        <div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !ready}
            onClick={() => void submit()}
            data-testid="bridge-extend-submit"
          >
            {busy ? "Working..." : "Extend the bridge"}
          </button>
        </div>
        {error && (
          <p className="body-s" role="alert" style={{ color: "var(--error)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function EmergencyDisableForm({ token, onChanged }: { token: string; onChanged: (message: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await updateActivationBridgeSettings<{ ok: boolean; phase: string }>(token, {
      action: "emergency_disable",
      reason: reason.trim(),
    });
    setBusy(false);
    if (res.kind === "ok") onChanged("Bridge emergency-disabled. New obligations are refused.");
    else
      setError(
        res.kind === "denied" || res.kind === "error"
          ? (res.message ?? "The disable was refused.")
          : "The disable was refused.",
      );
  }

  return (
    <div className="card" data-testid="bridge-emergency">
      <p className="body-m font-700">Emergency disable</p>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        Immediately stops new manual-payment obligations (sunset). Requires a written reason. Existing
        submitted reports stay verifiable.
      </p>
      <div className="mt-3 grid gap-3" style={{ maxWidth: 420 }}>
        <div>
          <label htmlFor="emg-reason" className="form-label">
            Reason (required)
          </label>
          <input
            id="emg-reason"
            className="input-field"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid="bridge-emergency-reason"
          />
        </div>
        <div>
          <button
            type="button"
            className="btn ra-btn-danger"
            disabled={busy || !reason.trim()}
            onClick={() => void submit()}
            data-testid="bridge-emergency-submit"
          >
            {busy ? "Working..." : "Emergency disable"}
          </button>
        </div>
        {error && (
          <p className="body-s" role="alert" style={{ color: "var(--error)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The method registry.
// ---------------------------------------------------------------------------

const EXPIRY_WARNING_DAYS = 5;

function MethodsPanel({
  token,
  methods,
  onChanged,
}: {
  token: string;
  methods: AdminMethod[];
  onChanged: (message: string) => void;
}) {
  const expiring = methods.filter((m) => {
    const days = daysUntil(m.activeEndAt);
    return m.enabled && days !== null && days <= EXPIRY_WARNING_DAYS;
  });

  return (
    <div className="grid gap-4">
      {expiring.length > 0 && (
        <div className="card" data-testid="methods-expiring">
          <p className="body-m font-700">Methods expiring soon</p>
          <ul className="mt-2 grid gap-1">
            {expiring.map((m) => (
              <li key={m.methodId} className="body-s text-ink-2">
                {m.adminFacingName} ({m.methodId}) expires in {daysUntil(m.activeEndAt)} day
                {daysUntil(m.activeEndAt) === 1 ? "" : "s"} ({fmtDateTime(m.activeEndAt)}).
              </li>
            ))}
          </ul>
        </div>
      )}

      {methods.length === 0 ? (
        <ResearchEmptyState
          title="No payment methods are registered."
          body="Create the first method below. It stays unusable until it is compliance-approved."
        />
      ) : (
        methods.map((m) => <MethodCard key={m.methodId} token={token} method={m} onChanged={onChanged} />)
      )}

      <CreateMethodForm token={token} onChanged={onChanged} />
    </div>
  );
}

function MethodCard({
  token,
  method,
  onChanged,
}: {
  token: string;
  method: AdminMethod;
  onChanged: (message: string) => void;
}) {
  const [note, setNote] = useState("");
  const [disableReason, setDisableReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approved = method.approvalStatus === "approved";

  async function approve() {
    setBusy(true);
    setError(null);
    const res = await approveActivationMethod<{ ok: boolean }>(token, method.methodId, note.trim() || undefined);
    setBusy(false);
    if (res.kind === "ok") onChanged(`${method.methodId}: compliance-approved.`);
    else
      setError(
        res.kind === "denied" || res.kind === "error"
          ? (res.message ?? "The approval was refused.")
          : "The approval was refused.",
      );
  }

  async function disable() {
    if (!disableReason.trim()) return;
    setBusy(true);
    setError(null);
    const res = await disableActivationMethod<{ ok: boolean }>(token, method.methodId, disableReason.trim());
    setBusy(false);
    if (res.kind === "ok") onChanged(`${method.methodId}: disabled.`);
    else
      setError(
        res.kind === "denied" || res.kind === "error"
          ? (res.message ?? "The disable was refused.")
          : "The disable was refused.",
      );
  }

  return (
    <article className="card" data-testid={`method-${method.methodId}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="body-m font-700">
          {method.adminFacingName} <span className="mono-label text-ink-mute">({method.methodId})</span>
        </p>
        <div className="flex items-center gap-2">
          <ResearchStatusBadge
            label={approved ? "Approved" : method.approvalStatus.replace(/_/g, " ")}
            tone={approved ? "success" : "pending"}
          />
          <ResearchStatusBadge
            label={method.enabled ? "Enabled" : "Disabled"}
            tone={method.enabled ? "success" : "danger"}
          />
        </div>
      </div>
      <dl className="mt-3 grid gap-2">
        <SettingsRow label="Member-facing name" value={method.memberFacingName} />
        <SettingsRow label="Receiving (masked)" value={method.receivingInstructionsMasked} />
        <SettingsRow label="Receiving entity" value={method.receivingLegalEntity} />
        <SettingsRow label="Ownership" value={method.ownershipClassification.replace(/_/g, " ")} />
        <SettingsRow
          label="Eligible for"
          value={
            [method.activationEligible ? "activation" : null, method.renewalEligible ? "renewal" : null]
              .filter(Boolean)
              .join(" + ") || "nothing"
          }
        />
        <SettingsRow label="Duration" value={method.duration} />
        {method.activeEndAt && <SettingsRow label="Active until" value={fmtDateTime(method.activeEndAt)} />}
        {method.settlementTime && <SettingsRow label="Settlement" value={method.settlementTime} />}
        {method.approvedBy && (
          <SettingsRow label="Approved by" value={`${method.approvedBy} (${fmtDateTime(method.approvalDate)})`} />
        )}
        {method.disabledReason && <SettingsRow label="Disabled because" value={method.disabledReason} />}
      </dl>

      <div className="mt-4 grid gap-3">
        {!approved && (
          <div className="flex flex-wrap items-end gap-3">
            <div style={{ flex: "1 1 220px" }}>
              <label htmlFor={`approve-note-${method.methodId}`} className="form-label">
                Compliance review note (optional)
              </label>
              <input
                id={`approve-note-${method.methodId}`}
                className="input-field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                data-testid={`method-approve-note-${method.methodId}`}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void approve()}
              data-testid={`method-approve-${method.methodId}`}
            >
              {busy ? "Working..." : "Approve"}
            </button>
          </div>
        )}
        {method.enabled && (
          <div className="flex flex-wrap items-end gap-3">
            <div style={{ flex: "1 1 220px" }}>
              <label htmlFor={`disable-reason-${method.methodId}`} className="form-label">
                Disable reason (required)
              </label>
              <input
                id={`disable-reason-${method.methodId}`}
                className="input-field"
                value={disableReason}
                onChange={(e) => setDisableReason(e.target.value)}
                data-testid={`method-disable-reason-${method.methodId}`}
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || !disableReason.trim()}
              onClick={() => void disable()}
              data-testid={`method-disable-${method.methodId}`}
            >
              {busy ? "Working..." : "Disable"}
            </button>
          </div>
        )}
        {error && (
          <p className="body-s" role="alert" style={{ color: "var(--error)" }}>
            {error}
          </p>
        )}
      </div>
    </article>
  );
}

function CreateMethodForm({ token, onChanged }: { token: string; onChanged: (message: string) => void }) {
  const [form, setForm] = useState({
    methodId: "",
    providerCode: "",
    memberFacingName: "",
    adminFacingName: "",
    duration: "permanent",
    activationEligible: true,
    renewalEligible: true,
    settlementTime: "",
    receivingLegalEntity: "",
    ownershipClassification: "business",
    receivingInstructions: "",
    memoInstructions: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const ready =
    form.methodId.trim() &&
    form.providerCode.trim() &&
    form.memberFacingName.trim() &&
    form.adminFacingName.trim() &&
    form.receivingLegalEntity.trim() &&
    form.receivingInstructions.trim();

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const res = await createActivationMethod<{ ok: boolean }>(token, {
      ...form,
      settlementTime: form.settlementTime.trim() || undefined,
      memoInstructions: form.memoInstructions.trim() || undefined,
    });
    setBusy(false);
    if (res.kind === "ok") {
      onChanged(`${form.methodId}: created (awaiting compliance approval).`);
      setForm((f) => ({ ...f, methodId: "", receivingInstructions: "" }));
    } else
      setError(
        res.kind === "denied" || res.kind === "error"
          ? (res.message ?? "The method could not be created.")
          : "The method could not be created.",
      );
  }

  return (
    <details className="card" data-testid="method-create">
      <summary className="body-m font-700" style={{ cursor: "pointer" }}>
        Register a new payment method
      </summary>
      <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
        The receiving instructions you type here are encrypted at rest immediately and never shown again;
        only a masked tail renders anywhere after this form.
      </p>
      <div className="mt-4 grid gap-3" style={{ maxWidth: 480 }}>
        {(
          [
            ["methodId", "Method id (e.g. zelle-1)"],
            ["providerCode", "Provider code (e.g. zelle)"],
            ["memberFacingName", "Member-facing name"],
            ["adminFacingName", "Admin-facing name"],
            ["settlementTime", "Settlement time (e.g. same day)"],
            ["receivingLegalEntity", "Receiving legal entity"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label htmlFor={`create-${key}`} className="form-label">
              {label}
            </label>
            <input
              id={`create-${key}`}
              className="input-field"
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
              data-testid={`method-create-${key}`}
            />
          </div>
        ))}
        <div>
          <label htmlFor="create-ownership" className="form-label">
            Ownership classification
          </label>
          <select
            id="create-ownership"
            className="input-field"
            value={form.ownershipClassification}
            onChange={(e) => set("ownershipClassification", e.target.value)}
          >
            <option value="business">Business</option>
            <option value="personal">Personal</option>
            <option value="third_party">Third party</option>
          </select>
        </div>
        <div>
          <label htmlFor="create-duration" className="form-label">
            Duration
          </label>
          <select
            id="create-duration"
            className="input-field"
            value={form.duration}
            onChange={(e) => set("duration", e.target.value)}
          >
            <option value="permanent">Permanent</option>
            <option value="temporary">Temporary</option>
          </select>
        </div>
        <label className="flex items-start gap-3 body-s text-ink-2" htmlFor="create-activation-eligible">
          <input
            id="create-activation-eligible"
            type="checkbox"
            checked={form.activationEligible}
            onChange={(e) => set("activationEligible", e.target.checked)}
          />
          <span>Eligible for activation payments</span>
        </label>
        <label className="flex items-start gap-3 body-s text-ink-2" htmlFor="create-renewal-eligible">
          <input
            id="create-renewal-eligible"
            type="checkbox"
            checked={form.renewalEligible}
            onChange={(e) => set("renewalEligible", e.target.checked)}
          />
          <span>Eligible for renewal payments</span>
        </label>
        <div>
          <label htmlFor="create-instructions" className="form-label">
            Receiving instructions (encrypted at rest, never echoed)
          </label>
          <textarea
            id="create-instructions"
            className="input-field"
            rows={2}
            value={form.receivingInstructions}
            onChange={(e) => set("receivingInstructions", e.target.value)}
            data-testid="method-create-instructions"
          />
        </div>
        <div>
          <label htmlFor="create-memo" className="form-label">
            Memo instructions (member-visible)
          </label>
          <input
            id="create-memo"
            className="input-field"
            value={form.memoInstructions}
            onChange={(e) => set("memoInstructions", e.target.value)}
          />
        </div>
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !ready}
            onClick={() => void submit()}
            data-testid="method-create-submit"
          >
            {busy ? "Working..." : "Create method"}
          </button>
        </div>
        {error && (
          <p className="body-s" role="alert" style={{ color: "var(--error)" }}>
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
