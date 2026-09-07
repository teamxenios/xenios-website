import { Link } from "wouter";
import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchDenialNotice, ResearchEmptyState, ResearchLoadingState, ResearchRouteBoundary, ResearchSecureNotice } from "../../ui/kit";
import { getPartnerLeads } from "../../adapters/partner";
import { ACCOUNT_PORTAL_ROUTES, ACCESS_ROUTES } from "../../lib/routes";
import { LEAD_CHANNEL_LABELS, readLeadAggregates, type LeadAggregate } from "../../partner-crm/lead-aggregate";
import { usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner leads (/research/partners/leads). AGGREGATE COUNTS ONLY, by
// period and channel. This page is structurally incapable of showing an
// individual: the row type has no name, no email, no identity field at all,
// and the server contract mirrors that.
// ---------------------------------------------------------------------------

function SignInNotice() {
  return <ResearchEmptyState title="Sign in to view partner lead reporting"
    body="Use your Xenios account. The server checks whether partner reporting is available to that account."
    action={<Link href={ACCESS_ROUTES.signIn} className="btn btn-primary">Sign in</Link>} />;
}

export default function Leads() {
  const { memberToken, memberChecking } = useResearch();

  return (
    <ResearchPartnerShell
      title="Leads"
      lead="Recorded attribution activity grouped by month and channel. Aggregate events, never identified people."
    >
      <div className="mb-6">
        <ResearchSecureNotice>
          Lead reporting is aggregate only. You will never see who a lead is: no names, no contact details, no member
          identities, and never any health data. This is a design guarantee, not a setting.
        </ResearchSecureNotice>
      </div>
      <p className="body-s text-ink-2 mb-4">These are recorded attribution events, not unique people, approved applications, purchases, recruits, or earned commissions. Reporting access does not grant another role.</p>
      <Link href={ACCOUNT_PORTAL_ROUTES.home} className="btn btn-secondary mb-6">My account</Link>
      {memberChecking ? <ResearchLoadingState label="Checking your account" />
        : memberToken ? <LeadReporting key={memberToken} token={memberToken} /> : <SignInNotice />}
    </ResearchPartnerShell>
  );
}

function LeadReporting({ token }: { token: string }) {
  const { state, denied, data, reload } = usePartnerResource<unknown>(getPartnerLeads, token);
  if (state === "unauthorized") return <SignInNotice />;
  if (denied) return <><ResearchDenialNotice code={denied.code} />
    <p className="body-s mt-4">Partner reporting access is separate from customer account access. No role or account approval was changed.</p></>;
  if (state === "unavailable") return <ResearchEmptyState
    title="Partner lead reporting is unavailable right now"
    body="The current counts could not be loaded. This does not mean zero activity or that your account access has changed."
    action={<button type="button" className="btn btn-secondary" onClick={() => void reload()}>Refresh lead reporting</button>} />;
  const rows = state === "ok" ? readLeadAggregates(data) : null;
  const malformed = state === "ok" && rows === null;
  return <ResearchRouteBoundary state={malformed ? "error" : state}
    errorMessage="The aggregate lead report could not be read safely. Please try again."
    onRetry={() => void reload()}>
        <ResearchDataTable<LeadAggregate>
          caption="Recorded attribution events by month and channel"
          columns={[
            { key: "period", header: "Month", render: (r) => r.period },
            { key: "channel", header: "Channel", render: (r) => LEAD_CHANNEL_LABELS[r.channel] },
            { key: "leads", header: "Recorded events", render: (r) => <span className="tabular">{r.leads}</span> },
          ]}
          rows={rows ?? []}
          rowKey={(r) => `${r.period}-${r.channel}`}
          empty="No aggregate rows were returned for this account. This does not establish a complete history or zero unique leads."
        />
      </ResearchRouteBoundary>;
}
