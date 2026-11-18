import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RequestWorkflowEventV1, RequestWorkflowV1, StaffRequestWorkflowV1, StartReviewResultV1, StartReviewV1 } from "../../../../shared/research/assisted-order/request-intent-workflow";
import type { RequestWorkflowRead } from "./request-workflow-api";
import { StaffStartReviewControl, type StaffReviewCommandJournal, type StaffStartReviewPorts } from "./StaffStartReviewControl";
import "./request-workflow.css";

export const REQUEST_STATUS_UNAVAILABLE = "Online status is not available for review requests.";

const EVENT_LABEL: Readonly<Record<RequestWorkflowEventV1["kind"], string>> = {
  received: "Request received",
  queued: "Added to the review queue",
  review_started: "Review started",
};
const STATE_SENTENCE: Readonly<Record<RequestWorkflowV1["state"], string>> = {
  queued: "Your request is in the review queue. No action is needed from you right now.",
  reviewing: "The team has started reviewing your request. The request page and support will tell you if anything is needed.",
};

/** Server event times only. Nothing here estimates, predicts or fills a gap. */
export function formatWorkflowTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
}

export function WorkflowTimeline({ workflow }: Readonly<{ workflow: RequestWorkflowV1 }>) {
  return <ol className="xenios-request-workflow__events">
    {workflow.events.map((event) => <li key={event.id}>
      <span>{EVENT_LABEL[event.kind]}</span>{" "}
      <time dateTime={event.occurredAt}>{formatWorkflowTime(event.occurredAt)}</time>
    </li>)}
  </ol>;
}

type Shown = Readonly<{ status: "loading" }> | RequestWorkflowRead<RequestWorkflowV1>;

/**
 * Customer status for one saved request. Read-only: one GET on mount and one
 * per explicit refresh. When the server reports the read switched off, the
 * receipt's existing sentence is shown unchanged.
 */
export function RequestWorkflowStatus({ requestId, read, headingLevel = 2 }: Readonly<{
  requestId: string;
  read: (requestId: string) => Promise<RequestWorkflowRead<RequestWorkflowV1>>;
  headingLevel?: 2 | 3;
}>) {
  const [shown, setShown] = useState<Shown>({ status: "loading" });
  // Until the first answer, one line stands where the receipt's sentence
  // stood, so a switched-off read does not shift the page.
  const [answered, setAnswered] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(() => {
    const run = ++sequence.current;
    setShown({ status: "loading" });
    void read(requestId).catch((): RequestWorkflowRead<RequestWorkflowV1> => ({ status: "unconfirmed" }))
      .then((result) => { if (sequence.current === run) { setShown(result); setAnswered(true); } });
  }, [read, requestId]);
  useEffect(() => { load(); return () => { sequence.current += 1; }; }, [load]);

  if (!answered) return <p role="status">Checking current status...</p>;
  if (shown.status === "unavailable") return <p>{REQUEST_STATUS_UNAVAILABLE}</p>;
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const refreshable = shown.status === "ready" || shown.status === "rate_limited" || shown.status === "unconfirmed"
    || shown.status === "loading";
  return <section className="xenios-request-workflow" aria-busy={shown.status === "loading"}>
    <Heading>Request status</Heading>
    <div role="status">
      {shown.status === "loading" && <p>Checking current status...</p>}
      {shown.status === "ready" && <p>{STATE_SENTENCE[shown.value.state]}</p>}
      {/* A real owner also gets 404 for a request saved before the workflow began, so this names no cause. */}
      {shown.status === "denied" && <p>Online status is not available for this request. Your request is still saved.
        Quote your reference if you contact support.</p>}
      {shown.status === "rate_limited" && <p>Status was checked too often. Wait a moment, then refresh.</p>}
      {shown.status === "unconfirmed" && <p>Current status could not be confirmed. Your request is still saved. Refresh to
        try again, or quote your reference if you contact support.</p>}
    </div>
    {shown.status === "ready" && <WorkflowTimeline workflow={shown.value} />}
    {refreshable && <button type="button" className="xenios-order-link" disabled={shown.status === "loading"}
      onClick={load}>Refresh status</button>}
  </section>;
}

