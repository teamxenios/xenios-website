import { useState } from "react";
import PageShell from "@/components/PageShell";
import { content } from "@/lib/content";

export default function FAQ() {
  const f = content.faq;
  const [open, setOpen] = useState<number | null>(0);
  return (
    <PageShell>
      <section className="container-x pt-16 md:pt-24 pb-12 max-w-4xl">
        <p className="eyebrow text-orange-fire mb-8">{f.eyebrow}</p>
        <h1 className="display-md mb-4 text-balance" style={{ textTransform: "none" }} data-testid="text-faq-h1">
          {f.h1}
        </h1>
      </section>

      <section className="container-x pb-24 max-w-4xl">
        <div className="rule-top">
          {f.items.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className="rule-bottom" data-testid={`faq-item-${i}`}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-6 py-6 text-left hover:text-orange-fire transition-colors"
                  data-testid={`button-faq-${i}`}
                  aria-expanded={isOpen}
                >
                  <span className="h4-card">{item.q}</span>
                  <span className={`text-2xl text-orange-fire transition-transform ${isOpen ? "rotate-45" : ""}`}>
                    +
                  </span>
                </button>
                {isOpen && (
                  <div className="pb-8 body-base text-ink-muted max-w-3xl" data-testid={`text-faq-answer-${i}`}>
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </PageShell>
  );
}
