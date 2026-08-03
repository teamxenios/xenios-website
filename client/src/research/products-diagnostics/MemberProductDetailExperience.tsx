import { useMemo, useState } from "react";
import { Link } from "wouter";
import { productRequestHref } from "@shared/research/product-request-sources";
import type {
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
import type { MemberCatalogSurfaceState } from "./MemberCatalogExperience";

function formatPrice(variant: MemberCatalogVariant): string {
  if (variant.price === null) return "Price not currently available";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: variant.price.currency,
  }).format(variant.price.amountCents / 100);
}

function lotCoaLabel(state: MemberCatalogVariant["lotCoaState"]): string {
  if (state === "verified") return "Exact-lot documentation verified";
  if (state === "not_applicable") return "Lot documentation not applicable";
  return "Exact-lot documentation required";
}

// The one media renderer for the detail view. Signed hrefs expire five
// minutes after the fetch that minted them, so a load can fail on a stale
// tab; the failure state is the same truthful pending panel the page shows
// when no approved image exists, never the browser's broken-image icon.
function ProductMedia({ media }: { media: NonNullable<MemberProductDetail["media"]> }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <ResearchPendingPanel
        kind="supplier_pending"
        body="An approved product image is not available."
      />
    );
  }
  return (
    <img
      src={media.href}
      alt={media.altText}
      onError={() => setFailed(true)}
      className="w-full"
      style={{ aspectRatio: "4 / 3", objectFit: "contain" }}
    />
  );
}

function FactSection({
  title,
  value,
  pending,
}: {
  title: string;
  value: string | null;
  pending: string;
}) {
  return (
    <section className="py-6" style={{ borderTop: "1px solid var(--rule)" }}>
      <h2 className="body-l font-700">{title}</h2>
      {value ? (
        <p className="body-s text-ink-2 mt-3 max-w-[68ch]">{value}</p>
      ) : (
        <div className="mt-3">
          <ResearchPendingPanel kind="supplier_pending" body={pending} />
        </div>
      )}
    </section>
  );
}

