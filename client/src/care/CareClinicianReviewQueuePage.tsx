import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import {
  CARE_CLINICAL_CAPABILITIES_DISABLED,
  CARE_REVIEW_ACTION_LABELS,
  careReviewActionState,
  type CareClinicalActionState,
} from "@shared/care/clinical-actions";
import { CARE_CLINICIAN_REVIEW_ACTIONS } from "@shared/care/clinician-review";
import {
  CARE_REVIEW_APPOINTMENT_LABELS,
  CARE_REVIEW_CONSENT_LABELS,
  CARE_REVIEW_CONSENT_REASON_LABELS,
  CARE_REVIEW_DECISION_LABELS,
  CARE_REVIEW_INTAKE_LABELS,
  CARE_REVIEW_STATUS_LABELS,
  type CareReviewDetail,
  type CareReviewQueueItem,
  type CareReviewQueueSummary,
} from "@shared/care/review-queue";
import { careApiFetch } from "./api";

/**
 * The clinician review queue.
 *
 * Read only by construction. This file contains no write request, no clinical
 * action endpoint, and no patient identifier. Every clinical control is
 * rendered disabled with a plain explanation supplied by the server, which
 * keeps the workflow visible and reviewable while nothing clinical is active.
 */

export const CARE_CLINICIAN_REVIEW_PATH = "/care/reviews";

