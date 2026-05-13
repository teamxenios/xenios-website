import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import { content } from "@/lib/content";

export default function Product() {
  const P = content.product;
  const DARK_PRESETS = ["grad-04-meridian", "grad-06-horizon"];

  return (
    <PageShell>
      <section className="bg-paper section-y rule-bottom" data-testid="section-product-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-8">{P.eyebrow}</p>
          <h1 className="display-l text-ink text-balance max-w-4xl">{P.h1}</h1>
          <p className="body-l mt-8 text-ink-2 max-w-2xl">{P.sub}</p>
          <Link href="/waitlist" className="btn btn-ghost mt-6 inline-flex" data-testid="link-product-hero-cta">
            {P.inlineLinkLabel}
          </Link>
        </div>
      </section>

      {P.capabilities.map((cap) => {
        const isDark = DARK_PRESETS.includes(cap.preset);
        return (
          <section
            key={cap.num}
            className={`grad ${cap.preset} section-y`}
            data-testid={`section-capability-${cap.num}`}
          >
            <div className="container-x">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
                <div className="md:col-span-3">
                  <p className={`mono-cap ${isDark ? "text-paper/80" : "text-ink-mute"}`}>{cap.num} —</p>
                  <p className={`mono-cap mt-2 ${isDark ? "text-paper" : "text-ink"}`}>{cap.eyebrow}</p>
                </div>
                <div className="md:col-span-9">
                  <h2 className={`display-m text-balance ${isDark ? "text-paper" : "text-ink"}`}>{cap.title}</h2>
                  <div className={`mt-6 space-y-4 ${isDark ? "text-paper/90" : "text-ink-2"}`}>
                    {cap.body.map((p, i) => (
                      <p key={i} className="body-l">{p}</p>
                    ))}
                  </div>
                  {"inlineLinkLabel" in cap && cap.inlineLinkHref && (
                    <Link
                      href={cap.inlineLinkHref}
                      className={`btn btn-ghost mt-6 inline-flex ${isDark ? "text-paper" : ""}`}
                      style={isDark ? { color: "var(--paper)" } : undefined}
                      data-testid={`link-capability-${cap.num}`}
                    >
                      {cap.inlineLinkLabel}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </section>
        );
      })}

      <section className="bg-paper section-y rule-top" data-testid="section-product-closer">
        <div className="container-x text-center max-w-3xl mx-auto">
          <p className="display-s text-ink mb-10" style={{ fontWeight: 700 }}>{P.closer}</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/waitlist" className="btn btn-primary" data-testid="button-product-primary">{P.ctaPrimary}</Link>
            <Link href="/contact" className="btn btn-ghost" data-testid="button-product-secondary">{P.ctaSecondary}</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
