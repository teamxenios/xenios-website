import { useState } from "react";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import WaitlistForm from "@/components/WaitlistForm";
import Counter from "@/components/Counter";
import { PAGES, content } from "@/lib/content";

export default function Waitlist() {
  const WL = content.waitlistPage;
  const [done, setDone] = useState<{ name: string } | null>(null);

  return (
    <PageShell>
      <SeoHead {...PAGES.waitlist} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">{WL.headline}</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "18ch" }}>You build the work upstream. We build the operating system.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">{WL.sub}</p>
        <div className="mt-8">
          <Counter variant="line" suffix="coaches, trainers, and practitioners" />
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12">
          <div>
            {done ? (
              <div className="space-y-4" data-testid="waitlist-success">
                <p className="mono-cap text-pulse">YOU'RE IN{done.name ? `, ${done.name.toUpperCase()}` : ""}</p>
                <h2 className="display-l">You're on the xenios waitlist.</h2>
                <p className="body-l text-ink-2 max-w-[60ch]">
                  Check your email for confirmation. We onboard coaches in small groups, so we will reach out as soon as a spot opens.
                </p>
              </div>
            ) : (
              <WaitlistForm onSuccess={(info) => setDone({ name: info.name })} />
            )}
          </div>
          <aside>
            <p className="mono-cap text-ink-mute mb-4">WHAT YOU GET</p>
            <ul className="space-y-3 mb-10">
              {WL.youWillGet.map((g) => (
                <li key={g} className="body-m text-ink-2 grid grid-cols-[14px_1fr] gap-3">
                  <span className="text-pulse">→</span>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
            <p className="mono-cap text-ink-mute mb-4">HOW WE TREAT YOU</p>
            <ul className="space-y-3">
              {WL.trustBlock.map((t) => (
                <li key={t} className="body-s text-ink-2">{t}</li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </PageShell>
  );
}
