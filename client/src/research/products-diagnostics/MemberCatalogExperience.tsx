import { useMemo, useState } from "react";
import { Link } from "wouter";
import { productRequestHref } from "@shared/research/product-request-sources";
import type {
  MemberCatalog,
  MemberCatalogCard,
  MemberCatalogSort,
} from "@shared/research/member-catalog";
import { ResearchMemberShell } from "../ui/shells";
import {
  ResearchEmptyState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  type BadgeTone,
} from "../ui/kit";

export type MemberCatalogSurfaceState =
  | "loading"
  | "ok"
  | "error"
  | "unavailable"
  | "unauthorized";

const STATE_COPY: Record<
  MemberCatalogCard["displayState"],
  { label: string; tone: BadgeTone; note: string }
> = {
  available: {
    label: "Available",
    tone: "success",
    note: "Current approved selection is available.",
  },
  unavailable: {
    label: "Unavailable",
    tone: "warning",
    note: "No eligible operational selection is available.",
  },
  documentation_pending: {
    label: "Documentation pending",
    tone: "pending",
    note: "Required product documentation is still being verified.",
  },
  pricing_pending: {
    label: "Pricing pending",
    tone: "pending",
    note: "An approved current member price is not available.",
  },
  catalog_only: {
    label: "Catalog information",
    tone: "neutral",
    note: "This entry is informational and is not available for transaction.",
  },
};

const LANE_LABELS: Record<string, string> = {
  research: "Research",
  research_material: "Research",
  future_clinical: "Clinical / provider review",
  clinician_guided_care: "Clinical / provider review",
  supplement: "Supplement",
  non_product_program: "Program",
  laboratory_supply: "Laboratory supply",
  storage_accessory: "Storage and organization",
  quantum: "Quantum",
};

function laneLabel(value: string): string {
  return LANE_LABELS[value] ?? value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pricePresentation(product: MemberCatalogCard): { label: string; value: string } {
  if (product.price !== null && product.price.amountCents > 0) {
    return {
      label: product.lane === "future_clinical" ? "Medication price" : "Member price",
      value: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: product.price.currency,
      }).format(product.price.amountCents / 100),
    };
  }
  if (product.lane === "future_clinical") {
    return { label: "Pricing", value: "Pricing shown after clinical review" };
  }
  if (product.displayState === "catalog_only") {
    return { label: "Pricing", value: "Price on request" };
  }
  return { label: "Pricing", value: "Price not currently available" };
}

function catalogSummary(product: MemberCatalogCard): string {
  if (product.lane === "future_clinical") {
    return "This clinical listing is available only through independent licensed review and current pharmacy fulfillment. A listing does not guarantee suitability or a prescription.";
  }
  if (product.displayState === "documentation_pending" || product.displayState === "pricing_pending") {
    return "This listing remains under documentation, pricing, classification, or availability review. No transaction or pathway availability is implied.";
  }
  if (product.lane === "research_material") {
    return `${product.summary} Research interest and evidence context are educational only and are not personal recommendations.`;
  }
  return product.summary;
}

