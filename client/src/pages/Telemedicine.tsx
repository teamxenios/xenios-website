import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, TELEMED_STRIP_4, TELEMED_SECTIONS } from "@/lib/content";

export default function Telemedicine() {
  return (
    <PageShell>
      <SeoHead title={PAGES.telemedicine.title} description={PAGES.telemedicine.description} canonical="/telemedicine" />
      <section className="grad grad-02-tide section-y" data-testid="section-telemed-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">TELEMEDICINE</p>
          <h1 className="display-xl text-ink text-balance" style={{ maxWidth: "22ch" }}>
            The care delivery layer, finally inside the substrate.
          </h1>
          <p className="body-l mt-8 text-ink-2 max-w-3xl">
            Video, async clinical messaging, e-prescribing, lab ordering, and fast charting — inside your branded experience, under your scope of practice.
          </p>
        </div>
      </section>

      <section className="bg-paper section-y rule-bottom" data-testid="section-telemed-strip">
        <div className="container-x">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {TELEMED_STRIP_4.map((s, i) => (
              <div key={i} className="card">
                <p className="mono-cap text-pulse">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="h3 mt-3 text-ink">{s.cap}</h3>
                <p className="body-m mt-3 text-ink-2">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-telemed-detail">
        <div className="container-x space-y-6">
          {TELEMED_SECTIONS.map((s, i) => (
            <article key={i} className="card" data-testid={`telemed-${i}`}>
              <p className="mono-cap text-ink-mute">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="h1 mt-3 text-ink">{s.title}</h2>
              <p className="body-l mt-5 text-ink-2 max-w-4xl">{s.body}</p>
              {s.bullets.length > 0 && (
                <ul className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {s.bullets.map((b, j) => <li key={j} className="body-m text-ink-2">— {b}</li>)}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="grad grad-06-horizon section-y" data-testid="section-telemed-cta">
        <div className="container-x">
          <h2 className="display-l text-paper text-balance max-w-4xl">Run telemedicine inside your own substrate.</h2>
          <Link href="/waitlist" className="btn btn-primary btn-on-dark mt-8 inline-flex">join the waitlist →</Link>
        </div>
      </section>
    </PageShell>
  );
}
