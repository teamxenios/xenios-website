import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, CAPABILITIES, SURFACES, REPLACES } from "@/lib/content";

export default function Product() {
  return (
    <PageShell>
      <SeoHead {...PAGES.product} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">PRODUCT</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "16ch" }}>One operating system. Two surfaces. Your voice everywhere.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          xenios is the AI-adjunct operations system for coaches, trainers, and practitioners. The xenios agent runs the back office. The xenios client agent holds the in-between.
        </p>
      </section>

      <section className="container-x py-20 rule-top">
        <p className="mono-cap text-ink-mute mb-10">CAPABILITIES</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {CAPABILITIES.map((c) => (
            <div key={c.name} className="rule-all p-6 md:p-8 rounded-[12px]" data-testid={`card-capability-${c.name.replace(/\s+/g, "-").toLowerCase()}`}>
              <h3 className="h3 mb-3">{c.name}</h3>
              <p className="body-m text-ink-2">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <h2 className="display-m mb-10 max-w-[24ch]">The two surfaces, in one system.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {[SURFACES.coach, SURFACES.client].map((s) => (
            <article key={s.eyebrow} className="rule-all p-8 rounded-[16px]">
              <p className="mono-cap text-ink-mute mb-3">{s.eyebrow}</p>
              <h3 className="display-s mb-4">{s.title}</h3>
              {s.body.map((p, i) => <p key={i} className="body-m text-ink-2 mb-3">{p}</p>)}
              <Link href={s.cta.href} className="mono-cap text-pulse hover:underline">{s.cta.label} →</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <h2 className="display-m mb-10 max-w-[24ch]">The stack you retire when xenios ships.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <p className="mono-cap text-ink-mute mb-4">YESTERDAY</p>
            <ul className="space-y-2">{REPLACES.oldLabels.map((l) => <li key={l} className="body-l line-through opacity-70">{l}</li>)}</ul>
          </div>
          <div>
            <p className="mono-cap text-ink-mute mb-4">TODAY</p>
            <ul className="space-y-2">{REPLACES.newLabels.map((l) => <li key={l} className="body-l font-700">{l}</li>)}</ul>
          </div>
        </div>
      </section>

      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[24ch]">Ready to see your stack on one rail?</h2>
          <Link href="/waitlist" className="btn btn-primary btn-on-dark">Join the waitlist</Link>
        </div>
      </section>
    </PageShell>
  );
}
