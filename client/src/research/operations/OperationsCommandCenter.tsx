import type { OperationsCommandCenterView } from "@shared/research/operations/commercial";
import { ResearchEmptyState, ResearchStatusBadge } from "../ui/kit";

export interface OperationsCommandCenterProps {
  summary: OperationsCommandCenterView | null;
}

function StateGroup({
  title,
  values,
}: {
  title: string;
  values: Record<string, number>;
}) {
  const rows = Object.entries(values).filter(([, count]) => count > 0);
  return (
    <section className="card" aria-labelledby={`operations-${title.toLowerCase().replaceAll(" ", "-")}`}>
      <h3 id={`operations-${title.toLowerCase().replaceAll(" ", "-")}`} className="body-m font-700">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="body-s text-ink-mute mt-3">No current records.</p>
      ) : (
        <ul className="grid gap-2 mt-3">
          {rows.map(([state, count]) => (
            <li key={state} className="flex items-center justify-between gap-3 body-s">
              <ResearchStatusBadge label={state.replaceAll("_", " ")} tone="neutral" />
              <span aria-label={`${count} ${state}`}>{count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OperationsCommandCenter({ summary }: OperationsCommandCenterProps) {
  if (!summary) {
    return (
      <ResearchEmptyState
        title="Operations are ready for verified records."
        body="Supplier, fulfillment, affiliate, and professional activity will appear after reviewed configuration and real activity."
      />
    );
  }
  return (
    <section aria-labelledby="operations-command-center-heading" className="grid gap-5">
      <header>
        <p className="mono-label text-ink-mute">Internal operations</p>
        <h2 id="operations-command-center-heading" className="display-s mt-1">
          Command center
        </h2>
        <p className="body-s text-ink-2 mt-2 max-w-[64ch]">
          Current operational state only. Counts exclude customer identity,
          clinical information, fabricated revenue, and unverified partner facts.
        </p>
      </header>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StateGroup title="Suppliers" values={summary.supplierCounts} />
        <StateGroup title="Fulfillment" values={summary.fulfillmentCounts} />
        <StateGroup title="Affiliates" values={summary.affiliateCounts} />
        <StateGroup title="Professionals" values={summary.professionalCounts} />
      </div>
      <div className="card grid sm:grid-cols-2 gap-4">
        <div>
          <p className="mono-label text-ink-mute">Open exceptions</p>
          <p className="display-s mt-1">{summary.exceptionCount}</p>
        </div>
        <div>
          <p className="mono-label text-ink-mute">Payable commissions</p>
          <p className="display-s mt-1">
            {summary.currency
              ? `${summary.currency} ${(summary.payableCommissionCents / 100).toFixed(2)}`
              : "VERIFIED PAYABLE DATA REQUIRED"}
          </p>
        </div>
      </div>
    </section>
  );
}
