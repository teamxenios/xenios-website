import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import { content } from "@/lib/content";

export default function About() {
  const a = content.about;
  return (
    <PageShell>
      <section className="container-x pt-16 md:pt-24 pb-12 max-w-4xl">
        <p className="eyebrow text-orange-fire mb-8">{a.eyebrow}</p>
        <h1 className="display-md mb-12 text-balance" style={{ textTransform: "none" }} data-testid="text-about-h1">
          {a.h1}
        </h1>
        <p className="body-lg text-ink-soft">{a.lead}</p>
      </section>

      <section className="container-x pb-20 max-w-4xl space-y-16">
        {a.sections.map((s, i) => (
          <div key={i} data-testid={`about-section-${i}`} className="rule-top pt-12">
            <h2 className="h2-section mb-8">{s.h2}</h2>
            <p className="body-lg text-ink-soft mb-6">{s.body}</p>
            {"list" in s && s.list && (
              <ul className="space-y-3 body-base text-ink-muted">
                {s.list.map((item, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="text-orange-fire">—</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        <div className="flex flex-wrap gap-4 pt-8">
          <Link href="/careers" className="btn btn-primary" data-testid="button-about-careers">
            See open roles →
          </Link>
          <a href={`mailto:${content.contact.email}`} className="btn btn-secondary" data-testid="button-about-email">
            {content.contact.email}
          </a>
        </div>
      </section>
    </PageShell>
  );
}
