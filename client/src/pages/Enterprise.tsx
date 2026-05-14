import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, ENTERPRISE_SECTIONS } from "@/lib/content";

export default function Enterprise() {
  return (
    <PageShell>
      <SeoHead title={PAGES.enterprise.title} description={PAGES.enterprise.description} canonical="/enterprise" />
      <section className="grad grad-04-meridian section-y" data-testid="section-enterprise-hero">
        <div className="container-x">
          <p className="mono-cap text-paper/70 mb-6">ENTERPRISE</p>
          <h1 className="display-xl text-paper text-balance" style={{ maxWidth: "24ch" }}>
            The substrate underneath proactive care at scale.
          </h1>
          <p className="body-l mt-8 text-paper/90 max-w-3xl">
            Performance labs. Longevity clinics. Healthcare systems. Military. Sports orgs. Self-insured employers. One operating system.
          </p>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-enterprise-detail">
        <div className="container-x space-y-6">
          {ENTERPRISE_SECTIONS.map((s, i) => (
            <article key={i} className="card">
              <p className="mono-cap text-pulse">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="h1 mt-3 text-ink">{s.title}</h2>
              <p className="body-l mt-5 text-ink-2 max-w-4xl">{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grad grad-06-horizon section-y">
        <div className="container-x">
          <h2 className="display-l text-paper text-balance max-w-4xl">
            Talk to us. <a href="mailto:team@xeniostechnology.com?subject=%5BENTERPRISE%5D" className="underline">team@xeniostechnology.com</a> · subject [ENTERPRISE].
          </h2>
          <Link href="/contact" className="btn btn-primary btn-on-dark mt-8 inline-flex">contact xenios →</Link>
        </div>
      </section>
    </PageShell>
  );
}
