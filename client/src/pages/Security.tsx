import PageShell from "@/components/PageShell";
import { content } from "@/lib/content";

export default function Security() {
  const s = content.security;
  return (
    <PageShell>
      <section className="container-x pt-16 md:pt-24 pb-12 max-w-4xl">
        <p className="eyebrow text-orange-fire mb-8">{s.eyebrow}</p>
        <h1 className="h1-page mb-10 text-balance" data-testid="text-security-h1">{s.h1}</h1>
        <p className="body-lg text-ink-soft">{s.lead}</p>
      </section>

      <section className="container-x pb-24 max-w-4xl space-y-12">
        {s.sections.map((sec, i) => (
          <div key={i} className="rule-top pt-10" data-testid={`security-section-${i}`}>
            <h2 className="h3-sub mb-4">{sec.h2}</h2>
            <p className="body-base text-ink-soft">{sec.body}</p>
          </div>
        ))}

        <div className="rule-top pt-10">
          <a
            href={`mailto:${content.contact.email}`}
            className="btn btn-primary"
            data-testid="button-security-contact"
          >
            Contact us → {content.contact.email}
          </a>
        </div>
      </section>
    </PageShell>
  );
}
