import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

export default function About() {
  return (
    <PageShell>
      <SeoHead title={PAGES.about.title} description={PAGES.about.description} canonical="/about" />
      <section className="grad grad-01-dawn section-y" data-testid="section-about-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">ABOUT</p>
          <h1 className="display-xl text-ink text-balance" style={{ maxWidth: "24ch" }}>Built in Austin. Built to last.</h1>
        </div>
      </section>

      <section className="bg-paper section-y">
        <div className="container-x max-w-4xl space-y-6">
          <p className="quote-lead text-ink-2">
            xenios is built by a team that has spent two decades shipping infrastructure into the most regulated, most consequential corners of U.S. healthcare and finance.
          </p>
          <p className="body-l text-ink-2">
            Two of the team's prior companies — FinDox (acquired by Donnelley Financial Solutions) and InstaMed (acquired by JPMorgan Chase, 2019) — combined for $710M+ in enterprise outcomes. Both shipped boring layers underneath payments, compliance, and clinical data exchange — the layers that look invisible right up until they are missing.
          </p>
          <p className="body-l text-ink-2">
            We are building xenios with that same standard. Pre-seed. In stealth. In Austin, Texas — which is becoming the gravitational center of proactive health in America.
          </p>
        </div>
      </section>

      <section className="grad grad-03-fieldwork section-y" data-testid="section-five-beliefs">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">FIVE BELIEFS</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              ["Healthcare leverage belongs to the practitioner doing the work.", "Software should hand it to them, not extract it from them."],
              ["This decade decides the next fifty years of human health.", "We're building infrastructure for the long arc — not the cycle."],
              ["AI is the substrate, not the product.", "The agent acts in the practitioner's voice and judgment, or it has no place in this stack."],
              ["The proactive health ecosystem is the most fragmented it has ever been.", "xenios is the connective tissue."],
              ["Boring infrastructure is what wins regulated environments.", "We've shipped it before. We're shipping it again."],
            ].map(([h, b], i) => (
              <article key={i} className="card">
                <p className="mono-cap text-pulse">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="h2 mt-3 text-ink">{h}</h3>
                <p className="body-m mt-4 text-ink-2">{b}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grad grad-06-horizon section-y">
        <div className="container-x">
          <h2 className="display-l text-paper text-balance max-w-4xl">Build with us.</h2>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Link href="/careers" className="btn btn-primary btn-on-dark">see open roles →</Link>
            <Link href="/waitlist" className="btn btn-secondary btn-on-dark">join the waitlist</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
