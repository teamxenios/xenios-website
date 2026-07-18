import { Link } from "wouter";
import { ArrowRight, FileCheck2, FlaskConical, PackageCheck } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { byCategory, useResearch } from "../core";
import { AddToCartButton, NoticeBar, ProductGrid, StatusBadge } from "../components";

const PILLARS = [
  {
    icon: FileCheck2,
    title: "A complete technical file",
    body: "Origin, product class, manufacturing, batch records, testing methods, stability, storage, and claims support.",
  },
  {
    icon: FlaskConical,
    title: "A distinct research path",
    body: "Quantum does not depend on a peptide bundle or consumer program to justify its place in the catalog.",
  },
  {
    icon: PackageCheck,
    title: "Backend by Quantum",
    body: "The code is structured for Quantum-held inventory and fulfillment while xenios owns demand, customer experience, and support.",
  },
];

export default function Quantum() {
  const { products } = useResearch();
  const items = byCategory(products, "quantum");
  const product = items[0];

  return (
    <>
      <SeoHead
        title="Quantum, xenios research"
        description="Quantum as a standalone research product and as a separate component of the broader xenios ecosystem."
        path="/research/quantum"
      />

      <section className="container-x" style={{ paddingTop: 72, paddingBottom: 48 }}>
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-12 items-center">
          <div
            className="card bg-paper-2 flex items-center justify-center"
            style={{ minHeight: 420 }}
            aria-hidden="true"
          >
            <div className="text-center">
              <p className="mono-cap text-ink-mute mb-3">quantum</p>
              <p className="display-s">Quantum</p>
            </div>
          </div>
          <div>
            <p className="mono-cap text-pulse mb-5">Quantum, by itself</p>
            <h1 className="display-m text-balance max-w-[16ch]">The foundational platform.</h1>
            {product && (
              <p className="mt-6 body-l text-ink-2 max-w-[58ch]">{product.summary}</p>
            )}
            <div className="card bg-paper-2 mt-6" style={{ borderColor: "var(--rule)" }}>
              <p className="body-s text-ink-2">
                Quantum is currently configured as a standalone research-access product. Technical classification, claims, origin, testing, and commerce stay gated until the complete file is approved.
              </p>
            </div>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              {product ? (
                <AddToCartButton product={product} />
              ) : (
                <Link href="/research/access" className="btn btn-primary">Request access</Link>
              )}
              <Link href="/research/quality" className="btn btn-secondary">Review the standard</Link>
            </div>
            {product && (
              <div className="mt-5">
                <StatusBadge status={product.status} />
              </div>
            )}
          </div>
        </div>
      </section>

      <NoticeBar>
        Not for human or veterinary use. Research materials are presented with documentation only; no personal-use guidance is provided.
      </NoticeBar>

      <section className="container-x section-y rule-top">
        <p className="mono-cap text-ink-mute mb-5">The standard Quantum meets</p>
        <h2 className="display-s max-w-[22ch]">Standalone by design.</h2>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <div className="card" key={title}>
              <Icon size={22} aria-hidden="true" className="text-pulse" />
              <h3 className="h3 mt-5 mb-3">{title}</h3>
              <p className="body-s text-ink-2">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {items.length > 0 && (
        <section className="container-x section-y rule-top">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
            <div>
              <p className="mono-cap text-ink-mute mb-5">In the catalog</p>
              <h2 className="display-s max-w-[20ch]">Quantum as a listed product.</h2>
            </div>
            <p className="body-m text-ink-mute max-w-[46ch]">
              Quantum stays request-access. The listing carries its own profile, documentation status, and access path.
            </p>
          </div>
          <ProductGrid products={items} />
        </section>
      )}

      <section className="container-x section-y rule-top">
        <div className="card bg-paper-2 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center" style={{ padding: "clamp(28px, 5vw, 56px)" }}>
          <div>
            <p className="mono-cap text-ink-mute mb-4">Part of a broader system</p>
            <h2 className="display-s max-w-[18ch]">Available alone. Connected by choice.</h2>
          </div>
          <div>
            <p className="body-l text-ink-2">
              A visitor can explore Quantum independently, then separately choose supplements or a human-led program. Research and consumer products do not share one bundled checkout.
            </p>
            <Link href="/research/build-a-system" className="btn btn-primary mt-8">
              Build a system <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
