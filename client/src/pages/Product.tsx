import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import AgentDiagram from "@/components/AgentDiagram";
import EcosystemMarquee from "@/components/EcosystemMarquee";
import { content, FAQ_QA } from "@/lib/content";

const DARK = ["grad-04-meridian", "grad-06-horizon"];

export default function Product() {
  const P = content.product;
  return (
    <PageShell>
      <SeoHead {...P.seo} />

      {/* HERO */}
      <section className="bg-paper section-y rule-bottom" data-testid="section-product-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-8">{P.eyebrow}</p>
          <h1 className="display-l text-ink text-balance max-w-4xl">{P.h1}</h1>
          <p className="body-l mt-8 text-ink-2 max-w-2xl">{P.sub}</p>
        </div>
      </section>

      {/* SEVEN CAPABILITIES */}
      <section className="bg-paper section-y" data-testid="section-capabilities">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-8">SEVEN CAPABILITIES</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {P.capabilities.map((c) => {
              const isDark = DARK.includes(c.preset);
              return (
                <div key={c.num} className={`grad ${c.preset} card flex flex-col h-full`} style={{ minHeight: 240 }} data-testid={`capability-${c.num}`}>
                  <p className={`mono-cap ${isDark ? "text-paper/80" : "text-ink-mute"}`}>{c.num}</p>
                  <h3 className={`h3 mt-3 ${isDark ? "text-paper" : "text-ink"}`}>{c.name}</h3>
                  <p className={`body-m mt-4 flex-1 ${isDark ? "text-paper/90" : "text-ink-2"}`}>{c.line}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* MULTI-AGENT DEEP DIVE */}
      <section className="grad grad-04-meridian section-y" data-testid="section-multi-agent-deep">
        <div className="container-x">
          <p className="mono-cap text-paper/80 mb-6">{P.multiAgent.eyebrow}</p>
          <h2 className="display-m text-paper text-balance max-w-4xl">{P.multiAgent.h2}</h2>
          <div className="mt-10">
            <AgentDiagram />
          </div>
          <div className="mt-12">
            <p className="mono-cap text-paper/80 mb-4">CROSS-CUTTING PRINCIPLES</p>
            <ul className="space-y-3 max-w-3xl">
              {P.multiAgent.principles.map((p, i) => (
                <li key={i} className="body-l text-paper/90 flex gap-3" data-testid={`principle-${i}`}>
                  <span className="text-pulse" aria-hidden>—</span><span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* NETWORK DEEP DIVE */}
      <section className="bg-paper section-y rule-y" data-testid="section-network-deep">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{P.network.eyebrow}</p>
          <h2 className="display-m text-ink text-balance max-w-4xl">{P.network.h2}</h2>
          <p className="body-l mt-6 text-ink-2 max-w-3xl">{P.network.body}</p>
          <ul className="mt-8 space-y-3 max-w-3xl">
            {P.network.bullets.map((b, i) => (
              <li key={i} className="body-l text-ink-2 flex gap-3" data-testid={`network-bullet-${i}`}>
                <span className="text-pulse" aria-hidden>—</span><span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10 card" style={{ background: "var(--paper-2)", maxWidth: 800 }}>
            <p className="mono-cap text-ink-mute mb-3">FLOW EXAMPLE</p>
            <p className="body-l text-ink" style={{ fontWeight: 600 }}>{P.network.flowExample}</p>
          </div>
          <Link href="/network" className="btn btn-ghost mt-8 inline-flex" data-testid="link-product-to-network">
            Read the network page →
          </Link>
        </div>
      </section>

      {/* REVENUE LAYER */}
      <section className="grad grad-05-meadow section-y" data-testid="section-revenue-layer">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{P.revenue.eyebrow}</p>
          <h2 className="display-m text-ink text-balance max-w-4xl">{P.revenue.h2}</h2>
          <p className="body-l mt-6 text-ink-2 max-w-3xl">{P.revenue.body}</p>
          <ol className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4">
            {P.revenue.lines.map((l, i) => (
              <li key={i} className="flex gap-4 body-m text-ink-2" data-testid={`revenue-line-${i}`}>
                <span className="mono-label text-pulse" style={{ minWidth: 28 }}>{String(i + 1).padStart(2, "0")}</span>
                <span><span style={{ fontWeight: 700, color: "var(--ink)" }}>{l.split("—")[0].trim()}</span>{l.includes("—") ? <> — {l.split("—").slice(1).join("—").trim()}</> : null}</span>
              </li>
            ))}
          </ol>
          <p className="body-s text-ink-mute italic mt-8 max-w-3xl">{P.revenue.footnote}</p>
        </div>
      </section>

      {/* GLOSSARY */}
      <section className="bg-paper section-y" data-testid="section-glossary">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{P.glossary.eyebrow}</p>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 max-w-5xl">
            {P.glossary.items.map((g) => (
              <div key={g.term} data-testid={`glossary-${g.term.replace(/\s+/g, "-")}`}>
                <dt className="h3 text-ink mb-2">{g.term}</dt>
                <dd className="body-m text-ink-2">{g.def}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ECOSYSTEM BELT */}
      <section className="bg-paper-2 section-y rule-y" data-testid="section-product-ecosystem">
        <div className="container-x mb-10">
          <p className="mono-cap text-ink-mute mb-4">DESIGNED TO CONNECT WITH</p>
          <h2 className="display-s text-ink max-w-3xl">The proactive stack the practitioner already uses.</h2>
        </div>
        <EcosystemMarquee rows={2} />
      </section>

      {/* COMMON QUESTIONS */}
      <section className="bg-paper section-y" data-testid="section-product-faq">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">COMMON QUESTIONS</p>
          <div className="max-w-4xl divide-y" style={{ borderColor: "var(--rule)" }}>
            {FAQ_QA.map((q, i) => (
              <details key={i} className="py-6 group" data-testid={`product-faq-${i}`}>
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

      {/* CLOSER */}
      <section className="grad grad-06-horizon section-y" data-testid="section-product-closer">
        <div className="container-x text-center max-w-3xl mx-auto">
          <h2 className="display-l text-paper text-balance" style={{ fontWeight: 800 }}>{P.closer.h}</h2>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link href="/waitlist" className="btn btn-primary btn-on-dark w-full sm:w-auto" data-testid="button-product-primary">{P.closer.primary}</Link>
            <Link href="/ecosystem" className="btn btn-secondary btn-on-dark w-full sm:w-auto" data-testid="button-product-secondary">{P.closer.secondary}</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
