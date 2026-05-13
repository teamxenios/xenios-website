import PageShell from "@/components/PageShell";
import { content } from "@/lib/content";

export default function Security() {
  const S = content.security;
  return (
    <PageShell>
      <section className="grad grad-02-tide section-y" data-testid="section-security-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-2 mb-8">{S.eyebrow}</p>
          <h1 className="display-l text-ink text-balance max-w-4xl">{S.h1}</h1>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-security-body">
        <div className="container-x">
          <article className="max-w-prose mx-auto space-y-6">
            {S.intro.map((p, i) => (
              <p key={i} className="body-l text-ink-2">{p}</p>
            ))}

            <div className="rule-top pt-10 mt-10">
              <p className="mono-cap text-ink-mute mb-4">{S.posture.h}</p>
              <ul className="space-y-3">
                {S.posture.items.map((b, i) => (
                  <li key={i} className="body-l text-ink-2 flex gap-3">
                    <span className="text-pulse" aria-hidden="true">—</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rule-top pt-10 mt-10">
              <p className="mono-cap text-ink-mute mb-4">{S.promises.h}</p>
              <ul className="space-y-3">
                {S.promises.items.map((b, i) => (
                  <li key={i} className="body-l text-ink-2 flex gap-3">
                    <span className="text-pulse" aria-hidden="true">—</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rule-top pt-10 mt-10">
              <p className="mono-cap text-ink-mute mb-4">{S.limits.h}</p>
              <p className="body-l text-ink-2">{S.limits.body}</p>
            </div>

            <p className="quote-lead text-ink mt-12">{S.closer}</p>
          </article>
        </div>
      </section>
    </PageShell>
  );
}
