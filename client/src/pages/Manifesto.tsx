import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, MANIFESTO_PARAGRAPHS, MANIFESTO_AFTER, MANIFESTO_BELIEFS, MANIFESTO_CLOSER } from "@/lib/content";

export default function Manifesto() {
  return (
    <PageShell>
      <SeoHead title={PAGES.manifesto.title} description={PAGES.manifesto.description} canonical="/manifesto" />
      <section className="grad grad-01-dawn section-y" data-testid="section-manifesto-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">MANIFESTO</p>
          <h1 className="display-xl text-ink text-balance" style={{ maxWidth: "20ch" }}>Care, finally upstream.</h1>
        </div>
      </section>

      <section className="bg-paper section-y">
        <div className="container-x max-w-4xl space-y-6">
          {MANIFESTO_PARAGRAPHS.map((p, i) => (
            <p key={i} className="body-l text-ink-2" data-testid={`mani-para-${i}`}>{p}</p>
          ))}
          <hr className="my-12 border-0 border-t" style={{ borderColor: "var(--rule)" }} />
          {MANIFESTO_AFTER.map((p, i) => (
            <p key={i} className={i === 1 ? "display-s text-ink" : "body-l text-ink-2"} style={i === 1 ? { fontWeight: 700 } : undefined}>{p}</p>
          ))}
        </div>
      </section>

      <section className="grad grad-04-meridian section-y" data-testid="section-beliefs">
        <div className="container-x">
          <p className="mono-cap text-paper/70 mb-6">FOUR BELIEFS</p>
          <div className="space-y-6 max-w-4xl">
            {MANIFESTO_BELIEFS.map((b, i) => (
              <div key={i} className="card">
                <p className="display-s text-pulse" style={{ fontWeight: 800 }}>{b.num}</p>
                <p className="body-l mt-3 text-ink-2">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grad grad-06-horizon section-y" data-testid="section-manifesto-closer">
        <div className="container-x">
          {MANIFESTO_CLOSER.map((line, i) => (
            line === "" ? <div key={i} className="h-6" /> : (
              <p key={i} className="display-l text-paper" style={{ fontWeight: 800 }}>{line}</p>
            )
          ))}
          <Link href="/waitlist" className="btn btn-primary btn-on-dark mt-12 inline-flex">join the waitlist →</Link>
        </div>
      </section>
    </PageShell>
  );
}
