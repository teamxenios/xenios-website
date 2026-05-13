import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import { content } from "@/lib/content";

export default function Partners() {
  const P = content.partners;
  const DARK_PRESETS = ["grad-04-meridian", "grad-06-horizon"];

  return (
    <PageShell>
      <section className="bg-paper section-y rule-bottom" data-testid="section-partners-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-8">{P.eyebrow}</p>
          <h1 className="display-l text-ink text-balance max-w-4xl">{P.h1}</h1>
          <p className="body-l mt-8 text-ink-2 max-w-2xl">{P.sub}</p>
        </div>
      </section>

      {P.tracks.map((t) => {
        const isDark = DARK_PRESETS.includes(t.preset);
        return (
          <section key={t.num} className={`grad ${t.preset} section-y`} data-testid={`section-track-${t.num}`}>
            <div className="container-x">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
                <div className="md:col-span-3">
                  <p className={`mono-cap ${isDark ? "text-paper/80" : "text-ink-mute"}`}>{t.num} —</p>
                  <h2 className={`display-s mt-2 ${isDark ? "text-paper" : "text-ink"}`}>{t.title}</h2>
                </div>
                <div className="md:col-span-9">
                  {t.body.map((p, i) => (
                    <p key={i} className={`body-l ${isDark ? "text-paper/90" : "text-ink-2"} mb-4`}>{p}</p>
                  ))}
                  <div className={`mt-6 space-y-2 body-m ${isDark ? "text-paper" : "text-ink"}`}>
                    {t.lines.map((line, i) => <p key={i}>{line}</p>)}
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      })}

      <section className="bg-paper section-y rule-top" data-testid="section-partners-closer">
        <div className="container-x">
          <p className="body-l text-ink-2 max-w-3xl mb-8">{P.closerBody}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/waitlist" className="btn btn-primary" data-testid="button-partners-primary">{P.ctaPrimary}</Link>
            <Link href="/manifesto" className="btn btn-ghost" data-testid="button-partners-secondary">{P.ctaSecondary}</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
