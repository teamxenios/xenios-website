import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import AtmosCard from "@/components/AtmosCard";
import Counter from "@/components/Counter";
import WaitlistForm from "@/components/WaitlistForm";
import { content } from "@/lib/content";

export default function Home() {
  const c = content.home;

  return (
    <PageShell>
      {/* HERO */}
      <section className="container-x pt-16 md:pt-24 pb-20 md:pb-32" data-testid="section-hero">
        <p className="eyebrow text-orange-fire mb-8">{c.hero.eyebrow}</p>
        <h1 className="display-xl text-balance" data-testid="text-hero-h1">
          {c.hero.h1Line1}
          <br />
          {c.hero.h1Line2}
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 mt-12 md:mt-16 max-w-6xl">
          <p className="body-lg text-ink-soft text-balance">{c.hero.lead}</p>
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap gap-3">
              <Link href="/waitlist" className="btn btn-primary" data-testid="button-hero-primary">
                {c.hero.ctaPrimary}
              </Link>
              <Link href="/manifesto" className="btn btn-secondary" data-testid="button-hero-secondary">
                {c.hero.ctaSecondary}
              </Link>
            </div>
            <Counter prefix={c.hero.counterPrefix} suffix={c.hero.counterLabel} size="md" align="left" />
          </div>
        </div>
      </section>

      {/* METRICS */}
      <section className="bg-paper-soft section-y" data-testid="section-metrics">
        <div className="container-x">
          <p className="eyebrow text-ink-muted mb-12">{c.metrics.eyebrow}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 md:gap-12">
            {c.metrics.stats.map((s, i) => (
              <div key={i} className="border-l-2 border-ink pl-6" data-testid={`metric-${i}`}>
                <p className="display-md tabular mb-3" style={{ textTransform: "none" }}>{s.value}</p>
                <p className="body-base text-ink-muted">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THESIS */}
      <section className="container-x section-y" data-testid="section-thesis">
        <p className="eyebrow text-orange-fire mb-6">{c.thesis.eyebrow}</p>
        <h2 className="h2-section text-balance max-w-4xl mb-16">{c.thesis.h2}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {c.thesis.cards.map((card, i) => (
            <AtmosCard
              key={i}
              preset={card.preset}
              eyebrow={card.eyebrow}
              title={card.title}
              testId={`card-thesis-${i}`}
            >
              <p>{card.body}</p>
            </AtmosCard>
          ))}
        </div>
      </section>

      {/* HOW */}
      <section className="bg-paper-soft section-y" data-testid="section-how">
        <div className="container-x">
          <p className="eyebrow text-orange-fire mb-6">{c.how.eyebrow}</p>
          <h2 className="h2-section text-balance max-w-4xl mb-16">{c.how.h2}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-12">
            {c.how.steps.map((s) => (
              <div key={s.step} className="rule-top pt-8" data-testid={`step-${s.step}`}>
                <p className="mono-sm text-orange-fire mb-4">STEP {s.step}</p>
                <h3 className="h3-sub mb-3">{s.title}</h3>
                <p className="body-base text-ink-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="container-x section-y" data-testid="section-features">
        <p className="eyebrow text-orange-fire mb-6">{c.features.eyebrow}</p>
        <h2 className="h2-section text-balance max-w-4xl mb-16">{c.features.h2}</h2>
        <div className="space-y-6">
          {c.features.items.map((f, i) => (
            <AtmosCard
              key={i}
              preset={f.preset}
              eyebrow={f.eyebrow}
              title={f.title}
              testId={`feature-${i}`}
            >
              <p className="max-w-3xl">{f.body}</p>
            </AtmosCard>
          ))}
        </div>
      </section>

      {/* AUDIENCE */}
      <section className="bg-paper-soft section-y" data-testid="section-audience">
        <div className="container-x">
          <p className="eyebrow text-orange-fire mb-6">{c.audience.eyebrow}</p>
          <h2 className="h2-section text-balance max-w-4xl mb-16">{c.audience.h2}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {c.audience.tiles.map((t, i) => (
              <div
                key={i}
                className="bg-paper rounded-2xl p-6 rule-top border-l-2 border-orange-warm"
                data-testid={`tile-audience-${i}`}
              >
                <p className="mono-sm mb-3 leading-snug">{t.label}</p>
                <p className="body-base text-ink-muted">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="container-x section-y" data-testid="section-trust">
        <p className="eyebrow text-orange-fire mb-6">{c.trust.eyebrow}</p>
        <h2 className="h2-section text-balance max-w-4xl mb-8">{c.trust.h2}</h2>
        <p className="body-lg text-ink-muted max-w-3xl mb-12">{c.trust.body}</p>
        <div className="flex flex-wrap gap-x-8 gap-y-3 rule-top pt-8">
          {c.trust.tags.map((t) => (
            <span key={t} className="mono-sm text-ink-muted">{t}</span>
          ))}
        </div>
      </section>

      {/* TEAM TEASER */}
      <section className="bg-paper-soft section-y" data-testid="section-team">
        <div className="container-x">
          <p className="eyebrow text-orange-fire mb-6">{c.team.eyebrow}</p>
          <h2 className="h2-section text-balance max-w-4xl mb-8">{c.team.h2}</h2>
          <p className="body-lg text-ink-muted max-w-3xl mb-10">{c.team.body}</p>
          <Link href="/about" className="btn btn-secondary" data-testid="button-team-cta">
            {c.team.cta}
          </Link>
        </div>
      </section>

      {/* FINAL CTA — Denim */}
      <section className="atmos atmos-denim" data-testid="section-final-cta">
        <div className="container-x py-24 md:py-32">
          <p className="eyebrow text-paper/80 mb-6">{c.finalCta.eyebrow}</p>
          <h2 className="display-md text-balance max-w-5xl mb-8 text-paper">{c.finalCta.h2}</h2>
          <p className="body-lg text-paper/85 max-w-2xl mb-12">{c.finalCta.body}</p>
          <WaitlistForm variant="dark" compact />
          <div className="mt-12">
            <Counter
              suffix={c.finalCta.counterSuffix}
              size="lg"
              variant="dark"
            />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
