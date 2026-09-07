import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchDenialNotice, ResearchEmptyState, ResearchLoadingState, ResearchRouteBoundary, ResearchSecureNotice, ResearchStatusBadge } from "../../ui/kit";
import { getPartnerEvents, requestEvent } from "../../adapters/partner";
import { ACCOUNT_PORTAL_ROUTES, ACCESS_ROUTES } from "../../lib/routes";
import { EVENT_SCHEDULE_LABELS, prepareEventRequest, readPartnerEventRecords, type ReportedPartnerEvent } from "../../partner-crm/event-records";
import { usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner events (/research/partners/events). Existing server-scoped organization
// event records carry schedule facts, not registrations, approvals, or attendance.
// The current request route remains server-disabled.
// ---------------------------------------------------------------------------

const UNAVAILABLE_MESSAGE =
  "Event request intake is unavailable. This page cannot confirm a request was recorded. Your draft is kept; contact the team before resubmitting.";

export default function Events() {
  const { memberToken, memberChecking } = useResearch();
  return <ResearchPartnerShell title="Events" lead="Event records returned for your server-verified organization relationships. A schedule marker is not event approval, registration, or attendance evidence.">
    <ResearchSecureNotice>
      No medical claims, no income claims, no recruitment. This report does not establish content clearance, a confirmed venue,
      event occurrence, attendance attribution, or organization permissions. The current integration does not provide event request intake.
    </ResearchSecureNotice>
    <div className="my-6"><Link href={ACCOUNT_PORTAL_ROUTES.home} className="btn btn-secondary">My account</Link></div>
    {memberChecking ? <ResearchLoadingState label="Checking your account" />
      : memberToken ? <EventWorkspace key={memberToken} token={memberToken} /> : <SignInNotice />}
  </ResearchPartnerShell>;
}

function SignInNotice() {
  return <ResearchEmptyState title="Sign in to view reported events"
    body="Use your Xenios account. The server verifies partner and organization reporting access separately."
    action={<Link href={ACCESS_ROUTES.signIn} className="btn btn-primary">Sign in</Link>} />;
}

function EventWorkspace({ token }: { token: string }) {
  const { state, denied, data, reload } = usePartnerResource<unknown>(getPartnerEvents, token);
  const rows = state === "ok" ? readPartnerEventRecords(data) : null;
  const readable = rows !== null;

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"idle" | "submitting" | "responded" | "uncertain" | "unavailable">("idle");
  const lifecycle = useRef({ active: false, generation: 0, locked: false, submitting: false });
  const readableRef = useRef(readable);
  readableRef.current = readable;
  useLayoutEffect(() => {
    lifecycle.current.active = true;
    return () => { lifecycle.current.active = false; lifecycle.current.generation++; };
  }, []);
  const refresh = () => {
    if (!lifecycle.current.active || lifecycle.current.submitting) return;
    readableRef.current = false;
    void reload();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const current = lifecycle.current;
    if (!current.active || !readableRef.current || current.locked) return;
    const prepared = prepareEventRequest({ name, date, location, description });
    if ("error" in prepared) { setValidation(prepared.error); return; }
    setValidation(null);
    current.locked = true;
    current.submitting = true;
    const generation = ++current.generation;
    setOutcome("submitting");
    try {
      const result = await requestEvent(prepared.body, token, UNAVAILABLE_MESSAGE);
      if (!current.active || current.generation !== generation) return;
      if (result.kind === "accepted") {
        // Compatibility only: the current server refuses intake with 503.
        // The legacy adapter exposes no receipt, registration, or approval.
        setOutcome("responded"); current.submitting = false; refresh();
      } else setOutcome(result.kind === "unavailable" ? "unavailable" : "uncertain");
    } catch {
      if (current.active && current.generation === generation) setOutcome("uncertain");
    } finally {
      if (current.active && current.generation === generation) current.submitting = false;
    }
  };
  const startAnother = () => {
    if (!lifecycle.current.active || !readableRef.current || outcome !== "responded" || lifecycle.current.submitting) return;
    setName(""); setDate(""); setLocation(""); setDescription(""); setValidation(null);
    lifecycle.current.locked = false; setOutcome("idle");
  };
  if (state === "unauthorized") return <SignInNotice />;
  if (denied) return <><ResearchDenialNotice code={denied.code} />
    <p className="body-s mt-4">Partner and organization reporting access is separate from customer approval. No account permissions were changed.</p></>;

  return (
    <>
      <div className="flex justify-end my-4"><button type="button" className="btn btn-secondary" disabled={outcome === "submitting"}
        onClick={refresh}>Refresh event records</button></div>
      {outcome === "responded" && <p className="body-s my-4" role="status">
        Request response received. The endpoint returned success but no receipt ID. This does not establish registration,
        approval, venue confirmation, a schedule, attendance, attribution, or email delivery. Your draft is kept until you start another.
      </p>}
      {(outcome === "uncertain" || outcome === "unavailable") && <div className="my-4" role="alert">
        <p className="body-s">{outcome === "unavailable" ? UNAVAILABLE_MESSAGE
          : "The event request could not be confirmed. Your draft is kept. Contact the team before resubmitting."}</p>
        <p className="body-s mt-2">Resubmission is blocked in this view to avoid duplicates. Do not reload or leave to retry; this safeguard is not stored after leaving.</p>
      </div>}
      <a className="btn btn-secondary mb-4" href="mailto:team@xeniostechnology.com?subject=Event%20request">Contact the event team</a>
      <section aria-labelledby="pe-list">
        <h2 id="pe-list" className="mono-cap text-ink-mute">
          Reported organization event records
        </h2>
        <div className="mt-4">
          <ResearchRouteBoundary
            state={state === "ok" && !readable ? "error" : state}
            errorMessage="Event records could not be read safely. Please try again."
            onRetry={refresh}
            unavailableTitle="Event reporting is unavailable right now"
            unavailableBody="The source could not be loaded. This does not confirm an empty event list, organization access, or any event approval."
          >
            <ResearchDataTable<ReportedPartnerEvent>
              caption="Reported organization events: recorded date, unavailable location, and schedule marker"
              columns={[
                { key: "name", header: "Event", render: (ev) => ev.name },
                { key: "date", header: "Reported date", render: (ev) => ev.date ?? "Date not reported" },
                { key: "location", header: "Location", render: () => "Location not provided by this source" },
                {
                  key: "status",
                  header: "Reported schedule marker",
                  render: (ev) => <ResearchStatusBadge label={`${EVENT_SCHEDULE_LABELS[ev.status]} (reported)`} tone="neutral" />,
                },
              ]}
              rows={rows ?? []}
              rowKey={(ev) => ev.id}
              empty="No event rows were returned for this account. This does not confirm complete event history, absence of organization relationships, or request status."
            />
          </ResearchRouteBoundary>
        </div>
      </section>

      {readable && <section aria-labelledby="pe-request" className="mt-10">
        <h2 id="pe-request" className="mono-cap text-ink-mute">
          Prepare an event request
        </h2>
        <form onSubmit={onSubmit} noValidate className="card mt-4" style={{ maxWidth: 680 }}>
          <p className="body-s mb-4">The current request route is unavailable. Preparing this draft is not event registration.
            Do not include passwords, sign-in codes, customer health information, or bank details.</p>
          <fieldset disabled={outcome !== "idle"} style={{ border: 0, margin: 0, padding: 0 }}>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div>
              <label htmlFor="pe-name" className="form-label">
                Event name
              </label>
              <input id="pe-name" className="input-field" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="pe-date" className="form-label">
                Date
              </label>
              <input id="pe-date" className="input-field" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="pe-location" className="form-label">
                Location
              </label>
              <input
                id="pe-location"
                className="input-field"
                type="text"
                placeholder="City and venue, or online"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="pe-description" className="form-label">
              What you plan to present
            </label>
            <p className="body-s text-ink-mute mb-2">
              Format, expected attendance, and any materials beyond the approved library.
            </p>
            <textarea
              id="pe-description"
              className="input-field"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          </fieldset>

          {validation && (
            <p className="body-s mt-4" role="alert">
              {validation}
            </p>
          )}
          <div className="mt-6">
            <button type="submit" className="btn btn-primary" disabled={outcome !== "idle"}>
              {outcome === "submitting" ? "Submitting..." : "Submit request"}
            </button>
            {outcome === "responded" && <button type="button" className="btn btn-secondary ml-3" onClick={startAnother}>Start another draft</button>}
          </div>
        </form>
      </section>}
    </>
  );
}
