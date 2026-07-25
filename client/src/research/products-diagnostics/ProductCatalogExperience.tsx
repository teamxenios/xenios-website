import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FlaskConical,
  Search,
  ShieldCheck,
} from "lucide-react";
import { productRequestHref } from "../../../../server/research/products-diagnostics/product-request-sources";

export const PRODUCT_FAMILY_OPTIONS = [
  ["all_products", "All Products"],
  ["research_vials", "Research Vials"],
  ["blends", "Blends"],
  ["supplements", "Supplements"],
  ["programs", "Programs"],
  ["quantum", "Quantum"],
  ["laboratory_supplies", "Laboratory Supplies"],
  ["diagnostics", "Diagnostics"],
  ["clinician_guided_care", "Clinician-Guided Care"],
  ["storage_and_organization", "Storage and Organization"],
] as const;

export type ProductFamilyFilter = (typeof PRODUCT_FAMILY_OPTIONS)[number][0];

export type ProductCardView = {
  slug: string;
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

function StatusPill({ label }: { label: ProductCardView["statusLabel"] }) {
  const positive = label === "Available";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
        positive
          ? "border-emerald-300/40 bg-emerald-50 text-emerald-800"
          : "border-slate-300 bg-slate-50 text-slate-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${positive ? "bg-emerald-500" : "bg-slate-400"}`} />
      {label}
    </span>
  );
}

export function ProductCatalogExperience({ products }: { products: ProductCardView[] }) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<ProductFamilyFilter>("all_products");

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

  return (
    <section aria-labelledby="product-catalog-title" className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_55%,#ecfeff_100%)] p-6 shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">Member catalog</p>
        <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
          <div>
            <h1 id="product-catalog-title" className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Products with precise status, documentation, and access.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Browse the complete Xenios catalog. A listing becomes purchasable only when its product,
              documentation, inventory, and commerce gates are all confirmed.
            </p>
          </div>
          <Link href={productRequestHref("products")} className="btn btn-primary w-full justify-center">
            Request a product <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </div>

      <div className="sticky top-2 z-10 mt-6 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <label className="relative block">
          <span className="sr-only">Search products</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" size={18} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by product, family, or alias"
            className="input-field w-full pl-10"
          />
        </label>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Product families">
          {PRODUCT_FAMILY_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFamily(value)}
              aria-pressed={family === value}
              className={`shrink-0 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                family === value
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-lg font-semibold text-slate-950">No current listing matches that search.</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Submit a private request for evaluation. It is a demand signal, not an order,
            availability promise, or clinical recommendation.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href={productRequestHref("empty_search", query)} className="btn btn-primary">
              Request this product
            </Link>
            <button type="button" className="btn btn-secondary" onClick={() => setQuery("")}>
              Clear search
            </button>
          </div>
        </div>
      ) : (
        <ul className="mt-6 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((product) => (
            <li key={product.slug} className="group flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-xl bg-slate-100 p-2 text-slate-700">
                  <FlaskConical aria-hidden="true" size={18} />
                </span>
                <StatusPill label={product.statusLabel} />
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{product.familyLabel}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{product.displayName}</h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{product.summary}</p>
              {product.priceLabel && <p className="mt-4 text-sm font-semibold text-slate-900">{product.priceLabel}</p>}
              <Link
                href={`/research/member/products/${product.slug}`}
                className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-indigo-700"
              >
                View details <ArrowRight aria-hidden="true" size={15} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
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

export function ProductDetailExperience({ product }: { product: ProductDetailView }) {
  return (
    <article className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">{product.familyLabel}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">{product.displayName}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">{TEMPLATE_INTROS[product.templateClass]}</p>
        </div>
        <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <StatusPill label={product.statusLabel} />
          <p className="mt-4 text-sm leading-6 text-slate-600">{product.summary}</p>
          <Link href={productRequestHref("products", product.displayName)} className="btn btn-primary mt-5 w-full justify-center">
            Request an alternative
          </Link>
        </aside>
      </div>

      <nav className="mt-8 overflow-x-auto border-y border-slate-200 py-3" aria-label="Product sections">
        <ul className="flex min-w-max list-none gap-5 p-0 text-sm font-semibold text-slate-600">
          {DETAIL_SECTIONS.map((section) => (
            <li key={section}><a href={`#${section.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{section}</a></li>
          ))}
        </ul>
      </nav>

      <div className="mt-8 grid gap-5">
        <section id="overview" className="card">
          <h2 className="text-xl font-semibold text-slate-950">Overview</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{product.summary}</p>
        </section>
        <section id="specifications" className="card">
          <h2 className="text-xl font-semibold text-slate-950">Specifications</h2>
          {product.specifications.length ? (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {product.specifications.map((item) => (
                <div key={item.label} className="rounded-xl bg-slate-50 p-4">
                  <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.label}</dt>
                  <dd className="mt-1 text-sm text-slate-900">{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : <p className="mt-3 text-sm text-slate-600">Specifications are pending documentation review.</p>}
        </section>
        <section id="certificate-of-analysis" className="card">
          <div className="flex items-start gap-3">
            <FileCheck2 className="mt-0.5 text-indigo-700" aria-hidden="true" />
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Certificate of Analysis</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Certificates are private, signed, and linked only to the exact lot code on the product.
                Documentation pending is shown when an exact-lot document is not on file.
              </p>
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                A reported purity result does not establish sterility, safety, potency, or suitability for human use.
              </p>
            </div>
          </div>
        </section>
        <section id="research-information" className="card">
          <h2 className="text-xl font-semibold text-slate-950">Research Information</h2>
          {product.researchInformation.length ? (
            <ul className="mt-3 grid gap-2 pl-5 text-sm leading-6 text-slate-600">
              {product.researchInformation.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : <p className="mt-3 text-sm text-slate-600">Research information is under review.</p>}
        </section>
        <section id="storage-and-handling" className="card">
          <h2 className="text-xl font-semibold text-slate-950">Storage and Handling</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{product.storageAndHandling ?? "Storage documentation is pending."}</p>
        </section>
        <section id="shipping-and-returns" className="card">
          <h2 className="text-xl font-semibold text-slate-950">Shipping and Returns</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{product.shippingAndReturns ?? "Shipping and returns details are pending final review."}</p>
        </section>
        <section id="documentation" className="card">
          <h2 className="text-xl font-semibold text-slate-950">Documentation</h2>
          <ul className="mt-4 grid list-none gap-3 p-0">
            {product.documentation.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck size={16} aria-hidden="true" /> {item.label}
                </span>
                <span className="text-sm text-slate-600">{item.state}</span>
              </li>
            ))}
          </ul>
        </section>
        <section id="related-products" className="card">
          <h2 className="text-xl font-semibold text-slate-950">Related Products</h2>
          {product.relatedProducts.length ? (
            <ul className="mt-4 grid list-none gap-3 p-0 sm:grid-cols-2">
              {product.relatedProducts.map((item) => (
                <li key={item.slug} className="rounded-xl border border-slate-200 p-4">
                  <p className="font-semibold text-slate-950">{item.displayName}</p>
                  <Link href={`/research/member/products/${item.slug}`} className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-indigo-700">
                    View <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-slate-600">No related products are published yet.</p>}
        </section>
        <section id="request-an-alternative" className="rounded-2xl bg-slate-950 p-6 text-white">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Request an Alternative</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Tell the team what you are looking for. A request does not create an order, product,
                inventory, availability promise, or clinical recommendation.
              </p>
            </div>
            <Link href={productRequestHref("products", product.displayName)} className="btn btn-primary shrink-0">
              Start request <CheckCircle2 size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </article>
  );
}
