import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { content } from "@/lib/content";

export default function About() {
  const A = content.about;
  return (
    <PageShell>
      <SeoHead {...A.seo} />

      <section className="grad grad-06-horizon section-y" data-testid="section-about-hero">
        <div className="container-x">
          <p className="mono-cap text-paper/80 mb-8">{A.eyebrow}</p>
          <h1 className="display-l text-paper text-balance max-w-5xl">{A.h1}</h1>
          <p className="body-l mt-8 text-paper/85 max-w-2xl">{A.sub}</p>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-about-body">
        <div className="container-x">
          <article className="max-w-prose mx-auto space-y-6">
            {A.paragraphs.map((p, i) => (
              <p key={i} className="body-l text-ink-2" data-testid={`text-about-para-${i}`}>{p}</p>
            ))}
          </article>
        </div>
      </section>

      <section className="bg-paper-2 section-y rule-y" data-testid="section-about-beliefs">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{A.beliefsHeader}</p>
          <ul className="space-y-5 max-w-3xl">
            {A.beliefs.map((b, i) => (
              <li key={i} className="quote-lead text-ink flex gap-4" data-testid={`belief-${i}`}>
                <span className="mono-label text-pulse" style={{ minWidth: 28, marginTop: 8 }}>{String(i + 1).padStart(2, "0")}</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-about-team">
        <div className="container-x max-w-prose mx-auto">
          <p className="mono-cap text-ink-mute mb-4">{A.teamBlock.h}</p>
          <p className="body-l text-ink-2">{A.teamBlock.body}</p>
        </div>
      </section>

      <section className="grad grad-04-meridian section-y" data-testid="section-about-closer">
        <div className="container-x">
          <h2 className="display-l text-paper text-balance max-w-4xl" style={{ fontWeight: 800 }}>{A.closer.h}</h2>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link href="/waitlist" className="btn btn-primary btn-on-dark w-full sm:w-auto" data-testid="button-about-primary">{A.closer.primary}</Link>
            <Link href="/careers" className="btn btn-secondary btn-on-dark w-full sm:w-auto" data-testid="button-about-secondary">{A.closer.secondary}</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
