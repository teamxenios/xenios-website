import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatMoney } from "../../core";
import {
  ResearchEmptyState,
  ResearchModal,
  ResearchSecureNotice,
  ResearchStatusBadge,
  ResearchTimeline,
  type BadgeTone,
} from "../../ui/kit";
import {
  ACTIVATION_QUEUE_ACTIONS,
  actOnActivationObligation,
  activationIdentityEmergencyDelete,
  getActivationDetail,
  getActivationIdentityQueue,
  getActivationIdentityViewUrl,
  getActivationQueue,
  listActivationMethods,
  migrateActivationObligation,
  submitActivationIdentityReview,
  verifyActivationPayment,
  type ActivationQueueAction,
} from "../../adapters/adminOps";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { fmtDateTime, useAdminResource } from "./auth";

// ---------------------------------------------------------------------------
// /admin/research/activation-queue: the founding-membership payment
// verification queue. Verification is the ONE action that moves money state:
// it requires every verification field, the EXACT confirmation sentence
// acknowledged by its own never-prechecked checkbox, and an idempotency key
// that is minted once per dialog and reused on retry, so a double click or a
// retried failure can never activate twice. Every other transition (reject,
// request-info, mismatch, duplicate, reversed, refunded, cancel) requires a
// written detail. The identity review queue lives here too, because an
// activation cannot verify until the manual identity review passes.
// ---------------------------------------------------------------------------

/** The EXACT confirmation sentence; the checkbox acknowledges this text. */
export const VERIFY_CONFIRMATION_SENTENCE =
  "I confirm that I checked the receiving account and verified that this payment was received.";

type QueueSubmission = {
  methodId: string;
  amountCents: number;
  sentDate: string;
  sentTime: string | null;
  senderName: string;
  senderContact: string | null;
  senderIdentifierMasked: string | null;
  externalRef: string | null;
  xeniosRef: string;
  note: string | null;
  evidenceRef: string | null;
  accuracyCertified: boolean;
  submittedAt: string;
};

type QueueEntry = {
  obligationId: string;
  humanRef: string;
  memberId: string;
  type: string;
  expectedAmountCents: number;
  currency: string;
  description: string;
  status: string;
  bridgePhase: string;
  method: { methodId: string; label: string };
  submission: QueueSubmission | null;
  createdAt: string;
  dueAt: string;
  expiresAt: string | null;
  duplicates: Array<{ obligationId: string; humanRef: string; memberId: string; status: string }>;
  priorAttempts: number;
};

type IdentityQueueEntry = {
  caseId: string;
  memberId: string;
  status: string;
  consentVersion: string | null;
  contentType: string | null;
  uploadedAt: string | null;
};

const STATUS_TONE: Record<string, BadgeTone> = {
  submitted: "info",
  under_review: "info",
  info_requested: "warning",
  mismatch: "warning",
  duplicate: "warning",
};

const ACTION_LABEL: Record<ActivationQueueAction, string> = {
  reject: "Reject",
  "request-info": "Request info",
  mismatch: "Mark mismatch",
  duplicate: "Mark duplicate",
  reversed: "Mark reversed",
  refunded: "Mark refunded",
  cancel: "Cancel obligation",
};

