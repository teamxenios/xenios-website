import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import { content } from "@/lib/content";

export default function Investors() {
  const I = content.investors;
  return (
    <PageShell>
      <section className="grad grad-04-meridian section-y" data-testid="section-investors-hero">
        <div className="container-x">
          <p className="mono-cap text-paper/80 mb-8">{I.eyebrow}</p>
          <h1 className="display-l text-paper text-balance max-w-5xl">{I.h1}</h1>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-investors-body">
        <div className="container-x">
          <div className="max-w-prose mx-auto space-y-6">
            {I.paragraphs.map((p, i) => (
              <p key={i} className="body-l text-ink-2" data-testid={`text-investors-para-${i}`}>{p}</p>
            ))}
            <div className="rule-top mt-12 pt-10">
              <p className="mono-cap text-ink-mute mb-4">{I.inboundEyebrow}</p>
              <div className="space-y-2 body-l text-ink">
                {I.inboundLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
              <p className="body-m text-ink-2 mt-6 italic">{I.closingNote}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-paper-2 section-y rule-y" data-testid="section-investors-why">
        <div className="container-x">
          <div className="max-w-3xl space-y-3">
            {I.whyWeExist.map((line, i) => (
              <p key={i} className="quote-lead text-ink">{line}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-investors-closer">
        <div className="container-x">
          <div className="flex flex-wrap gap-4">
            {I.closer.map((c) => (
              <Link key={c.href} href={c.href} className="btn btn-secondary" data-testid={`link-investors-${c.href.replace(/[^a-z]/g, "")}`}>
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
