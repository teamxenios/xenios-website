import { useState, type FormEvent } from "react";
import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchRouteBoundary, ResearchStatusBadge } from "../../ui/kit";
import {
  PARTNER_PENDING_TITLE,
  PARTNER_SUPPORT_EMAIL,
  submitPartnerRequest,
  usePartnerResource,
  type SubmitOutcome,
} from "./shared";

// ---------------------------------------------------------------------------
// Partner events (/research/partners/events). In-person or live events a rep
// plans to host or speak at. Registered ahead of time so materials can be
// cleared and attendance attributed in aggregate. Same rules on stage as
// online: no medical claims, no income claims, no recruitment.
// ---------------------------------------------------------------------------

interface PartnerEvent {
  id: string;
  name: string;
  date?: string | null;
  location?: string | null;
  status?: string | null;
}

type EventsPayload = { events?: PartnerEvent[] };

const UNAVAILABLE_MESSAGE =
  "Event requests are not being accepted through this form yet, so nothing was submitted. Email the team with the event name, date, location, and what you plan to present.";

function statusTone(status?: string | null) {
  if (status === "approved" || status === "confirmed") return "success" as const;
  if (status === "declined") return "danger" as const;
  return "pending" as const;
}

export default function Events() {
  const { memberToken } = useResearch();
  const { state, errorMessage, data, reload } = usePartnerResource<EventsPayload>(
    "/api/research/partner/events",
    memberToken,
  );

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SubmitOutcome>({ kind: "idle" });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (outcome.kind === "submitting") return;
    if (!name.trim() || !date.trim() || !location.trim() || !description.trim()) {
      setValidation("Please fill in the event name, date, location, and description.");
      return;
    }
    setValidation(null);
    setOutcome({ kind: "submitting" });
    const result = await submitPartnerRequest(
      "/api/research/partner/events/request",
      { name: name.trim(), date: date.trim(), location: location.trim(), description: description.trim() },
      memberToken,
      UNAVAILABLE_MESSAGE,
    );
    setOutcome(result);
    if (result.kind === "accepted") {
      setName("");
      setDate("");
      setLocation("");
      setDescription("");
      void reload();
    }
  };

  return (
    <ResearchPartnerShell
      title="Events"
      lead="Register talks, meetups, and live sessions before they happen so materials can be cleared. The same three hard lines apply on stage as online."
    >
      <section aria-labelledby="pe-list">
        <h2 id="pe-list" className="mono-cap text-ink-mute">
          Your events
        </h2>
        <div className="mt-4">
          <ResearchRouteBoundary
            state={state}
            errorMessage={errorMessage}
            onRetry={() => void reload()}
            unavailableTitle={PARTNER_PENDING_TITLE}
            unavailableBody="Your event list appears here when the partner platform launches. Requests you email in the meantime are carried over."
          >
            <ResearchDataTable<PartnerEvent>
              caption="Your registered events with dates, locations, and review status"
              columns={[
                { key: "name", header: "Event", render: (ev) => ev.name },
                { key: "date", header: "Date", render: (ev) => ev.date ?? "To be scheduled" },
                { key: "location", header: "Location", render: (ev) => ev.location ?? "To be confirmed" },
                {
                  key: "status",
                  header: "Status",
                  render: (ev) => <ResearchStatusBadge label={ev.status ?? "In review"} tone={statusTone(ev.status)} />,
                },
              ]}
              rows={data?.events ?? []}
              rowKey={(ev) => ev.id}
              empty="No events registered yet. Request one below when you have something planned."
            />
          </ResearchRouteBoundary>
        </div>
      </section>

      <section aria-labelledby="pe-request" className="mt-10">
        <h2 id="pe-request" className="mono-cap text-ink-mute">
          Register an event
        </h2>
        <form onSubmit={onSubmit} noValidate className="card mt-4" style={{ maxWidth: 680 }}>
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

          {validation && (
            <p className="body-s mt-4" role="alert">
              {validation}
            </p>
          )}
          {outcome.kind === "accepted" && (
            <p className="body-s mt-4" role="status" aria-live="polite">
              {outcome.message}
            </p>
          )}
          {outcome.kind === "unavailable" && (
            <div className="mt-4" role="status" aria-live="polite">
              <p className="body-s text-ink-2">{outcome.message}</p>
              <a className="btn btn-secondary mt-3" href={`mailto:${PARTNER_SUPPORT_EMAIL}?subject=Event%20registration`}>
                Email the registration
              </a>
            </div>
          )}
          {outcome.kind === "error" && (
            <p className="body-s mt-4" role="alert">
              {outcome.message}
            </p>
          )}

          <div className="mt-6">
            <button type="submit" className="btn btn-primary" disabled={outcome.kind === "submitting"}>
              {outcome.kind === "submitting" ? "Submitting..." : "Submit registration"}
            </button>
          </div>
        </form>
      </section>
    </ResearchPartnerShell>
  );
}
