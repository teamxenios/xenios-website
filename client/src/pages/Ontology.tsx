import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, ONTOLOGY_SECTIONS } from "@/lib/content";

export default function Ontology() {
  return (
    <PageShell>
      <SeoHead title={PAGES.ontology.title} description={PAGES.ontology.description} canonical="/ontology" />
      <section className="grad grad-04-meridian section-y" data-testid="section-ontology-hero">
        <div className="container-x">
          <p className="mono-cap text-paper/70 mb-6">HEALTH ONTOLOGY</p>
          <h1 className="display-xl text-paper text-balance" style={{ maxWidth: "22ch" }}>
            The interoperability primitive proactive health has been missing.
          </h1>
          <p className="body-l mt-8 text-paper/90 max-w-3xl">
            A standardized model of biomarkers, protocols, behaviors, and outcomes. Built to be programmed.
          </p>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-ontology-detail">
        <div className="container-x space-y-6">
          {ONTOLOGY_SECTIONS.map((s, i) => (
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
          <h2 className="display-l text-paper text-balance max-w-4xl">Build on the substrate.</h2>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link href="/developers" className="btn btn-primary btn-on-dark">read the developer page →</Link>
            <Link href="/waitlist" className="btn btn-secondary btn-on-dark">join the waitlist</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
