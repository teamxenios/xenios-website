import { Link } from "wouter";
import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchDenialNotice, ResearchEmptyState, ResearchLoadingState, ResearchRouteBoundary, ResearchSecureNotice } from "../../ui/kit";
import { getPartnerConversions } from "../../adapters/partner";
import { ACCOUNT_PORTAL_ROUTES, ACCESS_ROUTES, PARTNER_ROUTES } from "../../lib/routes";
import { readConversionAggregates, type ConversionAggregate } from "../../partner-crm/conversion-aggregate";
import { usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner conversions (/research/partners/conversions). AGGREGATE COUNTS
// ONLY: recorded conversion events by period; never identified customers.
// The row type has no identity fields; individuals are never shown.
// ---------------------------------------------------------------------------

function SignInNotice() {
  return <ResearchEmptyState title="Sign in to view partner conversion reporting"
    body="Use your Xenios account. The server checks whether partner reporting is available to that account."
    action={<Link href={ACCESS_ROUTES.signIn} className="btn btn-primary">Sign in</Link>} />;
}

export default function Conversions() {
  const { memberToken, memberChecking } = useResearch();

  return (
    <ResearchPartnerShell
      title="Conversions"
      lead="Aggregate referral conversion records by period. Legacy membership activations and renewals are historical reporting fields only; approved customer access does not require paid membership."
    >
      <div className="mb-6">
        <ResearchSecureNotice>
          Conversion reporting is aggregate only. You will never see which person converted, what they purchased, or
          anything about their participation. Historical membership fields do not establish current access or pricing.
        </ResearchSecureNotice>
      </div>
      <p className="body-s text-ink-2 mb-4">These are recorded conversion events, not unique people, verified purchases, earned commissions, or current account approvals. Reporting access does not grant another role.</p>
      <div className="flex flex-wrap gap-3 mb-6">
        <Link href={ACCOUNT_PORTAL_ROUTES.home} className="btn btn-secondary">My account</Link>
        <Link href={PARTNER_ROUTES.links} className="btn btn-ghost">My referral links</Link>
      </div>
      {memberChecking ? <ResearchLoadingState label="Checking your account" />
        : memberToken ? <ConversionReporting key={memberToken} token={memberToken} /> : <SignInNotice />}
    </ResearchPartnerShell>
  );
}

function ConversionReporting({ token }: { token: string }) {
  const { state, denied, data, reload } = usePartnerResource<unknown>(getPartnerConversions, token);
  if (state === "unauthorized") return <SignInNotice />;
  if (denied) return <><ResearchDenialNotice code={denied.code} />
    <p className="body-s mt-4">Partner reporting access is separate from customer account access. No role or account approval was changed.</p></>;
  const rows = state === "ok" ? readConversionAggregates(data) : null;
  const malformed = state === "ok" && rows === null;
  return <>
    <div className="mb-4 flex justify-end"><button type="button" className="btn btn-secondary"
      onClick={() => void reload()}>Refresh conversion reporting</button></div>
    <ResearchRouteBoundary state={malformed ? "error" : state}
      errorMessage="The aggregate conversion report could not be read safely. Please try again."
      onRetry={() => void reload()}
      unavailableTitle="Partner conversion reporting is unavailable right now"
      unavailableBody="The current counts could not be loaded. This does not mean zero conversions or that your account access has changed.">
        <ResearchDataTable<ConversionAggregate>
          caption="Aggregate referral conversions by period"
          columns={[
            { key: "period", header: "Period", render: (r) => r.period },
            {
              key: "activations",
              header: "Recorded conversions",
              render: (r) => <span className="tabular">{r.activations}</span>,
            },
            {
              key: "renewals",
              header: "Historical renewals",
              render: (r) => <span className="tabular">{r.renewals ?? "Not reported"}</span>,
            },
          ]}
          rows={rows ?? []}
          rowKey={(r) => r.period}
          empty="No aggregate rows were returned for this account. This does not establish a complete history or zero unique customers."
        />
      </ResearchRouteBoundary>
    </>;
}
