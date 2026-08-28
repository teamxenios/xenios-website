import { useEffect, useMemo, useState, type ComponentProps } from "react";
import {
  CATALOG_DISCOVERY_ACCESS_PATH_LABELS,
  CATALOG_DISCOVERY_ACCESS_PATHS,
  CATALOG_DISCOVERY_STATUS_LABELS,
  CATALOG_DISCOVERY_STATUSES,
  parseCatalogDiscoveryProjection,
  savedInterestCommand,
  type CatalogDiscoveryAction,
  type CatalogDiscoveryImage as CatalogDiscoveryImageValue,
  type CatalogDiscoveryItem,
  type CatalogDiscoverySavedInterestCommand,
  type CatalogDiscoveryStatus,
} from "@shared/research/master-offerings/presentation-contract";
import {
  ResearchEmptyState,
  ResearchErrorState,
  ResearchLoadingState,
  ResearchStatusBadge,
  type BadgeTone,
} from "../ui/kit";
import type { CatalogHistory } from "./useCatalogQueryState";
import { useCatalogDiscoveryQueryState } from "./useCatalogDiscoveryQueryState";
import {
  catalogDiscoveryFilterOptions,
  filterCatalogDiscoveryItems,
  type CatalogDiscoveryQuery,
} from "./catalog-discovery-query";

export type CatalogDiscoverySurfaceState = "loading" | "ready" | "error";

const STATUS_TONES: Readonly<Record<CatalogDiscoveryStatus, BadgeTone>> = {
  live: "success",
  request_only: "info",
  provider_required: "info",
  documentation_pending: "pending",
  held: "warning",
  unavailable: "neutral",
  unknown: "neutral",
};

const STATUS_FALLBACK_COPY: Readonly<Record<CatalogDiscoveryStatus, string>> = {
  live: "An explicit live catalog status is recorded.",
  request_only: "Availability must be requested.",
  provider_required: "This item requires the Care access path.",
  documentation_pending: "Required documentation is not complete.",
  held: "This item is temporarily held.",
  unavailable: "This item is currently unavailable.",
  unknown: "No authoritative catalog status is available.",
};

export function CatalogDiscoveryImage({
  image,
}: {
  image: CatalogDiscoveryImageValue;
}) {
  return (
    <img
      src={image.href}
      alt={image.altText}
      width={image.width}
      height={image.height}
      loading="lazy"
      decoding="async"
      className="w-full"
      style={{ height: "auto", objectFit: "contain" }}
    />
  );
}

function SavedInterestControl({
  item,
  onSavedInterest,
}: {
  item: CatalogDiscoveryItem;
  onSavedInterest?: (command: CatalogDiscoverySavedInterestCommand) => void;
}) {
  const command = savedInterestCommand(item);
  if (!command) {
    return <p className="body-xs text-ink-mute">Saved interest unavailable.</p>;
  }
  const saved = command.kind === "remove_saved_interest";
  return (
    <button
      type="button"
      className="btn btn-ghost min-h-[44px]"
      aria-pressed={saved}
      disabled={!onSavedInterest}
      onClick={() => onSavedInterest?.(command)}
      data-testid={`catalog-interest-${item.variantId}`}
    >
      {saved ? "Remove saved interest" : "Save interest"}
    </button>
  );
}

