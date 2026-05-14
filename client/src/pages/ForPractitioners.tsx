import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, ICP_LIST } from "@/lib/content";

const TILE_GRADS = ["grad-01-dawn","grad-02-tide","grad-03-fieldwork","grad-04-meridian","grad-05-meadow","grad-06-horizon"];

export default function ForPractitioners() {
  return (
    <PageShell>
      <SeoHead title={PAGES.forPractitioners.title} description={PAGES.forPractitioners.description} canonical="/for-practitioners" />
      <section className="grad grad-01-dawn section-y" data-testid="section-fp-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">FOR PRACTITIONERS</p>
          <h1 className="display-xl text-ink text-balance" style={{ maxWidth: "22ch" }}>
            Built for the people building the next era of care.
          </h1>
          <p className="body-l mt-8 text-ink-2 max-w-3xl">
            25 archetypes. One substrate. Find yourself below.
          </p>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-fp-grid">
        <div className="container-x">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ICP_LIST.map((t, i) => {
              const grad = TILE_GRADS[i % TILE_GRADS.length];
              const isDark = grad === "grad-04-meridian" || grad === "grad-06-horizon";
              return (
                <Link key={t.slug} href={`/for/${t.slug}`} className={`grad ${grad} tile ${isDark ? "on-dark" : ""}`} data-testid={`tile-${t.slug}`}>
                  <div>
                    <p className="tile-num">{String(i + 1).padStart(2, "0")}</p>
                    <p className="tile-label">{t.label}</p>
                  </div>
                  <p className="tile-cap">// {t.oneliner}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grad grad-06-horizon section-y">
        <div className="container-x">
          <h2 className="display-l text-paper text-balance max-w-4xl">Don't see yourself? Tell us.</h2>
          <p className="body-l mt-6 text-paper/80 max-w-3xl">
            Email <a href="mailto:team@xeniostechnology.com?subject=%5BHELLO%5D" className="underline">team@xeniostechnology.com</a> with subject [HELLO]. We add archetypes from the people on this list.
          </p>
          <Link href="/waitlist" className="btn btn-primary btn-on-dark mt-8 inline-flex">join the waitlist →</Link>
        </div>
      </section>
    </PageShell>
  );
}
