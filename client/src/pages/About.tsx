import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import { content } from "@/lib/content";

export default function About() {
  const A = content.about;
  return (
    <PageShell>
      <section className="grad grad-05-meadow section-y" data-testid="section-about-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-2 mb-8">{A.eyebrow}</p>
          <h1 className="display-l text-ink text-balance max-w-4xl">{A.h1}</h1>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-about-body">
        <div className="container-x">
          <article className="max-w-prose mx-auto space-y-6">
            {A.intro.map((p, i) => (
              <p key={i} className="body-l text-ink-2">{p}</p>
            ))}

            <div className="rule-top pt-10 mt-10">
              <p className="mono-cap text-ink-mute mb-4">{A.team.h}</p>
              <p className="body-l text-ink-2">{A.team.body}</p>
            </div>

            <div className="rule-top pt-10 mt-10">
              <p className="mono-cap text-ink-mute mb-4">{A.beliefs.h}</p>
              <ul className="space-y-3">
                {A.beliefs.items.map((b, i) => (
                  <li key={i} className="body-l text-ink-2 flex gap-3">
                    <span className="text-pulse" aria-hidden="true">—</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rule-top pt-10 mt-10">
              <p className="mono-cap text-ink-mute mb-4">{A.company.h}</p>
              <p className="body-l text-ink-2">{A.company.body}</p>
              <div className="flex flex-wrap gap-3 mt-6">
                {A.company.links.map((l) => (
                  <Link key={l.href} href={l.href} className="btn btn-secondary" data-testid={`link-about-${l.href.replace(/[^a-z]/g, "")}`}>
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          </article>
        </div>
      </section>
    </PageShell>
  );
}
