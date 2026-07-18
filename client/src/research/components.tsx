import { useState } from "react";
import { Link } from "wouter";
import type { Product } from "@shared/research/types";
import { canAddToCart, formatMoney, productActionLabel, useResearch } from "./core";

// xenios research: shared UI pieces, styled with the site's design tokens.

const STATUS_LABEL: Record<Product["status"], string> = {
  live: "Available",
  "professional-only": "Professional access",
  "request-access": "Request access",
  "coming-soon": "Coming soon",
  hold: "Research profile",
};

export function StatusBadge({ status }: { status: Product["status"] }) {
  return (
    <span className="mono-label text-ink-mute" data-testid={`badge-status-${status}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PageIntro({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <section className="container-x" style={{ paddingTop: 64, paddingBottom: 24 }}>
      <p className="mono-cap text-pulse mb-5">{eyebrow}</p>
      <h1 className="display-m text-balance max-w-[22ch]">{title}</h1>
      {lead && <p className="mt-6 body-l text-ink-2 max-w-[62ch]">{lead}</p>}
    </section>
  );
}

export function AddToCartButton({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { commerce, addItem } = useResearch();
  const [added, setAdded] = useState(false);
  const enabled = canAddToCart(product, commerce);
  const label = productActionLabel(product, commerce);

  if (!enabled) {
    // Commerce off or product not saleable: the action routes to access/waitlist
    // paths instead. No hidden purchase path exists (the server enforces too).
    const href = product.status === "hold" ? `/research/products/${product.slug}` : "/research/access";
    return (
      <Link href={href} className={`btn btn-secondary ${compact ? "" : "w-full sm:w-auto"}`} style={compact ? { height: 40, padding: "0 14px", fontSize: 13 } : undefined} data-testid={`button-action-${product.slug}`}>
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={`btn btn-primary ${compact ? "" : "w-full sm:w-auto"}`}
      style={compact ? { height: 40, padding: "0 14px", fontSize: 13 } : undefined}
      onClick={() => {
        addItem(product);
        setAdded(true);
        window.setTimeout(() => setAdded(false), 1200);
      }}
      data-testid={`button-add-${product.slug}`}
    >
      {added ? "Added" : label}
    </button>
  );
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="card flex flex-col gap-4" data-testid={`card-product-${product.slug}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="mono-cap text-ink-mute">{product.eyebrow}</p>
        <StatusBadge status={product.status} />
      </div>
      <div>
        <h3 className="h3">
          <Link href={`/research/products/${product.slug}`} className="hover:text-pulse transition-colors">
            {product.shortName || product.name}
          </Link>
        </h3>
        {product.size && <p className="mono-label text-ink-mute mt-1">{product.size}</p>}
      </div>
      <p className="body-s text-ink-2">{product.summary}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-2">
        <p className="body-s font-700 tabular">{formatMoney(product.priceCents)}</p>
        <Link href={`/research/products/${product.slug}`} className="btn btn-ghost" style={{ fontSize: 13 }}>
          View
        </Link>
      </div>
    </article>
  );
}

export function ProductGrid({ products }: { products: Product[] }) {
  if (!products.length) {
    return <p className="body-m text-ink-mute">Nothing is listed in this category yet.</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {products.map((product) => (
        <ProductCard key={product.slug} product={product} />
      ))}
    </div>
  );
}

export function SpecList({ specifications }: { specifications?: Record<string, string> }) {
  if (!specifications) return null;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
      {Object.entries(specifications).map(([key, value]) => (
        <div key={key} className="rule-bottom pb-2">
          <dt className="mono-label text-ink-mute">{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt>
          <dd className="body-s text-ink mt-1">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function NoticeBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-x">
      <div className="card bg-paper-2" style={{ borderColor: "var(--rule)" }}>
        <p className="body-s text-ink-2">{children}</p>
      </div>
    </div>
  );
}
