import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { productRequestHref } from "@shared/research/product-request-sources";
import type {
  MemberCatalog,
  MemberCatalogCard,
  MemberCatalogSort,
  MemberCatalogVariant,
  MemberProductDetail,
} from "@shared/research/member-catalog";
import { ResearchMemberShell } from "../ui/shells";
import {
  ResearchEmptyState,
  ResearchPendingPanel,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../ui/kit";
import {
  PEPTIDE_ACCESS_STATES,
  cardAccessPresentation,
  formatEligibleCardPrice,
  formatEligibleVariantPrice,
  isPeptideCatalogCard,
  type PeptideAccessState,
  variantAccessPresentation,
  variantIdentityLabel,
} from "./peptide-presentation";

export type PeptideCatalogSurfaceState =
  | "loading"
  | "ok"
  | "error"
  | "unavailable"
  | "unauthorized";

const ACCESS_LABELS: Record<PeptideAccessState, string> = {
  eligible: "Eligible variant available",
  request_access: "Request access",
  held: "Held",
  pending_documentation: "Pending documentation",
  coming_soon: "Coming soon",
  care_only: "Care only",
  unavailable: "Unavailable",
};

function ProductMedia({ product }: { product: MemberCatalogCard }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.media?.href]);

  return (
    <div
      className="grid place-items-center bg-paper-2"
      style={{ aspectRatio: "4 / 3", borderBottom: "1px solid var(--rule)" }}
    >
      {product.media && !failed ? (
        <img
          src={product.media.href}
          alt={product.media.altText}
          loading="lazy"
          className="h-full w-full"
          style={{ objectFit: "contain" }}
          onError={() => setFailed(true)}
        />
      ) : (
        <p className="body-s text-ink-mute max-w-[28ch] px-4 text-center" role="status">
          Approved product image is not available.
        </p>
      )}
    </div>
  );
}

