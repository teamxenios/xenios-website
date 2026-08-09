import { useEffect, useMemo, useState } from "react";
import type { EarlyAccessAddToCartAuthority } from "@shared/research/early-access-hardening";
import { canAddToCart } from "@shared/research/early-access-hardening";
import {
  PEPTIDE_ROADMAP_DISPLAY_LABELS,
  PEPTIDE_ROADMAP_DISPLAY_STATUSES,
  type PeptideRoadmapCard,
  type PeptideRoadmapDisplayStatus,
} from "@shared/research/early-access-roadmap";

export type PeptideRoadmapCatalogProps = Readonly<{
  cards?: readonly PeptideRoadmapCard[];
  loading?: boolean;
  error?: boolean;
  pageSize?: number;
  onAdd?: (authority: EarlyAccessAddToCartAuthority, card: PeptideRoadmapCard) => void;
  onRequestAccess?: (card: PeptideRoadmapCard) => void;
}>;

const ALL_STATUSES = "all" as const;

function normaliseSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function requestLabel(status: PeptideRoadmapDisplayStatus): string | null {
  if (status === "care_pathway_only") return "Explore care pathway";
  if (status === "approval_required" || status === "request_access") return "Request access";
  return null;
}

export function PeptideRoadmapCatalog({
  cards = [],
  loading = false,
  error = false,
  pageSize = 48,
  onAdd,
  onRequestAccess,
}: PeptideRoadmapCatalogProps) {
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 48;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PeptideRoadmapDisplayStatus | typeof ALL_STATUSES>(
    ALL_STATUSES,
  );
  const [visibleCount, setVisibleCount] = useState(safePageSize);

  const filtered = useMemo(() => {
    const query = normaliseSearch(search);
    return cards.filter((card) => {
      if (status !== ALL_STATUSES && card.displayStatus !== status) return false;
      if (query.length === 0) return true;
      return [card.displayName, card.strength ?? "", card.family, card.format]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [cards, search, status]);

  useEffect(() => {
    setVisibleCount(safePageSize);
  }, [safePageSize, search, status]);

  if (loading) {
    return <div className="ea-roadmap-state" role="status">Loading catalog roadmap…</div>;
  }
  if (error) {
    return (
      <div className="ea-roadmap-state" role="alert">
        The catalog roadmap is temporarily unavailable. No purchase controls are shown.
      </div>
    );
  }

  const visible = filtered.slice(0, visibleCount);

  return (
    <section className="ea-roadmap" aria-labelledby="ea-roadmap-heading">
      <header className="ea-roadmap__header">
        <div>
          <p className="ea-roadmap__eyebrow">Private Early Access</p>
          <h2 id="ea-roadmap-heading">Peptide roadmap</h2>
          <p className="ea-roadmap__intro">
            Roadmap status is planning information. Purchase controls appear only when the
            live catalog confirms the exact product, variant, availability, and price.
          </p>
        </div>
        <p className="ea-roadmap__count" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "variant" : "variants"}
        </p>
      </header>

      <div className="ea-roadmap__controls">
        <label>
          <span>Search variants</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Name, strength, family, or format"
          />
        </label>
        <label>
          <span>Availability</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(
                event.currentTarget.value as PeptideRoadmapDisplayStatus | typeof ALL_STATUSES,
              )
            }
          >
            <option value={ALL_STATUSES}>All statuses</option>
            {PEPTIDE_ROADMAP_DISPLAY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {PEPTIDE_ROADMAP_DISPLAY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {cards.length === 0 ? (
        <div className="ea-roadmap-state">The catalog roadmap is being prepared.</div>
      ) : filtered.length === 0 ? (
        <div className="ea-roadmap-state">No variants match the current search and filter.</div>
      ) : (
        <>
          <div className="ea-roadmap__grid">
            {visible.map((card) => {
              const buyable = canAddToCart(card);
              const requestCopy = requestLabel(card.displayStatus);
              return (
                <article className="ea-roadmap-card" key={card.catalogId}>
                  <div className="ea-roadmap-card__topline">
                    <span
                      className={`ea-roadmap-badge ea-roadmap-badge--${card.displayStatus}`}
                    >
                      {PEPTIDE_ROADMAP_DISPLAY_LABELS[card.displayStatus]}
                    </span>
                    <span className="ea-roadmap-card__format">{card.format}</span>
                  </div>
                  <h3>{card.displayName}</h3>
                  <p className="ea-roadmap-card__meta">
                    {[card.strength, card.family].filter(Boolean).join(" · ")}
                  </p>
                  <div className="ea-roadmap-card__commerce">
                    {buyable ? (
                      <>
                        <strong>{card.priceDisplay}</strong>
                        <button
                          type="button"
                          onClick={() => onAdd?.(card.addToCart!, card)}
                          disabled={onAdd === undefined}
                        >
                          Add to cart
                        </button>
                      </>
                    ) : requestCopy !== null && onRequestAccess !== undefined ? (
                      <button type="button" onClick={() => onRequestAccess(card)}>
                        {requestCopy}
                      </button>
                    ) : (
                      <span className="ea-roadmap-card__pending">No live price or purchase action</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {visible.length < filtered.length ? (
            <button
              className="ea-roadmap__more"
              type="button"
              onClick={() => setVisibleCount((count) => count + safePageSize)}
            >
              Load more variants
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
