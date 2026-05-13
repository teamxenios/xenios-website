import PageShell from "@/components/PageShell";
import { content } from "@/lib/content";

export default function Privacy() {
  const P = content.privacy;
  return (
    <PageShell>
      <section className="bg-paper section-y" data-testid="section-privacy">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{P.eyebrow}</p>
          <h1 className="display-l text-ink mb-10">{P.h1}</h1>
          <article className="max-w-prose space-y-6">
            {P.paragraphs.map((p, i) => (
              <p key={i} className="body-l text-ink-2">{p}</p>
            ))}
          </article>
        </div>
      </section>
    </PageShell>
  );
}
