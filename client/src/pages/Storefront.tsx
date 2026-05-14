import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, STOREFRONT_BLOCKS, REVENUE_CHIPS } from "@/lib/content";

export default function Storefront() {
  return (
    <PageShell>
      <SeoHead title={PAGES.storefront.title} description={PAGES.storefront.description} canonical="/storefront" />
      <section className="grad grad-05-meadow section-y" data-testid="section-storefront-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">STOREFRONT</p>
          <h1 className="display-xl text-ink text-balance" style={{ maxWidth: "22ch" }}>
            Every practitioner runs a storefront. Every storefront runs itself.
          </h1>
          <p className="body-l mt-8 text-ink-2 max-w-3xl">
            Branded apps. Digital products. Drop-ship fulfillment. Subscriptions. Group cohorts. Outcome-based packages. The Commerce Agent runs all of it end-to-end.
          </p>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-storefront-blocks">
        <div className="container-x">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {STOREFRONT_BLOCKS.map((s, i) => (
              <article key={i} className="card">
                <p className="mono-cap text-pulse">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="h2 mt-3 text-ink">{s.title}</h3>
                <p className="body-l mt-4 text-ink-2">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grad grad-05-meadow section-y" data-testid="section-storefront-revenue">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">TEN NEW REVENUE STREAMS</p>
          <h2 className="display-m text-ink text-balance max-w-4xl">Get paid for the work you already do.</h2>
          <ul className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {REVENUE_CHIPS.map((c, i) => (
              <li key={i} className="flex items-start gap-3 body-m text-ink-2 bg-paper/60 p-4" style={{ borderRadius: 4 }}>
                <span className="mono-label text-pulse">{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontWeight: 600 }}>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grad grad-06-horizon section-y">
        <div className="container-x">
          <h2 className="display-l text-paper text-balance max-w-4xl">Run a storefront that runs itself.</h2>
          <Link href="/waitlist" className="btn btn-primary btn-on-dark mt-8 inline-flex">join the waitlist →</Link>
        </div>
      </section>
    </PageShell>
  );
}