export function MemberProductDetailExperience({
  product,
  state = "ok",
  errorMessage,
  onRetry,
}: {
  product: MemberProductDetail | null;
  state?: MemberCatalogSurfaceState;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState(
    product?.variants[0]?.id ?? "",
  );
  const selected = useMemo(
    () =>
      product?.variants.find((variant) => variant.id === selectedVariantId) ??
      product?.variants[0] ??
      null,
    [product, selectedVariantId],
  );
  const showProductIdentity = state === "ok" && product !== null;

  return (
    <ResearchMemberShell
      eyebrow={showProductIdentity ? product.category : "Product catalog"}
      title={showProductIdentity ? product.displayName : "Product information"}
      lead={
        showProductIdentity
          ? product.summary
          : "Approved product information appears after the exact catalog record is loaded."
      }
      actions={
        showProductIdentity &&
        product.lane !== "future_clinical" &&
        product.lane !== "non_product_program" ? (
          <Link
            href={productRequestHref("products", product.displayName)}
            className="btn btn-primary"
          >
            Request an alternative
          </Link>
        ) : undefined
      }
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={onRetry}
        unavailableTitle="This product is not available."
        unavailableBody="Only an exact published and public Product Control record can appear here."
      >
        {product === null ? (
          <ResearchEmptyState
            title="Product not found."
            body="The product may no longer be published, or the link may be incorrect."
            action={
              <Link href="/research/member/products" className="btn btn-secondary">
                Return to products
              </Link>
            }
          />
        ) : (
          <>
            <section className="card grid gap-6 md:grid-cols-2">
              <div style={{ minWidth: 0 }}>
                {product.media ? (
                  <ProductMedia key={product.media.mediaId} media={product.media} />
                ) : (
                  <ResearchPendingPanel
                    kind="supplier_pending"
                    body="An approved product image is not available."
                  />
                )}
              </div>
              <div className="grid content-start gap-4" style={{ minWidth: 0 }}>
                <p className="mono-label text-ink-mute">{product.classification}</p>
                <ResearchStatusBadge
                  label={
                    product.displayState === "available"
                      ? "Available"
                      : product.displayState === "catalog_only"
                        ? "Catalog information"
                        : product.displayState === "documentation_pending"
                          ? "Documentation pending"
                          : product.displayState === "pricing_pending"
                            ? "Pricing pending"
                            : "Unavailable"
                  }
                  tone={product.displayState === "available" ? "success" : "pending"}
                />

                {product.variants.length ? (
                  <label className="grid gap-2" htmlFor="member-product-variant">
                    <span className="form-label">Variant</span>
                    <select
                      id="member-product-variant"
                      className="input-field"
                      value={selected?.id ?? ""}
                      onChange={(event) => setSelectedVariantId(event.target.value)}
                    >
                      {product.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.label} — {variant.sku}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <ResearchPendingPanel
                    kind="supplier_pending"
                    body="An exact approved Product Control variant and SKU are required."
                  />
                )}

                {selected && (
                  <dl className="grid gap-3 body-s sm:grid-cols-2">
                    <div>
                      <dt className="mono-label text-ink-mute">Member price</dt>
                      <dd className="mt-1 tabular">{formatPrice(selected)}</dd>
                    </div>
                    <div>
                      <dt className="mono-label text-ink-mute">Availability</dt>
                      <dd className="mt-1">
                        {selected.availability === "available"
                          ? "Available"
                          : "Not currently available"}
                      </dd>
                    </div>
                    <div>
                      <dt className="mono-label text-ink-mute">SKU</dt>
                      <dd className="mt-1">{selected.sku}</dd>
                    </div>
                    <div>
                      <dt className="mono-label text-ink-mute">
                        Certificate status
                      </dt>
                      <dd className="mt-1">{lotCoaLabel(selected.lotCoaState)}</dd>
                    </div>
                  </dl>
                )}
                <p className="body-s text-ink-mute">
                  Ordering appears only after current product, price,
                  documentation, and availability checks pass.
                </p>
              </div>
            </section>

            {product.researchOnlyBoundary && (
              <div className="mt-5">
                <ResearchSecureNotice>
                  This is Research catalog information. It is not prescribing,
                  dosing guidance, treatment, or a statement of clinical
                  suitability.
                </ResearchSecureNotice>
              </div>
            )}

            <div className="mt-6">
              <FactSection
                title="Overview"
                value={product.overview}
                pending="Approved overview content is required before it can be displayed."
              />
              <FactSection
                title="Specifications"
                value={product.specifications}
                pending="Approved product specifications are required."
              />
              <FactSection
                title="Research information"
                value={product.researchInformation}
                pending="Reviewed Research information is required."
              />
              <FactSection
                title="Storage"
                value={product.storageInformation}
                pending="Approved storage information is required."
              />
              <FactSection
                title="Shipping and returns"
                value={
                  [product.shippingInformation, product.returnInformation]
                    .filter(Boolean)
                    .join(" ") || null
                }
                pending="Approved shipping and return information is required."
              />
              <section
                className="py-6"
                style={{ borderTop: "1px solid var(--rule)" }}
              >
                <h2 className="body-l font-700">Related products</h2>
                {product.relatedProducts.length ? (
                  <ul
                    className="mt-3 grid gap-3"
                    style={{ listStyle: "none", padding: 0 }}
                  >
                    {product.relatedProducts.map((related) => (
                      <li
                        key={related.id}
                        className="flex flex-wrap items-center justify-between gap-3"
                      >
                        <span className="body-s font-700">
                          {related.displayName}
                        </span>
                        <Link
                          href={`/research/member/products/${related.slug}`}
                          className="btn btn-ghost"
                        >
                          View product
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="body-s text-ink-2 mt-3">
                    No related products are published.
                  </p>
                )}
              </section>
            </div>
          </>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
