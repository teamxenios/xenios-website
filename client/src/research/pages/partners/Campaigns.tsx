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
// Partner campaigns (/research/partners/campaigns). A campaign is a planned
// push (a launch week, a series, a themed month) registered ahead of time so
// compliance can review it and results can be attributed. List is served by
// the partner API; the request form is unavailable-tolerant.
// ---------------------------------------------------------------------------

interface Campaign {
  id: string;
  name: string;
  window?: string | null;
  status?: string | null;
}

type CampaignsPayload = { campaigns?: Campaign[] };

const UNAVAILABLE_MESSAGE =
  "Campaign requests are not being accepted through this form yet, so nothing was submitted. Email the team with your campaign name, timeframe, and a short description instead.";

function statusTone(status?: string | null) {
  if (status === "approved" || status === "active") return "success" as const;
  if (status === "declined") return "danger" as const;
  return "pending" as const;
}

export default function Campaigns() {
  const { memberToken } = useResearch();
  const { state, errorMessage, data, reload } = usePartnerResource<CampaignsPayload>(
    "/api/research/partner/campaigns",
    memberToken,
  );

  const [name, setName] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [description, setDescription] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SubmitOutcome>({ kind: "idle" });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (outcome.kind === "submitting") return;
    if (!name.trim() || !timeframe.trim() || !description.trim()) {
      setValidation("Please fill in the campaign name, timeframe, and description.");
      return;
    }
    setValidation(null);
    setOutcome({ kind: "submitting" });
    const result = await submitPartnerRequest(
      "/api/research/partner/campaigns/request",
      { name: name.trim(), timeframe: timeframe.trim(), description: description.trim() },
      memberToken,
      UNAVAILABLE_MESSAGE,
    );
    setOutcome(result);
    if (result.kind === "accepted") {
      setName("");
      setTimeframe("");
      setDescription("");
      void reload();
    }
  };

  return (
    <ResearchPartnerShell
      title="Campaigns"
      lead="Register a planned push before it runs. Compliance reviews the plan, and results are attributed to the campaign in aggregate."
    >
      <section aria-labelledby="pc-list">
        <h2 id="pc-list" className="mono-cap text-ink-mute">
          Your campaigns
        </h2>
        <div className="mt-4">
          <ResearchRouteBoundary
            state={state}
            errorMessage={errorMessage}
            onRetry={() => void reload()}
            unavailableTitle={PARTNER_PENDING_TITLE}
            unavailableBody="Your campaign list appears here when the partner platform launches. Requests you email in the meantime are carried over."
          >
            <ResearchDataTable<Campaign>
              caption="Your campaigns with their windows and review status"
              columns={[
                { key: "name", header: "Campaign", render: (c) => c.name },
                { key: "window", header: "Window", render: (c) => c.window ?? "To be scheduled" },
                {
                  key: "status",
                  header: "Status",
                  render: (c) => <ResearchStatusBadge label={c.status ?? "In review"} tone={statusTone(c.status)} />,
                },
              ]}
              rows={data?.campaigns ?? []}
              rowKey={(c) => c.id}
              empty="No campaigns yet. Request one below when you have a push planned."
            />
          </ResearchRouteBoundary>
        </div>
      </section>

      <section aria-labelledby="pc-request" className="mt-10">
        <h2 id="pc-request" className="mono-cap text-ink-mute">
          Request a campaign
        </h2>
        <form onSubmit={onSubmit} noValidate className="card mt-4" style={{ maxWidth: 680 }}>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div>
              <label htmlFor="pc-name" className="form-label">
                Campaign name
              </label>
              <input id="pc-name" className="input-field" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="pc-timeframe" className="form-label">
                Timeframe
              </label>
              <input
                id="pc-timeframe"
                className="input-field"
                type="text"
                placeholder="For example: first two weeks of September"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="pc-description" className="form-label">
              What you plan to run
            </label>
            <p className="body-s text-ink-mute mb-2">Channels, content format, and what you want reviewed.</p>
            <textarea
              id="pc-description"
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
              <a className="btn btn-secondary mt-3" href={`mailto:${PARTNER_SUPPORT_EMAIL}?subject=Campaign%20request`}>
                Email the request
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
              {outcome.kind === "submitting" ? "Submitting..." : "Submit request"}
            </button>
          </div>
        </form>
      </section>
    </ResearchPartnerShell>
  );
}
