import { useResearch } from "../../core";
import { ResearchPartnerShell } from "../../ui/shells";
import { ResearchDataTable, ResearchRouteBoundary, ResearchSecureNotice } from "../../ui/kit";
import { getPartnerLeads } from "../../adapters/partner";
import { PARTNER_PENDING_TITLE, usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Partner leads (/research/partners/leads). AGGREGATE COUNTS ONLY, by
// period and channel. This page is structurally incapable of showing an
// individual: the row type has no name, no email, no identity field at all,
// and the server contract mirrors that.
// ---------------------------------------------------------------------------

interface LeadAggregate {
  period: string;
  channel: string;
  leads: number;
}

type LeadsPayload = { rows?: LeadAggregate[] };

export default function Leads() {
  const { memberToken } = useResearch();
  const { state, errorMessage, data, reload } = usePartnerResource<LeadsPayload>(getPartnerLeads, memberToken);

  return (
    <ResearchPartnerShell
      title="Leads"
      lead="Aggregate counts of applications started from your link, grouped by period and channel. Counts, never people."
    >
      <div className="mb-6">
        <ResearchSecureNotice>
          Lead reporting is aggregate only. You will never see who a lead is: no names, no contact details, no member
          identities, and never any health data. This is a design guarantee, not a setting.
        </ResearchSecureNotice>
      </div>

      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={() => void reload()}
        unavailableTitle={PARTNER_PENDING_TITLE}
        unavailableBody="Aggregate lead counts appear here once your link is issued and tracking begins."
      >
        <ResearchDataTable<LeadAggregate>
          caption="Aggregate lead counts by period and channel"
          columns={[
            { key: "period", header: "Period", render: (r) => r.period },
            { key: "channel", header: "Channel", render: (r) => r.channel },
            { key: "leads", header: "Leads", render: (r) => <span className="tabular">{r.leads}</span> },
          ]}
          rows={data?.rows ?? []}
          rowKey={(r) => `${r.period}-${r.channel}`}
          empty="Lead counts appear when tracking begins."
        />
      </ResearchRouteBoundary>
    </ResearchPartnerShell>
  );
}
