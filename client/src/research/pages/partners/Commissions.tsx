import { useResearch, formatMoney } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchRouteBoundary, ResearchStatusBadge, type BadgeTone } from "../../ui/kit";
import { getPartnerCommissions } from "../../adapters/partner";
import { PARTNER_PENDING_TITLE, usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner commissions (/research/partners/commissions). The ledger of
// commission entries with the hold and reversal vocabulary spelled out.
// Every figure comes from the partner API; nothing is projected or implied.
// ---------------------------------------------------------------------------

type LedgerStatus = "pending" | "hold" | "payable" | "paid" | "reversed";

interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  status: LedgerStatus | string;
}

type CommissionsPayload = { entries?: LedgerEntry[] };

const STATUS_TONES: Record<string, BadgeTone> = {
  pending: "pending",
  hold: "warning",
  payable: "info",
  paid: "success",
  reversed: "danger",
};

const VOCABULARY: Array<{ term: string; definition: string }> = [
  {
    term: "Pending",
    definition: "The referred payment settled and the commission entry was created. It has not entered the hold window yet.",
  },
  {
    term: "Hold",
    definition:
      "Every new commission sits in hold through the refund window on the payment behind it. Holds protect both sides; a held commission is not spendable and not lost.",
  },
  {
    term: "Payable",
    definition: "The hold cleared with no refund. The amount is queued for your next payout once payout setup is complete.",
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
              caption="Commission ledger entries with date, description, amount, and status"
              columns={[
                { key: "date", header: "Date", render: (r) => r.date },
                { key: "description", header: "Description", render: (r) => r.description },
                {
                  key: "amount",
                  header: "Amount",
                  render: (r) => <span className="tabular">{formatMoney(r.amountCents)}</span>,
                },
                {
                  key: "status",
                  header: "Status",
                  render: (r) => (
                    <ResearchStatusBadge label={r.status} tone={STATUS_TONES[r.status] ?? "neutral"} />
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
          What each status means
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