const NOTICE_LABEL: Readonly<Record<RequestWorkflowV1["customerNotice"], string>> = {
  pending: "Waiting to send",
  provider_accepted: "Accepted by the mail provider",
  delivered_to_server: "Delivered to the recipient's mail server",
  delivery_unknown: "Result unknown. Reconcile before any resend",
  failed: "Failed",
  suppressed: "Suppressed",
  unavailable: "No notice record available",
};
const STAFF_STATE: Readonly<Record<RequestWorkflowV1["state"], string>> = { queued: "Queued", reviewing: "Reviewing" };

/**
 * Staff workflow beside an authorized detail read. The optional review binding
 * only coordinates a manual command; server processing authority is repeated.
 */
export function StaffRequestWorkflowPanel({ requestId, read, review }: Readonly<{
  requestId: string;
  read: (requestId: string) => Promise<RequestWorkflowRead<StaffRequestWorkflowV1>>;
  review?: Readonly<{ sessionInstance: object; journal: StaffReviewCommandJournal;
    startReview: (requestId: string, command: StartReviewV1) => Promise<StartReviewResultV1> }>;
}>) {
  type Read = typeof read;
  type ShownStaff = Readonly<{ status: "loading" }> | RequestWorkflowRead<StaffRequestWorkflowV1>;
  const [loaded, setLoaded] = useState<Readonly<{ requestId: string; read: Read; shown: ShownStaff }> | null>(null);
  const shown: ShownStaff = loaded?.requestId === requestId && loaded.read === read ? loaded.shown : { status: "loading" };
  const sequence = useRef(0);
  const current = useRef({ requestId, read });
  current.current = { requestId, read };
  const load = useCallback(() => {
    const run = ++sequence.current;
    setLoaded({ requestId, read, shown: { status: "loading" } });
    void read(requestId).catch((): RequestWorkflowRead<StaffRequestWorkflowV1> => ({ status: "unconfirmed" }))
      .then((result) => { if (sequence.current === run && current.current.requestId === requestId && current.current.read === read)
        setLoaded({ requestId, read, shown: result }); });
  }, [read, requestId]);
  useEffect(() => { load(); return () => { sequence.current += 1; }; }, [load]);
  const startReview = review?.startReview;
  const ports = useMemo<StaffStartReviewPorts | null>(() => startReview ? {
    readStaffWorkflow: async (id) => {
      const result = await read(id);
      if (result.status !== "ready") throw new Error("Current workflow access could not be confirmed.");
      return result.value;
    },
    startReview,
  } : null, [read, startReview]);
  const snapshot = useMemo(() => ports && shown.status === "ready"
    ? { requestId, api: ports, value: shown.value } : null, [ports, requestId, shown]);
  const workflow = shown.status === "ready" ? shown.value.workflow : null;
  return <section className="xenios-request-workflow" aria-label="Request workflow" aria-busy={shown.status === "loading"}>
    <h3>Workflow</h3>
    <div role="status">
      {shown.status === "loading" && <p>Loading workflow...</p>}
      {shown.status === "unavailable" && <p>Workflow is unavailable right now.</p>}
      {shown.status === "denied" && <p>Workflow access could not be confirmed for this session.</p>}
      {shown.status === "rate_limited" && <p>Workflow was read too often. Wait a moment, then refresh.</p>}
      {shown.status === "unconfirmed" && <p>Workflow could not be confirmed.</p>}
      {workflow && <p>State: {STAFF_STATE[workflow.state]} | Revision {workflow.revision} | Customer notice: {NOTICE_LABEL[workflow.customerNotice]}</p>}
    </div>
    {workflow && <WorkflowTimeline workflow={workflow} />}
    {review && ports && <StaffStartReviewControl requestId={requestId} sessionInstance={review.sessionInstance}
      journal={review.journal} api={ports} current={snapshot} onConfirmed={load} />}
    {shown.status !== "unavailable" && shown.status !== "denied" && <button type="button" disabled={shown.status === "loading"}
      onClick={load}>Refresh workflow</button>}
  </section>;
}
