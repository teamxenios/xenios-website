import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, CAPABILITIES_12 } from "@/lib/content";

export default function Product() {
  return (
    <PageShell>
      <SeoHead title={PAGES.product.title} description={PAGES.product.description} canonical="/product" />
      <section className="grad grad-02-tide section-y" data-testid="section-product-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">PRODUCT</p>
          <h1 className="display-xl text-ink text-balance" style={{ maxWidth: "22ch" }}>
            The operating system for proactive health, in twelve capabilities.
          </h1>
          <p className="body-l mt-8 text-ink-2 max-w-3xl">
            xenios is one substrate with one signal graph and one practitioner in command. Each capability below is a layer in that substrate, available the moment the platform ships.
          </p>
        </div>
      </section>
      <section className="bg-paper section-y" data-testid="section-product-capabilities">
        <div className="container-x">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {CAPABILITIES_12.map((c) => (
              <article key={c.num} className="card" data-testid={`cap-${c.num}`}>
                <p className="mono-cap text-pulse">{c.num}</p>
                <h2 className="h2 mt-3 text-ink">{c.name}</h2>
                <p className="body-l mt-4 text-ink-2">{c.body}</p>
                {c.linkLabel && c.href && (
                  <Link href={c.href} className="btn btn-ghost mt-4 inline-flex">{c.linkLabel} →</Link>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="grad grad-06-horizon section-y" data-testid="section-product-cta">
        <div className="container-x">
          <h2 className="display-l text-paper text-balance max-w-4xl">Be on the list when it ships.</h2>
          <Link href="/waitlist" className="btn btn-primary btn-on-dark mt-8 inline-flex">join the waitlist →</Link>
        </div>
      </section>
    </PageShell>
  );
}
