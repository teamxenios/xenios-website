import { useState } from "react";
import PageShell from "@/components/PageShell";
import WaitlistForm from "@/components/WaitlistForm";
import Counter from "@/components/Counter";
import { content } from "@/lib/content";

export default function Waitlist() {
  const WL = content.waitlistPage;
  const [success, setSuccess] = useState<{ position: number; email: string; firstName: string; duplicate?: boolean } | null>(null);

  return (
    <PageShell>
      <section className="grad grad-01-dawn section-y" data-testid="section-waitlist-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-2 mb-8">{WL.eyebrow}</p>
          <h1 className="display-l text-ink text-balance max-w-4xl">{WL.h1}</h1>
          <p className="body-l mt-8 text-ink-2 max-w-2xl">{WL.sub}</p>
          <div className="mt-10">
            <Counter variant="line" suffix={WL.counterSuffix} />
          </div>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-waitlist-form">
        <div className="container-x">
          <div className="max-w-2xl mx-auto">
            {success ? (
              <div className="space-y-6" data-testid="waitlist-success">
                <p className="mono-cap text-ink-mute">{WL.successTitle}</p>
                <p className="display-l text-ink">You're <span className="tabular">#{success.position}</span></p>
                <p className="body-l text-ink-2">{WL.successPositionLabel}.</p>
                <p className="body-l text-ink-2">{WL.successBody.replace("{email}", success.email)}</p>
                <ul className="space-y-2 mt-6">
                  {WL.successLinks.map((l, i) => (
                    <li key={i}>
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className="body-l underline underline-offset-2 hover:text-pulse" data-testid={`link-success-${i}`}>{l.label}</a>
                    </li>
                  ))}
                </ul>
                <p className="body-m text-ink-mute italic mt-6">{WL.successCloser}</p>
                {success.duplicate && (
                  <p className="mono-cap text-ink-mute">(You were already on the list — your spot is unchanged.)</p>
                )}
              </div>
            ) : (
              <WaitlistForm onSuccess={(info) => setSuccess(info)} />
            )}
          </div>
        </div>
      </section>

      <section className="bg-paper-2 section-y rule-top" data-testid="section-waitlist-trust">
        <div className="container-x">
          <div className="max-w-3xl space-y-3">
            {WL.trustBlock.map((line, i) => (
              <p key={i} className="body-m text-ink-2" data-testid={`text-trust-${i}`}>{line}</p>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
