import { useMemo, useState } from "react";
import { Link } from "wouter";
import { productRequestHref } from "@shared/research/product-request-sources";
import type {
  MemberCatalogVariant,
  MemberProductDetail,
} from "@shared/research/member-catalog";
import { getProductEducationProfile } from "../content/productEducation";
import { ResearchMemberShell } from "../ui/shells";
import {
  ResearchEmptyState,
  ResearchPendingPanel,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../ui/kit";
import type { MemberCatalogSurfaceState } from "./MemberCatalogExperience";

function pricePresentation(
  variant: MemberCatalogVariant,
  product: MemberProductDetail,
): { label: string; value: string } {
  if (variant.price === null || variant.price.amountCents <= 0) {
    if (product.lane === "future_clinical") {
      return { label: "Pricing", value: "Pricing shown after clinical review" };
    }
    if (product.displayState === "catalog_only") {
      return { label: "Pricing", value: "Price on request" };
    }
    return { label: "Pricing", value: "Price not currently available" };
  }
  return {
    label: product.lane === "future_clinical" ? "Medication price" : "Member price",
    value: new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: variant.price.currency,
    }).format(variant.price.amountCents / 100),
  };
}

function EducationList({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 grid gap-2 pl-5 body-s text-ink-2">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function EducationSection({
  title,
  text,
  items,
}: {
  title: string;
  text?: string | null;
  items?: readonly string[];
}) {
  if (!text && (!items || items.length === 0)) return null;
  return (
    <section className="py-6" style={{ borderTop: "1px solid var(--rule)" }}>
      <h2 className="body-l font-700">{title}</h2>
      {text && <p className="body-s text-ink-2 mt-3 max-w-[72ch]">{text}</p>}
      {items && <EducationList items={items} />}
    </section>
  );
}

function formatSourceReviewDate(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return fallback;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function lotCoaLabel(state: MemberCatalogVariant["lotCoaState"]): string {
  if (state === "verified") return "Exact-lot documentation verified";
  if (state === "not_applicable") return "Lot documentation not applicable";
  return "Exact-lot documentation required";
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
  const education = useMemo(
    () =>
      product
        ? getProductEducationProfile({
            canonicalName: product.canonicalName,
            displayName: product.displayName,
            aliases: product.aliases,
            lane: product.lane,
            variantLabel: selected?.label,
          })
        : null,
    [product, selected?.label],
  );
  const selectedPrice = selected && product ? pricePresentation(selected, product) : null;
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
                  <img
                    src={product.media.href}
                    alt={product.media.altText}
                    width={4}
                    height={3}
                    decoding="async"
                    className="w-full"
                    style={{ aspectRatio: "4 / 3", objectFit: "contain" }}
                  />
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
                  <div className="grid gap-3">
                    <ResearchPendingPanel
                      kind="supplier_pending"
                      body="An exact approved Product Control variant and SKU are required."
                    />
                    {product.lane === "future_clinical" && (
                      <p className="body-s text-ink-2">Pricing shown after clinical review</p>
                    )}
                  </div>
                )}

                {selected && selectedPrice && (
                  <dl className="grid gap-3 body-s sm:grid-cols-2">
                    <div>
                      <dt className="mono-label text-ink-mute">{selectedPrice.label}</dt>
                      <dd className="mt-1 tabular">{selectedPrice.value}</dd>
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

            {education && <div className="mt-6">
              <EducationSection title="Overview" text={product.overview || product.summary} />
              <EducationSection title="What it is" text={education.whatItIs} />
              <EducationSection title="Why people are interested" text={education.whyPeopleAreInterested} />
              <EducationSection title="Commonly discussed goals" items={education.commonlyDiscussedGoals} />
              <EducationSection title="Research areas being investigated" items={education.researchAreas} />
              <EducationSection title="How researchers think it may work" text={education.mechanismContext} />
              <EducationSection title="What researchers have observed" text={education.observedResearch} />
              <EducationSection
                title="Where the evidence comes from"
                text={[education.evidenceSourceSummary, product.researchInformation].filter(Boolean).join(" ")}
              />
              <EducationSection title="What human evidence exists" text={education.humanEvidence} />
              <EducationSection title="Evidence strength" text={education.evidenceLabel} />
              <EducationSection title="What remains unknown" items={education.unknowns} />
              <EducationSection title="What this does not prove" items={education.doesNotProve} />
              <EducationSection title="Potential clinical relevance under licensed care" text={education.potentialClinicalRelevance} />
              <EducationSection
                title="Current regulatory and clinical status"
                text={[education.regulatoryAndClinicalStatus, product.disclaimers].filter(Boolean).join(" ")}
              />
              <EducationSection
                title="Research and Care availability"
                items={[education.researchAvailability, education.careAvailability]}
              />
              <EducationSection title="Specifications" text={product.specifications} />
              <EducationSection
                title="Certificate of Analysis"
                items={selected ? [lotCoaLabel(selected.lotCoaState), "A Certificate of Analysis documents specified quality attributes for an exact lot. It does not establish clinical suitability."] : []}
              />
              <EducationSection title="Storage and handling" text={product.storageInformation} />
              <EducationSection
                title="Shipping and returns"
                text={[product.shippingInformation, product.returnInformation].filter(Boolean).join(" ") || null}
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
              <EducationSection
                title="Sources and last reviewed"
                items={[
                  ...education.sourceNotes,
                  `Last reviewed: ${formatSourceReviewDate(product.reviewDate, education.lastReviewed)}`,
                ]}
              />
            </div>}
          </>
        )}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
