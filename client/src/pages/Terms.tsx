import PageShell from "@/components/PageShell";
import { content } from "@/lib/content";

export default function Terms() {
  const t = content.terms;
  return (
    <PageShell>
      <section className="container-x pt-16 md:pt-24 pb-24 max-w-3xl">
        <p className="eyebrow text-ink-muted mb-8">{t.eyebrow}</p>
        <h1 className="h1-page mb-12" data-testid="text-terms-h1">{t.h1}</h1>
        <div className="space-y-6 body-base text-ink-soft">
          {t.paragraphs.map((p, i) => (
            <p key={i} data-testid={`text-terms-p-${i}`}>{p}</p>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
