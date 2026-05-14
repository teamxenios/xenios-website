import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { content } from "@/lib/content";

export default function Network() {
  const N = content.network;
  return (
    <PageShell>
      <SeoHead {...N.seo} />

      <section className="grad grad-04-meridian section-y" data-testid="section-network-hero">
        <div className="container-x">
          <p className="mono-cap text-paper/80 mb-8">{N.eyebrow}</p>
          <h1 className="display-l text-paper text-balance max-w-5xl">{N.h1}</h1>
          <p className="body-l mt-8 text-paper/90 max-w-2xl">{N.sub}</p>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-network-pillars">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-10">FOUR PILLARS</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {N.pillars.map((p) => (
              <div key={p.num} className="card" data-testid={`pillar-${p.num}`}>
                <p className="mono-cap text-ink-mute">{p.num}</p>
                <h3 className="h3 mt-3 text-ink">{p.title}</h3>
                <p className="body-m mt-4 text-ink-2">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grad grad-05-meadow section-y" data-testid="section-network-flow">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{N.flow.eyebrow}</p>
          <h2 className="display-m text-ink text-balance max-w-4xl">{N.flow.h2}</h2>
          <ol className="mt-10 space-y-4 max-w-3xl">
            {N.flow.steps.map((s, i) => (
              <li key={i} className="flex gap-4 body-l text-ink-2" data-testid={`flow-step-${i}`}>
                <span className="mono-label text-pulse" style={{ minWidth: 28, marginTop: 6 }}>{String(i + 1).padStart(2, "0")}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <p className="quote-lead text-ink mt-10 max-w-3xl" style={{ fontWeight: 700 }}>{N.flow.footnote}</p>
        </div>
      </section>

      <section className="bg-paper section-y rule-top" data-testid="section-network-closer">
        <div className="container-x">
          <h2 className="display-l text-ink text-balance max-w-4xl">{N.closer.h}</h2>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link href="/waitlist" className="btn btn-primary w-full sm:w-auto" data-testid="button-network-primary">{N.closer.primary}</Link>
            <Link href="/product" className="btn btn-ghost w-full sm:w-auto" data-testid="button-network-secondary">{N.closer.secondary}</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
