import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  parseStaffRequestWorkflow, parseStartReview, parseStartReviewResult, requestWorkflowId,
  type StaffRequestWorkflowV1, type StartReviewResultV1, type StartReviewV1,
} from "../../../../shared/research/assisted-order/request-intent-workflow";
import { RequestIntentHttpError } from "./request-intent-api";

/** Ports must retain the canonical staff token, credentials and server guards. */
export interface StaffStartReviewPorts {
  readStaffWorkflow(requestId: string): Promise<unknown>;
  startReview(requestId: string, command: StartReviewV1): Promise<unknown>;
}
/** Produced by an authorized read under this exact API/session identity. */
export interface StaffReviewSnapshot {
  readonly requestId: string;
  readonly api: StaffStartReviewPorts;
  readonly value: StaffRequestWorkflowV1;
}
export interface StaffStartReviewControlProps {
  requestId: string;
  /** Memoize per canonical staff-session identity; replace on identity change. */
  api: StaffStartReviewPorts;
  current: StaffReviewSnapshot | null;
  onConfirmed?: (result: StartReviewResultV1) => void;
}

type Scope = Readonly<{ requestId: string; api: StaffStartReviewPorts }>;
type Attempt = {
  api: StaffStartReviewPorts;
  command: StartReviewV1;
  status: "pending" | "uncertain" | "conflict" | "confirmed";
};
type View = {
  scope: Scope;
  override: boolean;
  snapshot: StaffRequestWorkflowV1 | null;
  confirm: StaffRequestWorkflowV1 | null;
  busy: "read" | "write" | null;
  message: string;
  result: StartReviewResultV1 | null;
};
function checkedSnapshot(raw: unknown, requestId: string): StaffRequestWorkflowV1 {
  const value = parseStaffRequestWorkflow(raw);
  if (value.workflow.requestId !== requestId) throw new Error("Workflow identity mismatch.");
  return value;
}

