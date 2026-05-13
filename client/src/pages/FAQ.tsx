import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import { content } from "@/lib/content";

export default function FAQ() {
  const F = content.faq;
  return (
    <PageShell>
      <section className="grad grad-02-tide section-y" data-testid="section-faq-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-2 mb-8">{F.eyebrow}</p>
          <h1 className="display-l text-ink">{F.h1}</h1>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-faq-body">
        <div className="container-x">
          <div className="max-w-3xl mx-auto divide-y" style={{ borderColor: "var(--rule)" }}>
            {F.items.map((q, i) => (
              <details key={i} className="py-6 group" data-testid={`faq-item-${i}`}>
                <summary className="cursor-pointer list-none flex items-start justify-between gap-6">
                  <span className="display-s text-ink" style={{ fontWeight: 700 }}>{q.q}</span>
                  <span className="text-pulse text-2xl mt-1 group-open:rotate-45 transition-transform" aria-hidden="true">+</span>
                </summary>
                <p className="body-l text-ink-2 mt-4">{q.a}</p>
              </details>
            ))}
          </div>
          <p className="text-center mt-16">
            <Link href={F.closerHref} className="btn btn-ghost" data-testid="link-faq-closer">
              {F.closerLabel}
            </Link>
          </p>
        </div>
      </section>
    </PageShell>
  );
}