function PeptideCatalogCard({ product }: { product: MemberCatalogCard }) {
  const access = cardAccessPresentation(product);
  const price = formatEligibleCardPrice(product);

  return (
    <li
      className="card grid content-start gap-4 overflow-hidden p-0"
      data-testid={`peptide-card-${product.id}`}
      data-access-state={access.state}
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <ProductMedia product={product} />
      <div className="grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div style={{ minWidth: 0 }}>
            <p className="mono-label text-ink-mute">{product.category}</p>
            <h3 className="body-l font-700 mt-1">
              <Link href={`/research/member/products/${product.slug}`}>
                {product.displayName}
              </Link>
            </h3>
          </div>
          <ResearchStatusBadge label={access.label} tone={access.tone} />
        </div>

        <p className="body-s text-ink-2">{product.summary}</p>

        <dl className="grid gap-3 body-s sm:grid-cols-2">
          <div>
            <dt className="mono-label text-ink-mute">Exact variants</dt>
            <dd className="mt-1 tabular">{product.variantCount}</dd>
          </div>
          <div>
            <dt className="mono-label text-ink-mute">Current member price</dt>
            <dd className="mt-1 tabular">{price ?? "Not published"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="mono-label text-ink-mute">Classification</dt>
            <dd className="mt-1">{product.classification}</dd>
          </div>
        </dl>

        <p className="body-s text-ink-mute">{access.note}</p>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/research/member/products/${product.slug}`}
            className="btn btn-secondary"
          >
            View details
          </Link>
          {access.canRequestAccess && (
            <Link
              href={productRequestHref("products", product.displayName)}
              className="btn btn-ghost"
            >
              Request access
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function stateCounts(products: readonly MemberCatalogCard[]) {
  const counts = new Map<PeptideAccessState, number>();
  for (const state of PEPTIDE_ACCESS_STATES) counts.set(state, 0);
  for (const product of products) {
    const state = cardAccessPresentation(product).state;
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return counts;
}

export function PeptideCatalogExperience({
  catalog,
  state = "ok",
  errorMessage,
  onRetry,
}: {
  catalog: MemberCatalog;
  state?: PeptideCatalogSurfaceState;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [accessState, setAccessState] = useState<PeptideAccessState | "all">("all");
  const [sort, setSort] = useState<MemberCatalogSort>("name_ascending");

  const peptideProducts = useMemo(
    () => catalog.items.filter(isPeptideCatalogCard),
    [catalog.items],
  );
  const categories = useMemo(
    () =>
      Array.from(new Set(peptideProducts.map((product) => product.category))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [peptideProducts],
  );
  const counts = useMemo(() => stateCounts(peptideProducts), [peptideProducts]);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return peptideProducts
      .filter((product) => {
        if (category !== "all" && product.category !== category) return false;
        if (
          accessState !== "all" &&
          cardAccessPresentation(product).state !== accessState
        ) {
          return false;
        }
        if (!normalizedQuery) return true;
        return [
          product.displayName,
          product.category,
          product.classification,
          ...product.aliases,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
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
  }, [accessState, category, peptideProducts, query, sort]);

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
    setAccessState("all");
    setSort("name_ascending");
  };

  return (
    <ResearchMemberShell
      eyebrow="Xenios Research catalog"
      title="Peptides and research materials"
      lead="Browse exact server-projected variants and truthful access states. Listings are not clinical recommendations, and a displayed price never establishes checkout eligibility."
      actions={
        <Link href={productRequestHref("products")} className="btn btn-primary">
          Request a peptide
        </Link>
      }
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={onRetry}
        unavailableTitle="The peptide catalog is not available right now."
        unavailableBody="The catalog remains closed until its authenticated server projection can be loaded."
      >
        <section className="card" aria-labelledby="peptide-catalog-state-summary">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="peptide-catalog-state-summary" className="body-l font-700">
                Catalog state
              </h2>
              <p className="body-s text-ink-2 mt-1">
                {peptideProducts.length} exact product records in this authenticated projection.
              </p>
            </div>
            <p className="body-s text-ink-mute">
              {counts.get("eligible") ?? 0} with a reconciled eligible variant
            </p>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PEPTIDE_ACCESS_STATES.filter(
              (item) => (counts.get(item) ?? 0) > 0 || item === "eligible",
            ).map((item) => (
              <div key={item}>
                <dt className="mono-label text-ink-mute">{ACCESS_LABELS[item]}</dt>
                <dd className="body-l tabular mt-1">{counts.get(item) ?? 0}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          className="card mt-5 grid gap-4 md:grid-cols-2"
          aria-label="Peptide catalog controls"
        >
          <label className="grid gap-2" htmlFor="peptide-catalog-search">
            <span className="form-label">Search peptides</span>
            <input
              id="peptide-catalog-search"
              className="input-field"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, category, or alias"
            />
          </label>
          <label className="grid gap-2" htmlFor="peptide-catalog-category">
            <span className="form-label">Category</span>
            <select
              id="peptide-catalog-category"
              className="input-field"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="all">All peptide categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2" htmlFor="peptide-catalog-access">
            <span className="form-label">Access state</span>
            <select
              id="peptide-catalog-access"
              className="input-field"
              value={accessState}
              onChange={(event) =>
                setAccessState(event.target.value as PeptideAccessState | "all")
              }
            >
              <option value="all">All truthful states</option>
              {PEPTIDE_ACCESS_STATES.map((item) => (
                <option key={item} value={item}>
                  {ACCESS_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2" htmlFor="peptide-catalog-sort">
            <span className="form-label">Sort</span>
            <select
              id="peptide-catalog-sort"
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

        <section className="mt-6" aria-labelledby="peptide-catalog-results">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="peptide-catalog-results" className="body-l font-700">
                Peptide catalog
              </h2>
              <p className="body-s text-ink-2 mt-1" role="status" aria-live="polite">
                {visible.length} {visible.length === 1 ? "product" : "products"}
              </p>
            </div>
            {(query || category !== "all" || accessState !== "all") && (
              <button type="button" className="btn btn-ghost" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>

          {peptideProducts.length === 0 ? (
            <div className="mt-4">
              <ResearchEmptyState
                title="No peptide records are published."
                body="Approved authenticated peptide records will appear here. No planning row is presented as orderable."
                action={
                  <Link href={productRequestHref("products")} className="btn btn-secondary">
                    Request a peptide
                  </Link>
                }
              />
            </div>
          ) : visible.length === 0 ? (
            <div className="mt-4">
              <ResearchEmptyState
                title="No peptide records match those filters."
                body="Change the filters or submit an access request. A request is not an order or availability promise."
                action={
                  <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                    Clear filters
                  </button>
                }
              />
            </div>
          ) : (
            <ul
              className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              style={{ listStyle: "none", margin: 0, padding: 0 }}
            >
              {visible.map((product) => (
                <PeptideCatalogCard key={product.id} product={product} />
              ))}
            </ul>
          )}
        </section>

        <ResearchSecureNotice>
          This private member surface displays only the authenticated server
          projection. Supplier notes, wholesale values, inventory quantities,
          locations, private media keys, and provider details are never rendered.
          There is no add-to-cart control in this component.
        </ResearchSecureNotice>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}

function DetailFact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="mono-label text-ink-mute">{label}</dt>
      <dd className="mt-1">{value?.trim() || "Not published"}</dd>
    </div>
  );
}

function lotDocumentationLabel(variant: MemberCatalogVariant): string {
  if (variant.lotCoaState === "verified") return "Exact-lot documentation verified";
  if (variant.lotCoaState === "not_applicable") return "Not applicable in server projection";
  return "Exact-lot documentation pending";
}

export function PeptideProductDetailExperience({
  product,
  state = "ok",
  errorMessage,
  onRetry,
}: {
  product: MemberProductDetail | null;
  state?: PeptideCatalogSurfaceState;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  const scopedProduct = product && isPeptideCatalogCard(product) ? product : null;
  const [selectedVariantId, setSelectedVariantId] = useState("");

  useEffect(() => {
    setSelectedVariantId(scopedProduct?.variants[0]?.id ?? "");
  }, [scopedProduct?.id, scopedProduct?.variants]);

  const selected = useMemo(
    () =>
      scopedProduct?.variants.find((variant) => variant.id === selectedVariantId) ??
      scopedProduct?.variants[0] ??
      null,
    [scopedProduct, selectedVariantId],
  );
  const access =
    scopedProduct && selected
      ? variantAccessPresentation(scopedProduct, selected)
      : scopedProduct
        ? cardAccessPresentation(scopedProduct)
        : null;
  const price =
    scopedProduct && selected
      ? formatEligibleVariantPrice(scopedProduct, selected)
      : null;
  const showIdentity = state === "ok" && scopedProduct !== null;

  return (
    <ResearchMemberShell
      eyebrow={showIdentity ? scopedProduct.category : "Peptide catalog"}
      title={showIdentity ? scopedProduct.displayName : "Peptide information"}
      lead={
        showIdentity
          ? scopedProduct.summary
          : "Approved peptide information appears after the exact authenticated record is loaded."
      }
      actions={
        showIdentity && access?.canRequestAccess ? (
          <Link
            href={productRequestHref("products", scopedProduct.displayName)}
            className="btn btn-primary"
          >
            Request access
          </Link>
        ) : undefined
      }
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={onRetry}
        unavailableTitle="This peptide record is not available."
        unavailableBody="Only an exact authenticated Product Control projection can appear here."
      >
        {scopedProduct === null ? (
          <ResearchEmptyState
            title="Peptide record not found."
            body="The record may not be a published peptide or research material, or the link may be incorrect."
            action={
              <Link href="/research/member/products" className="btn btn-secondary">
                Return to catalog
              </Link>
            }
          />
        ) : (
          <>
            <section className="card grid gap-6 md:grid-cols-2">
              <ProductMedia product={scopedProduct} />
              <div className="grid content-start gap-4" style={{ minWidth: 0 }}>
                <p className="mono-label text-ink-mute">{scopedProduct.classification}</p>
                {access && <ResearchStatusBadge label={access.label} tone={access.tone} />}

                {scopedProduct.variants.length > 0 ? (
                  <label className="grid gap-2" htmlFor="peptide-detail-variant">
                    <span className="form-label">Exact variant</span>
                    <select
                      id="peptide-detail-variant"
                      className="input-field"
                      value={selected?.id ?? ""}
                      onChange={(event) => setSelectedVariantId(event.target.value)}
                    >
                      {scopedProduct.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variantIdentityLabel(variant)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <ResearchPendingPanel
                    kind="supplier_pending"
                    body="An exact approved variant, SKU, strength, and presentation are required."
                  />
                )}

                {selected && (
                  <>
                    <div role="status" aria-live="polite" data-testid="peptide-variant-state">
                      <p className="body-s text-ink-2">{access?.note}</p>
                    </div>
                    <dl className="grid gap-3 body-s sm:grid-cols-2">
                      <DetailFact label="Current member price" value={price} />
                      <DetailFact
                        label="Availability"
                        value={
                          selected.availability === "available"
                            ? "Server record available"
                            : "Not currently available"
                        }
                      />
                      <DetailFact label="Exact SKU" value={selected.sku} />
                      <DetailFact label="Exact strength" value={selected.strength} />
                      <DetailFact label="Exact presentation" value={selected.presentation} />
                      <DetailFact label="Size" value={selected.size} />
                      <DetailFact label="Format" value={selected.format} />
                      <DetailFact
                        label="Documentation"
                        value={lotDocumentationLabel(selected)}
                      />
                    </dl>
                  </>
                )}
              </div>
            </section>

            <div className="mt-5">
              <ResearchSecureNotice>
                This is private Research catalog information, not prescribing,
                dosing, reconstitution, cycling, treatment guidance, or a statement
                of clinical suitability. Checkout is not exposed by this component.
              </ResearchSecureNotice>
            </div>

            <section className="mt-6 grid gap-5" aria-label="Reviewed product information">
              {[
                ["Overview", scopedProduct.overview],
                ["Specifications", scopedProduct.specifications],
                ["Research information", scopedProduct.researchInformation],
                ["Storage", scopedProduct.storageInformation],
              ].map(([title, value]) => (
                <article key={title} className="card">
                  <h2 className="body-l font-700">{title}</h2>
                  <p className="body-s text-ink-2 mt-3 max-w-[68ch]">
                    {value || "Reviewed content is pending."}
                  </p>
                </article>
              ))}
            </section>

            <section className="mt-6 card" aria-labelledby="related-peptides">
              <h2 id="related-peptides" className="body-l font-700">
                Related peptides and research materials
              </h2>
              {scopedProduct.relatedProducts.filter(isPeptideCatalogCard).length > 0 ? (
                <ul className="mt-3 grid gap-3" style={{ listStyle: "none", padding: 0 }}>
                  {scopedProduct.relatedProducts
                    .filter(isPeptideCatalogCard)
                    .map((related) => (
                      <li
                        key={related.id}
                        className="flex flex-wrap items-center justify-between gap-3"
                      >
                        <span className="body-s font-700">{related.displayName}</span>
                        <Link
                          href={`/research/member/products/${related.slug}`}
                          className="btn btn-ghost"
                        >
                          View details
                        </Link>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="body-s text-ink-2 mt-3">
                  No related peptide records are published.
                </p>
              )}
            </section>
          </>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
