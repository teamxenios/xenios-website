import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

const HERITAGE = [
  { name: "FinDox", body: "Acquired by Confluence Technologies. Document and data infrastructure for institutional finance." },
  { name: "InstaMed", body: "Acquired by JPMorgan Chase for $500M+. The healthcare payments rail used by hundreds of providers and millions of patients." },
];

export default function About() {
  return (
    <PageShell>
      <SeoHead {...PAGES.about} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">ABOUT</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "20ch" }}>Built in Austin by operators behind $710M+ in prior exits.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          xenios (Xenios Technologies, Inc.) is in stealth, pre-seed, headquartered in Austin, Texas. The team comes from the front lines of healthcare infrastructure and proactive health.
        </p>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">FOUNDER</p>
        <h2 className="display-l mb-6">Alex Houston</h2>
        <div className="space-y-4 max-w-[64ch]">
          <p className="body-l text-ink-2">
            Alex is the founder, and he has spent his career building infrastructure for the parts of healthcare and finance that the rest of the industry treats as someone else's problem.
          </p>
          <p className="body-l text-ink-2">
            Most recently he led product at a healthcare payments rail used by hundreds of providers and millions of patients. Before that he built and shipped data infrastructure for institutional finance. He sees coaches, trainers, and practitioners as the next operator class to be given infrastructure as serious as the work.
          </p>
          <p className="body-l text-ink-2">
            He lives in Austin. He works upstream.
          </p>
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">HERITAGE</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {HERITAGE.map((h) => (
            <div key={h.name} className="rule-all p-6 rounded-[12px]">
              <h3 className="h3 mb-2">{h.name}</h3>
              <p className="body-m text-ink-2">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">WHERE</p>
        <p className="body-l text-ink-2 max-w-[60ch]">
          Headquartered in Austin, Texas. Remote first. Austin preferred for the founding team.
        </p>
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
