import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

const TEAM_LINES = [
  "xenios is built by a small, senior team with a large bench around it.",
  "The founder built and scaled a healthcare company through COVID, then spent a year interviewing more than two hundred coaches and clinicians before writing a single line of code.",
  "Engineering is led by an operator who has built and exited companies across healthcare and payments, including inside a payments company acquired by a major bank, and who has architected the kind of regulated structures xenios runs on.",
  "Clinical thinking comes from a practicing physician who has led inside major hospital systems and a national telehealth company.",
  "Around them sits a bench across product, clinical operations, sports science, growth, and brand, with advisors in clinical informatics, applied sports science, consumer growth, and engineering.",
  "The team's roots run deep in professional sports and elite coaching, across the NFL, NBA, and NHL, and into entertainment. Those relationships open doors no marketing budget can buy.",
  "Our agents are built on a frontier open-source AI framework backed by some of the most respected investors in the field.",
];

export default function About() {
  return (
    <PageShell>
      <SeoHead {...PAGES.about} />

      {/* Block 1 - What xenios is (lead) */}
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">ABOUT</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "22ch" }}>An AI workspace for coaches.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]" data-testid="text-about-lead">
          xenios helps coaches manage more clients without losing the human relationship. One workspace that drafts the busywork and keeps every client record connected.
        </p>
        <p className="mt-4 body-l text-ink-2 max-w-[60ch]">
          It is built for coaches first, with clinicians, nutritionists, and performance teams alongside them.
        </p>
      </section>

      {/* Block 2 - Why we are building it */}
      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">WHY WE ARE BUILDING IT</p>
        <p className="body-l text-ink-2 max-w-[64ch]" data-testid="text-about-why">
          We started from a simple belief: the trusted relationship between a coach and a client is the thing that actually changes behavior, and it does not scale, because trust does not scale. AI is the first technology that can extend that relationship without breaking it. So we are building the system that gives a coach leverage without ever replacing them.
        </p>
        <p className="mt-8 quote-lead text-ink">The AI drafts. The coach decides.</p>
      </section>

      {/* Block 3 - The team (background and role only, no names) */}
      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">THE TEAM</p>
        <p className="h3 text-ink mb-8 max-w-[60ch]" data-testid="text-about-team-lead">
          We are building quietly for now, so this page stays light on names. The background behind the work does not.
        </p>
        <div className="space-y-5 max-w-[64ch]">
          {TEAM_LINES.map((line, i) => (
            <p key={i} className="body-l text-ink-2" data-testid={`text-about-team-${i}`}>
              {line}
            </p>
          ))}
        </div>
      </section>

      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[26ch]">Build with us.</h2>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/careers" className="btn btn-primary btn-on-dark">Open roles</Link>
            <Link href="/contact" className="btn btn-ghost-on-dark">Talk to us</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
