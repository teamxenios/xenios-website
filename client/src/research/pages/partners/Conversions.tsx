import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchRouteBoundary, ResearchSecureNotice } from "../../ui/kit";
import { getPartnerConversions } from "../../adapters/partner";
import { PARTNER_PENDING_TITLE, usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner conversions (/research/partners/conversions). AGGREGATE COUNTS
// ONLY: how many referred applications became active memberships, by period.
// The row type has no identity fields; individuals are never shown.
// ---------------------------------------------------------------------------

interface ConversionAggregate {
  period: string;
  activations: number;
  renewals?: number | null;
}

type ConversionsPayload = { rows?: ConversionAggregate[] };

export default function Conversions() {
  const { memberToken } = useResearch();
  const { state, errorMessage, data, reload } = usePartnerResource<ConversionsPayload>(
    getPartnerConversions,
    memberToken,
  );

  return (
    <ResearchPartnerShell
      title="Conversions"
      lead="Aggregate counts of memberships activated from your referrals, by period. An activation is the verified $50 start of a membership, which includes the member's first 30 days."
    >
      <div className="mb-6">
        <ResearchSecureNotice>
          Conversion reporting is aggregate only. You will never see which person converted, what they purchased beyond
          membership, or anything about their participation. Counts, never people.
        </ResearchSecureNotice>
      </div>

      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={() => void reload()}
        unavailableTitle={PARTNER_PENDING_TITLE}
        unavailableBody="Aggregate conversion counts appear here once your link is issued and tracking begins."
      >
        <ResearchDataTable<ConversionAggregate>
          caption="Aggregate membership conversions by period"
          columns={[
            { key: "period", header: "Period", render: (r) => r.period },
            {
              key: "activations",
              header: "Activations",
              render: (r) => <span className="tabular">{r.activations}</span>,
            },
            {
              key: "renewals",
              header: "Active renewals",
              render: (r) => <span className="tabular">{r.renewals ?? "Reported later"}</span>,
            },
          ]}
          rows={data?.rows ?? []}
          rowKey={(r) => r.period}
          empty="Conversion counts appear when tracking begins."
        />
      </ResearchRouteBoundary>
    </ResearchPartnerShell>
  );
}
