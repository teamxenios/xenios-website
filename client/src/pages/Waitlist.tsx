import { useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import Counter from "@/components/Counter";
import WaitlistForm from "@/components/WaitlistForm";
import { content } from "@/lib/content";

export default function Waitlist() {
  const w = content.waitlistPage;
  const [success, setSuccess] = useState<{ position: number; count: number } | null>(null);

  return (
    <PageShell>
      <section className="container-x pt-16 md:pt-24 pb-12">
        <p className="eyebrow text-orange-fire mb-8">{w.eyebrow}</p>
        <h1 className="display-md mb-8 text-balance" style={{ textTransform: "none" }} data-testid="text-waitlist-h1">
          {w.h1}
        </h1>
        <p className="body-lg text-ink-muted max-w-2xl mb-12">{w.lead}</p>

        <div className="rule-y py-10 mb-12">
          <Counter prefix={w.counterPrefix} suffix={w.counterSuffix} size="lg" align="left" />
          <p className="eyebrow text-ink-muted mt-6">{w.counterFootnote}</p>
        </div>
      </section>

      <section className="container-x pb-24 max-w-3xl">
        {success ? (
          <div className="atmos atmos-bone card text-center py-16" data-testid="state-success">
            <p className="eyebrow text-orange-fire mb-6">YOU'RE IN</p>
            <h2 className="display-md mb-6" style={{ textTransform: "none" }}>{w.successTitle}</h2>
            <p className="body-lg text-ink-muted mb-8 max-w-xl mx-auto">{w.successBody}</p>
            <p className="counter-digits text-5xl mb-2" data-testid="text-position">
              #{success.position}
              <span className="text-ink-muted text-2xl font-medium"> of {success.count}</span>
            </p>
            <p className="eyebrow text-ink-muted mb-8">YOUR POSITION</p>
            <Link href="/manifesto" className="btn btn-secondary">{w.successCta} →</Link>
          </div>
        ) : (
          <WaitlistForm onSuccess={setSuccess} />
        )}
      </section>
    </PageShell>
  );
}
