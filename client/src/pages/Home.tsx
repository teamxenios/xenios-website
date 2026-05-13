import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import Counter from "@/components/Counter";
import AtmosCard from "@/components/AtmosCard";
import Constellation from "@/components/Constellation";
import { content } from "@/lib/content";

export default function Home() {
  const H = content.home;

  return (
    <PageShell>
      {/* VP1 — Hero */}
      <section className="grad grad-01-dawn" data-testid="section-hero">
        <div className="container-x section-y">
          <div className="max-w-5xl">
            <p className="mono-cap text-ink-2 mb-8" data-testid="text-hero-eyebrow">{H.hero.eyebrow}</p>
            <h1 className="display-xl text-ink text-balance" data-testid="text-hero-h1">{H.hero.h1}</h1>
            <p className="display-s mt-10 text-ink-2 max-w-3xl" data-testid="text-hero-sub" style={{ fontWeight: 700 }}>
              {H.hero.sub}
            </p>
            <div className="mt-12 flex flex-wrap items-center gap-4">
              <Link href="/waitlist" className="btn btn-primary" data-testid="button-hero-primary">
                {H.hero.primaryCta}
              </Link>
              <Link href="/manifesto" className="btn btn-ghost" data-testid="button-hero-secondary">
                {H.hero.secondaryCta}
              </Link>
            </div>
            <div className="mt-10">
              <Counter variant="line" suffix={H.hero.counterSuffix} />
            </div>
          </div>
        </div>
      </section>

      {/* VP2 top — Thesis */}
      <section className="bg-paper section-y rule-bottom" data-testid="section-thesis">
        <div className="container-x">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
            <div className="md:col-span-7">
              <p className="mono-cap text-ink-mute mb-6">{H.thesis.eyebrow}</p>
              <h2 className="display-m text-ink text-balance" data-testid="text-thesis-h2">{H.thesis.h2}</h2>
              <p className="body-l mt-6 text-ink-2 max-w-prose">{H.thesis.body}</p>
              <Link href={H.thesis.inlineLinkHref} className="btn btn-ghost mt-6 inline-flex" data-testid="link-thesis-inline">
                {H.thesis.inlineLinkLabel}
              </Link>
            </div>
            <div className="md:col-span-5">
              <div className="grad grad-02-tide rounded-lg" style={{ aspectRatio: "4/5" }} aria-hidden="true"></div>
            </div>
          </div>
        </div>
      </section>

      {/* VP2-3 — Ecosystem constellation */}
      <section id="ecosystem" className="grad grad-03-fieldwork section-y" data-testid="section-ecosystem">
        <div className="container-x">
          <div className="max-w-3xl mb-16">
            <p className="mono-cap text-ink-2 mb-6">{H.ecosystem.eyebrow}</p>
            <h2 className="display-m text-ink text-balance">{H.ecosystem.h2}</h2>
            <p className="body-l mt-6 text-ink-2">{H.ecosystem.body1}</p>
            <p className="quote-lead mt-4 text-ink">{H.ecosystem.body2}</p>
            <Link href={H.ecosystem.inlineLinkHref} className="btn btn-ghost mt-6 inline-flex" data-testid="link-ecosystem-inline">
              {H.ecosystem.inlineLinkLabel}
            </Link>
          </div>
          <Constellation />
        </div>
      </section>

      {/* VP3 — Built-for grid (18 tiles) */}
      <section className="bg-paper section-y" data-testid="section-built-for">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{H.builtFor.eyebrow}</p>
          <h2 className="display-m text-ink text-balance max-w-4xl mb-12">{H.builtFor.h2}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {content.audienceTiles.map((t) => {
              const isDark = t.preset === "grad-04-meridian" || t.preset === "grad-06-horizon";
              return (
                <div
                  key={t.value}
                  className={`grad ${t.preset} tile ${isDark ? "on-dark" : ""}`}
                  data-testid={`tile-${t.value}`}
                >
                  <div>
                    <div className="tile-num">{t.num}</div>
                    <div className="tile-label">{t.label}</div>
                  </div>
                  <div className="tile-cap">// {t.cap}</div>
                </div>
              );
            })}
          </div>
          <p className="body-l mt-12 text-ink-2 max-w-3xl">{H.builtFor.closing}</p>
          <Link href={H.builtFor.inlineLinkHref} className="btn btn-ghost mt-6 inline-flex" data-testid="link-builtfor-inline">
            {H.builtFor.inlineLinkLabel}
          </Link>
        </div>
      </section>

      {/* Trust strip */}
      <section className="bg-paper-2 section-y rule-y" data-testid="section-trust">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{H.trust.eyebrow}</p>
          <p className="quote-lead text-ink max-w-4xl text-balance">{H.trust.body}</p>
          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3">
            {H.trust.stats.map((s, i) => (
              <span key={i} className="mono-cap text-ink-2" data-testid={`stat-${i}`}>{s}</span>
            ))}
          </div>
          <Link href={H.trust.inlineLinkHref} className="btn btn-ghost mt-8 inline-flex" data-testid="link-trust-inline">
            {H.trust.inlineLinkLabel}
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="grad grad-06-horizon section-y" data-testid="section-final-cta">
        <div className="container-x">
          <div className="max-w-5xl">
            <p className="mono-cap text-paper/80 mb-8">{H.finalCta.eyebrow}</p>
            <h2 className="display-l text-paper text-balance" style={{ fontWeight: 900 }}>{H.finalCta.h2}</h2>
            <div className="mt-12 flex items-baseline gap-4 flex-wrap">
              <Counter variant="bignum" size="lg" onDark />
              <span className="display-s text-paper/85" style={{ fontWeight: 700 }}>{H.finalCta.counterPrefix}</span>
            </div>
            <div className="mt-12 flex flex-wrap items-center gap-4">
              <Link href="/waitlist" className="btn btn-primary btn-on-dark" data-testid="button-final-primary">
                {H.finalCta.primaryCta}
              </Link>
              <Link href="/contact" className="btn btn-ghost text-paper border-paper hover:border-paper" style={{ color: "var(--paper)" }} data-testid="button-final-secondary">
                {H.finalCta.secondaryCta}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
