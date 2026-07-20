import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import type { Product, ProductStatus } from "@shared/research/types";
import { formatMoney, useResearch } from "../../core";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchRouteBoundary,
  ResearchCapabilityBoundary,
  capabilityStatusOrPending,
  ResearchEmptyState,
  ResearchStatusBadge,
  ResearchSearch,
  ResearchTabs,
  ResearchFilterBar,
  ResearchDrawer,
  ResearchDataTable,
  useDebounced,
  type BadgeTone,
} from "../../ui/kit";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../../lib/capabilities";
import { apiPost } from "../../lib/api";
import { MEMBER_ROUTES } from "../../lib/routes";

// Member catalog (Supreme build). Product data comes ONLY from the gated
// catalog in useResearch(); this page never invents availability, pricing,
// or documentation status. Quantum items always present as coming soon,
// regardless of any server flag.

const SAVED_KEY = "research-saved-products-v1";
const COMPARE_LIMIT = 3;

type CategoryFilter = "all" | "peptides" | "supplements" | "quantum";

const CATEGORY_TABS: Array<{ key: CategoryFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "peptides", label: "Peptides" },
  { key: "supplements", label: "Supplements" },
  { key: "quantum", label: "Quantum" },
];

// Quantum is always presented as coming soon, no matter what flags say.
export function effectiveStatus(product: Product): ProductStatus {
  return product.category === "quantum" ? "coming-soon" : product.status;
}

const STATUS_BADGE: Record<ProductStatus, { label: string; tone: BadgeTone }> = {
  live: { label: "Available", tone: "success" },
  hold: { label: "Documentation review", tone: "pending" },
  "professional-only": { label: "Professional access", tone: "info" },
  "request-access": { label: "Request access", tone: "neutral" },
  "coming-soon": { label: "Coming soon", tone: "pending" },
};

function productHref(slug: string): string {
  return MEMBER_ROUTES.product.replace(":slug", slug);
}

function guideStatusLine(product: Product): string {
  return product.researchContext && product.researchContext.length > 0
    ? "Guide available"
    : "Guide documentation pending";
}

function qualityStatusLine(product: Product): string {
  return product.qualityNotes && product.qualityNotes.length > 0
    ? "Quality documents on file"
    : "Quality documentation pending";
}

