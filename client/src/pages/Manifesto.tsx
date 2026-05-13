import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import Counter from "@/components/Counter";
import { content } from "@/lib/content";

export default function Manifesto() {
  const m = content.manifesto;
  return (
    <PageShell>
      <article className="container-x pt-16 md:pt-24 pb-20 md:pb-28 max-w-3xl">
        <p className="eyebrow text-orange-fire mb-8">{m.eyebrow}</p>
        <h1 className="display-md mb-16 text-balance" style={{ textTransform: "none" }} data-testid="text-manifesto-h1">
          {m.h1}
        </h1>
        <div className="space-y-7 body-lg text-ink-soft">
          {m.paragraphs.map((p, i) => (
            <p key={i} data-testid={`text-manifesto-p-${i}`}>{p}</p>
          ))}
        </div>

        <div className="my-16 py-12 border-y-2 border-ink">
          {m.pullQuote.map((q, i) => (
            <p key={i} className="h3-sub italic mb-4 last:mb-0">{q}</p>
          ))}
        </div>

        <p className="eyebrow text-ink-muted">{m.sign}</p>
      </article>

      <section className="atmos atmos-denim" data-testid="section-manifesto-cta">
        <div className="container-x py-20 md:py-28">
          <h2 className="h2-section text-paper mb-8 text-balance">{m.cta.h2}</h2>
          <div className="flex flex-col md:flex-row md:items-center gap-8">
            <Link href="/waitlist" className="btn btn-primary btn-on-dark" data-testid="button-manifesto-cta">
              {m.cta.button}
            </Link>
            <Counter suffix={m.cta.counterSuffix} variant="dark" size="sm" />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
