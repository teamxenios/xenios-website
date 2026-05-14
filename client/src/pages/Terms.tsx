import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { content } from "@/lib/content";

export default function Terms() {
  const T = content.terms;
  return (
    <PageShell>
      <SeoHead {...T.seo} />
      <section className="bg-paper section-y" data-testid="section-terms">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{T.eyebrow}</p>
          <h1 className="display-l text-ink mb-10">{T.h1}</h1>
          <article className="max-w-prose space-y-6">
            {T.paragraphs.map((p, i) => (
              <p key={i} className="body-l text-ink-2">{p}</p>
            ))}
          </article>
        </div>
      </section>
    </PageShell>
  );
}