function readSaved(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

type WaitlistState = "idle" | "busy" | "joined" | "unavailable" | "error";

export default function Products() {
  const { member, memberChecking, memberToken, products } = useResearch();

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState<string[]>(() => readSaved());
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [waitlist, setWaitlist] = useState<Record<string, WaitlistState>>({});
  const [caps, setCaps] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);

  // Capability statuses fetched once per page; every provider-backed feature
  // reads from this single map.
  useEffect(() => {
    if (!memberToken) return;
    let alive = true;
    void fetchCapabilities(memberToken).then((m) => {
      if (alive) setCaps(m);
    });
    return () => {
      alive = false;
    };
  }, [memberToken]);

  // Saved products persist locally; this is real member state, not a fixture.
  useEffect(() => {
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    } catch {
      // storage unavailable: saving simply does not persist
    }
  }, [saved]);

  const commerceStatus = capabilityStatusOrPending(caps, "product_commerce");

  const toggleSaved = (slug: string) => {
    setSaved((current) => (current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]));
  };

  const toggleCompare = (slug: string) => {
    setCompare((current) => {
      if (current.includes(slug)) return current.filter((s) => s !== slug);
      if (current.length >= COMPARE_LIMIT) return current;
      return [...current, slug];
    });
  };

  const joinWaitlist = async (slug: string) => {
    setWaitlist((w) => ({ ...w, [slug]: "busy" }));
    const result = await apiPost<{ ok: boolean }>("/api/research/member/waitlist", { slug }, memberToken);
    if (result.kind === "ok") {
      setWaitlist((w) => ({ ...w, [slug]: "joined" }));
    } else if (result.kind === "unavailable") {
      setWaitlist((w) => ({ ...w, [slug]: "unavailable" }));
    } else {
      setWaitlist((w) => ({ ...w, [slug]: "error" }));
    }
  };

  const visible = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return products
      .filter((product) => {
        if (category !== "all" && product.category !== category) return false;
        if (savedOnly && !saved.includes(product.slug)) return false;
        if (!q) return true;
        const haystack = `${product.name} ${product.summary} ${product.eyebrow} ${product.tags.join(" ")}`.toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
  }, [products, debouncedQuery, category, savedOnly, saved]);

  const compareProducts = useMemo(
    () => compare.map((slug) => products.find((p) => p.slug === slug)).filter((p): p is Product => Boolean(p)),
    [compare, products],
  );

  // Compare rows: shared facts first, then the union of specification keys.
  const compareRows = useMemo(() => {
    const rows: Array<{ field: string; values: Record<string, string> }> = [];
    const row = (field: string, value: (p: Product) => string) => {
      const values: Record<string, string> = {};
      for (const p of compareProducts) values[p.slug] = value(p);
      rows.push({ field, values });
    };
    row("Category", (p) => p.category);
    row("Availability", (p) => STATUS_BADGE[effectiveStatus(p)].label);
    row("Price", (p) => formatMoney(p.priceCents));
    row("Format", (p) => p.size ?? "Not listed");
    row("Guide", (p) => guideStatusLine(p));
    row("Quality documents", (p) => qualityStatusLine(p));
    row("Tags", (p) => (p.tags.length ? p.tags.join(", ") : "None"));
    const specKeys = new Set<string>();
    for (const p of compareProducts) for (const key of Object.keys(p.specifications ?? {})) specKeys.add(key);
    for (const key of Array.from(specKeys).sort()) {
      row(key, (p) => p.specifications?.[key] ?? "Not listed");
    }
    return rows;
  }, [compareProducts]);

  const boundaryState: "loading" | "unauthorized" | "ok" = memberChecking ? "loading" : !member ? "unauthorized" : "ok";

  return (
    <ResearchMemberShell
      title="Products"
      lead="The full research catalog for active members. Availability is controlled product by product, and documentation status is always shown honestly."
    >
      <ResearchRouteBoundary state={boundaryState}>
        {/* Ordering state: honest, single source. When commerce is not enabled
            there is no cart anywhere on this page. */}
        <ResearchCapabilityBoundary status={commerceStatus}>
          <section className="card" aria-label="Ordering status">
            <p className="mono-label text-ink-mute">Ordering</p>
            <p className="body-s text-ink-2 mt-2">
              Ordering is open. One-time purchases are available on each product page. Subscription options appear on a
              product page only when that product supports them.
            </p>
          </section>
        </ResearchCapabilityBoundary>

        <div className="mt-6">
          <ResearchFilterBar>
            <ResearchSearch value={query} onChange={setQuery} label="Search products" placeholder="Search the catalog" />
            <ResearchTabs tabs={CATEGORY_TABS} active={category} onSelect={(key) => setCategory(key as CategoryFilter)} label="Product categories" />
            <button
              type="button"
              className={`chip ${savedOnly ? "ra-chip-selected" : "text-ink-2"}`}
              aria-pressed={savedOnly}
              onClick={() => setSavedOnly((v) => !v)}
            >
              Saved only ({saved.length})
            </button>
          </ResearchFilterBar>
        </div>

        {/* Goal navigation: browse the same catalog through goals. */}
        <div className="card mt-4 flex flex-wrap items-center justify-between gap-4" aria-label="Browse by goal">
          <p className="body-s text-ink-2">Prefer to start from an outcome? Browse the catalog by research goal.</p>
          <Link href={MEMBER_ROUTES.goals} className="btn btn-ghost">
            Browse by goal
          </Link>
        </div>

        {compare.length > 0 && (
          <div className="card mt-4 flex flex-wrap items-center justify-between gap-4" role="status" aria-live="polite">
            <p className="body-s text-ink-2">
              Comparing {compare.length} of {COMPARE_LIMIT} products.
            </p>
            <div className="flex gap-3">
              <button type="button" className="btn btn-secondary" onClick={() => setCompareOpen(true)} disabled={compare.length < 2}>
                Compare side by side
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setCompare([])}>
                Clear
              </button>
            </div>
          </div>
        )}

        <section className="mt-6" aria-label="Product list">
          {products.length === 0 ? (
            <ResearchEmptyState
              title="The catalog is not available yet."
              body="Products load for active members once the catalog is published to your account. Nothing is wrong with your membership."
            />
          ) : visible.length === 0 ? (
            <ResearchEmptyState
              title="No matches."
              body="Try a different search term or category, or clear the saved-only filter."
              action={
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setQuery("");
                    setCategory("all");
                    setSavedOnly(false);
                  }}
                >
                  Clear filters
                </button>
              }
            />
          ) : (
            <ul className="grid gap-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {visible.map((product) => {
                const status = effectiveStatus(product);
                const badge = STATUS_BADGE[status];
                const isSaved = saved.includes(product.slug);
                const inCompare = compare.includes(product.slug);
                const wl = waitlist[product.slug] ?? "idle";
                return (
                  <li key={product.slug} className="card">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div style={{ minWidth: 0 }}>
                        <p className="mono-label text-ink-mute">{product.eyebrow}</p>
                        <p className="body-m font-700 mt-1">
                          <Link href={productHref(product.slug)}>{product.name}</Link>
                        </p>
                        <p className="body-s text-ink-2 mt-1 max-w-[64ch]">{product.summary}</p>
                        <p className="body-s text-ink-mute mt-2">
                          {guideStatusLine(product)}. {qualityStatusLine(product)}.
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <ResearchStatusBadge label={badge.label} tone={badge.tone} />
                        <p className="body-s tabular text-ink-2">{formatMoney(product.priceCents)}</p>
                        <p className="mono-label text-ink-mute">One-time</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Link href={productHref(product.slug)} className="btn btn-secondary">
                        View product
                      </Link>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-pressed={isSaved}
                        onClick={() => toggleSaved(product.slug)}
                      >
                        {isSaved ? "Saved" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-pressed={inCompare}
                        disabled={!inCompare && compare.length >= COMPARE_LIMIT}
                        onClick={() => toggleCompare(product.slug)}
                      >
                        {inCompare ? "In compare" : "Compare"}
                      </button>
                      {status === "coming-soon" && (
                        <span className="flex items-center gap-3">
                          {wl === "joined" ? (
                            <span role="status" className="body-s text-ink-2">
                              You are on the waitlist.
                            </span>
                          ) : wl === "unavailable" ? (
                            <span role="status" className="body-s text-ink-mute">
                              The waitlist is not open yet.
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              disabled={wl === "busy"}
                              onClick={() => void joinWaitlist(product.slug)}
                            >
                              {wl === "busy" ? "Joining..." : wl === "error" ? "Retry waitlist" : "Join the waitlist"}
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="card mt-8 flex flex-wrap items-center justify-between gap-4" aria-label="Related areas">
          <p className="body-s text-ink-2">Products work best combined into a system built around your goal.</p>
          <Link href="/research/systems" className="btn btn-ghost">
            Explore Systems
          </Link>
        </div>

        <ResearchDrawer open={compareOpen} title="Compare products" onClose={() => setCompareOpen(false)}>
          {compareProducts.length < 2 ? (
            <ResearchEmptyState title="Pick at least two products to compare." />
          ) : (
            <ResearchDataTable
              caption="Side-by-side product comparison"
              columns={[
                { key: "field", header: "Field", render: (row: { field: string; values: Record<string, string> }) => row.field },
                ...compareProducts.map((p) => ({
                  key: p.slug,
                  header: p.shortName ?? p.name,
                  render: (row: { field: string; values: Record<string, string> }) => row.values[p.slug] ?? "Not listed",
                })),
              ]}
              rows={compareRows}
              rowKey={(row) => row.field}
            />
          )}
        </ResearchDrawer>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
