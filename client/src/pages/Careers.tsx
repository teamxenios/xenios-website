import PageShell from "@/components/PageShell";
import AtmosCard from "@/components/AtmosCard";
import { content } from "@/lib/content";

export default function Careers() {
  const c = content.careers;
  return (
    <PageShell>
      <section className="container-x pt-16 md:pt-24 pb-16 max-w-5xl">
        <p className="eyebrow text-orange-fire mb-8">{c.eyebrow}</p>
        <h1 className="h1-page mb-10 text-balance" data-testid="text-careers-h1">{c.h1}</h1>
        <p className="body-lg text-ink-soft max-w-3xl">{c.lead}</p>
      </section>

      <section className="container-x pb-20">
        <p className="eyebrow text-ink-muted mb-8">{c.rolesEyebrow}</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {c.roles.map((r, i) => {
            const isDark = r.preset === "voltage" || r.preset === "forge";
            const apply = `mailto:${content.contact.email}?subject=${encodeURIComponent(r.subject)}`;
            return (
              <AtmosCard
                key={i}
                preset={r.preset}
                eyebrow={r.eyebrow}
                title={r.title}
                testId={`role-${i}`}
              >
                <p className="mb-6">{r.body}</p>
                <a
                  href={apply}
                  data-testid={`link-apply-${i}`}
                  className={`inline-flex items-center gap-2 mono-sm hover:underline underline-offset-4 ${
                    isDark ? "text-orange-warm" : "text-orange-fire"
                  }`}
                >
                  APPLY → {content.contact.email}
                </a>
              </AtmosCard>
            );
          })}
        </div>
      </section>

      <section className="container-x pb-20 max-w-3xl rule-top pt-16">
        <h2 className="h2-section mb-6">{c.howWeWork.h2}</h2>
        <p className="body-lg text-ink-soft">{c.howWeWork.body}</p>
      </section>

      <section className="container-x pb-24 max-w-3xl">
        <h3 className="h3-sub mb-6">{c.elsewhere.h3}</h3>
        <p className="body-lg text-ink-soft">{c.elsewhere.body}</p>
        <a
          href={`mailto:${content.contact.email}`}
          className="btn btn-primary mt-8"
          data-testid="button-careers-write"
        >
          Write us →
        </a>
      </section>
    </PageShell>
  );
}
