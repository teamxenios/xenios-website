import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import ContactForm from "@/components/ContactForm";
import { content } from "@/lib/content";

export default function Contact() {
  const C = content.contactPage;

  return (
    <PageShell>
      <section className="bg-paper section-y rule-bottom" data-testid="section-contact-hero">
        <div className="container-x">
          <p className="mono-cap text-ink-mute mb-8">{C.eyebrow}</p>
          <h1 className="display-l text-ink text-balance max-w-4xl">{C.h1}</h1>
          <p className="body-l mt-8 text-ink-2 max-w-2xl">{C.sub}</p>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-contact-cards">
        <div className="container-x">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {C.cards.map((card) => (
              <div key={card.num} className="card flex flex-col" data-testid={`card-contact-${card.num}`}>
                <p className="mono-cap text-ink-mute mb-3">{card.num} — {card.title}</p>
                <p className="body-m text-ink-2 mb-6 flex-1">{card.body}</p>
                <div className="space-y-2 body-s text-ink-2">
                  {"href" in card && card.href ? (
                    <Link href={card.href} className="btn btn-secondary mt-2 self-start" data-testid={`link-card-${card.num}`}>
                      {card.hrefLabel}
                    </Link>
                  ) : (
                    <p>
                      → <a href={`mailto:${content.contact.email}`} className="underline-offset-2 hover:underline font-600">{content.contact.email}</a>
                    </p>
                  )}
                  {"subject" in card && card.subject && (
                    <p className="mono-label text-ink-mute">Subject prefix: {card.subject}</p>
                  )}
                  {"subjectMulti" in card && card.subjectMulti && card.subjectMulti.map((s, i) => (
                    <p key={i} className="mono-label text-ink-mute">Subject prefix: {s}</p>
                  ))}
                  {"note" in card && card.note && <p className="text-ink-mute italic">{card.note}</p>}
                  {"moreHref" in card && card.moreHref && (
                    <Link href={card.moreHref} className="inline-block underline underline-offset-2 mt-2" data-testid={`link-card-more-${card.num}`}>
                      {card.moreLabel}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-paper-2 section-y rule-y" data-testid="section-contact-form">
        <div className="container-x">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
            <div className="md:col-span-4">
              <p className="mono-cap text-ink-mute mb-4">{C.formEyebrow}</p>
              <p className="body-l text-ink-2">Pick the closest match for "I am a…" — your subject line is auto-prefixed so the right inbox label catches it.</p>
            </div>
            <div className="md:col-span-8">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-paper section-y" data-testid="section-contact-closer">
        <div className="container-x text-center max-w-2xl mx-auto">
          <p className="display-s text-ink mb-3">{C.closer.h}</p>
          <p className="body-l text-ink-2">{C.closer.body}</p>
        </div>
      </section>
    </PageShell>
  );
}
