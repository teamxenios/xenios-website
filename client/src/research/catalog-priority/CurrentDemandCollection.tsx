import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ResearchEmptyState, ResearchStatusBadge } from "../ui/kit";
import { activationPresentation } from "./activation-presentation";
import {
  CATALOG_PRIORITY_LANES,
  type CatalogPriorityLane,
  type PriorityCatalogItem,
} from "./priority-config";
import "./catalog-priority.css";

function safeResearchPath(value: string | null): string | null {
  return value?.startsWith("/research/") && !value.startsWith("//") ? value : null;
}

export function PriorityCatalogCard({ item }: { item: PriorityCatalogItem }) {
  const presentation = activationPresentation(item.activationStatus);
  const actionPath = presentation.actionable
    ? safeResearchPath(item.actionPath ?? item.detailsPath)
    : null;

  return (
    <li className="account-surface catalog-priority-card" data-status={item.activationStatus}>
      <div className="catalog-priority-card-top">
        <p className="account-section-label">{item.lanes[0]}</p>
        <ResearchStatusBadge label={presentation.label} tone={presentation.tone} />
      </div>
      <h3 className="body-l font-700 break-words">{item.title}</h3>
      {item.formulation ? <p className="body-s text-ink-2">{item.formulation}</p> : null}
      <p className="body-s text-ink-mute">{presentation.note}</p>
      <div className="catalog-priority-lanes" aria-label="Catalog lanes">
        {item.lanes.slice(1).map((lane) => <span key={lane}>{lane}</span>)}
      </div>
      {actionPath && presentation.actionLabel ? (
        <Link className="btn btn-secondary catalog-priority-action" href={actionPath}>
          {presentation.actionLabel}: {item.title}
        </Link>
      ) : (
        <p className="mono-label text-ink-mute catalog-priority-action">No ordering action available</p>
      )}
    </li>
  );
}

export function CurrentDemandCollection({
  items,
  title = "Current client demand",
  lead = "A priority collection organized by verified catalog pathways and current activation status.",
  showFilters = true,
}: {
  items: readonly PriorityCatalogItem[];
  title?: string;
  lead?: string;
  showFilters?: boolean;
}) {
  const [lane, setLane] = useState<CatalogPriorityLane | "All">("All");
  const visibleItems = useMemo(
    () => lane === "All" ? items : items.filter((item) => item.lanes.includes(lane)),
    [items, lane],
  );

  return (
    <section aria-labelledby="current-demand-title" className="catalog-priority">
      <div className="catalog-priority-heading">
        <div>
          <p className="account-section-label">Priority collection</p>
          <h2 id="current-demand-title" className="account-section-title">{title}</h2>
          <p className="body-s text-ink-2 mt-2 max-w-[70ch]">{lead}</p>
        </div>
        <p className="mono-label text-ink-mute">No demand counts shown</p>
      </div>

      {showFilters ? (
        <div className="catalog-priority-filters" role="group" aria-label="Filter catalog lane">
          {(["All", ...CATALOG_PRIORITY_LANES] as const).map((option) => (
            <button
              type="button"
              key={option}
              className={lane === option ? "catalog-priority-filter-active" : ""}
              aria-pressed={lane === option}
              onClick={() => setLane(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}

      {visibleItems.length ? (
        <ul role="list" className="catalog-priority-grid">
          {visibleItems.map((item) => <PriorityCatalogCard key={item.key} item={item} />)}
        </ul>
      ) : (
        <ResearchEmptyState title="No items in this lane." body="Choose another lane to continue browsing." />
      )}
    </section>
  );
}
