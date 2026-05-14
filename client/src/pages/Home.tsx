import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import RotatingHero from "@/components/RotatingHero";
import Counter from "@/components/Counter";
import EcosystemMarquee from "@/components/EcosystemMarquee";
import AgentDiagram from "@/components/AgentDiagram";
import {
  PAGES, PRACTITIONER_TILES, REVENUE_CHIPS, FAQ_QA,
  LAYERS_5, FRAGMENTED_STACK, CAPABILITIES_12, CONDUCTOR,
} from "@/lib/content";

const TILE_GRADS = ["grad-01-dawn","grad-02-tide","grad-03-fieldwork","grad-04-meridian","grad-05-meadow","grad-06-horizon"];

export default function Home() {
  return (
    <PageShell>
      <SeoHead title={PAGES.home.title} description={PAGES.home.description} canonical="/" />

      {/* 01 — HERO */}
      <section className="grad grad-01-dawn" data-testid="section-hero">
        <div className="container-x" style={{ paddingTop: "var(--space-hero-top)", paddingBottom: "var(--space-hero-bottom)" }}>
          <div className="counter-pill mb-8">
            <span className="counter-dot" />
            <Counter variant="line" suffix="practitioners on the waitlist" />
          </div>
          <RotatingHero prefix="the AI-native OS for" />
          <p className="display-s mt-8 text-ink-2 max-w-3xl" style={{ fontWeight: 700 }}>
            Eight specialized AI agents, one Conductor, telemedicine, branded storefront, a practitioner network, a programmable health ontology, a developer platform, an enterprise tier — on one substrate.
          </p>
          <p className="body-l mt-6 text-ink-2" style={{ maxWidth: "60ch" }}>
            Built in Austin by the team behind $710M+ in prior exits, including FinDox and InstaMed.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link href="/waitlist" className="btn btn-primary w-full sm:w-auto" data-testid="button-hero-primary">join the waitlist →</Link>
            <Link href="/product" className="btn btn-ghost w-full sm:w-auto" data-testid="button-hero-secondary">see the platform</Link>
          </div>
        </div>
      </section>

      {/* 02 — CATEGORY CLAIM */}
      <section className="bg-ink text-paper section-y" data-testid="section-category">
        <div className="container-x">
          <p className="mono-cap text-paper/60 mb-6">02 — CATEGORY</p>
          <h2 className="display-l text-paper text-balance" style={{ maxWidth: "22ch" }}>
            This is not another wellness app. This is infrastructure.
          </h2>
          <p className="body-l mt-8 text-paper/85 max-w-3xl">
            Proactive health is becoming the most important category in human medicine. xenios is the operating system underneath it — connecting every signal, every workflow, and every practitioner moving care upstream of disease.
          </p>
        </div>
      </section>

      {/* 03 — BEFORE / AFTER */}
      <section className="bg-paper section-y rule-bottom" data-testid="section-before-after">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">03 — THE PROBLEM, AND THE COLLAPSE</p>
          <h2 className="display-m text-ink text-balance max-w-4xl mb-12">
            Today, every proactive practitioner runs on a fragmented stack. Tomorrow, they run on one substrate.
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card" style={{ borderColor: "var(--rule)" }}>
              <p className="mono-cap text-ink-mute mb-4">BEFORE</p>
              <div className="flex flex-wrap gap-2">
                {FRAGMENTED_STACK.map((s) => (
                  <span key={s} className="chip" style={{ opacity: 0.7 }} data-testid={`chip-fragment-${s.replace(/\s+/g, "-")}`}>{s}</span>
                ))}
              </div>
              <p className="body-m mt-6 text-ink-mute">14 tools. Twelve tabs. Zero context.</p>
            </div>
            <div className="grad grad-04-meridian card">
              <p className="mono-cap text-paper/70 mb-4">AFTER · xenios</p>
              <p className="display-s text-paper" style={{ fontWeight: 800 }}>One operating system.</p>
              <p className="body-l mt-4 text-paper/90">Eight agents + Conductor. Telemedicine. Storefront. Network. Ontology. Developers. Enterprise.</p>
              <p className="body-m mt-6 text-paper/80">One context. One signal graph. One practitioner in command.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 04 — FIVE LAYERS */}
      <section className="grad grad-03-fieldwork section-y" data-testid="section-layers">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">04 — THE FIVE LAYERS</p>
          <h2 className="display-m text-ink text-balance max-w-4xl mb-12">
            One substrate. Five layers. Every dot connected.
          </h2>
          <div className="space-y-3">
            {LAYERS_5.map((l) => (
              <div key={l.num} className="card flex flex-col md:flex-row md:items-start gap-4 md:gap-8" data-testid={`layer-${l.num}`}>
                <p className="mono-cap text-pulse" style={{ minWidth: 60 }}>{l.num}</p>
                <div className="flex-1">
                  <h3 className="h2 text-ink">{l.name}</h3>
                  <p className="body-l mt-3 text-ink-2">{l.body}</p>
                  <Link href={l.href} className="btn btn-ghost mt-4 inline-flex" data-testid={`link-layer-${l.num}`}>{l.linkLabel} →</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 05 — 8 + 1 AGENTS */}
      <section className="grad grad-04-meridian section-y" data-testid="section-agents">
        <div className="container-x">
          <p className="mono-cap text-paper/70 mb-6">05 — THE FIRST AI WORKFORCE FOR PROACTIVE CARE</p>
          <h2 className="display-m text-paper text-balance max-w-4xl mb-12">
            Eight specialized agents. One Conductor.
          </h2>
          <div className="card mb-6 grad grad-06-horizon">
            <p className="mono-cap text-paper/70">00 — THE CONDUCTOR</p>
            <h3 className="h3 mt-3 text-paper">{CONDUCTOR.name}</h3>
            <p className="body-l mt-4 text-paper/90">{CONDUCTOR.body}</p>
          </div>
          <AgentDiagram withConductor={false} />
          <Link href="/agents" className="btn btn-secondary btn-on-dark mt-12 inline-flex">read the agent deep-dive →</Link>
        </div>
      </section>

      {/* 06 — 25 ICP TILES */}
      <section className="bg-paper section-y" data-testid="section-built-for">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">06 — BUILT FOR EVERY PRACTITIONER MOVING CARE UPSTREAM</p>
          <h2 className="display-m text-ink text-balance max-w-4xl mb-12">25 archetypes. One substrate.</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {PRACTITIONER_TILES.map((t, i) => {
              const grad = TILE_GRADS[i % TILE_GRADS.length];
              const isDark = grad === "grad-04-meridian" || grad === "grad-06-horizon";
              return (
                <Link key={t.value} href={`/for/${t.value.replace(/_/g, "-")}`} className={`grad ${grad} tile ${isDark ? "on-dark" : ""}`} data-testid={`tile-${t.value}`}>
                  <div>
                    <p className="tile-num">{String(i + 1).padStart(2, "0")}</p>
                    <p className="tile-label">{t.label}</p>
                  </div>
                  <p className="tile-cap">// {t.sub}</p>
                </Link>
              );
            })}
          </div>
          <Link href="/for-practitioners" className="btn btn-ghost mt-10 inline-flex">see the full audience map →</Link>
        </div>
      </section>

      {/* 07 — ECOSYSTEM */}
      <section className="bg-paper-2 section-y rule-y" data-testid="section-ecosystem">
        <div className="container-x mb-10">
          <p className="mono-cap text-ink-mute mb-6">07 — THE ECOSYSTEM</p>
          <h2 className="display-m text-ink text-balance">Designed to connect to every dot.</h2>
          <p className="body-l mt-4 text-ink-2 max-w-2xl">
            100+ brands across 18 categories of the proactive health stack. Wearables. Labs. Recovery. Nutrition. GLP-1 and peptides where lawful. Mental performance. Compliance. Payments. Intelligence.
          </p>
        </div>
        <EcosystemMarquee rows={2} />
        <div className="container-x mt-10">
          <p className="body-s text-ink-mute">Brand names are property of their respective owners. Integration availability varies. Ecosystem is illustrative of design intent, not endorsements or partnerships.</p>
          <Link href="/ecosystem" className="btn btn-ghost mt-6 inline-flex">see the full ecosystem →</Link>
        </div>
      </section>

      {/* 08 — REVENUE CHIPS */}
      <section className="grad grad-05-meadow section-y" data-testid="section-revenue">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">08 — NEW REVENUE STREAMS</p>
          <h2 className="display-m text-ink text-balance max-w-4xl">Ten new ways to get paid for the work you already do.</h2>
          <ul className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {REVENUE_CHIPS.map((c, i) => (
              <li key={i} className="flex items-start gap-3 body-m text-ink-2 bg-paper/60 p-4" style={{ borderRadius: 4 }}>
                <span className="mono-label text-pulse">{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontWeight: 600 }}>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 09 — 12 CAPABILITIES TEASER */}
      <section className="bg-paper section-y" data-testid="section-capabilities">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">09 — THE PRODUCT, IN TWELVE CAPABILITIES</p>
          <h2 className="display-m text-ink text-balance max-w-4xl mb-12">Twelve capabilities. One stack.</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {CAPABILITIES_12.map((c) => (
              <li key={c.num} className="card" data-testid={`cap-${c.num}`}>
                <p className="mono-cap text-pulse">{c.num}</p>
                <p className="h3 mt-3 text-ink">{c.name}</p>
              </li>
            ))}
          </ul>
          <Link href="/product" className="btn btn-ghost mt-10 inline-flex">read the full product page →</Link>
        </div>
      </section>

      {/* 10 — HERITAGE */}
      <section className="bg-paper-2 section-y rule-y" data-testid="section-heritage">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">10 — HERITAGE</p>
          <h2 className="display-m text-ink text-balance max-w-5xl">From the team that built the boring layers underneath U.S. healthcare — and is now building the proactive one.</h2>
          <p className="quote-lead text-ink-2 mt-6">
            $710M+ in prior enterprise outcomes. Two prior companies operating inside the regulated stack: FinDox (acquired by Donnelley Financial Solutions) and InstaMed (acquired by JPMorgan Chase, 2019). Boring infrastructure shipped at scale, into environments where boring matters.
          </p>
          <Link href="/about" className="btn btn-ghost mt-6 inline-flex">read the founder story →</Link>
        </div>
      </section>

      {/* 11 — FAQ */}
      <section className="bg-paper section-y" data-testid="section-faq">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">11 — COMMON QUESTIONS</p>
          <h2 className="display-m text-ink text-balance mb-10">Common questions.</h2>
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

      {/* 12 — FINAL CTA */}
      <section className="grad grad-06-horizon section-y" data-testid="section-final-cta">
        <div className="container-x">
          <p className="mono-cap text-paper/70 mb-6">12 — JOIN THE WAITLIST</p>
          <h2 className="display-l text-paper text-balance max-w-4xl" style={{ fontWeight: 800 }}>
            Be on the list when the proactive health OS ships.
          </h2>
          <div className="mt-10 flex items-baseline gap-5 flex-wrap">
            <Counter variant="bignum" size="lg" onDark />
            <span className="display-s text-paper/85" style={{ fontWeight: 700 }}>on the waitlist · live</span>
          </div>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link href="/waitlist" className="btn btn-primary btn-on-dark w-full sm:w-auto">join the waitlist →</Link>
            <Link href="/manifesto" className="btn btn-secondary btn-on-dark w-full sm:w-auto">read the manifesto</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
