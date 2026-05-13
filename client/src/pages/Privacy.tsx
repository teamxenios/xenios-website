import PageShell from "@/components/PageShell";
import { content } from "@/lib/content";

export default function Privacy() {
  const p = content.privacy;
  return (
    <PageShell>
      <section className="container-x pt-16 md:pt-24 pb-24 max-w-3xl">
        <p className="eyebrow text-ink-muted mb-8">{p.eyebrow}</p>
        <h1 className="h1-page mb-12" data-testid="text-privacy-h1">{p.h1}</h1>
        <div className="space-y-6 body-base text-ink-soft">
          {p.paragraphs.map((para, i) => (
            <p key={i} data-testid={`text-privacy-p-${i}`}>{para}</p>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