function CatalogDiscoveryCard({
  item,
  onAction,
  onSavedInterest,
}: {
  item: CatalogDiscoveryItem;
  onAction?: (action: CatalogDiscoveryAction) => void;
  onSavedInterest?: (command: CatalogDiscoverySavedInterestCommand) => void;
}) {
  return (
    <li
      className="card grid min-w-0 content-start gap-4"
      data-testid={`catalog-discovery-${item.variantId}`}
    >
      {item.image ? (
        <CatalogDiscoveryImage image={item.image} />
      ) : (
        <p className="body-xs text-ink-mute">Approved image unavailable.</p>
      )}
      <div className="grid min-w-0 gap-2">
        <p className="mono-label text-ink-mute">{item.category.label}</p>
        <h2 className="body-l font-700 break-words">{item.displayName}</h2>
        <p className="body-s text-ink-2 break-words">{item.variantLabel}</p>
        <ResearchStatusBadge
          label={CATALOG_DISCOVERY_STATUS_LABELS[item.status]}
          tone={STATUS_TONES[item.status]}
        />
        <p className="body-s text-ink-2">
          {item.statusExplanation ?? STATUS_FALLBACK_COPY[item.status]}
        </p>
        <dl className="grid gap-2 body-s sm:grid-cols-2">
          <div>
            <dt className="mono-label text-ink-mute">Strength</dt>
            <dd>{item.strength?.label ?? "Not specified"}</dd>
          </div>
          <div>
            <dt className="mono-label text-ink-mute">Form</dt>
            <dd>{item.form?.label ?? "Not specified"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="mono-label text-ink-mute">Access path</dt>
            <dd>{CATALOG_DISCOVERY_ACCESS_PATH_LABELS[item.accessPath]}</dd>
          </div>
        </dl>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        {item.detailHref && (
          <a href={item.detailHref} className="btn btn-secondary min-h-[44px]">
            View details
          </a>
        )}
        {item.action ? (
          <button
            type="button"
            className="btn btn-primary min-h-[44px]"
            disabled={!onAction}
            onClick={() => onAction?.(item.action!)}
            data-testid={`catalog-action-${item.variantId}`}
          >
            {item.action.label}
          </button>
        ) : (
          <p className="body-xs text-ink-mute self-center">
            No executable catalog action.
          </p>
        )}
        <SavedInterestControl
          item={item}
          onSavedInterest={onSavedInterest}
        />
      </div>
    </li>
  );
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2" htmlFor={id}>
      <span className="form-label">{label}</span>
      <select
        id={id}
        className="input-field"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CatalogDiscoveryPresentation({
  records,
  state,
  query,
  onQueryChange,
  onSearchChange,
  errorMessage,
  onRetry,
  onAction,
  onSavedInterest,
}: {
  records: readonly unknown[];
  state: CatalogDiscoverySurfaceState;
  query: CatalogDiscoveryQuery;
  onQueryChange: (next: CatalogDiscoveryQuery) => void;
  onSearchChange: (next: CatalogDiscoveryQuery) => void;
  errorMessage?: string;
  onRetry?: () => void;
  onAction?: (action: CatalogDiscoveryAction) => void;
  onSavedInterest?: (command: CatalogDiscoverySavedInterestCommand) => void;
}) {
  const [search, setSearch] = useState(query.q ?? "");
  const projection = useMemo(
    () => parseCatalogDiscoveryProjection(records),
    [records],
  );
  const options = useMemo(
    () => catalogDiscoveryFilterOptions(projection.items),
    [projection.items],
  );
  const visible = useMemo(
    () => filterCatalogDiscoveryItems(projection.items, query),
    [projection.items, query],
  );

  useEffect(() => setSearch(query.q ?? ""), [query.q]);

  const updateSearch = (value: string) => {
    setSearch(value);
    const next = value.trim();
    onSearchChange({ ...query, q: next || undefined });
  };

  const setFilter = (
    field: keyof Omit<CatalogDiscoveryQuery, "q">,
    value: string,
  ) => {
    onQueryChange({
      ...query,
      [field]: value === "all" ? undefined : value,
    } as CatalogDiscoveryQuery);
  };

  const clearFilters = () => {
    setSearch("");
    onQueryChange({});
  };

  return (
    <div className="grid min-w-0 gap-6" data-testid="catalog-discovery">
      <header className="grid gap-2">
        <p className="mono-label text-ink-mute">Xenios Research</p>
        <h1 className="display-s">Catalog discovery</h1>
        <p className="body-s text-ink-2 max-w-[70ch]">
          Status, strength, form, and access paths appear only when the catalog
          authority publishes them explicitly.
        </p>
      </header>

      {state === "loading" ? (
        <ResearchLoadingState label="Loading catalog discovery" />
      ) : state === "error" ? (
        <ResearchErrorState
          message={errorMessage ?? "The catalog could not be loaded."}
          onRetry={onRetry}
        />
      ) : (
        <>
          <section
            className="card grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            aria-label="Catalog discovery filters"
          >
            <label className="grid gap-2" htmlFor="catalog-discovery-search">
              <span className="form-label">Search</span>
              <input
                id="catalog-discovery-search"
                className="input-field"
                type="search"
                value={search}
                onChange={(event) => updateSearch(event.target.value)}
              />
            </label>
            <FilterSelect
              id="catalog-discovery-category"
              label="Category"
              value={query.category ?? "all"}
              options={options.categories.map((option) => ({
                value: option.key,
                label: option.label,
              }))}
              onChange={(value) => setFilter("category", value)}
            />
            <FilterSelect
              id="catalog-discovery-strength"
              label="Strength"
              value={query.strength ?? "all"}
              options={options.strengths.map((option) => ({
                value: option.key,
                label: option.label,
              }))}
              onChange={(value) => setFilter("strength", value)}
            />
            <FilterSelect
              id="catalog-discovery-form"
              label="Form"
              value={query.form ?? "all"}
              options={options.forms.map((option) => ({
                value: option.key,
                label: option.label,
              }))}
              onChange={(value) => setFilter("form", value)}
            />
            <FilterSelect
              id="catalog-discovery-access"
              label="Access path"
              value={query.access ?? "all"}
              options={CATALOG_DISCOVERY_ACCESS_PATHS.map((value) => ({
                value,
                label: CATALOG_DISCOVERY_ACCESS_PATH_LABELS[value],
              }))}
              onChange={(value) => setFilter("access", value)}
            />
            <FilterSelect
              id="catalog-discovery-status"
              label="Status"
              value={query.status ?? "all"}
              options={CATALOG_DISCOVERY_STATUSES.map((value) => ({
                value,
                label: CATALOG_DISCOVERY_STATUS_LABELS[value],
              }))}
              onChange={(value) => setFilter("status", value)}
            />
            <button
              type="button"
              className="btn btn-secondary min-h-[44px] md:col-span-2 xl:col-span-3"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </section>

          <section aria-labelledby="catalog-discovery-results">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="catalog-discovery-results" className="body-l font-700">
                Results
              </h2>
              <p
                className="body-s text-ink-mute"
                role="status"
                aria-live="polite"
              >
                {projection.items.length === 0 && records.length > 0
                  ? "Catalog information unavailable"
                  : `${visible.length} explicit catalog ${
                      visible.length === 1 ? "entry" : "entries"
                    }`}
              </p>
            </div>
            {records.length === 0 ? (
              <div className="mt-4">
                <ResearchEmptyState
                  title="No catalog records are available."
                  body="No authoritative catalog rows were returned."
                />
              </div>
            ) : projection.items.length === 0 ? (
              <div className="mt-4">
                <ResearchEmptyState
                  title="Catalog information unavailable."
                  body="The returned rows did not contain safe explicit catalog identity."
                />
              </div>
            ) : visible.length === 0 ? (
              <div className="mt-4">
                <ResearchEmptyState
                  title="No catalog entries match these filters."
                  body="Clear search or widen the explicit category, strength, form, access-path, or status filters."
                  action={
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={clearFilters}
                    >
                      Clear filters
                    </button>
                  }
                />
              </div>
            ) : (
              <ul className="grid min-w-0 gap-4 mt-4 md:grid-cols-2 xl:grid-cols-3">
                {visible.map((item) => (
                  <CatalogDiscoveryCard
                    key={`${item.productId}:${item.variantId}`}
                    item={item}
                    onAction={onAction}
                    onSavedInterest={onSavedInterest}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** Route-neutral wrapper that supplies URL/back-forward persistence. */
export function CatalogDiscoveryPage({
  history,
  ...props
}: Omit<
  ComponentProps<typeof CatalogDiscoveryPresentation>,
  "query" | "onQueryChange" | "onSearchChange"
> & { history?: CatalogHistory }) {
  const queryState = useCatalogDiscoveryQueryState(history);
  return (
    <CatalogDiscoveryPresentation
      {...props}
      query={queryState.query}
      onQueryChange={queryState.setQuery}
      onSearchChange={queryState.replaceQuery}
    />
  );
}
