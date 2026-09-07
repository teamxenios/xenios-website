import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchDenialNotice, ResearchEmptyState, ResearchLoadingState, ResearchRouteBoundary, ResearchSecureNotice, ResearchStatusBadge } from "../../ui/kit";
import { getPartnerCampaigns, requestCampaign } from "../../adapters/partner";
import { ACCOUNT_PORTAL_ROUTES, ACCESS_ROUTES } from "../../lib/routes";
import { CAMPAIGN_LINK_LABELS, prepareCampaignRequest, readCampaignLinkRecords, type CampaignLinkRecord } from "../../partner-crm/campaign-records";
import { usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner campaigns (/research/partners/campaigns). The current source groups
// codes carried by issued links, not scheduled or approved campaigns. The
// existing request route remains server-disabled; this page does not enable it.
// ---------------------------------------------------------------------------

const UNAVAILABLE_MESSAGE =
  "Campaign request intake is unavailable. This page cannot confirm a request was recorded. Your draft is kept; contact the team before resubmitting.";

export default function Campaigns() {
  const { memberToken, memberChecking } = useResearch();
  return <ResearchPartnerShell title="Campaigns" lead="Campaign codes reported on your partner links. These records are not campaign registrations, approvals, or performance reports.">
    <ResearchSecureNotice>
      A reported issued link does not establish current link eligibility, content approval, a campaign schedule, or successful attribution.
      The current integration does not provide campaign request intake. Preparing a draft here does not register a campaign.
    </ResearchSecureNotice>
    <div className="my-6"><Link href={ACCOUNT_PORTAL_ROUTES.home} className="btn btn-secondary">My account</Link></div>
    {memberChecking ? <ResearchLoadingState label="Checking your account" />
      : memberToken ? <CampaignWorkspace key={memberToken} token={memberToken} /> : <SignInNotice />}
  </ResearchPartnerShell>;
}

function SignInNotice() {
  return <ResearchEmptyState title="Sign in to view campaign codes"
    body="Use your Xenios account. The server verifies partner reporting access separately."
    action={<Link href={ACCESS_ROUTES.signIn} className="btn btn-primary">Sign in</Link>} />;
}

function CampaignWorkspace({ token }: { token: string }) {
  const { state, denied, data, reload } = usePartnerResource<unknown>(getPartnerCampaigns, token);
  const rows = state === "ok" ? readCampaignLinkRecords(data) : null;
  const readable = rows !== null;

  const [name, setName] = useState("");
  const [timeframe, setTimeframe] = useState("");
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
    const prepared = prepareCampaignRequest({ name, timeframe, description });
    if ("error" in prepared) { setValidation(prepared.error); return; }
    setValidation(null);
    current.locked = true;
    current.submitting = true;
    const generation = ++current.generation;
    setOutcome("submitting");
    try {
      const result = await requestCampaign(prepared.body, token, UNAVAILABLE_MESSAGE);
      if (!current.active || current.generation !== generation) return;
      if (result.kind === "accepted") {
        // Compatibility only: the current server returns 503. A generic adapter
        // response is not a receipt, registration, approval, or delivery proof.
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
    setName(""); setTimeframe(""); setDescription(""); setValidation(null);
    lifecycle.current.locked = false; setOutcome("idle");
  };
  if (state === "unauthorized") return <SignInNotice />;
  if (denied) return <><ResearchDenialNotice code={denied.code} />
    <p className="body-s mt-4">Partner reporting access is separate from customer approval. This page does not change account permissions.</p></>;

  return (
    <>
      <div className="flex justify-end my-4"><button type="button" className="btn btn-secondary" disabled={outcome === "submitting"}
        onClick={refresh}>Refresh campaign codes</button></div>
      {outcome === "responded" && <p className="body-s my-4" role="status">
        Request response received. The endpoint returned success but no receipt ID. This does not establish a registration,
        approval, schedule, attribution, or email delivery. Your draft is kept until you start another.
      </p>}
      {(outcome === "uncertain" || outcome === "unavailable") && <div className="my-4" role="alert">
        <p className="body-s">{outcome === "unavailable" ? UNAVAILABLE_MESSAGE
          : "The campaign request could not be confirmed. Your draft is kept. Contact the team before resubmitting."}</p>
        <p className="body-s mt-2">Resubmission is blocked in this view to avoid duplicates. Do not reload or leave to retry; this safeguard is not stored after leaving.</p>
      </div>}
      <a className="btn btn-secondary mb-4" href="mailto:team@xeniostechnology.com?subject=Campaign%20request">Contact the campaign team</a>
      <section aria-labelledby="pc-list">
        <h2 id="pc-list" className="mono-cap text-ink-mute">
          Your reported campaign codes
        </h2>
        <div className="mt-4">
          <ResearchRouteBoundary
            state={state === "ok" && !readable ? "error" : state}
            errorMessage="Campaign code records could not be read safely. Please try again."
            onRetry={refresh}
            unavailableTitle="Campaign code reporting is unavailable right now"
            unavailableBody="The source could not be loaded. This does not confirm an empty code list, campaign approval, or a schedule."
          >
            <ResearchDataTable<CampaignLinkRecord>
              caption="Campaign codes carried by partner links: reported issue date and link state"
              columns={[
                { key: "name", header: "Campaign code", render: (c) => c.name },
                { key: "window", header: "Reported link issue date", render: (c) => c.window ?? "Link issue date not reported" },
                {
                  key: "status",
                  header: "Reported link state",
                  render: (c) => <ResearchStatusBadge label={`${CAMPAIGN_LINK_LABELS[c.status]} (reported)`} tone="neutral" />,
                },
              ]}
              rows={rows ?? []}
              rowKey={(c) => c.id}
              empty="No campaign-code rows were returned for this account. This does not confirm complete link history or the status of any campaign request."
            />
          </ResearchRouteBoundary>
        </div>
      </section>

      {readable && <section aria-labelledby="pc-request" className="mt-10">
        <h2 id="pc-request" className="mono-cap text-ink-mute">
          Prepare a campaign request
        </h2>
        <form onSubmit={onSubmit} noValidate className="card mt-4" style={{ maxWidth: 680 }}>
          <p className="body-s mb-4">The current request route is unavailable. A response from it is not campaign approval.
            Do not include passwords, sign-in codes, customer health information, or bank details in a draft.</p>
          <fieldset disabled={outcome !== "idle"} style={{ border: 0, margin: 0, padding: 0 }}>
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
