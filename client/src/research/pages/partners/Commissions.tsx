import { useResearch, formatMoney } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchRouteBoundary, ResearchStatusBadge, type BadgeTone } from "../../ui/kit";
import { getPartnerCommissions } from "../../adapters/partner";
import { PARTNER_PENDING_TITLE, usePartnerResource } from "./shared";
import type { CommissionState } from "@shared/research/distribution";

// ---------------------------------------------------------------------------
// Partner commissions (/research/partners/commissions). The ledger of
// commission entries with the hold and reversal vocabulary spelled out.
// Every figure comes from the partner API; nothing is projected or implied.
// ---------------------------------------------------------------------------

// Field names and states align to the frozen commission vocabulary
// (shared/research/distribution.ts CommissionState); the endpoint itself is
// not yet published, so the payload stays page-owned but never drifts from
// the contract's names.
interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  commissionCents: number;
  state: CommissionState | string;
}

type CommissionsPayload = { entries?: LedgerEntry[] };

const STATE_TONES: Record<CommissionState, BadgeTone> = {
  pending: "pending",
  held: "warning",
  approved: "info",
  payable: "info",
  paid: "success",
  reversed: "danger",
  disputed: "warning",
  forfeited: "danger",
};

const VOCABULARY: Array<{ term: string; definition: string }> = [
  {
    term: "Pending",
    definition: "The referred payment settled and the commission entry was created. It has not entered the hold window yet.",
  },
  {
    term: "Held",
    definition:
      "Every new commission sits held through the refund window on the payment behind it. Holds protect both sides; a held commission is not spendable and not lost.",
  },
  {
    term: "Approved",
    definition: "The hold cleared with no refund. The commission is confirmed and moves to payable.",
  },
  {
    term: "Payable",
    definition: "Confirmed and queued for your next payout once payout setup is complete.",
  },
  {
    term: "Paid",
    definition: "Included in a completed payout. The payout record on the Payouts page shows when and how.",
  },
  {
    term: "Reversed",
    definition:
      "The payment behind the commission was refunded or charged back, so the commission is reversed. If it was already paid, the reversal nets against future payable amounts.",
  },
  {
    term: "Disputed",
    definition: "Under review after a question was raised. It resolves back to approved, or to reversed or forfeited.",
  },
  {
    term: "Forfeited",
    definition: "Closed without payment after review. Forfeitures are always recorded with a reason.",
  },
];

export default function Commissions() {
  const { memberToken } = useResearch();
  const { state, errorMessage, data, reload } = usePartnerResource<CommissionsPayload>(
    getPartnerCommissions,
    memberToken,
  );

  return (
    <ResearchPartnerShell
      title="Commissions"
      lead="Your commission ledger, entry by entry. Each entry ties to a referred membership payment and moves through hold before it is payable."
    >
      <section aria-labelledby="pcm-ledger">
        <h2 id="pcm-ledger" className="mono-cap text-ink-mute">
          Ledger
        </h2>
        <div className="mt-4">
          <ResearchRouteBoundary
            state={state}
            errorMessage={errorMessage}
            onRetry={() => void reload()}
            unavailableTitle={PARTNER_PENDING_TITLE}
            unavailableBody="Your commission ledger appears here once tracking begins. The vocabulary below is exactly how entries will be labeled."
          >
            <ResearchDataTable<LedgerEntry>
              caption="Commission ledger entries with date, description, commission amount, and state"
              columns={[
                { key: "date", header: "Date", render: (r) => r.date },
                { key: "description", header: "Description", render: (r) => r.description },
                {
                  key: "commission",
                  header: "Commission",
                  render: (r) => <span className="tabular">{formatMoney(r.commissionCents)}</span>,
                },
                {
                  key: "state",
                  header: "State",
                  render: (r) => (
                    <ResearchStatusBadge
                      label={r.state}
                      tone={STATE_TONES[r.state as CommissionState] ?? "neutral"}
                    />
                  ),
                },
              ]}
              rows={data?.entries ?? []}
              rowKey={(r) => r.id}
              empty="No commission entries yet. Entries appear when referred memberships activate."
            />
          </ResearchRouteBoundary>
        </div>
      </section>

      <section aria-labelledby="pcm-vocab" className="mt-10">
        <h2 id="pcm-vocab" className="mono-cap text-ink-mute">
          What each state means
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
