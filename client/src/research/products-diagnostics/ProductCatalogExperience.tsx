import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { productRequestHref } from "@shared/research/product-request-sources";
import type { RequiredInput } from "@shared/research/required-inputs";
import { ResearchMemberShell } from "../ui/shells";
import {
  ResearchEmptyState,
  ResearchFilterBar,
  ResearchPendingPanel,
  ResearchRouteBoundary,
  ResearchSearch,
  ResearchSecureNotice,
  ResearchStatusBadge,
  ResearchTabs,
  type BadgeTone,
} from "../ui/kit";
import {
  Website3RequiredInputNotice,
  Website3RequiredInputValue,
} from "./RequiredInputState";

export const PRODUCT_FAMILY_OPTIONS = [
  ["all_products", "All products"],
  ["research_vials", "Research vials"],
  ["blends", "Blends"],
  ["supplements", "Supplements"],
  ["programs", "Programs"],
  ["quantum", "Quantum"],
  ["laboratory_supplies", "Laboratory supplies"],
  ["diagnostics", "Diagnostics"],
  ["clinician_guided_care", "Clinician-guided care"],
  ["storage_and_organization", "Storage and organization"],
] as const;

export type ProductFamilyFilter = (typeof PRODUCT_FAMILY_OPTIONS)[number][0];
export type Website3SurfaceState = "loading" | "ok" | "error" | "unavailable";

export type ProductCardView = {
  slug: string;
  requiredInputRecordId?: string | null;
  displayName: string;
  family: Exclude<ProductFamilyFilter, "all_products">;
  familyLabel: string;
  statusLabel:
    | "Available"
    | "Request access"
    | "Coming soon"
    | "Documentation pending"
    | "Out of stock"
    | "Under review"
    | "Clinician pathway pending"
    | "Not currently offered";
  summary: string;
  priceLabel: string | null;
  aliases?: string[];
};

export type ProductDetailView = ProductCardView & {
  templateClass:
    | "research_material"
    | "blend"
    | "supplement"
    | "program"
    | "quantum"
    | "laboratory_supply"
    | "diagnostic"
    | "clinician_guided_care"
    | "storage_accessory";
  specifications: Array<{ label: string; value: string }>;
  researchInformation: string[];
  storageAndHandling: string | null;
  shippingAndReturns: string | null;
  documentation: Array<{ label: string; state: string }>;
  relatedProducts: ProductCardView[];
};

function statusTone(label: ProductCardView["statusLabel"]): BadgeTone {
  if (label === "Available") return "success";
  if (label === "Out of stock" || label === "Not currently offered") return "warning";
  if (label === "Coming soon" || label === "Clinician pathway pending") return "pending";
  return "neutral";
}

