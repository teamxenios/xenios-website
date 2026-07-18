import { Link, useParams } from "wouter";
import { ExternalLink } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { formatMoney, useResearch } from "../core";
import { AddToCartButton, NoticeBar, SpecList, StatusBadge } from "../components";

export default function ProductDetail() {
  const params = useParams<{ slug: string }>();
  const { bySlug } = useResearch();
  const product = params.slug ? bySlug.get(params.slug) : undefined;

  if (!product) {
    return (
      <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }}>
        <p className="mono-cap text-ink-mute mb-5">Not found</p>
        <h1 className="display-s">That product is not listed.</h1>
        <Link href="/research/shop" className="btn btn-secondary mt-8">Browse the catalog</Link>
      </section>
    );
  }

  return (
    <>
      <SeoHead title={`${product.name}, xenios research`} description={product.summary} path={`/research/products/${product.slug}`} />

      <section className="container-x" style={{ paddingTop: 64, paddingBottom: 48 }}>
        <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-10 items-start">
          <div className="card bg-paper-2 flex items-center justify-center" style={{ minHeight: 260 }} aria-hidden="true">
            <p className="display-s text-ink-mute text-center px-6" style={{ letterSpacing: "-0.02em" }}>
              {product.shortName || product.name}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between gap-4">
              <p className="mono-cap text-pulse">{product.eyebrow}</p>
              <StatusBadge status={product.status} />
            </div>
            <h1 className="display-s mt-4">{product.name}</h1>
            {product.size && <p className="mono-label text-ink-mute mt-2">{product.size}</p>}
            <p className="mt-6 body-l text-ink-2">{product.summary}</p>
            <p className="mt-6 h3 tabular" data-testid="text-product-price">{formatMoney(product.priceCents)}</p>
            <div className="mt-6">
              <AddToCartButton product={product} />
            </div>
            {product.lane === "research" && (
              <div className="card bg-paper-2 mt-6">
                <p className="body-s text-ink-2">
                  Research use only. Not for human or veterinary use. Account and order review apply. No personal-use instructions are provided.
                </p>
              </div>
            )}
            <div className="rule-top mt-8 pt-8 space-y-4">
              {product.description.map((paragraph) => (
                <p key={paragraph} className="body-m text-ink-2">{paragraph}</p>
              ))}
            </div>
            <h2 className="h3 mt-8 mb-4">Why it is here</h2>
            <ul className="space-y-2">
              {product.highlights.map((item) => (
                <li key={item} className="body-s text-ink-2 flex gap-3">
                  <span aria-hidden="true" className="bg-orange-fire shrink-0 mt-2" style={{ width: 6, height: 6, borderRadius: 9999 }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {product.specifications && (
        <section className="container-x section-y rule-top">
          <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-10 items-start">
            <div>
              <p className="mono-cap text-ink-mute mb-4">Specifications</p>
              <h2 className="display-s max-w-[16ch]">The details should be easy to verify.</h2>
            </div>
            <SpecList specifications={product.specifications} />
          </div>
        </section>
      )}

      {(product.researchContext?.length || product.qualityNotes?.length) && (
        <section className="container-x section-y rule-top">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {product.researchContext?.length ? (
              <div className="card">
                <p className="mono-cap text-ink-mute mb-4">Research context</p>
                <ul className="space-y-2 mb-6">
                  {product.researchContext.map((item) => (
                    <li key={item} className="body-s text-ink-2">{item}</li>
                  ))}
                </ul>
                {product.sourceUrl && (
                  <a className="btn btn-secondary" href={product.sourceUrl} target="_blank" rel="noreferrer">
                    Primary source <ExternalLink size={15} aria-hidden="true" />
                  </a>
                )}
              </div>
            ) : null}
            {product.qualityNotes?.length ? (
              <div className="card">
                <p className="mono-cap text-ink-mute mb-4">Quality review</p>
                <ul className="space-y-2 mb-6">
                  {product.qualityNotes.map((item) => (
                    <li key={item} className="body-s text-ink-2">{item}</li>
                  ))}
                </ul>
                <Link className="btn btn-secondary" href="/research/quality">Quality standards</Link>
              </div>
            ) : null}
          </div>
        </section>
      )}

      {product.lane === "research" && (
        <div className="pb-16">
          <NoticeBar>
            No dosing, injection, reconstitution, cycling, or stacking information is provided anywhere on this site.
          </NoticeBar>
        </div>
      )}
    </>
  );
}
