import { useMemo, useState } from "react";
import SeoHead from "@/components/SeoHead";
import { useResearch, type Product } from "../core";
import { NoticeBar, PageIntro, ProductGrid } from "../components";

// The full catalog: every category in one place, filterable and searchable.
// Product data comes only from the gated catalog via useResearch().

type CategoryFilter = "all" | Product["category"];

const FILTERS: Array<{ label: string; value: CategoryFilter }> = [
  { label: "All", value: "all" },
  { label: "Peptides", value: "peptides" },
  { label: "Quantum", value: "quantum" },
  { label: "Supplements", value: "supplements" },
  { label: "Programs", value: "programs" },
];

export default function Shop() {
  const { products } = useResearch();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");

  const visible = useMemo(
    () =>
      products.filter((product) => {
        const matchesCategory = category === "all" || product.category === category;
        const haystack = `${product.name} ${product.summary} ${product.tags.join(" ")}`.toLowerCase();
        return matchesCategory && haystack.includes(query.toLowerCase());
      }),
    [products, query, category],
  );

  return (
    <>
      <SeoHead
        title="Shop, xenios research"
        description="Browse research products, Quantum, supplements, and human-led programs in one place, with research and consumer offerings kept clearly separate."
        path="/research/shop"
      />
      <PageIntro
        eyebrow="The complete platform"
        title="Research products, Quantum, supplements, and programs."
        lead="Browse every category in one place. Research and consumer products remain clearly separated by access, cart, checkout, language, and fulfillment."
      />
      <NoticeBar>
        Research products are offered only for legitimate nonclinical research. Product visibility does not mean a product is cleared for checkout. Availability is controlled product by product.
      </NoticeBar>

      <section className="container-x section-y">
        <div className="flex flex-col gap-6 mb-10">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the catalog"
            aria-label="Search the catalog"
            className="body-m w-full max-w-[420px]"
            style={{
              height: 48,
              padding: "0 16px",
              border: "1px solid var(--rule)",
              borderRadius: 4,
              background: "var(--paper)",
              color: "var(--ink)",
            }}
            data-testid="input-catalog-search"
          />
          <div className="chip-strip" role="group" aria-label="Catalog filters">
            {FILTERS.map((filter) => {
              const active = category === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  className="chip"
                  aria-pressed={active}
                  onClick={() => setCategory(filter.value)}
                  style={
                    active
                      ? { background: "var(--ink)", color: "var(--paper)", borderColor: "var(--ink)" }
                      : undefined
                  }
                  data-testid={`button-filter-${filter.value}`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>

        {visible.length ? (
          <ProductGrid products={visible} />
        ) : (
          <div className="card" style={{ padding: 36 }}>
            <h2 className="h3">No matches yet</h2>
            <p className="body-s text-ink-mute mt-2">Try a different search term.</p>
          </div>
        )}
      </section>
    </>
  );
}
