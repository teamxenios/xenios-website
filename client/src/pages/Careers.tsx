import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, CAREERS_ROLES, HOW_WE_WORK } from "@/lib/content";

export default function Careers() {
  return (
    <PageShell>
      <SeoHead title={PAGES.careers.title} description={PAGES.careers.description} canonical="/careers" />
      <section className="grad grad-02-tide section-y" data-testid="section-careers-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">CAREERS · REMOTE · AUSTIN PREFERRED</p>
          <h1 className="display-xl text-ink text-balance" style={{ maxWidth: "22ch" }}>
            Build the operating system for the next fifty years of human health.
          </h1>
          <p className="body-l mt-8 text-ink-2 max-w-3xl">
            Five founding roles. All remote. Austin preferred for in-person sprint weeks. Founding equity for every founding hire.
          </p>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-careers-roles">
        <div className="container-x space-y-5">
          {CAREERS_ROLES.map((r) => {
            const subj = encodeURIComponent(r.subject);
            return (
              <article key={r.num} className="card" data-testid={`role-${r.num}`}>
                <p className="mono-cap text-pulse">{r.num}</p>
                <h2 className="h1 mt-3 text-ink">{r.title}</h2>
                <p className="body-l mt-5 text-ink-2 max-w-4xl">{r.body}</p>
                <a href={`mailto:team@xeniostechnology.com?subject=${subj}`} className="btn btn-primary mt-6 inline-flex" data-testid={`apply-${r.num}`}>
                  apply — email team@xeniostechnology.com →
                </a>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grad grad-03-fieldwork section-y" data-testid="section-careers-howwework">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">HOW WE WORK</p>
          <ul className="space-y-3 max-w-3xl">
            {HOW_WE_WORK.map((p, i) => (
              <li key={i} className="body-l text-ink-2">— {p}</li>
            ))}
          </ul>
        </div>
      </section>
    </PageShell>
  );
}