type QueueState =
  | { kind: "loading" }
  | { kind: "disabled"; message: string }
  | { kind: "auth_required" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | {
      kind: "ready";
      queue: readonly CareReviewQueueItem[];
      summary: CareReviewQueueSummary;
    };

type DetailState =
  | { kind: "idle" }
  | { kind: "loading"; position: number }
  | {
      kind: "ready";
      position: number;
      detail: CareReviewDetail;
      actions: readonly CareClinicalActionState[];
    }
  | { kind: "missing"; position: number }
  | { kind: "error"; position: number };

function positionLabel(index: number): string {
  return `Review ${String(index + 1).padStart(2, "0")}`;
}

/** Fail closed if the server ever omits the action states. */
function failClosedActions(
  detail: Pick<CareReviewDetail, "status" | "appointment">,
): CareClinicalActionState[] {
  return CARE_CLINICIAN_REVIEW_ACTIONS.map((action) =>
    careReviewActionState({
      action,
      careEnabled: false,
      flags: CARE_CLINICAL_CAPABILITIES_DISABLED,
      reviewDecided: detail.status === "decided",
      appointmentCompleted: detail.appointment.completed,
    }),
  );
}

/**
 * Rebuild the action list from the known action set rather than trusting the
 * response shape. The controls, their order, and their labels are ours; the
 * server only supplies the reason a control is unavailable.
 */
function normalizeActions(
  detail: Pick<CareReviewDetail, "status" | "appointment">,
  reported: unknown,
): CareClinicalActionState[] {
  const byAction = new Map<string, Partial<CareClinicalActionState>>();
  if (Array.isArray(reported)) {
    for (const entry of reported) {
      const candidate = entry as Partial<CareClinicalActionState> | null;
      if (candidate && typeof candidate.action === "string") {
        byAction.set(candidate.action, candidate);
      }
    }
  }
  return failClosedActions(detail).map((fallback) => {
    const match = byAction.get(fallback.action);
    return {
      ...fallback,
      label: CARE_REVIEW_ACTION_LABELS[fallback.action],
      enabled: match?.enabled === true,
      explanation:
        typeof match?.explanation === "string" && match.explanation.length > 0
          ? match.explanation
          : fallback.explanation,
    };
  });
}

function isQueueItem(value: unknown): value is CareReviewQueueItem {
  const item = value as Partial<CareReviewQueueItem> | null;
  return (
    typeof item === "object" &&
    item !== null &&
    typeof item.reviewId === "string" &&
    typeof item.status === "string" &&
    typeof item.intakeState === "string" &&
    typeof item.consentComplete === "boolean"
  );
}

function isDetail(value: unknown): value is CareReviewDetail {
  if (!isQueueItem(value)) return false;
  const detail = value as Partial<CareReviewDetail>;
  return (
    typeof detail.appointment === "object" &&
    detail.appointment !== null &&
    typeof detail.intake === "object" &&
    detail.intake !== null &&
    Array.isArray(detail.consent)
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-3 rule-top first:pt-0 first:border-t-0">
      <span className="mono-label text-ink-mute">{label}</span>
      <span className="body-m break-words">{value}</span>
    </div>
  );
}

/**
 * Every control on this page is disabled, whatever the server reports, because
 * this release ships no clinical write path at all. If the server ever reports
 * a capability as open, the control still explains why it does nothing here.
 */
const NO_WRITE_PATH_EXPLANATION =
  "This release has no path from this screen to a clinical record, so the control does nothing.";

function actionExplanation(action: CareClinicalActionState): string {
  return action.enabled || action.explanation.length === 0
    ? NO_WRITE_PATH_EXPLANATION
    : action.explanation;
}

function appointmentLabel(detail: CareReviewDetail): string {
  return detail.appointment.status
    ? CARE_REVIEW_APPOINTMENT_LABELS[detail.appointment.status]
    : "No appointment recorded";
}

export default function CareClinicianReviewQueuePage() {
  const [state, setState] = useState<QueueState>({ kind: "loading" });
  const [detail, setDetail] = useState<DetailState>({ kind: "idle" });

  const loadQueue = useCallback(async () => {
    setState({ kind: "loading" });
    setDetail({ kind: "idle" });
    try {
      const response = await careApiFetch("/api/care/reviews/queue");
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) return setState({ kind: "auth_required" });
      if (response.status === 403) return setState({ kind: "forbidden" });
      if (response.status === 503 && body?.code === "care_disabled") {
        return setState({
          kind: "disabled",
          message:
            typeof body?.message === "string" && body.message.length > 0
              ? body.message
              : "Care is being prepared.",
        });
      }
      if (!response.ok || body?.ok !== true || !Array.isArray(body.queue)) {
        throw new Error("care_review_queue_unavailable");
      }
      const queue = body.queue.filter(isQueueItem);
      const summary = body.summary as CareReviewQueueSummary | undefined;
      setState({
        kind: "ready",
        queue,
        summary:
          summary && typeof summary.total === "number"
            ? summary
            : {
                total: queue.length,
                openWithClinician: 0,
                waitingOnSomeoneElse: 0,
                decided: 0,
              },
      });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => void loadQueue(), [loadQueue]);

  const openReview = useCallback(async (reviewId: string, position: number) => {
    setDetail({ kind: "loading", position });
    try {
      const response = await careApiFetch(
        `/api/care/reviews/${encodeURIComponent(reviewId)}`,
      );
      const body = await response.json().catch(() => ({}));
      if (response.status === 404) return setDetail({ kind: "missing", position });
      if (!response.ok || body?.ok !== true || !isDetail(body.detail)) {
        throw new Error("care_review_detail_unavailable");
      }
      setDetail({
        kind: "ready",
        position,
        detail: body.detail,
        actions: normalizeActions(body.detail, body.actions),
      });
    } catch {
      setDetail({ kind: "error", position });
    }
  }, []);

  return (
    <PageShell>
      <SeoHead
        title="Care clinician review, xenios"
        description="The private clinician review queue in the separate Xenios Care pathway."
        path={CARE_CLINICIAN_REVIEW_PATH}
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · CLINICIAN REVIEW</p>
        <h1 className="display-m max-w-[20ch]">
          Each review stays with the clinician it was assigned to.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
          This private area shows the state of your assigned reviews. It never
          shows a patient identity, a clinician roster, or clinical content, and
          every clinical action is shown disabled while Care is being prepared.
        </p>

        <section
          className="mt-10"
          aria-live="polite"
          aria-busy={state.kind === "loading"}
          aria-labelledby="care-review-queue-status"
          data-care-review-read-only="true"
        >
          <p className="mono-label text-pulse mb-3">REVIEW QUEUE</p>
          <h2 id="care-review-queue-status" className="h2">
            {state.kind === "loading" && "Checking your assigned reviews…"}
            {state.kind === "disabled" && "Clinical review is not available yet."}
            {state.kind === "auth_required" && "Sign in is required."}
            {state.kind === "forbidden" && "This area is limited to assigned clinicians."}
            {state.kind === "error" && "The review queue is temporarily unavailable."}
            {state.kind === "ready" &&
              (state.queue.length === 0
                ? "No review is assigned to you."
                : "Your assigned reviews")}
          </h2>

          {state.kind === "loading" && (
            <div className="card mt-6">
              <p className="body-m text-ink-mute">
                No clinical action is available while this check is in progress.
              </p>
            </div>
          )}

          {state.kind === "disabled" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">{state.message}</p>
              <p className="body-m text-ink-2 mt-4">
                Clinical review opens only after coverage, credentials, clinical
                partners, and quality review are complete.
              </p>
              <Link href="/care" className="btn btn-secondary mt-6">
                View Care status
              </Link>
            </div>
          )}

          {state.kind === "auth_required" && (
            <div className="card mt-6">
              <p className="mono-label text-pulse mb-2">AUTHORIZATION REQUIRED</p>
              <p className="body-m text-ink-2">
                Review information is private and requires an authorized Care
                account. No review action is available here.
              </p>
              <Link href="/research/sign-in" className="btn btn-primary mt-6">
                Sign in securely
              </Link>
            </div>
          )}

          {state.kind === "forbidden" && (
            <div className="card mt-6">
              <p className="mono-label text-pulse mb-2">NOT AUTHORIZED</p>
              <p className="body-m text-ink-2">
                Your account does not hold the assigned clinician permission, so
                no review is shown and no review action is available here.
              </p>
              <Link href="/care" className="btn btn-secondary mt-6">
                View Care status
              </Link>
            </div>
          )}

          {state.kind === "error" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Nothing was changed. Confirm the queue again before relying on
                this page.
              </p>
              <button
                type="button"
                className="btn btn-secondary mt-6"
                onClick={() => void loadQueue()}
              >
                Try again
              </button>
            </div>
          )}

          {state.kind === "ready" && state.queue.length === 0 && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Nothing is waiting on you. An assigned review appears here only
                after a clinical admin assigns it, and this page never invents a
                queue entry.
              </p>
            </div>
          )}

          {state.kind === "ready" && state.queue.length > 0 && (
            <>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                <div className="card">
                  <dt className="mono-label text-ink-mute">WITH YOU</dt>
                  <dd className="body-l mt-2">{state.summary.openWithClinician}</dd>
                </div>
                <div className="card">
                  <dt className="mono-label text-ink-mute">WAITING ON OTHERS</dt>
                  <dd className="body-l mt-2">{state.summary.waitingOnSomeoneElse}</dd>
                </div>
                <div className="card">
                  <dt className="mono-label text-ink-mute">DECIDED</dt>
                  <dd className="body-l mt-2">{state.summary.decided}</dd>
                </div>
              </dl>

              <ul className="grid grid-cols-1 gap-4 mt-6" role="list">
                {state.queue.map((item, index) => (
                  <li className="card" key={item.reviewId}>
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="mono-label text-ink-mute">
                          {positionLabel(index)}
                        </p>
                        <p className="body-l mt-2">
                          {CARE_REVIEW_STATUS_LABELS[item.status]}
                          {item.decision
                            ? `, ${CARE_REVIEW_DECISION_LABELS[item.decision]}`
                            : ""}
                        </p>
                        <p className="body-s text-ink-2 mt-2 break-words">
                          {`Appointment: ${
                            item.appointmentStatus
                              ? CARE_REVIEW_APPOINTMENT_LABELS[item.appointmentStatus]
                              : "None recorded"
                          }. Intake: ${
                            CARE_REVIEW_INTAKE_LABELS[item.intakeState]
                          }. Consent: ${
                            item.consentComplete ? "Complete" : "Incomplete"
                          }.`}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary flex-none"
                        onClick={() => void openReview(item.reviewId, index)}
                      >
                        {`Open ${positionLabel(index).toLowerCase()}`}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {detail.kind !== "idle" && (
          <section
            className="mt-12"
            aria-live="polite"
            aria-busy={detail.kind === "loading"}
            aria-labelledby="care-review-detail-title"
          >
            <p className="mono-label text-pulse mb-3">REVIEW DETAIL</p>
            <h2 id="care-review-detail-title" className="h2">
              {positionLabel(detail.position)}
            </h2>

            {detail.kind === "loading" && (
              <div className="card mt-6">
                <p className="body-m text-ink-mute">Opening this review…</p>
              </div>
            )}

            {detail.kind === "missing" && (
              <div className="card mt-6">
                <p className="body-m text-ink-2">
                  This review is not available to you. Nothing was changed.
                </p>
              </div>
            )}

            {detail.kind === "error" && (
              <div className="card mt-6">
                <p className="body-m text-ink-2">
                  This review is temporarily unavailable. Nothing was changed.
                </p>
              </div>
            )}

            {detail.kind === "ready" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                <div className="card">
                  <h3 className="h3 mb-4">Review</h3>
                  <StatusRow
                    label="STATUS"
                    value={CARE_REVIEW_STATUS_LABELS[detail.detail.status]}
                  />
                  <StatusRow
                    label="DECISION"
                    value={
                      detail.detail.decision
                        ? CARE_REVIEW_DECISION_LABELS[detail.detail.decision]
                        : "No decision recorded"
                    }
                  />
                  <StatusRow
                    label="DECISION RECORDED BY"
                    value={
                      detail.detail.decisionSource === "human_clinician"
                        ? "A human clinician"
                        : "Not recorded"
                    }
                  />
                </div>

                <div className="card">
                  <h3 className="h3 mb-4">Appointment</h3>
                  <StatusRow label="STATUS" value={appointmentLabel(detail.detail)} />
                  <StatusRow
                    label="SCHEDULED"
                    value={detail.detail.appointment.scheduled ? "Yes" : "No"}
                  />
                  <StatusRow
                    label="COMPLETED"
                    value={detail.detail.appointment.completed ? "Yes" : "No"}
                  />
                  <StatusRow
                    label="TELEHEALTH SESSION"
                    value={
                      detail.detail.appointment.telehealthReady
                        ? "Ready"
                        : "Not ready"
                    }
                  />
                </div>

                <div className="card">
                  <h3 className="h3 mb-4">Intake</h3>
                  <StatusRow
                    label="STATUS"
                    value={CARE_REVIEW_INTAKE_LABELS[detail.detail.intake.state]}
                  />
                  <StatusRow
                    label="FORM VERSION"
                    value={detail.detail.intake.definitionVersion ?? "Not recorded"}
                  />
                  <StatusRow
                    label="SUBMITTED"
                    value={detail.detail.intake.submittedAt ?? "Not submitted"}
                  />
                  <p className="body-s text-ink-mute mt-4">
                    Intake answers are not displayed here.
                  </p>
                </div>

                <div className="card">
                  <h3 className="h3 mb-4">Consent</h3>
                  {detail.detail.consent.length === 0 && (
                    <p className="body-m text-ink-2">No consent record is available.</p>
                  )}
                  {detail.detail.consent.map((consent) => (
                    <StatusRow
                      key={consent.kind}
                      label={CARE_REVIEW_CONSENT_LABELS[consent.kind].toUpperCase()}
                      value={`${
                        consent.satisfied ? "Active" : "Not satisfied"
                      }, ${CARE_REVIEW_CONSENT_REASON_LABELS[consent.reason]}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {detail.kind === "ready" && (
              <div className="mt-8" aria-labelledby="care-review-actions-title">
                <h3 id="care-review-actions-title" className="h3">
                  Clinical actions
                </h3>
                <p className="body-m text-ink-2 mt-3 max-w-[64ch]">
                  These controls are shown so the review workflow is visible.
                  None of them can be used, and this page contains no path that
                  could record a clinical decision.
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6" role="list">
                  {detail.actions.map((action) => (
                    <li className="card" key={action.action}>
                      <button
                        type="button"
                        className="btn btn-secondary w-full"
                        disabled
                        aria-disabled="true"
                        aria-describedby={`care-review-action-${action.action}`}
                        data-care-action-enabled="false"
                      >
                        {action.label}
                      </button>
                      <p
                        id={`care-review-action-${action.action}`}
                        className="body-s text-ink-2 mt-3 break-words"
                      >
                        {actionExplanation(action)}
                      </p>
                      <p className="mono-label text-ink-mute mt-3">UNAVAILABLE</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </PageShell>
  );
}
