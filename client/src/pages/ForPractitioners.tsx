import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { content, PRACTITIONER_TILES } from "@/lib/content";

const DARK = ["grad-04-meridian", "grad-06-horizon"];

export default function ForPractitioners() {
  const F = content.forPractitioners;
  return (
    <PageShell>
      <SeoHead {...F.seo} />

      <section className="grad grad-02-tide section-y" data-testid="section-fp-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-2 mb-8">{F.eyebrow}</p>
          <h1 className="display-l text-ink text-balance max-w-5xl">{F.h1}</h1>
          <p className="body-l mt-8 text-ink-2 max-w-2xl">{F.sub}</p>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-fp-grid">
        <div className="container-x">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRACTITIONER_TILES.map((t, i) => {
              const isDark = DARK.includes(t.preset);
              return (
                <div key={t.value} className={`grad ${t.preset} tile ${isDark ? "on-dark" : ""}`} data-testid={`fp-tile-${t.value}`}>
                  <div>
                    <p className="tile-num">{String(i + 1).padStart(2, "0")} · {isDark ? "PRACTICE TYPE" : "PRACTICE TYPE"}</p>
                    <p className="tile-label">{t.label}</p>
                  </div>
                  <p className="tile-cap">// {t.oneLiner}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-paper-2 section-y rule-y" data-testid="section-fp-closer">
        <div className="container-x">
          <h2 className="display-m text-ink text-balance max-w-4xl">{F.closer.h}</h2>
          <p className="body-l mt-6 text-ink-2 max-w-3xl">{F.closer.body}</p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link href="/waitlist" className="btn btn-primary w-full sm:w-auto" data-testid="button-fp-primary">{F.closer.primary}</Link>
            <Link href="/product" className="btn btn-ghost w-full sm:w-auto" data-testid="button-fp-secondary">{F.closer.secondary}</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
