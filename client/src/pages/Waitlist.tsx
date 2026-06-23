import { useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import WaitlistForm from "@/components/WaitlistForm";
import Counter from "@/components/Counter";
import { PAGES, content } from "@/lib/content";

const NEXT_STEPS = [
  "Submit the short form.",
  "The founder or team reviews fit and timing.",
  "You receive a short conversation invite or onboarding email.",
  "A small cohort gets early access and direct feedback loops with the team.",
];

export default function Waitlist() {
  const WL = content.waitlistPage;
  const [done, setDone] = useState<{ name: string } | null>(null);

  return (
    <PageShell>
      <SeoHead {...PAGES.waitlist} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">EARLY ACCESS</p>
        <h1 className="display-xl text-balance max-w-[18ch]">Apply for the founding group.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[62ch]">
          xenios is opening to a small group of serious coaches and health professionals who want one inbox, one client record, and AI drafts they still control.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <a href="#application" className="btn btn-primary">Submit Application</a>
          <Link href="/book" className="btn btn-ghost">Book a Product Walkthrough</Link>
        </div>
        <div className="mt-8">
          <Counter variant="line" suffix="coaches, trainers, and practitioners" />
        </div>
      </section>

      <section id="application" className="container-x py-16 rule-top" style={{ scrollMarginTop: 120 }}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12 lg:gap-16 items-start">
          <div>
            {done ? (
              <div className="space-y-4" data-testid="waitlist-success">
                <p className="mono-cap text-pulse">APPLICATION RECEIVED{done.name ? `, ${done.name.toUpperCase()}` : ""}</p>
                <h2 className="display-l">You are on the xenios waitlist.</h2>
                <p className="body-l text-ink-2 max-w-[60ch]">
                  Check your email for confirmation. We onboard coaches in small groups, so we will reach out as soon as a spot opens.
                </p>
              </div>
            ) : (
              <WaitlistForm onSuccess={(info) => setDone({ name: info.name })} />
            )}
          </div>
          <aside className="space-y-10">
            <div className="rule-all rounded-[16px] p-6 bg-paper">
              <p className="mono-cap text-ink-mute mb-4">WHAT YOU GET</p>
              <ul className="space-y-3">
                {WL.youWillGet.map((g) => (
                  <li key={g} className="body-m text-ink-2 grid grid-cols-[14px_1fr] gap-3">
                    <span className="text-pulse">→</span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rule-all rounded-[16px] p-6 bg-paper">
              <p className="mono-cap text-ink-mute mb-4">WHAT HAPPENS NEXT</p>
              <div className="space-y-3">
                {NEXT_STEPS.map((step, index) => (
                  <div key={step} className="grid grid-cols-[30px_1fr] gap-3">
                    <span className="mono-cap text-pulse">0{index + 1}</span>
                    <p className="body-s text-ink-2">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rule-all rounded-[16px] p-6 bg-paper">
              <p className="mono-cap text-ink-mute mb-4">HOW WE TREAT YOU</p>
              <ul className="space-y-3">
                {WL.trustBlock.map((t) => (
                  <li key={t} className="body-s text-ink-2">{t}</li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </PageShell>
  );
}
