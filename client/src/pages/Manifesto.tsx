import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import { content } from "@/lib/content";

export default function Manifesto() {
  const M = content.manifesto;
  return (
    <PageShell>
      <section className="grad grad-06-horizon" data-testid="section-manifesto-hero">
        <div className="container-x section-y">
          <p className="mono-cap text-paper/80 mb-8">{M.eyebrow}</p>
          <h1 className="display-xl text-paper text-balance max-w-5xl">{M.h1}</h1>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-manifesto-body">
        <div className="container-x">
          <article className="max-w-prose mx-auto space-y-6">
            {M.paragraphs.map((p, i) => (
              <p key={i} className="body-l text-ink-2" data-testid={`text-manifesto-para-${i}`}>{p}</p>
            ))}
            <div className="rule-y py-10 my-10">
              <p className="quote-lead text-ink">{M.bridge}</p>
            </div>
            {M.thesisParas.map((p, i) => (
              <p key={i} className="body-l text-ink-2">{p}</p>
            ))}
            <h2 className="display-m text-ink mt-16 mb-4">{M.beliefsHeader}</h2>
            <div className="space-y-8">
              {M.beliefs.map((b, i) => (
                <div key={i} data-testid={`belief-${i}`}>
                  <p className="display-s text-ink mb-2" style={{ fontWeight: 800 }}>{b.number}</p>
                  <p className="body-l text-ink-2">{b.body}</p>
                </div>
              ))}
            </div>
            <div className="rule-top mt-16 pt-10 space-y-4">
              {M.closingPull.map((line, i) => (
                <p key={i} className="quote-lead text-ink" style={{ fontWeight: 800 }}>{line}</p>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="bg-paper-2 section-y rule-top" data-testid="section-manifesto-cta">
        <div className="container-x text-center max-w-3xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/waitlist" className="btn btn-primary" data-testid="button-manifesto-primary">{M.cta.primary}</Link>
            <Link href="/#ecosystem" className="btn btn-ghost" data-testid="button-manifesto-secondary">{M.cta.secondary}</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
