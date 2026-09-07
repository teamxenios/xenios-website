import { Link } from "wouter";
import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import {
  ResearchCapabilityBoundary,
  ResearchDataTable,
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchLoadingState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  capabilityStatusOrPending,
} from "../../ui/kit";
import { getPartnerPayouts } from "../../adapters/partner";
import { ACCOUNT_PORTAL_ROUTES, ACCESS_ROUTES, PARTNER_ROUTES } from "../../lib/routes";
import { formatCommissionCents } from "../../partner-crm/commission-ledger";
import { PAYOUT_STATUS_LABELS, readPayoutRecords, type PayoutRecords } from "../../partner-crm/payout-records";
import { usePartnerCapabilities, usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner payouts (/research/partners/payouts). The entire payout surface
// sits behind the affiliate_payouts capability boundary: while the payout
// provider is unconfigured the page states that plainly instead of implying
// money can move. Inside the boundary, payout history is a normal partner
// data surface.
// ---------------------------------------------------------------------------

export default function Payouts() {
  const { memberToken, memberChecking } = useResearch();

  return (
    <ResearchPartnerShell
      title="Payouts"
      lead="Read-only payout batch records and reported setup status. This page does not schedule, submit, retry, or promise a payment."
    >
      <ResearchSecureNotice>
        No bank details or tax documents are collected here. A reported status does not grant access, approve tax setup,
        or independently confirm bank receipt. Approved customer access does not require paid membership.
      </ResearchSecureNotice>
      <div className="flex flex-wrap gap-3 my-6">
        <Link href={ACCOUNT_PORTAL_ROUTES.home} className="btn btn-secondary">My account</Link>
        <Link href={PARTNER_ROUTES.commissions} className="btn btn-ghost">Commission ledger</Link>
      </div>
      {memberChecking ? <ResearchLoadingState label="Checking your account" />
        : memberToken ? <PayoutCapability key={memberToken} token={memberToken} /> : <SignInNotice />}
    </ResearchPartnerShell>
  );
}

function SignInNotice() {
  return <ResearchEmptyState title="Sign in to view payout records"
    body="Use your Xenios account. The server verifies partner reporting access separately."
    action={<Link href={ACCESS_ROUTES.signIn} className="btn btn-primary">Sign in</Link>} />;
}

function PayoutCapability({ token }: { token: string }) {
  const capabilities = usePartnerCapabilities(token);
  const status = capabilityStatusOrPending(capabilities, "affiliate_payouts");
  return <ResearchCapabilityBoundary status={status}><PayoutReporting token={token} /></ResearchCapabilityBoundary>;
}

function PayoutReporting({ token }: { token: string }) {
  const { state, denied, data, reload } = usePartnerResource<unknown>(getPartnerPayouts, token);
  if (state === "unauthorized") return <SignInNotice />;
  if (denied) return <><ResearchDenialNotice code={denied.code} />
    <p className="body-s mt-4">Payout reporting access is separate from customer approval. No role or account approval was changed.</p></>;
  const records = state === "ok" ? readPayoutRecords(data) : null;
  const malformed = state === "ok" && records === null;
  return <>
    <div className="flex justify-end mb-4"><button type="button" className="btn btn-secondary"
      onClick={() => void reload()}>Refresh payout records</button></div>
    <ResearchRouteBoundary state={malformed ? "error" : state}
      errorMessage="The payout records could not be read safely. Please try again."
      onRetry={() => void reload()}
      unavailableTitle="Payout reporting is unavailable right now"
      unavailableBody="The source could not be loaded. This does not establish payout history, setup status, or a zero balance.">
      {records && <>
        <section aria-labelledby="pp-method">
          <h2 id="pp-method" className="mono-cap text-ink-mute">Reported method status</h2>
          <div className="card mt-4" style={{ maxWidth: 640 }}>
            <p className="body-m font-700">{records.method.label}</p>
            <p className="body-s text-ink-2 mt-2">This is the method status returned by the source, not payout eligibility or a completed tax review.</p>
            <div className="mt-2"><ResearchStatusBadge
              label={records.method.configured ? "On file (reported)" : "Setup not verified (reported)"} tone="neutral" /></div>
          </div>
        </section>
        <section aria-labelledby="pp-history" className="mt-10">
          <h2 id="pp-history" className="mono-cap text-ink-mute">Payout records</h2>
          <p className="body-s text-ink-2 mt-2">Dates and statuses are from the returned batch records. Built or submitted is not completed; no schedule, balance, or bank receipt is inferred.</p>
          <ResearchDataTable<PayoutRecords["payouts"][number]>
            caption="Payout batch records: recorded date, amount, provider label, and reported status"
            columns={[
              { key: "date", header: "Recorded date", render: (row) => row.date },
              { key: "amount", header: "Recorded amount", render: (row) => <span className="tabular">{formatCommissionCents(row.amountCents)}</span> },
              { key: "method", header: "Provider label", render: (row) => row.method },
              { key: "status", header: "Reported status", render: (row) => <ResearchStatusBadge label={`${PAYOUT_STATUS_LABELS[row.status]} (reported)`} tone="neutral" /> },
            ]}
            rows={records.payouts} rowKey={(row) => row.id}
            empty="No payout records were returned for this account. This is not a complete-history or zero-balance confirmation."
          />
        </section>
      </>}
    </ResearchRouteBoundary>
  </>;
}
