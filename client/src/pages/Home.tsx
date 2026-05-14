import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import RotatingHero from "@/components/RotatingHero";
import Counter from "@/components/Counter";
import EcosystemMarquee from "@/components/EcosystemMarquee";
import AgentDiagram from "@/components/AgentDiagram";
import { content, PRACTITIONER_TILES, REVENUE_CHIPS, FAQ_QA } from "@/lib/content";

export default function Home() {
  const H = content.home;
  return (
    <PageShell>
      <SeoHead {...H.seo} />

      {/* HERO */}
      <section className="grad grad-01-dawn" data-testid="section-hero">
        <div className="container-x" style={{ paddingTop: "var(--space-hero-top)", paddingBottom: "var(--space-hero-bottom)" }}>
          <div className="counter-pill mb-8" data-testid="hero-counter-pill">
            <span className="counter-dot" />
            <Counter variant="line" suffix={H.hero.counterPill} />
          </div>

          <RotatingHero prefix={H.hero.headlinePrefix} />

          <p className="display-s mt-8 text-ink-2 max-w-2xl" style={{ fontWeight: 700 }} data-testid="text-hero-sub">
            {H.hero.subhead}
          </p>

          <p className="body-l mt-6 text-ink-2" style={{ maxWidth: "48ch" }}>
            {H.hero.lede}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center">
            <Link href="/waitlist" className="btn btn-primary w-full sm:w-auto" data-testid="button-hero-primary">
              {H.hero.primaryCta}
            </Link>
            <Link href="/product" className="btn btn-ghost w-full sm:w-auto" data-testid="button-hero-secondary">
              {H.hero.secondaryCta}
            </Link>
          </div>
        </div>
      </section>

      {/* WHO'S SIGNING UP */}
      <section className="bg-paper section-y rule-bottom" data-testid="section-who">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{H.whoEyebrow}</p>
          <div className="chip-strip" data-testid="chip-strip-who">
            {H.whoChips.map((c, i) => (
              <span key={i} className="chip" data-testid={`chip-who-${i}`}>{c}</span>
            ))}
          </div>
          <p className="body-l mt-8 text-ink-2 max-w-3xl">{H.whoSubline}</p>
        </div>
      </section>

      {/* PROACTIVE HEALTH MOVEMENT */}
      <section className="grad grad-03-fieldwork section-y" data-testid="section-movement">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{H.movement.eyebrow}</p>
          <h2 className="display-m text-ink text-balance" style={{ maxWidth: "20ch" }}>{H.movement.h2}</h2>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-12 gap-10">
            <div className="md:col-span-7 space-y-5">
              {H.movement.paras.map((p, i) => (
                <p key={i} className="body-l text-ink-2" data-testid={`text-movement-para-${i}`}>{p}</p>
              ))}
            </div>
            <div className="md:col-span-5 space-y-3">
              {H.movement.stats.map((s, i) => (
                <div key={i} className="card" data-testid={`stat-${i}`}>
                  <p className="mono-label text-ink-mute mb-1">FACT {String(i + 1).padStart(2, "0")}</p>
                  <p className="body-l text-ink" style={{ fontWeight: 700 }}>{s}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* BUILT FOR — 18 tile grid */}
      <section className="bg-paper section-y" data-testid="section-built-for">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{H.builtFor.eyebrow}</p>
          <h2 className="display-m text-ink text-balance max-w-4xl mb-12">{H.builtFor.h2}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRACTITIONER_TILES.map((t, i) => {
              const isDark = t.preset === "grad-04-meridian" || t.preset === "grad-06-horizon";
              return (
                <div key={t.value} className={`grad ${t.preset} tile ${isDark ? "on-dark" : ""}`} data-testid={`tile-${t.value}`}>
                  <div>
                    <p className="tile-num">{String(i + 1).padStart(2, "0")}</p>
                    <p className="tile-label">{t.label}</p>
                  </div>
                  <p className="tile-cap">// {t.oneLiner}</p>
                </div>
              );
            })}
          </div>
          <Link href="/for-practitioners" className="btn btn-ghost mt-10 inline-flex" data-testid="link-builtfor-more">
            Read the practitioner page →
          </Link>
        </div>
      </section>

      {/* ECOSYSTEM MARQUEE */}
      <section className="bg-paper-2 section-y rule-y" data-testid="section-ecosystem">
        <div className="container-x mb-10">
          <p className="mono-cap text-ink-mute mb-6">{H.ecosystem.eyebrow}</p>
          <h2 className="display-m text-ink text-balance">{H.ecosystem.h2}</h2>
          <p className="body-l mt-4 text-ink-2 max-w-2xl">{H.ecosystem.sub}</p>
        </div>
        <EcosystemMarquee rows={2} />
        <div className="container-x mt-10">
          <p className="body-s text-ink-mute" data-testid="text-ecosystem-disclaimer">{H.ecosystem.disclaimer}</p>
          <Link href="/ecosystem" className="btn btn-ghost mt-6 inline-flex" data-testid="link-ecosystem-more">
            See the full ecosystem →
          </Link>
        </div>
      </section>

      {/* MULTI-AGENT OS */}
      <section className="grad grad-04-meridian section-y" data-testid="section-multi-agent">
        <div className="container-x">
          <p className="mono-cap text-paper/80 mb-6">{H.multiAgent.eyebrow}</p>
          <h2 className="display-m text-paper text-balance max-w-4xl">{H.multiAgent.h2}</h2>
          <p className="body-l mt-8 text-paper/85 max-w-3xl">{H.multiAgent.body}</p>
          <div className="mt-12">
            <AgentDiagram />
          </div>
        </div>
      </section>

      {/* PRACTITIONER NETWORK */}
      <section className="bg-paper section-y rule-bottom" data-testid="section-network-block">
        <div className="container-x">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
            <div className="md:col-span-5">
              <p className="mono-cap text-ink-mute mb-6">{H.networkBlock.eyebrow}</p>
              <h2 className="display-m text-ink text-balance">{H.networkBlock.h2}</h2>
              <Link href="/network" className="btn btn-ghost mt-6 inline-flex" data-testid="link-network-more">
                Read the network page →
              </Link>
            </div>
            <div className="md:col-span-7 space-y-5">
              {H.networkBlock.paras.map((p, i) => (
                <p key={i} className="body-l text-ink-2" data-testid={`text-network-para-${i}`}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* THREE-CAPABILITY STRIP */}
      <section className="bg-paper section-y" data-testid="section-three-strip">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{H.threeStrip.eyebrow}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {H.threeStrip.items.map((it) => {
              const isDark = it.preset === "grad-04-meridian" || it.preset === "grad-06-horizon";
              return (
                <div key={it.num} className={`grad ${it.preset} card`} style={{ minHeight: 300 }} data-testid={`three-strip-${it.num}`}>
                  <p className={`mono-cap mb-3 ${isDark ? "text-paper/80" : "text-ink-mute"}`}>{it.num}</p>
                  <h3 className={`h3 mb-3 ${isDark ? "text-paper" : "text-ink"}`}>{it.title}</h3>
                  <p className={`body-m ${isDark ? "text-paper/90" : "text-ink-2"}`}>{it.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* NEW REVENUE STREAMS */}
      <section className="grad grad-05-meadow section-y" data-testid="section-revenue">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{H.revenue.eyebrow}</p>
          <h2 className="display-m text-ink text-balance max-w-4xl">{H.revenue.h2}</h2>
          <p className="body-l mt-6 text-ink-2 max-w-3xl">{H.revenue.body}</p>
          <ul className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {REVENUE_CHIPS.map((c, i) => (
              <li key={i} className="flex items-start gap-3 body-m text-ink-2 bg-paper/60 p-4" style={{ borderRadius: 4 }} data-testid={`revenue-chip-${i}`}>
                <span className="mono-label text-pulse">{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontWeight: 600 }}>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* HERITAGE BLOCK */}
      <section className="bg-paper-2 section-y rule-y" data-testid="section-heritage">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{H.heritage.eyebrow}</p>
          <h2 className="display-m text-ink text-balance max-w-5xl">{H.heritage.h2}</h2>
          <p className="quote-lead text-ink-2 mt-6">{H.heritage.sub}</p>
        </div>
      </section>

      {/* COMMON QUESTIONS (FAQPage) */}
      <section className="bg-paper section-y" data-testid="section-faq">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{H.commonQuestions.eyebrow}</p>
          <h2 className="display-m text-ink text-balance mb-10">{H.commonQuestions.h2}</h2>
          <div className="max-w-4xl divide-y" style={{ borderColor: "var(--rule)" }}>
            {FAQ_QA.map((q, i) => (
              <details key={i} className="py-6 group" data-testid={`faq-${i}`}>
                <summary className="cursor-pointer list-none flex items-start justify-between gap-6">
                  <span className="h3 text-ink">{q.q}</span>
                  <span className="text-pulse text-3xl leading-none mt-1 group-open:rotate-45 transition-transform" aria-hidden="true">+</span>
                </summary>
                <p className="body-l text-ink-2 mt-4">{q.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="grad grad-06-horizon section-y" data-testid="section-final-cta">
        <div className="container-x">
          <p className="mono-cap text-paper/80 mb-6">{H.finalCta.eyebrow}</p>
          <h2 className="display-l text-paper text-balance max-w-4xl" style={{ fontWeight: 800 }}>{H.finalCta.h2}</h2>
          <div className="mt-10 flex items-baseline gap-5 flex-wrap">
            <Counter variant="bignum" size="lg" onDark />
            <span className="display-s text-paper/85" style={{ fontWeight: 700 }}>on the waitlist · live</span>
          </div>
          <p className="body-l text-paper/80 mt-8 max-w-2xl">{H.finalCta.sub}</p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link href="/waitlist" className="btn btn-primary btn-on-dark w-full sm:w-auto" data-testid="button-final-primary">
              {H.finalCta.primary}
            </Link>
            <Link href="/about" className="btn btn-secondary btn-on-dark w-full sm:w-auto" data-testid="button-final-secondary">
              {H.finalCta.secondary}
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
