import { useResearch, formatMoney } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import {
  ResearchCapabilityBoundary,
  ResearchDataTable,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  capabilityStatusOrPending,
} from "../../ui/kit";
import { getPartnerPayouts } from "../../adapters/partner";
import { PARTNER_PENDING_TITLE, usePartnerCapabilities, usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner payouts (/research/partners/payouts). The entire payout surface
// sits behind the affiliate_payouts capability boundary: while the payout
// provider is unconfigured the page states that plainly instead of implying
// money can move. Inside the boundary, payout history is a normal partner
// data surface.
// ---------------------------------------------------------------------------

interface PayoutRecord {
  id: string;
  date: string;
  amountCents: number;
  method?: string | null;
  status?: string | null;
}

type PayoutsPayload = { payouts?: PayoutRecord[]; method?: { label?: string; configured?: boolean } | null };

export default function Payouts() {
  const { memberToken } = useResearch();
  const capabilities = usePartnerCapabilities(memberToken);
  const payoutStatus = capabilityStatusOrPending(capabilities, "affiliate_payouts");
  const { state, errorMessage, data, reload } = usePartnerResource<PayoutsPayload>(getPartnerPayouts, memberToken);

  return (
    <ResearchPartnerShell
      title="Payouts"
      lead="Payouts cover payable commissions only, after holds clear and payout and tax setup are complete. Nothing here projects earnings."
    >
      <ResearchCapabilityBoundary status={payoutStatus}>
        <section aria-labelledby="pp-method">
          <h2 id="pp-method" className="mono-cap text-ink-mute">
            Payout method
          </h2>
          <div className="card mt-4" style={{ maxWidth: 640 }}>
            {data?.method?.configured ? (
              <>
                <p className="body-m font-700">{data.method.label ?? "Configured"}</p>
                <div className="mt-2">
                  <ResearchStatusBadge label="Ready for payouts" tone="success" />
                </div>
              </>
            ) : (
              <>
                <p className="body-m font-700">No payout method on file.</p>
                <p className="body-s text-ink-2 mt-2">
                  Payout method and tax documentation are collected during onboarding. Until both are on file, payable
                  commissions wait and nothing is lost.
                </p>
                <div className="mt-3">
                  <ResearchStatusBadge label="Setup pending" tone="pending" />
                </div>
              </>
            )}
          </div>
        </section>

        <section aria-labelledby="pp-history" className="mt-10">
          <h2 id="pp-history" className="mono-cap text-ink-mute">
            Payout history
          </h2>
          <div className="mt-4">
            <ResearchRouteBoundary
              state={state}
              errorMessage={errorMessage}
              onRetry={() => void reload()}
              unavailableTitle={PARTNER_PENDING_TITLE}
              unavailableBody="Your payout history appears here once the payout system is live and your first payout is issued."
            >
              <ResearchDataTable<PayoutRecord>
                caption="Completed and scheduled payouts with date, amount, method, and status"
                columns={[
                  { key: "date", header: "Date", render: (p) => p.date },
                  {
                    key: "amount",
                    header: "Amount",
                    render: (p) => <span className="tabular">{formatMoney(p.amountCents)}</span>,
                  },
                  { key: "method", header: "Method", render: (p) => p.method ?? "On file" },
                  {
                    key: "status",
                    header: "Status",
                    render: (p) => (
                      <ResearchStatusBadge
                        label={p.status ?? "Scheduled"}
                        tone={p.status === "completed" ? "success" : "pending"}
                      />
                    ),
                  },
                ]}
                rows={data?.payouts ?? []}
                rowKey={(p) => p.id}
                empty="No payouts yet. Your first payout is issued after commissions clear hold and setup is complete."
              />
            </ResearchRouteBoundary>
          </div>
        </section>
      </ResearchCapabilityBoundary>

      <div className="mt-8">
        <ResearchSecureNotice>
          Payout details and tax documents are handled by the payment provider once it is configured. They are never
          shown in this portal and never stored in the page.
        </ResearchSecureNotice>
      </div>
    </ResearchPartnerShell>
  );
}
