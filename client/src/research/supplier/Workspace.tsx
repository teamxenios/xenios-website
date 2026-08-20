import { useCallback, useEffect, useState } from "react";
import { useResearch } from "../core";
import { PageHeader } from "../ui/shells";
import {
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  type BadgeTone,
} from "../ui/kit";
import {
  FULFILLMENT_ACTION_LABEL,
  FULFILLMENT_STATE_LABEL,
  forbiddenSupplierFields,
  hasShipped,
  isOpenForSupplier,
  primarySupplierAction,
  requiredEvidenceFor,
  supplierActionsFor,
} from "@shared/research/supplier/workspace";
import type {
  FulfillmentAction,
  FulfillmentAssignmentView,
  FulfillmentState,
} from "@shared/research/fulfillment/contracts";
import {
  getSupplierAssignments,
  newIdempotencyKey,
  transitionSupplierAssignment,
  type SupplierTransitionEvidence,
} from "./api";

// ---------------------------------------------------------------------------
// The supplier workspace (/research/supplier). The operational surface an
// approved supplier uses to move their own assigned work forward.
//
// It renders the engine's minimum-necessary projection and NOTHING ELSE. The
// projection already excludes member identity, affiliate attribution, pricing,
// margin, and payment by construction; this page additionally refuses to
// render an assignment whose payload carries a forbidden field, so a widened
// projection fails closed instead of leaking on screen.
//
// No authority lives here. Buttons are drawn from the shared view model (which
// a test pins to the engine's own transition table), every action is sent to
// the server, and the server's refusal is what the operator is shown. A
// tracking number never renders as "shipped".
// ---------------------------------------------------------------------------

const STATE_TONE: Record<FulfillmentState, BadgeTone> = {
  assigned: "pending",
  acknowledged: "info",
  picking: "info",
  packed: "info",
  tracking_created: "info",
  shipped: "success",
  delivered: "success",
  exception: "warning",
  returned: "warning",
  replacement: "info",
  refunded: "neutral",
  damaged: "danger",
  lost: "danger",
  recalled: "danger",
  cancelled: "neutral",
};

type ActionState =
  | { kind: "idle" }
  | { kind: "working"; assignmentId: string }
  | { kind: "error"; assignmentId: string; message: string };

