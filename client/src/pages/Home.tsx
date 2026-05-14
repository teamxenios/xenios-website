import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import RotatingHero from "@/components/RotatingHero";
import Counter from "@/components/Counter";
import { PAGES, SURFACES, ECOSYSTEM_CATEGORIES, ICP_LIST, REPLACES, CAPABILITIES } from "@/lib/content";

export default function Home() {
  return (
    <PageShell>
      <SeoHead {...PAGES.home} />

      {/* HERO */}
      <section className="container-x pt-24 md:pt-36 pb-20 md:pb-32" data-testid="section-hero">
        <p className="mono-cap text-ink-mute mb-6">FOUNDING COHORT IS OPEN</p>
        <RotatingHero prefix="the operating system for" />
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          One inbox. One client record. One agent that drafts in your voice. One pocket coach for your clients. The AI-adjunct operations system for coaches, trainers, and practitioners.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link href="/waitlist" className="btn btn-primary" data-testid="button-hero-waitlist">Join the waitlist</Link>
          <Link href="/how-it-works" className="btn btn-ghost" data-testid="button-hero-how">See how it works</Link>
        </div>
        <div className="mt-10">
          <Counter variant="line" suffix="coaches, trainers, and practitioners on the waitlist" />
        </div>
      </section>

      {/* THE TWO SURFACES */}
      <section className="container-x py-20 md:py-32 rule-top" data-testid="section-surfaces">
        <p className="mono-cap text-ink-mute mb-8">TWO SURFACES, ONE OPERATING SYSTEM</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          {[SURFACES.coach, SURFACES.client].map((s) => (
            <article key={s.eyebrow} className={`surface-card grad-${s === SURFACES.coach ? "01-dawn" : "04-violet"} p-8 md:p-12 rounded-[20px]`} data-testid={`card-surface-${s.eyebrow.replace(/\s+/g, "-")}`}>
              <p className="mono-cap text-ink-mute mb-4">{s.eyebrow}</p>
              <h2 className="display-l text-ink mb-6">{s.title}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="body-l text-ink-2 mb-4">{p}</p>
              ))}
              <Link href={s.cta.href} className="mono-cap text-pulse hover:underline mt-4 inline-block">{s.cta.label} →</Link>
            </article>
          ))}
        </div>
      </section>

      {/* WHAT IT REPLACES */}
      <section className="container-x py-20 md:py-32 rule-top" data-testid="section-replaces">
        <h2 className="display-m mb-10 max-w-[24ch]">Retire the disconnected stack.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <p className="mono-cap text-ink-mute mb-4">YESTERDAY</p>
            <ul className="space-y-2">
              {REPLACES.oldLabels.map((l) => (
                <li key={l} className="body-l text-ink-2 line-through opacity-70">{l}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mono-cap text-ink-mute mb-4">TODAY</p>
            <ul className="space-y-2">
              {REPLACES.newLabels.map((l) => (
                <li key={l} className="body-l text-ink font-700">{l}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CAPABILITIES STRIP */}
      <section className="container-x py-20 md:py-32 rule-top" data-testid="section-capabilities">
        <h2 className="display-m mb-10 max-w-[28ch]">One operating system for the work you actually do.</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {CAPABILITIES.map((c) => (
            <div key={c.name} className="rule-all p-6 rounded-[12px]" data-testid={`card-capability-${c.name.replace(/\s+/g, "-").toLowerCase()}`}>
              <h3 className="h3 mb-2">{c.name}</h3>
              <p className="body-m text-ink-2">{c.body}</p>
            </div>
          ))}
        </div>
        <Link href="/product" className="btn btn-ghost mt-10 inline-block">See the full product</Link>
      </section>

      {/* WHO IT IS FOR (25 ICPs) */}
      <section className="container-x py-20 md:py-32 rule-top" data-testid="section-icps">
        <h2 className="display-m mb-10 max-w-[24ch]">Built for the people doing the work.</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {ICP_LIST.map((icp) => (
            <Link
              key={icp.slug}
              href={`/for/${icp.slug}`}
              className="rule-all p-4 rounded-[10px] hover:bg-paper-2 transition-colors"
              data-testid={`tile-icp-${icp.slug}`}
            >
              <p className="body-m font-700">{icp.label}</p>
            </Link>
          ))}
        </div>
        <Link href="/for-practitioners" className="btn btn-ghost mt-10 inline-block">All practitioner categories</Link>
      </section>

      {/* ECOSYSTEM */}
      <section className="container-x py-20 md:py-32 rule-top" data-testid="section-ecosystem">
        <h2 className="display-m mb-4 max-w-[24ch]">Connected to the proactive health stack.</h2>
        <p className="body-l text-ink-2 mb-10 max-w-[60ch]">Eighteen categories of partners and integrations across wearables, labs, recovery, nutrition, supplements, and more.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {ECOSYSTEM_CATEGORIES.map((cat) => (
            <div key={cat} className="rule-all p-4 rounded-[10px]" data-testid={`tile-ecosystem-${cat.replace(/\W+/g, "-").toLowerCase()}`}>
              <p className="body-m font-600">{cat}</p>
            </div>
          ))}
        </div>
        <Link href="/ecosystem" className="btn btn-ghost mt-10 inline-block">Explore the ecosystem</Link>
      </section>

      {/* HERITAGE */}
      <section className="container-x py-20 md:py-32 rule-top" data-testid="section-heritage">
        <p className="mono-cap text-ink-mute mb-4">HERITAGE</p>
        <p className="quote-lead max-w-[44ch]">
          Built in Austin by operators behind $710M+ in prior exits, including FinDox and InstaMed.
        </p>
        <Link href="/about" className="btn btn-ghost mt-8 inline-block">About the team</Link>
      </section>

      {/* FINAL CTA */}
      <section className="bg-ink text-paper py-24 md:py-32" data-testid="section-final-cta">
        <div className="container-x">
          <h2 className="display-l text-paper mb-6 max-w-[18ch]">The founding cohort is open.</h2>
          <p className="body-l text-paper/80 mb-8 max-w-[52ch]">
            Founder-direct onboarding. Founding pricing locked in for the life of your account. A seat in the room when we ship.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/waitlist" className="btn btn-primary btn-on-dark" data-testid="button-final-waitlist">Join the waitlist</Link>
            <Counter variant="line" suffix="already in line" onDark />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