function CatalogCard({ product }: { product: MemberCatalogCard }) {
  const presentation = STATE_COPY[product.displayState];
  const price = pricePresentation(product);
  return (
    <li
      className="card grid gap-4"
      data-testid={`member-catalog-card-${product.id}`}
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      {product.media && (
        <img
          src={product.media.href}
          alt={product.media.altText}
          width={4}
          height={3}
          loading="lazy"
          decoding="async"
          className="w-full"
          style={{
            aspectRatio: "4 / 3",
            objectFit: "contain",
            borderBottom: "1px solid var(--rule)",
          }}
        />
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <p className="mono-label text-ink-mute">{laneLabel(product.lane)}</p>
          <h2 className="body-l font-700 mt-1">
            <Link href={`/research/member/products/${product.slug}`}>
              {product.displayName}
            </Link>
          </h2>
        </div>
        <ResearchStatusBadge
          label={presentation.label}
          tone={presentation.tone}
        />
      </div>
      <p className="body-s text-ink-2">{catalogSummary(product)}</p>
      <dl className="grid gap-3 body-s sm:grid-cols-2">
        <div>
          <dt className="mono-label text-ink-mute">Category</dt>
          <dd className="mt-1">{product.category}</dd>
        </div>
        <div>
          <dt className="mono-label text-ink-mute">{price.label}</dt>
          <dd className="mt-1 tabular">{price.value}</dd>
        </div>
      </dl>
      <p className="body-s text-ink-mute">{presentation.note}</p>
      <div>
        <Link
          href={`/research/member/products/${product.slug}`}
          className="btn btn-secondary"
        >
          View product
        </Link>
      </div>
    </li>
  );
}

export function MemberCatalogExperience({
  catalog,
  state = "ok",
  errorMessage,
  onRetry,
}: {
  catalog: MemberCatalog;
  state?: MemberCatalogSurfaceState;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<MemberCatalogSort>("name_ascending");

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.items
      .filter((product) => {
        if (lane !== "all" && product.lane !== lane) return false;
        if (category !== "all" && product.category !== category) return false;
        return (
          !normalized ||
          [
            product.displayName,
            product.category,
            product.classification,
            ...product.aliases,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalized)
        );
      })
      .sort((left, right) => {
        if (sort === "name_descending") {
          return right.displayName.localeCompare(left.displayName);
        }
        if (sort === "recently_updated") {
          return right.updatedAt.localeCompare(left.updatedAt);
        }
        return left.displayName.localeCompare(right.displayName);
      });
  }, [catalog.items, category, lane, query, sort]);

  const clearFilters = () => {
    setQuery("");
    setLane("all");
    setCategory("all");
    setSort("name_ascending");
  };

  return (
    <ResearchMemberShell
      eyebrow="Xenios catalog"
      title="Care + Research products"
      lead="Browse exact products and formulations with clear pathway, evidence, documentation, pricing, and availability status. Clinical listings require licensed review and pharmacy serviceability. Research listings remain nonclinical and are not personal recommendations."
      actions={
        <Link href={productRequestHref("products")} className="btn btn-primary">
          Request a product
        </Link>
      }
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={onRetry}
        unavailableTitle="The product catalog is not available right now."
        unavailableBody="The catalog remains closed until its approved records can be loaded."
      >
        <section
          className="card grid gap-4 md:grid-cols-2"
          aria-label="Catalog controls"
        >
          <label className="grid gap-2" htmlFor="member-catalog-search">
            <span className="form-label">Search products</span>
            <input
              id="member-catalog-search"
              className="input-field"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, category, or alias"
            />
          </label>
          <label className="grid gap-2" htmlFor="member-catalog-lane">
            <span className="form-label">Product family</span>
            <select
              id="member-catalog-lane"
              className="input-field"
              value={lane}
              onChange={(event) => setLane(event.target.value)}
            >
              <option value="all">All product families</option>
              {catalog.lanes.map((item) => (
                <option key={item} value={item}>
                  {laneLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2" htmlFor="member-catalog-category">
            <span className="form-label">Category</span>
            <select
              id="member-catalog-category"
              className="input-field"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="all">All categories</option>
              {catalog.categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2" htmlFor="member-catalog-sort">
            <span className="form-label">Sort</span>
            <select
              id="member-catalog-sort"
              className="input-field"
              value={sort}
              onChange={(event) => setSort(event.target.value as MemberCatalogSort)}
            >
              <option value="name_ascending">Name, A to Z</option>
              <option value="name_descending">Name, Z to A</option>
              <option value="recently_updated">Recently updated</option>
            </select>
          </label>
        </section>

        <section className="mt-6" aria-labelledby="member-catalog-results">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="member-catalog-results" className="body-l font-700">
                Catalog
              </h2>
              <p className="body-s text-ink-2 mt-1" role="status" aria-live="polite">
                {visible.length} {visible.length === 1 ? "product" : "products"}
              </p>
            </div>
            {(query || lane !== "all" || category !== "all") && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
          </div>

          {catalog.items.length === 0 ? (
            <div className="mt-4">
              <ResearchEmptyState
                title="No products are published yet."
                body="Approved catalog entries will appear here. No unavailable product is being presented as orderable."
                action={
                  <Link
                    href={productRequestHref("products")}
                    className="btn btn-secondary"
                  >
                    Request a product
                  </Link>
                }
              />
            </div>
          ) : visible.length === 0 ? (
            <div className="mt-4">
              <ResearchEmptyState
                title="No products match those filters."
                body="Change the filters or request a product for review. A request is not an order or availability promise."
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
            <ul
              className="mt-4 grid gap-4 md:grid-cols-2"
              style={{ listStyle: "none", margin: 0, padding: 0 }}
            >
              {visible.map((product) => (
                <CatalogCard key={product.id} product={product} />
              ))}
            </ul>
          )}
        </section>

        <ResearchSecureNotice>
          Clinical and Research listings may share an active ingredient name,
          but they remain separate formulations, sources, authorities, prices,
          and fulfillment pathways. A listing never guarantees clinical
          suitability, a prescription, Research availability, or pharmacy
          serviceability.
        </ResearchSecureNotice>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
