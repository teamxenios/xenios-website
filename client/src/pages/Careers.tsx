import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, CAREERS_ROLES, SITE } from "@/lib/content";

const HOW_WE_WORK = [
  "Remote first. Austin preferred for the founding team.",
  "Founder-direct. No layers between you and the customer.",
  "We ship every week. We measure what we ship.",
  "We respect the customer enough to never ship sloppy.",
  "We treat AI as an adjunct, not a replacement. The practitioner owns the dial. So do you.",
];

export default function Careers() {
  return (
    <PageShell>
      <SeoHead {...PAGES.careers} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">CAREERS</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "18ch" }}>Five founding roles.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          Help build the AI-adjunct operations system for coaches, trainers, and practitioners. Remote first, Austin preferred. {SITE.location}
        </p>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">HOW WE WORK</p>
        <ul className="space-y-3 max-w-[60ch]">
          {HOW_WE_WORK.map((w) => (
            <li key={w} className="body-l text-ink-2 grid grid-cols-[16px_1fr] gap-3">
              <span className="text-pulse mt-1">→</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-8">OPEN ROLES</p>
        <div className="space-y-12">
          {CAREERS_ROLES.map((r) => (
            <article key={r.slug} className="rule-all p-8 rounded-[16px]" data-testid={`role-${r.slug}`}>
              <h2 className="display-s mb-2">{r.title}</h2>
              <p className="body-l text-ink-2 mb-6">{r.summary}</p>

              <p className="mono-cap text-ink-mute mb-3">THE ROLE</p>
              <p className="body-m text-ink-2 mb-6">{r.role}</p>

              <p className="mono-cap text-ink-mute mb-3">FIRST 90 DAYS</p>
              <ul className="space-y-2 mb-6">
                {r.first90.map((b) => (
                  <li key={b} className="body-m text-ink-2 grid grid-cols-[14px_1fr] gap-3">
                    <span className="text-pulse">→</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              <p className="mono-cap text-ink-mute mb-3">YOU BRING</p>
              <ul className="space-y-2 mb-6">
                {r.youBring.map((b) => (
                  <li key={b} className="body-m text-ink-2 grid grid-cols-[14px_1fr] gap-3">
                    <span className="text-pulse">→</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              <p className="mono-cap text-ink-mute mb-3">SUCCESS LOOKS LIKE</p>
              <p className="body-m text-ink-2 mb-6">{r.success}</p>

              <a
                href={`mailto:team@xeniostechnology.com?subject=${encodeURIComponent(r.subjectPrefix)}`}
                className="btn btn-primary"
                data-testid={`button-apply-${r.slug}`}
              >
                Apply
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[26ch]">Don't see your role? Tell us why we should make one.</h2>
          <Link href="/contact" className="btn btn-primary btn-on-dark">Talk to us</Link>
        </div>
      </section>
    </PageShell>
  );
}