export default function SupplierWorkspace() {
  const { memberToken } = useResearch();
  const [state, setState] = useState<"loading" | "ok" | "error" | "unavailable" | "unauthorized">("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [assignments, setAssignments] = useState<FulfillmentAssignmentView[]>([]);
  const [action, setAction] = useState<ActionState>({ kind: "idle" });

  const reload = useCallback(async () => {
    setState("loading");
    setErrorMessage(undefined);
    const result = await getSupplierAssignments(memberToken);
    if (result.kind === "ok") {
      setAssignments(result.data?.assignments ?? []);
      setState("ok");
      return;
    }
    if (result.kind === "unauthorized") {
      setState("unauthorized");
      return;
    }
    // 503 while supplier access is unwired, and 404/501, all land here.
    if (result.kind === "unavailable" || result.kind === "forbidden" || result.kind === "denied") {
      setState("unavailable");
      return;
    }
    setErrorMessage(result.message);
    setState("error");
  }, [memberToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (
    assignment: FulfillmentAssignmentView,
    next: FulfillmentAction,
    evidence: SupplierTransitionEvidence,
  ) => {
    setAction({ kind: "working", assignmentId: assignment.assignmentId });
    const key = newIdempotencyKey(assignment.assignmentId, next, String(assignment.version));
    const result = await transitionSupplierAssignment(
      assignment.assignmentId,
      next,
      assignment.version,
      key,
      evidence,
      memberToken,
    );
    if (result.kind === "ok") {
      setAction({ kind: "idle" });
      await reload();
      return;
    }
    // The server is the authority on whether a step was legal. Report what it
    // said rather than guessing, and re-read so the operator sees the truth.
    const message =
      result.kind === "denied" || result.kind === "forbidden"
        ? result.message ??
          "That step was refused. It may already have been taken, or it is an internal decision."
        : result.kind === "unauthorized"
          ? "Your supplier session has ended. Sign in again and retry."
          : result.kind === "unavailable"
            ? "Supplier access is not switched on yet, so nothing was recorded."
            : result.message;
    setAction({ kind: "error", assignmentId: assignment.assignmentId, message });
    await reload();
  };

  const open = assignments.filter((a) => isOpenForSupplier(a.state));
  const closed = assignments.filter((a) => !isOpenForSupplier(a.state));

  return (
    <div className="research-app container-x" style={{ paddingTop: 28, paddingBottom: 64 }}>
      <PageHeader
        eyebrow="Supplier workspace"
        title="Work assigned to you"
        lead="Only the orders and lines assigned to your supplier account, with the minimum information needed to fulfill them."
      />

      <div className="mt-8">
        <ResearchRouteBoundary
          state={state}
          errorMessage={errorMessage}
          onRetry={() => void reload()}
          unavailableTitle="Supplier access is not switched on yet."
          unavailableBody="Your workspace appears here once Xenios enables supplier access for your account. Nothing is required from you right now."
        >
          {assignments.length === 0 ? (
            <ResearchEmptyState
              title="No work is assigned to you right now."
              body="Assignments appear here after an order is paid and released to your account."
            />
          ) : (
            <>
              <section aria-labelledby="sw-open">
                <h2 id="sw-open" className="mono-cap text-ink-mute">
                  Open work
                </h2>
                <div className="mt-4 grid gap-4">
                  {open.length === 0 && (
                    <ResearchEmptyState title="Nothing is waiting on you." body="Completed work is listed below." />
                  )}
                  {open.map((a) => (
                    <AssignmentCard
                      key={a.assignmentId}
                      assignment={a}
                      action={action}
                      onRun={(next, evidence) => void run(a, next, evidence)}
                    />
                  ))}
                </div>
              </section>

              {closed.length > 0 && (
                <section aria-labelledby="sw-closed" className="mt-10">
                  <h2 id="sw-closed" className="mono-cap text-ink-mute">
                    Completed and closed
                  </h2>
                  <div className="mt-4 grid gap-4">
                    {closed.map((a) => (
                      <AssignmentCard
                        key={a.assignmentId}
                        assignment={a}
                        action={action}
                        onRun={(next, evidence) => void run(a, next, evidence)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          <div className="mt-8">
            <ResearchSecureNotice>
              This workspace shows only what is needed to fulfill your own assignments. It never carries customer
              pricing, Xenios margin, affiliate attribution, payment evidence, or another supplier's work.
            </ResearchSecureNotice>
          </div>
        </ResearchRouteBoundary>
      </div>
    </div>
  );
}

function AssignmentCard({
  assignment,
  action,
  onRun,
}: {
  assignment: FulfillmentAssignmentView;
  action: ActionState;
  onRun: (next: FulfillmentAction, evidence: SupplierTransitionEvidence) => void;
}) {
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [reason, setReason] = useState("");
  const [showProblem, setShowProblem] = useState(false);

  // Fail closed: a projection carrying something a supplier must not see is
  // not rendered at all. The engine excludes these by construction, so this
  // only fires if the projection is widened later.
  const leaked = forbiddenSupplierFields(assignment);
  if (leaked.length > 0) {
    return (
      <div className="card" role="alert" data-testid="sw-refused">
        <ResearchStatusBadge label="Withheld" tone="danger" />
        <p className="body-s text-ink-2 mt-2">
          This assignment was not displayed because it arrived carrying information a supplier workspace must not show.
          Xenios operations has been able to see this; contact them to have the assignment re-issued.
        </p>
      </div>
    );
  }

  const available = supplierActionsFor(assignment.state);
  const primary = primarySupplierAction(assignment.state);
  const canReportProblem = available.includes("record_exception");
  const busy = action.kind === "working" && action.assignmentId === assignment.assignmentId;
  const failed = action.kind === "error" && action.assignmentId === assignment.assignmentId;
  const needsTracking = primary !== null && requiredEvidenceFor(primary).includes("tracking");

  return (
    <div className="card" data-testid={`sw-assignment-${assignment.assignmentId}`}>
      <div className="flex items-start justify-between gap-3" style={{ flexWrap: "wrap" }}>
        <div>
          <p className="mono-label text-ink-mute">Order</p>
          <p className="body-m font-700 tabular">{assignment.orderReference}</p>
        </div>
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          <ResearchStatusBadge
            label={FULFILLMENT_STATE_LABEL[assignment.state] ?? assignment.state}
            tone={STATE_TONE[assignment.state] ?? "neutral"}
          />
          {assignment.handlingProfile === "cold_chain" && <ResearchStatusBadge label="Cold chain" tone="info" />}
        </div>
      </div>

      <div
        className="grid gap-4 mt-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
      >
        <div>
          <p className="mono-label text-ink-mute">Ship to</p>
          <p className="body-s text-ink-2 mt-1">
            {assignment.recipient.name}
            <br />
            {assignment.recipient.addressLine1}
            {assignment.recipient.addressLine2 ? (
              <>
                <br />
                {assignment.recipient.addressLine2}
              </>
            ) : null}
            <br />
            {assignment.recipient.city}, {assignment.recipient.state} {assignment.recipient.postalCode}
            {assignment.recipient.phone ? (
              <>
                <br />
                {assignment.recipient.phone}
              </>
            ) : null}
          </p>
        </div>
        <div>
          <p className="mono-label text-ink-mute">Service</p>
          <p className="body-s text-ink-2 mt-1">{assignment.shippingService}</p>
          {assignment.expectedShipAt && (
            <>
              <p className="mono-label text-ink-mute mt-3">Expected ship</p>
              <p className="body-s text-ink-2 mt-1 tabular">{assignment.expectedShipAt.slice(0, 10)}</p>
            </>
          )}
        </div>
      </div>

      <div className="mt-4">
        <p className="mono-label text-ink-mute">Lines</p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="mt-2 grid gap-1">
          {assignment.lines.map((line) => (
            <li key={line.lineId} className="body-s text-ink-2 tabular">
              {line.quantity} x {line.sku}
              <span className="text-ink-mute"> — lot {line.lotCode}</span>
            </li>
          ))}
        </ul>
      </div>

      {(assignment.carrier || assignment.trackingReference) && (
        <div className="mt-4">
          <p className="mono-label text-ink-mute">Tracking</p>
          <p className="body-s text-ink-2 mt-1 tabular">
            {assignment.carrier ?? "Carrier not recorded"}
            {assignment.trackingReference ? ` — ${assignment.trackingReference}` : ""}
          </p>
          {!hasShipped(assignment.state) && (
            <p className="body-s text-ink-mute mt-1">
              Recorded, but not yet marked shipped. Mark it shipped when the carrier takes possession.
            </p>
          )}
        </div>
      )}

      {needsTracking && (
        <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <div>
            <label htmlFor={`sw-carrier-${assignment.assignmentId}`} className="form-label">
              Carrier
            </label>
            <input
              id={`sw-carrier-${assignment.assignmentId}`}
              className="input-field"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`sw-tracking-${assignment.assignmentId}`} className="form-label">
              Tracking number
            </label>
            <input
              id={`sw-tracking-${assignment.assignmentId}`}
              className="input-field"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
            />
          </div>
        </div>
      )}

      {showProblem && (
        <div className="mt-4">
          <label htmlFor={`sw-reason-${assignment.assignmentId}`} className="form-label">
            What is the problem?
          </label>
          <textarea
            id={`sw-reason-${assignment.assignmentId}`}
            className="input-field"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}

      {failed && (
        <p className="body-s mt-4" role="alert">
          {action.message}
        </p>
      )}

      {available.length > 0 && (
        <div className="mt-5 flex gap-3 flex-wrap">
          {primary && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || (needsTracking && tracking.trim().length === 0)}
              onClick={() =>
                onRun(primary, needsTracking ? { carrier: carrier.trim(), trackingReference: tracking.trim() } : {})
              }
            >
              {busy ? "Working..." : FULFILLMENT_ACTION_LABEL[primary]}
            </button>
          )}
          {canReportProblem && !showProblem && (
            <button type="button" className="btn btn-ghost" onClick={() => setShowProblem(true)}>
              {FULFILLMENT_ACTION_LABEL.record_exception}
            </button>
          )}
          {canReportProblem && showProblem && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || reason.trim().length === 0}
                onClick={() => onRun("record_exception", { reason: reason.trim() })}
              >
                Submit problem
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowProblem(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
