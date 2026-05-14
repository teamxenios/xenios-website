import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, DEVELOPER_SECTIONS } from "@/lib/content";

export default function Developers() {
  return (
    <PageShell>
      <SeoHead title={PAGES.developers.title} description={PAGES.developers.description} canonical="/developers" />
      <section className="grad grad-02-tide section-y" data-testid="section-developers-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">DEVELOPERS</p>
          <h1 className="display-xl text-ink text-balance" style={{ maxWidth: "24ch" }}>
            Programmable health infrastructure.
          </h1>
          <p className="body-l mt-8 text-ink-2 max-w-3xl">
            REST API. Webhooks. Agent SDKs. The ontology, exposed. The Stripe-grade developer experience proactive health has been waiting for.
          </p>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-developers-detail">
        <div className="container-x space-y-6">
          {DEVELOPER_SECTIONS.map((s, i) => (
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
          <p className="mono-cap text-paper/70 mb-6">EARLY ACCESS</p>
          <h2 className="display-l text-paper text-balance max-w-4xl">
            Want early dev access? Email <a href="mailto:team@xeniostechnology.com" className="underline">team@xeniostechnology.com</a> with subject [PARTNER] or [DEV].
          </h2>
        </div>
      </section>
    </PageShell>
  );
}
