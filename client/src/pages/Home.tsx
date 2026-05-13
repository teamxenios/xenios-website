import type { ReactNode } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import TopRibbon from "@/components/TopRibbon";
import WaitlistForm from "@/components/WaitlistForm";
import { content } from "@/lib/content";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }
};

function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`eyebrow ${className}`}>{children}</span>;
}

function HeroSection() {
  const h = content.home.hero;
  return (
    <section className="bg-paper pt-16 pb-24 lg:pt-24 lg:pb-32 border-b border-hairline" data-testid="section-hero">
      <div className="container mx-auto px-6 lg:px-16">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <motion.div className="lg:col-span-7" {...fadeUp}>
            <Eyebrow>{h.eyebrow}</Eyebrow>
            <h1 className="font-display font-bold text-ink text-5xl sm:text-6xl lg:text-[88px] leading-[1.02] tracking-[-0.02em] mt-6" data-testid="text-hero-title">
              {h.title.line1}
              <br />
              {h.title.line2}
            </h1>
            <p className="text-lg lg:text-xl text-mono-500 max-w-xl leading-relaxed mt-8" data-testid="text-hero-subhead">
              {h.subhead}
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-10">
              <Link
                href="/waitlist"
                className="inline-flex items-center gap-2 bg-orange text-ink px-6 py-3.5 rounded-lg font-semibold text-base hover:bg-[hsl(var(--orange-hover))] transition-colors active:scale-[0.98]"
                data-testid="button-hero-cta-primary"
              >
                {h.ctaPrimary} <ArrowRight size={18} />
              </Link>
              <Link
                href="/manifesto"
                className="inline-flex items-center gap-2 text-ink underline underline-offset-4 decoration-1 hover:text-orange transition-colors text-base font-medium"
                data-testid="link-hero-cta-secondary"
              >
                {h.ctaSecondary} →
              </Link>
            </div>
            <p className="text-xs text-mono-300 mt-5">{h.microcopy}</p>
          </motion.div>

          <motion.div className="lg:col-span-5" {...fadeUp} transition={{ duration: 0.6, delay: 0.1 }}>
            <ProductMock />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ProductMock() {
  const clients = [
    { initials: "AM", name: "Alex M.", status: "At risk", color: "bg-orange text-ink" },
    { initials: "JK", name: "Jordan K.", status: "Steady", color: "bg-cream text-ink" },
    { initials: "ST", name: "Sam T.", status: "Crushing it", color: "bg-[hsl(var(--success))] text-ink" },
    { initials: "CL", name: "Chris L.", status: "Steady", color: "bg-cream text-ink" }
  ];
  return (
    <div className="bg-ink rounded-2xl p-5 shadow-2xl border border-hairline-ink rotate-[-1deg]" aria-hidden>
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[11px] text-mono-300 uppercase tracking-widest">roster · today</span>
        <span className="flex items-center gap-1.5 text-[11px] font-mono text-orange">
          <span className="w-1.5 h-1.5 rounded-full bg-orange animate-pulse-dot" />
          3 need you today
        </span>
      </div>
      <div className="space-y-2">
        {clients.map((c) => (
          <div key={c.initials} className="flex items-center justify-between bg-[hsl(var(--hairline-ink))]/40 border border-hairline-ink rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-cream/10 text-cream text-xs font-mono flex items-center justify-center">{c.initials}</div>
              <span className="text-cream text-sm">{c.name}</span>
            </div>
            <span className={`${c.color} px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider`}>{c.status}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-hairline-ink pt-4">
        <div className="font-mono text-[10px] text-mono-300 uppercase tracking-widest mb-2">agent · alex m.</div>
        <div className="bg-[hsl(var(--hairline-ink))]/30 border border-hairline-ink rounded-lg p-3 text-cream text-xs leading-relaxed">
          Hey Alex — saw your sleep dipped to 5.2 hrs last night. Want to swap today's lift for a Z2 walk and a mobility flow? I can move the squat session to Thursday.
        </div>
        <div className="flex gap-2 mt-3">
          <button className="bg-orange text-ink px-3 py-1.5 rounded text-[11px] font-semibold">Send as-is</button>
          <button className="border border-hairline-ink text-mono-100 px-3 py-1.5 rounded text-[11px]">Edit</button>
          <button className="border border-hairline-ink text-mono-100 px-3 py-1.5 rounded text-[11px]">Regenerate</button>
        </div>
      </div>
    </div>
  );
}

function MetricsStrip() {
  const m = content.home.metrics;
  return (
    <section className="bg-paper-elevated py-20 border-b border-hairline" data-testid="section-metrics">
      <div className="container mx-auto px-6 lg:px-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {m.items.map((item, i) => (
            <motion.div key={i} {...fadeUp} transition={{ duration: 0.4, delay: i * 0.05 }}>
              <div className="font-display text-5xl lg:text-6xl text-ink leading-none mb-3" data-testid={`metric-value-${i}`}>{item.value}</div>
              <div className="text-mono-500 text-sm leading-snug" data-testid={`metric-label-${i}`}>{item.label}</div>
            </motion.div>
          ))}
        </div>
        <p className="text-right text-[11px] text-mono-300 mt-8">{m.footnote}</p>
      </div>
    </section>
  );
}

function ThesisSection() {
  const t = content.home.thesis;
  return (
    <section className="bg-ink py-24 lg:py-32 text-cream" data-testid="section-thesis">
      <div className="container mx-auto px-6 lg:px-16">
        <motion.div {...fadeUp} className="max-w-3xl mb-16">
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h2 className="font-display text-4xl lg:text-5xl text-cream mt-5 leading-tight">{t.h2}</h2>
          <p className="text-mono-100 text-lg mt-6 leading-relaxed">{t.lede}</p>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-5">
          {t.cards.map((card, i) => (
            <motion.div
              key={i}
              {...fadeUp}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="border border-hairline-ink rounded-2xl p-7 bg-ink hover:-translate-y-0.5 transition-transform"
              data-testid={`thesis-card-${i}`}
            >
              <div className="font-mono text-orange text-sm mb-4">{card.number} /</div>
              <h3 className="font-display text-2xl text-cream mb-3 leading-snug">{card.title}</h3>
              <p className="text-mono-100 text-[15px] leading-relaxed">{card.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const h = content.home.howItWorks;
  return (
    <section className="bg-paper py-24 lg:py-32 border-b border-hairline" data-testid="section-how-it-works">
      <div className="container mx-auto px-6 lg:px-16">
        <motion.div {...fadeUp} className="max-w-3xl mb-16">
          <Eyebrow>{h.eyebrow}</Eyebrow>
          <h2 className="font-display text-4xl lg:text-5xl text-ink mt-5 leading-tight">{h.h2}</h2>
          <p className="text-mono-500 text-lg mt-6 leading-relaxed">{h.lede}</p>
        </motion.div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-hairline border border-hairline rounded-2xl overflow-hidden">
          {h.steps.map((step, i) => (
            <motion.div
              key={i}
              {...fadeUp}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="bg-paper-elevated p-7 flex flex-col"
              data-testid={`how-step-${i}`}
            >
              <div className="flex items-baseline gap-3 mb-5">
                <span className="font-mono text-orange text-sm">{step.number}</span>
                <span className="font-mono text-mono-300 text-xs uppercase tracking-widest">{step.name}</span>
              </div>
              <h3 className="font-display text-xl text-ink mb-3 leading-snug">{step.title}</h3>
              <p className="text-mono-500 text-sm leading-relaxed">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="bg-paper-elevated py-24 lg:py-32 border-b border-hairline" data-testid="section-features">
      <div className="container mx-auto px-6 lg:px-16 space-y-24">
        {content.home.features.map((f, i) => (
          <motion.div
            key={i}
            {...fadeUp}
            className="grid lg:grid-cols-12 gap-10 items-start"
            data-testid={`feature-${i}`}
          >
            <div className="lg:col-span-5">
              <Eyebrow>{f.eyebrow}</Eyebrow>
              <h3 className="font-display text-3xl lg:text-4xl text-ink mt-4 leading-tight">{f.h3}</h3>
            </div>
            <div className="lg:col-span-7">
              <p className="text-mono-500 text-lg leading-relaxed mb-6">{f.body}</p>
              <ul className="space-y-3">
                {f.bullets.map((b, j) => (
                  <li key={j} className="flex gap-3 text-mono-500 text-[15px] leading-relaxed">
                    <span className="text-orange font-mono">→</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function AudienceSection() {
  const a = content.home.audience;
  return (
    <section id="audience" className="bg-paper py-24 lg:py-32 border-b border-hairline" data-testid="section-audience">
      <div className="container mx-auto px-6 lg:px-16">
        <motion.div {...fadeUp} className="max-w-3xl mb-14">
          <Eyebrow>{a.eyebrow}</Eyebrow>
          <h2 className="font-display text-4xl lg:text-5xl text-ink mt-5 leading-tight">{a.h2}</h2>
        </motion.div>
        <div className="grid md:grid-cols-2 gap-6">
          {[a.coaches, a.clients].map((card, i) => (
            <motion.div
              key={i}
              {...fadeUp}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className={`rounded-2xl p-8 lg:p-10 border ${
                i === 0
                  ? "bg-ink text-cream border-hairline-ink"
                  : "bg-paper-elevated text-ink border-hairline"
              }`}
              data-testid={`audience-card-${i}`}
            >
              <h3 className={`font-display text-2xl lg:text-3xl mb-5 leading-snug ${i === 0 ? "text-cream" : "text-ink"}`}>
                {card.title}
              </h3>
              <div className={`text-[15px] leading-relaxed mb-7 whitespace-pre-line ${i === 0 ? "text-mono-100" : "text-mono-500"}`}>
                {card.body}
              </div>
              {i === 0 ? (
                <Link
                  href="/waitlist"
                  className="inline-flex items-center gap-2 bg-orange text-ink px-5 py-3 rounded-lg font-semibold text-sm hover:bg-[hsl(var(--orange-hover))] transition-colors"
                >
                  {card.cta} →
                </Link>
              ) : (
                <a
                  href={`mailto:?subject=${encodeURIComponent("You should see this")}&body=${encodeURIComponent("I think Xenios is built for you: https://xeniostechnology.com")}`}
                  className="inline-flex items-center gap-2 border border-ink text-ink px-5 py-3 rounded-lg font-semibold text-sm hover:bg-ink hover:text-cream transition-colors"
                >
                  {card.cta} →
                </a>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  const t = content.home.trust;
  return (
    <section className="bg-paper-elevated py-24 lg:py-32 border-b border-hairline" data-testid="section-trust">
      <div className="container mx-auto px-6 lg:px-16">
        <motion.div {...fadeUp} className="max-w-3xl mb-14">
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h2 className="font-display text-4xl lg:text-5xl text-ink mt-5 leading-tight">{t.h2}</h2>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-px bg-hairline border border-hairline rounded-2xl overflow-hidden">
          {t.signals.map((s, i) => (
            <div key={i} className="bg-paper-elevated p-8" data-testid={`trust-signal-${i}`}>
              <div className="font-display text-3xl lg:text-4xl text-ink mb-4 leading-tight">{s.headline}</div>
              <p className="text-mono-500 text-[15px] leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-mono-300 mt-8">{t.microcopy}</p>
      </div>
    </section>
  );
}

function TeamSection() {
  const t = content.home.team;
  return (
    <section className="bg-ink py-24 lg:py-32 text-cream" data-testid="section-team">
      <div className="container mx-auto px-6 lg:px-16 max-w-4xl">
        <Eyebrow>{t.eyebrow}</Eyebrow>
        <motion.h2 {...fadeUp} className="font-display text-4xl lg:text-5xl text-cream mt-5 leading-tight mb-8">
          {t.h2}
        </motion.h2>
        <div className="space-y-5 text-mono-100 text-lg leading-relaxed">
          {t.body.map((p, i) => <p key={i}>{p}</p>)}
        </div>
        <Link
          href="/careers"
          className="inline-flex items-center gap-2 mt-10 text-orange font-semibold hover:underline underline-offset-4"
          data-testid="link-team-careers"
        >
          {t.cta} →
        </Link>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  const f = content.home.finalCta;
  return (
    <section id="waitlist" className="bg-paper py-24 lg:py-32" data-testid="section-final-cta">
      <div className="container mx-auto px-6 lg:px-16 max-w-2xl text-center">
        <motion.h2 {...fadeUp} className="font-display text-4xl lg:text-6xl text-ink leading-[1.05] tracking-tight">
          {f.h2Line1}
          <br />
          {f.h2Line2}
        </motion.h2>
        <p className="text-mono-500 text-lg mt-6 leading-relaxed">{f.body}</p>
        <div className="mt-10 text-left">
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-paper text-ink font-sans overflow-x-hidden">
      <TopRibbon />
      <Navbar />
      <HeroSection />
      <MetricsStrip />
      <ThesisSection />
      <HowItWorksSection />
      <FeaturesSection />
      <AudienceSection />
      <TrustSection />
      <TeamSection />
      <FinalCtaSection />
      <Footer />
    </div>
  );
}