function newIdempotencyKey(): string {
  return `verify-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function ActivationQueue() {
  return (
    <AdminScreen
      title="Payment verification"
      lead="Founding-membership payment reports awaiting a human decision. Nothing activates until a person confirms the funds arrived on the receiving account."
    >
      {(token) => <QueueBody token={token} />}
    </AdminScreen>
  );
}

const loadQueue = (t: string) => getActivationQueue<{ ok: boolean; queue: QueueEntry[] }>(t);
const loadIdentityQueue = (t: string) => getActivationIdentityQueue<{ ok: boolean; queue: IdentityQueueEntry[] }>(t);

function QueueBody({ token }: { token: string }) {
  const queue = useAdminResource(token, loadQueue);
  const identity = useAdminResource(token, loadIdentityQueue);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="grid gap-8">
      {notice && (
        <p className="body-s" role="status" aria-live="polite" data-testid="queue-action-notice">
          {notice}
        </p>
      )}

      <section aria-label="Payment verification queue" data-testid="section-activation-queue">
        <h2 className="body-l font-700 mb-4">Waiting for verification</h2>
        <AdminBoundary
          state={queue.state}
          message={queue.message}
          deniedCode={queue.deniedCode}
          onRetry={queue.reload}
          unavailableTitle="The activation queue is not open."
          unavailableBody="Founding membership activation is not enabled in this environment, so there is no queue to show. Nothing is wrong with your access."
        >
          {(queue.data?.queue?.length ?? 0) === 0 ? (
            <ResearchEmptyState
              title="Nothing is waiting for verification."
              body="Member payment reports appear here the moment they are submitted, ordered oldest first."
            />
          ) : (
            <div className="grid gap-4">
              {(queue.data?.queue ?? []).map((entry) => (
                <QueueCard
                  key={entry.obligationId}
                  token={token}
                  entry={entry}
                  onChanged={(message) => {
                    setNotice(message);
                    queue.reload();
                  }}
                />
              ))}
            </div>
          )}
        </AdminBoundary>
      </section>

      <IdentityReviewSection
        token={token}
        resourceState={identity.state}
        message={identity.message}
        deniedCode={identity.deniedCode}
        entries={identity.data?.queue ?? []}
        reload={identity.reload}
        onChanged={(message) => {
          setNotice(message);
          identity.reload();
          queue.reload();
        }}
      />

      <ResearchSecureNotice>
        Receiving destinations render masked everywhere. The plaintext instructions are encrypted at rest and
        have no field to travel in; this page can never display them.
      </ResearchSecureNotice>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One queue entry: every field, duplicates, prior attempts, evidence, and the
// action surface.
// ---------------------------------------------------------------------------

function Row({ label, value, testid }: { label: string; value: ReactNode; testid?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="body-s text-ink-2">{label}</span>
      <span className="body-s tabular" data-testid={testid} style={{ overflowWrap: "anywhere" }}>
        {value}
      </span>
    </div>
  );
}

function QueueCard({
  token,
  entry,
  onChanged,
}: {
  token: string;
  entry: QueueEntry;
  onChanged: (message: string) => void;
}) {
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [action, setAction] = useState<ActivationQueueAction | null>(null);
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const submission = entry.submission;

  return (
    <article className="card" data-testid={`queue-entry-${entry.humanRef}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="body-m font-700 mono-label">{entry.humanRef}</p>
        <ResearchStatusBadge
          label={entry.status.replace(/_/g, " ")}
          tone={STATUS_TONE[entry.status] ?? "neutral"}
        />
      </div>
      <div className="mt-3 grid gap-2">
        <Row label="Member" value={entry.memberId} />
        <Row
          label="Expected"
          value={`${formatMoney(entry.expectedAmountCents)} (${entry.type === "activation_50" ? "activation" : "renewal"})`}
        />
        <Row label="Method" value={`${entry.method.label} (${entry.method.methodId})`} />
        <Row label="Bridge phase" value={entry.bridgePhase.replace(/_/g, " ")} />
        <Row label="Due" value={fmtDateTime(entry.dueAt)} />
        {entry.expiresAt && <Row label="Expires" value={fmtDateTime(entry.expiresAt)} />}
        <Row
          label="Prior attempts"
          value={String(entry.priorAttempts)}
          testid={`prior-attempts-${entry.humanRef}`}
        />
      </div>

      {submission ? (
        <div className="rule-top mt-4 pt-4 grid gap-2" data-testid={`submission-${entry.humanRef}`}>
          <p className="mono-label text-ink-mute">The member's report</p>
          <Row label="Amount reported" value={formatMoney(submission.amountCents)} />
          <Row
            label="Sent"
            value={`${submission.sentDate}${submission.sentTime ? ` at ${submission.sentTime}` : ""}`}
          />
          <Row label="Sender name" value={submission.senderName} />
          {submission.senderContact && <Row label="Sender contact" value={submission.senderContact} />}
          {submission.senderIdentifierMasked && (
            <Row label="Sender account (masked)" value={submission.senderIdentifierMasked} />
          )}
          {submission.externalRef && <Row label="Confirmation number" value={submission.externalRef} />}
          {submission.note && <Row label="Note" value={submission.note} />}
          <Row label="Accuracy certified" value={submission.accuracyCertified ? "Yes" : "No"} />
          <Row label="Submitted" value={fmtDateTime(submission.submittedAt)} />
          {submission.evidenceRef ? (
            <Row
              label="Evidence"
              value={submission.evidenceRef}
              testid={`evidence-${entry.humanRef}`}
            />
          ) : (
            <Row label="Evidence" value="None attached" />
          )}
        </div>
      ) : (
        <p className="body-s text-ink-mute mt-4">No member report yet.</p>
      )}

      {entry.duplicates.length > 0 && (
        <div className="rule-top mt-4 pt-4" data-testid={`duplicates-${entry.humanRef}`}>
          <p className="mono-label text-ink-mute">Possible duplicates (same confirmation number)</p>
          <ul className="mt-2 grid gap-1">
            {entry.duplicates.map((dup) => (
              <li key={dup.obligationId} className="body-s text-ink-2">
                {dup.humanRef} · member {dup.memberId} · {dup.status.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setVerifyOpen(true)}
          data-testid={`verify-open-${entry.humanRef}`}
        >
          Verify payment
        </button>
        {ACTIVATION_QUEUE_ACTIONS.map((a) => (
          <button
            key={a}
            type="button"
            className="btn btn-ghost"
            onClick={() => setAction(a)}
            data-testid={`action-${a}-${entry.humanRef}`}
          >
            {ACTION_LABEL[a]}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setMigrateOpen(true)}
          data-testid={`migrate-open-${entry.humanRef}`}
        >
          Migrate method
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setDetailOpen(true)}
          data-testid={`detail-open-${entry.humanRef}`}
        >
          Full history
        </button>
      </div>

      <VerifyDialog
        open={verifyOpen}
        token={token}
        entry={entry}
        onClose={() => setVerifyOpen(false)}
        onVerified={(message) => {
          setVerifyOpen(false);
          onChanged(message);
        }}
      />
      <ActionDialog
        action={action}
        token={token}
        entry={entry}
        onClose={() => setAction(null)}
        onDone={(message) => {
          setAction(null);
          onChanged(message);
        }}
      />
      <MigrateDialog
        open={migrateOpen}
        token={token}
        entry={entry}
        onClose={() => setMigrateOpen(false)}
        onDone={(message) => {
          setMigrateOpen(false);
          onChanged(message);
        }}
      />
      {detailOpen && <DetailDrawer token={token} entry={entry} onClose={() => setDetailOpen(false)} />}
    </article>
  );
}

// ---------------------------------------------------------------------------
// The verify dialog: every field required, the exact confirmation sentence,
// one idempotency key per dialog (reused on retry).
// ---------------------------------------------------------------------------

function VerifyDialog({
  open,
  token,
  entry,
  onClose,
  onVerified,
}: {
  open: boolean;
  token: string;
  entry: QueueEntry;
  onClose: () => void;
  onVerified: (message: string) => void;
}) {
  // Minted once per mounted dialog; a failed attempt retried from this dialog
  // reuses the SAME key so the server can collapse duplicates.
  const idempotencyKey = useMemo(() => newIdempotencyKey(), []);
  const [amount, setAmount] = useState("");
  const [dateReceived, setDateReceived] = useState("");
  const [receivingDestinationRef, setReceivingDestinationRef] = useState("");
  const [methodId, setMethodId] = useState(entry.method.methodId);
  const [externalRef, setExternalRef] = useState(entry.submission?.externalRef ?? "");
  const [reconciliationDate, setReconciliationDate] = useState("");
  const [note, setNote] = useState("");
  // NEVER prechecked: only the admin's own click sets the confirmation.
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = Math.round(Number.parseFloat(amount || "0") * 100);
  const ready =
    Number.isInteger(amountCents) &&
    amountCents > 0 &&
    dateReceived.trim().length > 0 &&
    receivingDestinationRef.trim().length > 0 &&
    methodId.trim().length > 0 &&
    reconciliationDate.trim().length > 0 &&
    confirmed;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const res = await verifyActivationPayment<{
      ok: boolean;
      replayed: boolean;
      membership?: { status: string };
      period?: { endsAt: string };
    }>(token, entry.obligationId, {
      amountReceivedCents: amountCents,
      dateReceived: dateReceived.trim(),
      receivingDestinationRef: receivingDestinationRef.trim(),
      methodId: methodId.trim(),
      externalRef: externalRef.trim() ? externalRef.trim() : null,
      reconciliationDate: reconciliationDate.trim(),
      note: note.trim() ? note.trim() : null,
      confirmedReceived: true,
      idempotencyKey,
    });
    setBusy(false);
    if (res.kind === "ok") {
      onVerified(
        `${entry.humanRef}: payment verified${res.data.period?.endsAt ? `; period runs to ${fmtDateTime(res.data.period.endsAt)}` : ""}.`,
      );
      return;
    }
    if (res.kind === "denied") {
      setError(
        res.code === "amount_mismatch"
          ? "The amount received does not match the expected amount. Nothing moved; use Mark mismatch if the member sent the wrong amount."
          : res.code === "identity_not_verified"
            ? "The manual identity review has not verified this member yet. Complete it below first."
            : res.code === "agreements_unsatisfied"
              ? "The member's required agreements are not satisfied yet."
              : (res.message ?? "The verification was refused."),
      );
      return;
    }
    setError(res.kind === "error" ? res.message : "The verification could not be completed. Retrying reuses the same idempotency key.");
  }

  return (
    <ResearchModal open={open} title={`Verify ${entry.humanRef}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        data-testid={`verify-form-${entry.humanRef}`}
      >
        <p className="body-s text-ink-2 max-w-[56ch]">
          Expected: {formatMoney(entry.expectedAmountCents)} from {entry.memberId}. Every field below is
          required; nothing verifies by omission.
        </p>
        <div className="mt-4 grid gap-3">
          <div>
            <label htmlFor={`v-amount-${entry.obligationId}`} className="form-label">
              Amount received (USD)
            </label>
            <input
              id={`v-amount-${entry.obligationId}`}
              className="input-field"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid={`verify-amount-${entry.humanRef}`}
            />
          </div>
          <div>
            <label htmlFor={`v-date-${entry.obligationId}`} className="form-label">
              Date received
            </label>
            <input
              id={`v-date-${entry.obligationId}`}
              type="date"
              className="input-field"
              value={dateReceived}
              onChange={(e) => setDateReceived(e.target.value)}
              data-testid={`verify-date-${entry.humanRef}`}
            />
          </div>
          <div>
            <label htmlFor={`v-dest-${entry.obligationId}`} className="form-label">
              Receiving destination reference (which account you checked)
            </label>
            <input
              id={`v-dest-${entry.obligationId}`}
              className="input-field"
              value={receivingDestinationRef}
              onChange={(e) => setReceivingDestinationRef(e.target.value)}
              data-testid={`verify-destination-${entry.humanRef}`}
            />
          </div>
          <div>
            <label htmlFor={`v-method-${entry.obligationId}`} className="form-label">
              Method id
            </label>
            <input
              id={`v-method-${entry.obligationId}`}
              className="input-field"
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
              data-testid={`verify-method-${entry.humanRef}`}
            />
          </div>
          <div>
            <label htmlFor={`v-ext-${entry.obligationId}`} className="form-label">
              Provider confirmation number (optional)
            </label>
            <input
              id={`v-ext-${entry.obligationId}`}
              className="input-field"
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              data-testid={`verify-external-${entry.humanRef}`}
            />
          </div>
          <div>
            <label htmlFor={`v-recon-${entry.obligationId}`} className="form-label">
              Reconciliation date
            </label>
            <input
              id={`v-recon-${entry.obligationId}`}
              type="date"
              className="input-field"
              value={reconciliationDate}
              onChange={(e) => setReconciliationDate(e.target.value)}
              data-testid={`verify-reconciliation-${entry.humanRef}`}
            />
          </div>
          <div>
            <label htmlFor={`v-note-${entry.obligationId}`} className="form-label">
              Note (optional)
            </label>
            <textarea
              id={`v-note-${entry.obligationId}`}
              className="input-field"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid={`verify-note-${entry.humanRef}`}
            />
          </div>
          <label className="flex items-start gap-3 body-s text-ink-2" htmlFor={`v-confirm-${entry.obligationId}`}>
            <input
              id={`v-confirm-${entry.obligationId}`}
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              data-testid={`verify-confirm-${entry.humanRef}`}
            />
            <span>{VERIFY_CONFIRMATION_SENTENCE}</span>
          </label>
          <div className="flex gap-3">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !ready}
              data-testid={`verify-submit-${entry.humanRef}`}
            >
              {busy ? "Verifying..." : "Verify and activate"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          </div>
          {error && (
            <p className="body-s" role="alert" style={{ color: "var(--error)" }} data-testid={`verify-error-${entry.humanRef}`}>
              {error}
            </p>
          )}
        </div>
      </form>
    </ResearchModal>
  );
}

// ---------------------------------------------------------------------------
// The written-detail transitions.
// ---------------------------------------------------------------------------

function ActionDialog({
  action,
  token,
  entry,
  onClose,
  onDone,
}: {
  action: ActivationQueueAction | null;
  token: string;
  entry: QueueEntry;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!action) return null;

  async function submit() {
    if (!action || detail.trim().length === 0 || busy) return;
    setBusy(true);
    setError(null);
    const res = await actOnActivationObligation<{ ok: boolean }>(token, entry.obligationId, action, detail.trim());
    setBusy(false);
    if (res.kind === "ok") {
      onDone(`${entry.humanRef}: ${ACTION_LABEL[action].toLowerCase()} recorded.`);
      setDetail("");
      return;
    }
    setError(
      res.kind === "denied" || res.kind === "error"
        ? (res.message ?? "The action was refused.")
        : "The action was refused.",
    );
  }

  return (
    <ResearchModal open title={`${ACTION_LABEL[action]} · ${entry.humanRef}`} onClose={onClose}>
      <p className="body-s text-ink-2 max-w-[56ch]">
        A written detail is required; it is recorded on the audit trail and drives the member's email.
      </p>
      <div className="mt-4">
        <label htmlFor={`act-detail-${entry.obligationId}`} className="form-label">
          Why
        </label>
        <textarea
          id={`act-detail-${entry.obligationId}`}
          className="input-field"
          rows={3}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          data-testid={`action-detail-${entry.humanRef}`}
        />
      </div>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || detail.trim().length === 0}
          onClick={() => void submit()}
          data-testid={`action-submit-${entry.humanRef}`}
        >
          {busy ? "Working..." : ACTION_LABEL[action]}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && (
        <p className="body-s mt-3" role="alert" style={{ color: "var(--error)" }}>
          {error}
        </p>
      )}
    </ResearchModal>
  );
}

// ---------------------------------------------------------------------------
// Migrate the obligation to another registered method / bridge phase.
// ---------------------------------------------------------------------------

type AdminMethodRow = { methodId: string; adminFacingName: string; approvalStatus: string; enabled: boolean };

function MigrateDialog({
  open,
  token,
  entry,
  onClose,
  onDone,
}: {
  open: boolean;
  token: string;
  entry: QueueEntry;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [methods, setMethods] = useState<AdminMethodRow[] | null>(null);
  const [methodId, setMethodId] = useState("");
  const [phase, setPhase] = useState("phase_a_manual_bridge");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || methods !== null) return;
    let alive = true;
    void listActivationMethods<{ ok: boolean; methods: AdminMethodRow[] }>(token).then((res) => {
      if (alive) setMethods(res.kind === "ok" ? res.data.methods : []);
    });
    return () => {
      alive = false;
    };
  }, [open, methods, token]);

  async function submit() {
    if (!methodId.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await migrateActivationObligation<{ ok: boolean }>(token, entry.obligationId, methodId.trim(), phase);
    setBusy(false);
    if (res.kind === "ok") {
      onDone(`${entry.humanRef}: migrated to ${methodId.trim()} (${phase.replace(/_/g, " ")}).`);
      return;
    }
    setError(
      res.kind === "denied" || res.kind === "error"
        ? (res.message ?? "The migration was refused.")
        : "The migration was refused.",
    );
  }

  if (!open) return null;

  return (
    <ResearchModal open title={`Migrate ${entry.humanRef}`} onClose={onClose}>
      <p className="body-s text-ink-2 max-w-[56ch]">
        Point this obligation at a different registered payment method and bridge phase. The change is audited.
      </p>
      <div className="mt-4 grid gap-3">
        <div>
          <label htmlFor={`mig-method-${entry.obligationId}`} className="form-label">
            Target method
          </label>
          <select
            id={`mig-method-${entry.obligationId}`}
            className="input-field"
            value={methodId}
            onChange={(e) => setMethodId(e.target.value)}
            data-testid={`migrate-method-${entry.humanRef}`}
          >
            <option value="">Choose a method</option>
            {(methods ?? []).map((m) => (
              <option key={m.methodId} value={m.methodId}>
                {m.adminFacingName} ({m.methodId})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`mig-phase-${entry.obligationId}`} className="form-label">
            Bridge phase
          </label>
          <select
            id={`mig-phase-${entry.obligationId}`}
            className="input-field"
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            data-testid={`migrate-phase-${entry.humanRef}`}
          >
            <option value="phase_a_manual_bridge">Phase A, manual bridge</option>
            <option value="phase_b_business_methods">Phase B, business methods</option>
          </select>
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !methodId.trim()}
          onClick={() => void submit()}
          data-testid={`migrate-submit-${entry.humanRef}`}
        >
          {busy ? "Working..." : "Migrate"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && (
        <p className="body-s mt-3" role="alert" style={{ color: "var(--error)" }}>
          {error}
        </p>
      )}
    </ResearchModal>
  );
}

// ---------------------------------------------------------------------------
// The full audit history drawer (GET detail).
// ---------------------------------------------------------------------------

type AuditEvent = { at: string; action: string; actorType?: string; actorId?: string | null; detail?: string | null };

function DetailDrawer({ token, entry, onClose }: { token: string; entry: QueueEntry; onClose: () => void }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void getActivationDetail<{ ok: boolean; auditHistory: AuditEvent[] }>(token, entry.obligationId).then((res) => {
      if (!alive) return;
      if (res.kind === "ok") setEvents(res.data.auditHistory);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [token, entry.obligationId]);

  return (
    <ResearchModal open title={`History · ${entry.humanRef}`} onClose={onClose} variant="drawer">
      {failed && <ResearchEmptyState title="The history could not be loaded." body="Close and try again." />}
      {!failed && events === null && <p className="body-s text-ink-mute">Loading history...</p>}
      {events && (
        <ResearchTimeline
          items={events.map((event) => ({
            at: fmtDateTime(event.at),
            title: event.action.replace(/_/g, " "),
            detail:
              [event.actorType && event.actorId ? `${event.actorType} ${event.actorId}` : null, event.detail]
                .filter(Boolean)
                .join(" · ") || undefined,
          }))}
        />
      )}
    </ResearchModal>
  );
}

// ---------------------------------------------------------------------------
// Identity review: the manual gate an activation verify depends on.
// ---------------------------------------------------------------------------

function IdentityReviewSection({
  token,
  resourceState,
  message,
  deniedCode,
  entries,
  reload,
  onChanged,
}: {
  token: string;
  resourceState: Parameters<typeof AdminBoundary>[0]["state"];
  message?: string;
  deniedCode?: string;
  entries: IdentityQueueEntry[];
  reload: () => void;
  onChanged: (message: string) => void;
}) {
  return (
    <section aria-label="Identity review queue" data-testid="section-identity-queue">
      <h2 className="body-l font-700 mb-2">Identity reviews</h2>
      <p className="body-s text-ink-2 mb-4 max-w-[64ch]">
        An activation cannot verify until a named person completes the manual name-and-age review. Every
        document view is audited before the signed URL exists.
      </p>
      <AdminBoundary
        state={resourceState}
        message={message}
        deniedCode={deniedCode}
        onRetry={reload}
        unavailableTitle="The identity queue is not open."
        unavailableBody="Founding membership activation is not enabled in this environment."
      >
        {entries.length === 0 ? (
          <ResearchEmptyState
            title="No identity documents are waiting."
            body="Uploaded documents appear here for the manual review, oldest first."
          />
        ) : (
          <div className="grid gap-4">
            {entries.map((kase) => (
              <IdentityCaseCard key={kase.caseId} token={token} kase={kase} onChanged={onChanged} />
            ))}
          </div>
        )}
      </AdminBoundary>
    </section>
  );
}

function IdentityCaseCard({
  token,
  kase,
  onChanged,
}: {
  token: string;
  kase: IdentityQueueEntry;
  onChanged: (message: string) => void;
}) {
  const [nameMatch, setNameMatch] = useState<"match" | "mismatch" | "">("");
  const [ageThresholdMet, setAgeThresholdMet] = useState(false);
  const [documentNotExpired, setDocumentNotExpired] = useState(false);
  const [jurisdiction, setJurisdiction] = useState("");
  const [licenseLast4, setLicenseLast4] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);

  async function openDocument() {
    setBusy(true);
    setError(null);
    const res = await getActivationIdentityViewUrl<{ ok: boolean; grant: { signedUrl: string } }>(token, kase.caseId);
    setBusy(false);
    if (res.kind === "ok") {
      setViewUrl(res.data.grant.signedUrl);
      window.open(res.data.grant.signedUrl, "_blank", "noopener");
    } else {
      setError(res.kind === "denied" || res.kind === "error" ? (res.message ?? "The view was refused.") : "The view was refused.");
    }
  }

  async function submitReview() {
    if (!nameMatch || busy) return;
    setBusy(true);
    setError(null);
    const res = await submitActivationIdentityReview<{ ok: boolean; review: { outcome: string } }>(token, kase.caseId, {
      nameMatch,
      ageThresholdMet,
      documentNotExpired,
      jurisdiction: jurisdiction.trim() ? jurisdiction.trim() : null,
      licenseLast4: licenseLast4.trim() ? licenseLast4.trim() : null,
    });
    setBusy(false);
    if (res.kind === "ok") {
      onChanged(`Identity case ${kase.caseId}: review recorded (${res.data.review.outcome}).`);
      return;
    }
    setError(
      res.kind === "denied" || res.kind === "error"
        ? (res.message ?? "The review was refused.")
        : "The review was refused.",
    );
  }

  async function emergencyDelete() {
    setBusy(true);
    setError(null);
    const res = await activationIdentityEmergencyDelete<{ ok: boolean }>(token, kase.caseId);
    setBusy(false);
    if (res.kind === "ok") onChanged(`Identity case ${kase.caseId}: raw document deleted.`);
    else
      setError(
        res.kind === "denied" || res.kind === "error"
          ? (res.message ?? "The delete was refused.")
          : "The delete was refused.",
      );
  }

  return (
    <article className="card" data-testid={`identity-case-${kase.caseId}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="mono-label">{kase.caseId}</p>
        <ResearchStatusBadge label={kase.status.replace(/_/g, " ")} tone="info" />
      </div>
      <p className="body-s text-ink-2 mt-2">
        Member {kase.memberId}
        {kase.uploadedAt ? ` · uploaded ${fmtDateTime(kase.uploadedAt)}` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void openDocument()}
          data-testid={`identity-view-${kase.caseId}`}
        >
          Open document (audited)
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => void emergencyDelete()}
          data-testid={`identity-delete-${kase.caseId}`}
        >
          Emergency delete raw document
        </button>
      </div>
      {viewUrl && (
        <p className="body-s text-ink-mute mt-2" style={{ overflowWrap: "anywhere" }}>
          Signed view URL issued (this access was logged).
        </p>
      )}

      <div className="rule-top mt-4 pt-4 grid gap-3">
        <p className="mono-label text-ink-mute">Findings</p>
        <div>
          <label htmlFor={`id-name-${kase.caseId}`} className="form-label">
            Legal name against the account
          </label>
          <select
            id={`id-name-${kase.caseId}`}
            className="input-field"
            value={nameMatch}
            onChange={(e) => setNameMatch(e.target.value as "match" | "mismatch" | "")}
            data-testid={`identity-namematch-${kase.caseId}`}
          >
            <option value="">Choose</option>
            <option value="match">Match</option>
            <option value="mismatch">Mismatch</option>
          </select>
        </div>
        <label className="flex items-start gap-3 body-s text-ink-2" htmlFor={`id-age-${kase.caseId}`}>
          <input
            id={`id-age-${kase.caseId}`}
            type="checkbox"
            checked={ageThresholdMet}
            onChange={(e) => setAgeThresholdMet(e.target.checked)}
            data-testid={`identity-age-${kase.caseId}`}
          />
          <span>Date of birth shows 21 or older.</span>
        </label>
        <label className="flex items-start gap-3 body-s text-ink-2" htmlFor={`id-exp-${kase.caseId}`}>
          <input
            id={`id-exp-${kase.caseId}`}
            type="checkbox"
            checked={documentNotExpired}
            onChange={(e) => setDocumentNotExpired(e.target.checked)}
            data-testid={`identity-expiry-${kase.caseId}`}
          />
          <span>The document is not expired.</span>
        </label>
        <div>
          <label htmlFor={`id-jur-${kase.caseId}`} className="form-label">
            Issuing jurisdiction
          </label>
          <input
            id={`id-jur-${kase.caseId}`}
            className="input-field"
            maxLength={10}
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            data-testid={`identity-jurisdiction-${kase.caseId}`}
          />
        </div>
        <div>
          <label htmlFor={`id-l4-${kase.caseId}`} className="form-label">
            Last 4 of the license number (never the full number)
          </label>
          <input
            id={`id-l4-${kase.caseId}`}
            className="input-field"
            maxLength={4}
            value={licenseLast4}
            onChange={(e) => setLicenseLast4(e.target.value)}
            data-testid={`identity-last4-${kase.caseId}`}
          />
        </div>
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !nameMatch}
            onClick={() => void submitReview()}
            data-testid={`identity-review-submit-${kase.caseId}`}
          >
            {busy ? "Working..." : "Record the review"}
          </button>
        </div>
        {error && (
          <p className="body-s" role="alert" style={{ color: "var(--error)" }}>
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
