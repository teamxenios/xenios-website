import { useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import Counter from "@/components/Counter";
import WaitlistForm from "@/components/WaitlistForm";
import { PAGES, content } from "@/lib/content";

export default function Waitlist() {
  const WL = content.waitlistPage;
  const [done, setDone] = useState<{ position: number; email: string; firstName: string } | null>(null);

  return (
    <PageShell>
      <SeoHead title={PAGES.waitlist.title} description={PAGES.waitlist.description} canonical="/waitlist" />
      <section className="grad grad-01-dawn section-y" data-testid="section-waitlist">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{WL.eyebrow}</p>
          <h1 className="display-l text-ink text-balance" style={{ maxWidth: "24ch" }}>{WL.headline}</h1>
          <div className="mt-8">
            <Counter variant="line" suffix={WL.counter} />
          </div>
          <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-7">
              {done ? (
                <div className="card" data-testid="waitlist-success">
                  <p className="mono-cap text-pulse">YOU'RE IN</p>
                  <h2 className="display-m mt-3 text-ink">{WL.success.headline}</h2>
                  <p className="body-l mt-4 text-ink-2">{WL.success.sub(done.position, done.email)}</p>
                  <ul className="mt-6 space-y-2">
                    {WL.success.followups.map((f, i) => <li key={i} className="body-m text-ink-2">→ {f}</li>)}
                  </ul>
                  <p className="body-m mt-4 text-ink-2">{WL.success.tail}</p>
                </div>
              ) : (
                <WaitlistForm onSuccess={(info) => setDone({ position: info.position, email: info.email, firstName: info.firstName })} />
              )}
            </div>
            <aside className="lg:col-span-5 space-y-4">
              {WL.trustBlock.map((t, i) => (
                <p key={i} className="body-m text-ink-2 card">{t}</p>
              ))}
              <Link href="/manifesto" className="btn btn-ghost inline-flex">read the manifesto →</Link>
            </aside>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