function ProductCard({
  product,
  compared,
  compareDisabled,
  onToggleCompare,
  requiredInputs,
}: {
  product: ProductCardView;
  compared: boolean;
  compareDisabled: boolean;
  onToggleCompare: () => void;
  requiredInputs?: readonly RequiredInput[];
}) {
  return (
    <li className="card" data-testid={`website3-product-${product.slug}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div style={{ minWidth: 0 }}>
          <p className="mono-label text-ink-mute">{product.familyLabel}</p>
          <h2 className="body-m font-700 mt-1">
            <Link href={`/research/member/products/${product.slug}`}>{product.displayName}</Link>
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[64ch]">{product.summary}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ResearchStatusBadge label={product.statusLabel} tone={statusTone(product.statusLabel)} />
          {requiredInputs ? (
            <p className="body-s text-ink-2">
              <Website3RequiredInputValue
                value={product.priceLabel}
                slot="retailPrice"
                items={requiredInputs}
                recordId={product.requiredInputRecordId}
              />
            </p>
          ) : product.priceLabel ? (
            <p className="body-s tabular text-ink-2">{product.priceLabel}</p>
          ) : (
            <p className="body-s text-ink-mute">Pricing not confirmed</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={`/research/member/products/${product.slug}`} className="btn btn-secondary">
          View product
        </Link>
        <button
          type="button"
          className="btn btn-ghost"
          aria-pressed={compared}
          disabled={compareDisabled && !compared}
          onClick={onToggleCompare}
        >
          {compared ? "Remove from compare" : "Add to compare"}
        </button>
      </div>
    </li>
  );
}

export function ProductComparePanel({
  products,
  onClear,
}: {
  products: ProductCardView[];
  onClear: () => void;
}) {
  if (products.length === 0) return null;
  return (
    <section className="card mt-5" aria-labelledby="product-compare-title" data-testid="website3-product-compare">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mono-label text-ink-mute">Compare products</p>
          <h2 id="product-compare-title" className="body-m font-700 mt-1">
            {products.length < 2 ? "Select one more product" : `${products.length} products selected`}
          </h2>
          <p className="body-s text-ink-2 mt-2">
            Compare only published catalog facts. Status and pricing remain subject to their server-authoritative gates.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClear}>Clear comparison</button>
      </div>
      {products.length >= 2 && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <article key={product.slug} className="py-3" style={{ borderTop: "1px solid var(--rule)" }}>
              <p className="body-m font-700">{product.displayName}</p>
              <dl className="mt-3 grid gap-3 body-s">
                <div>
                  <dt className="mono-label text-ink-mute">Family</dt>
                  <dd className="mt-1">{product.familyLabel}</dd>
                </div>
                <div>
                  <dt className="mono-label text-ink-mute">Status</dt>
                  <dd className="mt-1"><ResearchStatusBadge label={product.statusLabel} tone={statusTone(product.statusLabel)} /></dd>
                </div>
                <div>
                  <dt className="mono-label text-ink-mute">Price</dt>
                  <dd className="mt-1">{product.priceLabel ?? "Pricing not confirmed"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProductCatalogExperience({
  products,
  state = "ok",
  errorMessage,
  onRetry,
  initialFamily = "all_products",
  requiredInputs,
}: {
  products: ProductCardView[];
  state?: Website3SurfaceState;
  errorMessage?: string;
  onRetry?: () => void;
  initialFamily?: ProductFamilyFilter;
  requiredInputs?: readonly RequiredInput[];
}) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<ProductFamilyFilter>(initialFamily);
  const [comparedSlugs, setComparedSlugs] = useState<string[]>([]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      if (family !== "all_products" && product.family !== family) return false;
      if (!q) return true;
      return [
        product.displayName,
        product.familyLabel,
        product.statusLabel,
        ...(product.aliases ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [family, products, query]);

  const comparedProducts = useMemo(
    () => comparedSlugs.flatMap((slug) => {
      const product = products.find((candidate) => candidate.slug === slug);
      return product ? [product] : [];
    }),
    [comparedSlugs, products],
  );

  const toggleCompare = (slug: string) => {
    setComparedSlugs((current) => {
      if (current.includes(slug)) return current.filter((item) => item !== slug);
      if (current.length >= 3) return current;
      return [...current, slug];
    });
  };

  return (
    <ResearchMemberShell
      eyebrow="Renew 360 catalog"
      title="Products"
      lead="Browse the Xenios catalog with clear availability and documentation status. Ordering appears only after every product, inventory, documentation, and commerce gate is confirmed."
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
        unavailableBody="The catalog is being prepared. Nothing is wrong with your membership, and no unavailable product is being presented as orderable."
      >
        <ResearchFilterBar>
          <ResearchSearch
            value={query}
            onChange={setQuery}
            label="Search products"
            placeholder="Search the catalog"
          />
        </ResearchFilterBar>
        <ResearchTabs
          tabs={PRODUCT_FAMILY_OPTIONS.map(([key, label]) => ({ key, label }))}
          active={family}
          onSelect={(key) => setFamily(key as ProductFamilyFilter)}
          label="Product families"
        />

        <ProductComparePanel products={comparedProducts} onClear={() => setComparedSlugs([])} />

        <section className="mt-6" aria-label="Product list">
          {products.length === 0 ? (
            <ResearchEmptyState
              title="No products are published yet."
              body="The catalog appears here as products clear review. Nothing is wrong with your membership."
              action={
                <Link href={productRequestHref("products")} className="btn btn-secondary">
                  Request a product
                </Link>
              }
            />
          ) : visible.length === 0 ? (
            <ResearchEmptyState
              title="We do not currently have that product in the catalog."
              body="You can ask the research team to evaluate it. A request is a demand signal, not an order or availability promise."
              action={
                <span className="flex flex-wrap gap-3">
                  <Link href={productRequestHref("empty_search", query)} className="btn btn-primary">
                    Request this product
                  </Link>
                  <button type="button" className="btn btn-secondary" onClick={() => setQuery("")}>
                    Clear search
                  </button>
                </span>
              }
            />
          ) : (
            <ul className="grid gap-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {visible.map((product) => (
                <ProductCard
                  key={product.slug}
                  product={product}
                  compared={comparedSlugs.includes(product.slug)}
                  compareDisabled={comparedSlugs.length >= 3}
                  onToggleCompare={() => toggleCompare(product.slug)}
                  requiredInputs={requiredInputs}
                />
              ))}
            </ul>
          )}
        </section>

        <ResearchSecureNotice>
          Product status and documentation are shown from approved records. A listing does not imply
          clinical suitability or availability outside its stated gate.
        </ResearchSecureNotice>

        <section className="mt-8 pt-7" style={{ borderTop: "1px solid var(--rule)" }} aria-labelledby="website3-related-areas">
          <h2 id="website3-related-areas" className="body-l font-700">Related member areas</h2>
          <p className="body-s text-ink-2 mt-2 max-w-[64ch]">
            Review truthful Pending pathways, diagnostics, product documentation, and neutral storage resources.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/research/member/supplements" className="btn btn-secondary">Supplements</Link>
            <Link href="/research/member/diagnostics" className="btn btn-secondary">Diagnostics</Link>
            <Link href="/research/member/metabolic-care" className="btn btn-secondary">Metabolic pathways</Link>
            <Link href="/research/member/education" className="btn btn-ghost">Product documentation</Link>
            <Link href="/research/member/storage" className="btn btn-ghost">Storage resources</Link>
            <Link href="/research/member/support" className="btn btn-ghost">Support Center</Link>
          </div>
        </section>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}

const TEMPLATE_INTROS: Record<ProductDetailView["templateClass"], string> = {
  research_material: "Research-only listing with lot-specific documentation and evidence boundaries.",
  blend: "Multi-component research listing with component-level documentation requirements.",
  supplement: "Consumer supplement listing with formula, channel, and claims review gates.",
  program: "Standalone educational or lifestyle program, separate from research and clinical products.",
  quantum: "Quantum listing held behind its own operating and commerce approval gate.",
  laboratory_supply: "Neutral laboratory supply listing; not positioned for human administration.",
  diagnostic: "Diagnostics listing with partner, collection, availability, and effective-date controls.",
  clinician_guided_care: "Clinician-guided pathway presented separately from research commerce.",
  storage_accessory: "Neutral storage and organization accessory; not an administration supply.",
};

const DETAIL_SECTIONS = [
  "Overview",
  "Specifications",
  "Certificate of Analysis",
  "Research Information",
  "Storage and Handling",
  "Shipping and Returns",
  "Documentation",
  "Related Products",
  "Request an Alternative",
] as const;

function sectionId(label: string): string {
  return label.toLowerCase().replace(/[^a-z]+/g, "-");
}

function DetailSection({
  title,
  children,
}: {
  title: (typeof DETAIL_SECTIONS)[number];
  children: ReactNode;
}) {
  return (
    <section id={sectionId(title)} className="py-6" style={{ borderTop: "1px solid var(--rule)" }}>
      <h2 className="body-l font-700">{title}</h2>
      <div className="body-s text-ink-2 mt-3 max-w-[68ch]">{children}</div>
    </section>
  );
}

function CertificateAccessPanel({
  onRequest,
}: {
  onRequest: (lotCode: string) => Promise<string>;
}) {
  const [lotCode, setLotCode] = useState("");
  const [phase, setPhase] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; signedUrl: string }
    | { kind: "error" }
  >({ kind: "idle" });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = lotCode.trim();
    if (!normalized) return;
    setPhase({ kind: "loading" });
    try {
      const signedUrl = await onRequest(normalized);
      setPhase({ kind: "ready", signedUrl });
    } catch {
      setPhase({ kind: "error" });
    }
  };

  return (
    <form className="card mt-4" onSubmit={(event) => void submit(event)}>
      <label className="grid gap-2" htmlFor="website3-lot-code">
        <span className="form-label">Exact lot code</span>
        <input
          id="website3-lot-code"
          className="input-field"
          value={lotCode}
          onChange={(event) => setLotCode(event.target.value)}
          autoComplete="off"
          maxLength={120}
          required
        />
      </label>
      <button
        type="submit"
        className="btn btn-secondary mt-4"
        disabled={phase.kind === "loading" || !lotCode.trim()}
      >
        {phase.kind === "loading" ? "Checking exact lot..." : "Request certificate access"}
      </button>
      <div className="body-s mt-3" aria-live="polite">
        {phase.kind === "ready" && (
          <p role="status">
            Exact-lot certificate verified.{" "}
            <a
              href={phase.signedUrl}
              target="_blank"
              rel="noreferrer"
              className="font-700"
            >
              Open the private certificate
            </a>
            .
          </p>
        )}
        {phase.kind === "error" && (
          <p role="alert">
            No accessible certificate was verified for that exact lot. Check the
            lot code or try again later.
          </p>
        )}
      </div>
    </form>
  );
}

export function ProductDetailExperience({
  product,
  ordering,
  onCertificateRequest,
  state = "ok",
  errorMessage,
  onRetry,
  requiredInputs,
}: {
  product: ProductDetailView;
  ordering?: ReactNode;
  onCertificateRequest?: (lotCode: string) => Promise<string>;
  state?: Website3SurfaceState;
  errorMessage?: string;
  onRetry?: () => void;
  requiredInputs?: readonly RequiredInput[];
}) {
  return (
    <ResearchMemberShell
      eyebrow={product.familyLabel}
      title={product.displayName}
      lead={TEMPLATE_INTROS[product.templateClass]}
      actions={
        <Link href={productRequestHref("products", product.displayName)} className="btn btn-secondary">
          Request an alternative
        </Link>
      }
    >
      <ResearchRouteBoundary
        state={state}
        errorMessage={errorMessage}
        onRetry={onRetry}
        unavailableTitle="This product page is not available right now."
        unavailableBody="The listing remains unavailable until its current records can be verified."
      >
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <ResearchStatusBadge label={product.statusLabel} tone={statusTone(product.statusLabel)} />
              <p className="body-s text-ink-2 mt-3 max-w-[60ch]">{product.summary}</p>
            </div>
            <p className="body-m tabular">
              {requiredInputs ? (
                <Website3RequiredInputValue
                  value={product.priceLabel}
                  slot="retailPrice"
                  items={requiredInputs}
                  recordId={product.requiredInputRecordId}
                />
              ) : (
                product.priceLabel ?? "Pricing not confirmed"
              )}
            </p>
          </div>
        </div>

        <nav className="ra-subnav mt-5" aria-label="Product sections">
          {DETAIL_SECTIONS.map((section) => (
            <a key={section} href={`#${sectionId(section)}`} className="ra-subnav-link">
              {section}
            </a>
          ))}
        </nav>

        <div className="mt-4">
          <DetailSection title="Overview">
            <p>{product.summary}</p>
            {ordering && <div className="mt-5">{ordering}</div>}
          </DetailSection>

          <DetailSection title="Specifications">
            {product.specifications.length ? (
              <dl className="grid gap-3 sm:grid-cols-2">
                {product.specifications.map((item) => (
                  <div key={item.label}>
                    <dt className="mono-label text-ink-mute">{item.label}</dt>
                    <dd className="mt-1">{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <ResearchPendingPanel
                kind="supplier_pending"
                title="Specifications are pending documentation review."
                body="Only confirmed specifications will appear here."
              />
            )}
          </DetailSection>

          <DetailSection title="Certificate of Analysis">
            <p>
              Certificates are private, signed, and linked only to the exact lot code on the product.
              Documentation pending is shown when an exact-lot document is not on file.
            </p>
            {onCertificateRequest ? (
              <CertificateAccessPanel onRequest={onCertificateRequest} />
            ) : requiredInputs ? (
              <div className="grid gap-4 mt-4 sm:grid-cols-2">
                <Website3RequiredInputNotice
                  slot="activeLot"
                  items={requiredInputs}
                  recordId={product.requiredInputRecordId}
                />
                <Website3RequiredInputNotice
                  slot="coaFile"
                  items={requiredInputs}
                  recordId={product.requiredInputRecordId}
                />
                <Website3RequiredInputNotice
                  slot="exactLotMatch"
                  items={requiredInputs}
                  recordId={product.requiredInputRecordId}
                />
                <Website3RequiredInputNotice
                  slot="qualityReview"
                  items={requiredInputs}
                  recordId={product.requiredInputRecordId}
                />
              </div>
            ) : (
              <div className="mt-4">
                <ResearchPendingPanel
                  kind="supplier_pending"
                  body="An exact-lot certificate action is unavailable until a verified lot record is present."
                />
              </div>
            )}
            <div className="mt-4">
              <ResearchPendingPanel
                kind="supplier_pending"
                body="A reported purity result does not establish sterility, safety, potency, or suitability for human use."
              />
            </div>
          </DetailSection>

          <DetailSection title="Research Information">
            {product.researchInformation.length ? (
              <ul className="grid gap-2 pl-5">
                {product.researchInformation.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : (
              <p>Research information is under review.</p>
            )}
          </DetailSection>

          <DetailSection title="Storage and Handling">
            {product.storageAndHandling ? (
              <p>{product.storageAndHandling}</p>
            ) : requiredInputs ? (
              <Website3RequiredInputNotice
                slot="storageInformation"
                items={requiredInputs}
                recordId={product.requiredInputRecordId}
              />
            ) : (
              <p>Storage documentation is pending.</p>
            )}
          </DetailSection>

          <DetailSection title="Shipping and Returns">
            <p>{product.shippingAndReturns ?? "Shipping and returns details are pending final review."}</p>
          </DetailSection>

          <DetailSection title="Documentation">
            {product.documentation.length ? (
              <dl className="grid gap-3">
                {product.documentation.map((item) => (
                  <div key={item.label} className="flex flex-wrap items-center justify-between gap-3">
                    <dt className="font-700">{item.label}</dt>
                    <dd><ResearchStatusBadge label={item.state} tone="neutral" /></dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>No documentation is published yet.</p>
            )}
          </DetailSection>

          <DetailSection title="Related Products">
            {product.relatedProducts.length ? (
              <ul className="grid gap-3" style={{ listStyle: "none", padding: 0 }}>
                {product.relatedProducts.map((item) => (
                  <li key={item.slug} className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-700">{item.displayName}</span>
                    <Link href={`/research/member/products/${item.slug}`} className="btn btn-ghost">
                      View product
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No related products are published yet.</p>
            )}
          </DetailSection>

          <DetailSection title="Request an Alternative">
            <p>
              Tell the team what you are looking for. A request does not create an order, product,
              inventory, availability promise, or clinical recommendation.
            </p>
            <Link href={productRequestHref("products", product.displayName)} className="btn btn-primary mt-4">
              Start request <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </DetailSection>
        </div>
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
