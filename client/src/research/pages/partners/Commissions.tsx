import { Link } from "wouter";
import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchDenialNotice, ResearchEmptyState, ResearchLoadingState, ResearchRouteBoundary, ResearchSecureNotice, ResearchStatusBadge } from "../../ui/kit";
import { getPartnerCommissions } from "../../adapters/partner";
import { ACCOUNT_PORTAL_ROUTES, ACCESS_ROUTES, PARTNER_ROUTES } from "../../lib/routes";
import { COMMISSION_STATE_LABELS, formatCommissionCents, readCommissionLedger, type CommissionLedgerEntry } from "../../partner-crm/commission-ledger";
import { usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner commissions (/research/partners/commissions). The ledger of
// commission entries with the hold and reversal vocabulary spelled out.
// Every figure comes from the partner API; nothing is projected or implied.
// ---------------------------------------------------------------------------

const VOCABULARY: Array<{ term: string; definition: string }> = [
  {
    term: "Pending",
    definition: "The ledger reports an entry awaiting further processing. This view does not independently confirm the underlying payment.",
  },
  {
    term: "Held",
    definition:
      "The ledger reports a hold. This view does not establish its reason, release date, or a spendable balance.",
  },
  {
    term: "Approved",
    definition: "The ledger reports approval. Approval alone does not confirm payout scheduling or execution.",
  },
  {
    term: "Payable",
    definition: "The ledger reports the entry as payable. It does not confirm that a payout was queued or provide a payment date.",
  },
  {
    term: "Paid",
    definition: "The commission ledger reports paid. This page has no bank or provider receipt; consult the separate payout records for available evidence.",
  },
  {
    term: "Reversed",
    definition:
      "The ledger reports a reversal. The recorded signed amount is preserved; this page does not infer its cause or net it against other entries.",
  },
  {
    term: "Disputed",
    definition: "The ledger reports a dispute. No resolution or timing is assumed here.",
  },
  {
    term: "Forfeited",
    definition: "The ledger reports forfeited. This view does not infer a reason or change the entry.",
  },
];

export default function Commissions() {
  const { memberToken, memberChecking } = useResearch();

  return (
    <ResearchPartnerShell
      title="Commissions"
      lead="Recorded affiliate commission entries for this account. Ledger status is reported evidence, not a promise of income or payout."
    >
      <ResearchSecureNotice>
        Affiliate commission and wholesale ledgers stay separate. This page does not calculate a balance, initiate a payout,
        identify referred customers, or grant partner permissions. Approved customer access does not require paid membership.
      </ResearchSecureNotice>
      <div className="flex flex-wrap gap-3 my-6">
        <Link href={ACCOUNT_PORTAL_ROUTES.home} className="btn btn-secondary">My account</Link>
        <Link href={PARTNER_ROUTES.payouts} className="btn btn-ghost">Payout records</Link>
      </div>
      <section aria-labelledby="pcm-ledger">
        <h2 id="pcm-ledger" className="mono-cap text-ink-mute">
          Ledger
        </h2>
        <div className="mt-4">
          {memberChecking ? <ResearchLoadingState label="Checking your account" />
            : memberToken ? <CommissionReporting key={memberToken} token={memberToken} /> : <SignInNotice />}
        </div>
      </section>

      <section aria-labelledby="pcm-vocab" className="mt-10">
        <h2 id="pcm-vocab" className="mono-cap text-ink-mute">
          Reading reported ledger states
        </h2>
        <dl className="grid gap-4 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", margin: 0 }}>
          {VOCABULARY.map((v) => (
            <div key={v.term} className="card">
              <dt className="body-m font-700">{v.term}</dt>
              <dd className="body-s text-ink-2 mt-2" style={{ margin: 0 }}>
                {v.definition}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </ResearchPartnerShell>
  );
}

function SignInNotice() {
  return <ResearchEmptyState title="Sign in to view your commission ledger"
    body="Use your Xenios account. The server verifies partner reporting access separately."
    action={<Link href={ACCESS_ROUTES.signIn} className="btn btn-primary">Sign in</Link>} />;
}

function CommissionReporting({ token }: { token: string }) {
  const { state, denied, data, reload } = usePartnerResource<unknown>(getPartnerCommissions, token);
  if (state === "unauthorized") return <SignInNotice />;
  if (denied) return <><ResearchDenialNotice code={denied.code} />
    <p className="body-s mt-4">Commission reporting access is separate from customer approval. No role or account approval was changed.</p></>;
  const entries = state === "ok" ? readCommissionLedger(data) : null;
  const malformed = state === "ok" && entries === null;
  return <>
    <div className="flex justify-end mb-4"><button type="button" className="btn btn-secondary"
      onClick={() => void reload()}>Refresh commission ledger</button></div>
    <ResearchRouteBoundary state={malformed ? "error" : state}
      errorMessage="The commission ledger could not be read safely. Please try again."
      onRetry={() => void reload()}
      unavailableTitle="Commission reporting is unavailable right now"
      unavailableBody="The ledger could not be loaded. This does not mean a zero balance, no entries, or any change to your account access.">
      <ResearchDataTable<CommissionLedgerEntry>
        caption="Affiliate commission records: date, description, signed amount, and reported state"
        columns={[
          { key: "date", header: "Date", render: (entry) => entry.date },
          { key: "description", header: "Description", render: (entry) => entry.description },
          { key: "amount", header: "Recorded amount", render: (entry) => <span className="tabular">{formatCommissionCents(entry.commissionCents)}</span> },
          { key: "state", header: "Reported state", render: (entry) => <ResearchStatusBadge label={COMMISSION_STATE_LABELS[entry.state]} tone="neutral" /> },
        ]}
        rows={entries ?? []}
        rowKey={(entry) => entry.id}
        empty="No affiliate commission entries were returned for this account. This is not a complete-history or zero-balance confirmation."
      />
    </ResearchRouteBoundary>
  </>;
}