/** Standalone control. Mount only inside the existing identity-keyed private staff shell. */
export function StaffStartReviewControl({ requestId, api, current, onConfirmed }: StaffStartReviewControlProps) {
  const identity = requestId.toLowerCase();
  const scope = useMemo<Scope>(() => ({ requestId: identity, api }), [identity, api]);
  // A changed scope hides old state in the render itself, before effect cleanup.
  const live = useRef<Scope | null>(scope);
  live.current = scope;
  useEffect(() => {
    live.current = scope;
    return () => { if (live.current === scope) live.current = null; };
  }, [scope]);
  const [view, setView] = useState<View | null>(null);
  const confirmationId = useId();
  const startButton = useRef<HTMLButtonElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const busy = useRef(new Set<Scope>());
  // Keep unresolved commands when navigating away and back. Never replace one
  // merely because an authorized read still says queued after a lost response.
  const attempts = useRef(new Map<string, Attempt>());
  const initial = useMemo(() => {
    if (!requestWorkflowId.safeParse(identity).success || current?.api !== api || current.requestId.toLowerCase() !== identity) return null;
    try { return checkedSnapshot(current.value, identity); } catch { return null; }
  }, [identity, api, current]);
  const state = view?.scope === scope ? view : null;
  const snapshot = state?.override ? state.snapshot : initial;
  const attempt = attempts.current.get(identity);
  const working = state?.busy !== undefined && state.busy !== null;
  const eligible = snapshot?.workflow.state === "queued" && snapshot.canStartReview === true;
  const unresolved = attempt?.status === "pending" || attempt?.status === "uncertain";
  const canBegin = eligible && !attempt && !working;
  const canRetry = eligible && attempt?.status === "uncertain" && attempt.api === api && !working;
  const confirmed = state?.result;
  useEffect(() => {
    if (state && !state.busy && state.message) {
      (startButton.current ?? retryButton.current ?? refreshButton.current)?.focus();
    }
  }, [state?.busy, state?.message, state?.result]);
  const empty = (): View => ({ scope, override: false, snapshot: null, confirm: null, busy: null, message: "", result: null });
  const isLive = () => live.current === scope;

  async function refresh(conflict = false) {
    if (busy.current.has(scope) || !requestWorkflowId.safeParse(identity).success) return;
    busy.current.add(scope);
    // Once refreshed locally, an old parent snapshot cannot restore eligibility.
    setView({ ...empty(), override: true, busy: "read" });
    try {
      const value = checkedSnapshot(await api.readStaffWorkflow(identity), identity);
      if (!isLive()) return;
      const prior = attempts.current.get(identity);
      if (prior?.status === "conflict") attempts.current.delete(identity);
      else if (prior && value.workflow.state === "reviewing") prior.status = "confirmed";
      setView({ ...empty(), override: true, snapshot: value,
        message: conflict ? "The request changed. Current review availability has been refreshed. Starting review requires a new confirmation." : "Review availability refreshed." });
    } catch {
      if (isLive()) setView({ ...empty(), override: true,
        message: "Current review availability could not be confirmed. Refresh before starting a new attempt." });
    } finally { busy.current.delete(scope); }
  }

  async function send(retry: boolean) {
    if (busy.current.has(scope) || !eligible) return;
    let commandAttempt = attempts.current.get(identity);
    if (retry) {
      if (!commandAttempt || commandAttempt.api !== api || commandAttempt.status !== "uncertain") return;
    } else {
      if (commandAttempt || state?.confirm !== snapshot) return;
      try {
        const command = Object.freeze(parseStartReview({ commandId: crypto.randomUUID(), expectedRevision: snapshot.workflow.revision }));
        commandAttempt = { api, command, status: "pending" };
        attempts.current.set(identity, commandAttempt);
      } catch {
        setView({ ...empty(), message: "A review attempt could not be prepared. No command was sent." });
        return;
      }
    }
    // Ref fence closes the gap before React commits disabled controls.
    busy.current.add(scope);
    commandAttempt.status = "pending";
    setView({ ...empty(), override: true, snapshot, busy: "write" });
    let conflict = false;
    try {
      const result = parseStartReviewResult(await api.startReview(identity, commandAttempt.command));
      if (result.workflow.requestId !== identity || result.workflow.state !== "reviewing"
        || result.workflow.revision !== commandAttempt.command.expectedRevision + 1) throw new Error("Unconfirmed review result.");
      commandAttempt.status = "confirmed";
      if (!isLive()) return;
      setView({ ...empty(), override: true, result, message: "Review started. The saved request receipt remains pending review." });
      // A parent rendering failure is not a failed command and must not expose retry.
      try { onConfirmed?.(result); } catch { /* The validated server result remains confirmed. */ }
    } catch (error) {
      conflict = error instanceof RequestIntentHttpError && error.status === 409 && error.code === "workflow_revision_conflict";
      commandAttempt.status = conflict ? "conflict" : "uncertain";
      if (isLive()) setView({ ...empty(), override: true, snapshot: conflict ? null : snapshot,
        message: conflict ? "The request changed. Refreshing current review availability..."
          : "The start-review outcome is unconfirmed. Keep this same attempt; retrying will use the same command and revision." });
    } finally { busy.current.delete(scope); }
    // Only a validated 409 triggers a GET, never another POST or guessed revision.
    if (conflict && isLive()) await refresh(true);
  }

  return <section aria-label="Start request review" aria-busy={working}>
    <h3>Start review</h3>
    <p>This records internal review work. It does not approve clinical care, a price, payment or fulfillment.</p>
    {state?.message && <p role="status">{state.message}</p>}
    {working && <p role="status">{state?.busy === "write" ? "Confirming start-review outcome..." : "Refreshing review availability..."}</p>}
    {!confirmed && snapshot?.workflow.state === "reviewing" && <p>Review is already in progress.</p>}
    {!working && !confirmed && snapshot?.workflow.state !== "reviewing" && <>
      {!snapshot && <p>Review availability is not confirmed.</p>}
      {snapshot && !eligible && <p>This session cannot start review for this request.</p>}
      {unresolved && attempt.api !== api && <p>A previous start-review attempt is unconfirmed under another session identity. Refresh the workflow; do not create another attempt.</p>}
      {attempt?.status === "pending" && <p>A start-review attempt is still pending. Refresh the workflow before any further action.</p>}
      {attempt?.status === "confirmed" && <p>A start-review command was confirmed. Refresh the current workflow before taking another action.</p>}
      {canBegin && <button ref={startButton} type="button" className="xenios-order-button"
        aria-expanded={state?.confirm === snapshot} aria-controls={confirmationId} onClick={() => {
        if (!busy.current.has(scope) && !attempts.current.has(identity)) setView({ ...(state ?? empty()), confirm: snapshot, message: "" });
      }}>Start review</button>}
      {canBegin && state?.confirm === snapshot && <div id={confirmationId} role="group" aria-label="Confirm start review">
        <p>Start internal review of {snapshot.workflow.publicReference}?</p>
        <button type="button" className="xenios-order-button" onClick={() => void send(false)}>Confirm start review</button>
        <button type="button" onClick={() => {
          setView({ ...(state ?? empty()), confirm: null }); startButton.current?.focus();
        }}>Cancel</button>
      </div>}
      {canRetry && <button ref={retryButton} type="button" className="xenios-order-button" onClick={() => void send(true)}>Retry the same start-review attempt</button>}
    </>}
    <button ref={refreshButton} type="button" disabled={working || !requestWorkflowId.safeParse(identity).success} onClick={() => void refresh()}>Refresh review availability</button>
  </section>;
}
