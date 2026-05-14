import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { content } from "@/lib/content";

const DARK = ["grad-04-meridian", "grad-06-horizon"];

export default function Careers() {
  const C = content.careers;
  const openMail = `mailto:${content.contact.email}?subject=${encodeURIComponent(C.closer.subject)}`;
  return (
    <PageShell>
      <SeoHead {...C.seo} />

      <section className="grad grad-04-meridian section-y" data-testid="section-careers-hero">
        <div className="container-x">
          <p className="mono-cap text-paper/80 mb-8">{C.eyebrow}</p>
          <h1 className="display-l text-paper text-balance max-w-5xl">{C.h1}</h1>
          <p className="body-l mt-8 text-paper/90 max-w-2xl">{C.sub}</p>
        </div>
      </section>

      <section className="bg-paper section-y rule-bottom" data-testid="section-careers-how">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{C.howWeWork.h}</p>
          <ul className="space-y-3 max-w-3xl">
            {C.howWeWork.items.map((it, i) => (
              <li key={i} className="body-l text-ink-2 flex gap-3" data-testid={`how-${i}`}>
                <span className="text-pulse" aria-hidden>—</span><span>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-careers-roles">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-10">{C.rolesEyebrow}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {C.roles.map((role) => {
              const isDark = DARK.includes(role.preset);
              const mail = `mailto:${content.contact.email}?subject=${encodeURIComponent(role.subject)}`;
              return (
                <div key={role.num} className={`grad ${role.preset} card flex flex-col h-full`} data-testid={`role-${role.num}`}>
                  <p className={`mono-cap ${isDark ? "text-paper/80" : "text-ink-mute"}`}>{role.num} · {role.eyebrow}</p>
                  <h3 className={`h3 mt-3 ${isDark ? "text-paper" : "text-ink"}`}>{role.title}</h3>
                  <p className={`body-m mt-4 flex-1 ${isDark ? "text-paper/90" : "text-ink-2"}`}>{role.body}</p>
                  <p className={`mono-label mt-4 ${isDark ? "text-paper/70" : "text-ink-mute"}`}>{role.location}</p>
                  <p className={`mono-label mt-1 ${isDark ? "text-paper/70" : "text-ink-mute"}`}>Subject: {role.subject}</p>
                  <a href={mail} className={`btn ${isDark ? "btn-primary btn-on-dark" : "btn-primary"} mt-6 self-start`} data-testid={`link-apply-${role.num}`}>apply →</a>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-paper-2 section-y rule-top" data-testid="section-careers-closer">
        <div className="container-x">
          <div className="max-w-2xl">
            <p className="display-s text-ink mb-3" style={{ fontWeight: 700 }}>{C.closer.h}</p>
            <p className="body-l text-ink-2 mb-2">{C.closer.body}</p>
            <p className="mono-label text-ink-mute">Subject: {C.closer.subject}</p>
            <a href={openMail} className="btn btn-primary mt-6" data-testid="link-apply-open">write us →</a>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
