import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import EcosystemMarquee from "@/components/EcosystemMarquee";
import { content, ECOSYSTEM_CLUSTERS } from "@/lib/content";

export default function Ecosystem() {
  const E = content.ecosystem;
  return (
    <PageShell>
      <SeoHead {...E.seo} />

      <section className="grad grad-03-fieldwork section-y" data-testid="section-eco-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-8">{E.eyebrow}</p>
          <h1 className="display-l text-ink text-balance max-w-5xl">{E.h1}</h1>
          <p className="body-l mt-8 text-ink-2 max-w-2xl">{E.sub}</p>
        </div>
      </section>

      <section className="bg-paper-2 section-y" data-testid="section-eco-marquee">
        <EcosystemMarquee rows={2} />
      </section>

      <section className="bg-paper section-y" data-testid="section-eco-clusters">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-10">THE FULL LIST · 13 CLUSTERS · 52 NAMES</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12">
            {ECOSYSTEM_CLUSTERS.map((c, i) => (
              <div key={c.heading} data-testid={`cluster-${i}`}>
                <p className="mono-cap text-pulse mb-4">{String(i + 1).padStart(2, "0")} · {c.heading}</p>
                <ul className="space-y-2">
                  {c.names.map((n) => (
                    <li key={n} className="body-l text-ink" style={{ fontWeight: 600 }} data-testid={`eco-name-${n.replace(/\s+/g, "-")}`}>{n}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="body-s text-ink-mute mt-16 max-w-4xl" data-testid="text-eco-disclaimer">{E.disclaimer}</p>
        </div>
      </section>

      <section className="grad grad-06-horizon section-y" data-testid="section-eco-closer">
        <div className="container-x">
          <h2 className="display-m text-paper text-balance max-w-4xl">{E.closer.h}</h2>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link href="/waitlist" className="btn btn-primary btn-on-dark w-full sm:w-auto" data-testid="button-eco-primary">{E.closer.primary}</Link>
            <Link href="/contact" className="btn btn-secondary btn-on-dark w-full sm:w-auto" data-testid="button-eco-secondary">{E.closer.secondary}</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
