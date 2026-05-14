import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import ContactForm from "@/components/ContactForm";
import { PAGES, CONTACT_PATHS, content } from "@/lib/content";
import { Link } from "wouter";

export default function Contact() {
  const C = content.contactPage;
  return (
    <PageShell>
      <SeoHead title={PAGES.contact.title} description={PAGES.contact.description} canonical="/contact" />
      <section className="grad grad-02-tide section-y" data-testid="section-contact-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">{C.eyebrow}</p>
          <h1 className="display-xl text-ink text-balance" style={{ maxWidth: "22ch" }}>{C.headline}</h1>
          <p className="body-l mt-8 text-ink-2 max-w-3xl">{C.sub}</p>
        </div>
      </section>

      <section className="bg-paper section-y rule-bottom" data-testid="section-contact-paths">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">SEVEN PATHS</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CONTACT_PATHS.map((p) => {
              const isInternal = !!p.href;
              const subjectMail = p.subject ? `mailto:team@xeniostechnology.com?subject=${encodeURIComponent(p.subject.replace(/ or .*/, ""))}` : `mailto:team@xeniostechnology.com`;
              return (
                <article key={p.num} className="card" data-testid={`path-${p.num}`}>
                  <p className="mono-cap text-pulse">{p.num}</p>
                  <h3 className="h3 mt-3 text-ink">{p.label}</h3>
                  <p className="body-m mt-3 text-ink-2">{p.body}</p>
                  {p.subject && <p className="mono-cap text-ink-mute mt-2">subject {p.subject}</p>}
                  {isInternal ? (
                    <Link href={p.href!} className="btn btn-ghost mt-4 inline-flex">go →</Link>
                  ) : (
                    <a href={subjectMail} className="btn btn-ghost mt-4 inline-flex">email →</a>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-contact-form">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-6">OR WRITE BELOW</p>
          <h2 className="display-m text-ink mb-8 max-w-3xl">A human reads every reply.</h2>
          <div className="max-w-3xl">
            <ContactForm />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
