import { useMemo, useState } from "react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { productRequestHref } from "@shared/research/product-request-sources";
import type {
  MemberCatalog,
  MemberCatalogCard,
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

type CatalogSort =
  | "editorial"
  | "name_ascending"
  | "name_descending"
  | "recently_updated"
  | "availability"
  | "documentation";

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

function laneLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function priceLabel(product: MemberCatalogCard): string {
  if (product.price === null) return "Price not currently available";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.price.currency,
  }).format(product.price.amountCents / 100);
}

function CatalogCard({
  product,
  selectedForCompare,
  compareDisabled,
  onCompare,
  saved,
  onSave,
}: {
  product: MemberCatalogCard;
  selectedForCompare: boolean;
  compareDisabled: boolean;
  onCompare: (productId: string) => void;
  saved: boolean;
  onSave?: (productId: string) => void;
}) {
  const presentation = STATE_COPY[product.displayState];
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
          loading="lazy"
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
      <p className="body-s text-ink-2">{product.summary}</p>
      <dl className="grid gap-3 body-s sm:grid-cols-2">
        <div>
          <dt className="mono-label text-ink-mute">Category</dt>
          <dd className="mt-1">{product.category}</dd>
        </div>
        <div>
          <dt className="mono-label text-ink-mute">Member price</dt>
          <dd className="mt-1 tabular">{priceLabel(product)}</dd>
        </div>
      </dl>
      <p className="body-s text-ink-mute">{presentation.note}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/research/member/products/${product.slug}`}
          className="btn btn-secondary"
        >
          View product
        </Link>
        <Link
          href={productRequestHref("products", product.displayName)}
          className="btn btn-ghost"
        >
          {product.displayState === "available"
            ? "Request an alternative"
            : "Notify me"}
        </Link>
        <label className="body-s inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={selectedForCompare}
            disabled={compareDisabled && !selectedForCompare}
            onChange={() => onCompare(product.id)}
          />
          Compare
        </label>
        {onSave && (
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={saved}
            onClick={() => onSave(product.id)}
          >
            {saved ? "Saved" : "Save"}
          </button>
        )}
      </div>
    </li>
  );
}

export function MemberCatalogExperience({
  catalog,
  state = "ok",
  errorMessage,
  onRetry,
  savedProductIds = [],
  onSaveProduct,
}: {
  catalog: MemberCatalog;
  state?: MemberCatalogSurfaceState;
  errorMessage?: string;
  onRetry?: () => void;
  savedProductIds?: readonly string[];
  onSaveProduct?: (productId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [composition, setComposition] = useState("all");
  const [sort, setSort] = useState<CatalogSort>("editorial");
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.items
      .filter((product) => {
        if (lane !== "all" && product.lane !== lane) return false;
        if (category !== "all" && product.category !== category) return false;
        if (status !== "all" && product.displayState !== status) return false;
        const productComposition = /blend/i.test(product.classification)
          ? "blend"
          : "single";
        if (
          composition !== "all" &&
          productComposition !== composition
        ) {
          return false;
        }
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
        if (sort === "editorial") return 0;
        if (sort === "name_descending") {
          return right.displayName.localeCompare(left.displayName);
        }
        if (sort === "recently_updated") {
          return right.updatedAt.localeCompare(left.updatedAt);
        }
        if (sort === "availability") {
          return (
            Number(right.displayState === "available") -
              Number(left.displayState === "available") ||
            left.displayName.localeCompare(right.displayName)
          );
        }
        if (sort === "documentation") {
          return (
            Number(left.displayState === "documentation_pending") -
              Number(right.displayState === "documentation_pending") ||
            left.displayName.localeCompare(right.displayName)
          );
        }
        return left.displayName.localeCompare(right.displayName);
      });
  }, [catalog.items, category, composition, lane, query, sort, status]);

  const clearFilters = () => {
    setQuery("");
    setLane("all");
    setCategory("all");
    setStatus("all");
    setComposition("all");
    setSort("editorial");
  };

  const compared = compareIds
    .map((id) => catalog.items.find((item) => item.id === id))
    .filter((item): item is MemberCatalogCard => Boolean(item));

  const onCompare = (productId: string) => {
    setCompareIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : current.length < 3
          ? [...current, productId]
          : current,
    );
  };

  return (
    <>
      <SeoHead
        title="Research Products | Xenios"
        description="Browse Xenios Research profiles, verified product information, and truthful readiness states."
        path="/research/member/products"
      />
      <ResearchMemberShell
        eyebrow="Renew 360 catalog"
        title="Products"
        lead="Browse approved product information, current member pricing, and truthful availability. A catalog listing is not a clinical recommendation."
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
              list="member-catalog-suggestions"
            />
            <datalist id="member-catalog-suggestions">
              {catalog.items.slice(0, 20).map((item) => (
                <option key={item.id} value={item.displayName} />
              ))}
            </datalist>
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
              onChange={(event) => setSort(event.target.value as CatalogSort)}
            >
              <option value="editorial">Editorial order</option>
              <option value="name_ascending">Name, A to Z</option>
              <option value="name_descending">Name, Z to A</option>
              <option value="recently_updated">Recently updated</option>
              <option value="availability">Availability</option>
              <option value="documentation">Documentation readiness</option>
            </select>
          </label>
          <label className="grid gap-2" htmlFor="member-catalog-status">
            <span className="form-label">Status</span>
            <select
              id="member-catalog-status"
              className="input-field"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="available">Available</option>
              <option value="documentation_pending">Documentation pending</option>
              <option value="pricing_pending">Pricing pending</option>
              <option value="unavailable">Unavailable</option>
              <option value="catalog_only">Catalog information</option>
            </select>
          </label>
          <label className="grid gap-2" htmlFor="member-catalog-composition">
            <span className="form-label">Composition</span>
            <select
              id="member-catalog-composition"
              className="input-field"
              value={composition}
              onChange={(event) => setComposition(event.target.value)}
            >
              <option value="all">All compositions</option>
              <option value="single">Single research material</option>
              <option value="blend">Blend</option>
            </select>
          </label>
        </section>

        {compared.length > 0 && (
          <section
            className="card mt-5 grid gap-4"
            aria-labelledby="member-catalog-compare"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="member-catalog-compare" className="body-l font-700">
                  Compare products
                </h2>
                <p className="body-s text-ink-2 mt-1">
                  Compare up to three published profiles. Missing facts remain
                  explicit.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCompareIds([])}
              >
                Clear comparison
              </button>
            </div>
            <ul
              className="grid gap-3 md:grid-cols-3"
              style={{ listStyle: "none", margin: 0, padding: 0 }}
            >
              {compared.map((product) => (
                <li key={product.id} className="rule-bottom pb-3">
                  <p className="font-700">{product.displayName}</p>
                  <p className="body-s text-ink-2 mt-1">{product.category}</p>
                  <p className="body-s text-ink-mute mt-1">
                    {STATE_COPY[product.displayState].label} ·{" "}
                    {priceLabel(product)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

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
            {(query ||
              lane !== "all" ||
              category !== "all" ||
              status !== "all" ||
              composition !== "all") && (
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
                <CatalogCard
                  key={product.id}
                  product={product}
                  selectedForCompare={compareIds.includes(product.id)}
                  compareDisabled={compareIds.length >= 3}
                  onCompare={onCompare}
                  saved={savedProductIds.includes(product.id)}
                  onSave={onSaveProduct}
                />
              ))}
            </ul>
          )}
        </section>

        <ResearchSecureNotice>
          Prices, availability, media, documentation, and selection eligibility
          come from approved server records. Private storage keys, inventory
          quantities, locations, and provider details are not exposed here.
        </ResearchSecureNotice>
      </ResearchRouteBoundary>
      </ResearchMemberShell>
    </>
  );
}
