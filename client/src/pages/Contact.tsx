import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import ContactForm from "@/components/ContactForm";
import { PAGES, CONTACT_PAGE, CONTACT_PREFIXES, SITE } from "@/lib/content";

export default function Contact() {
  return (
    <PageShell>
      <SeoHead {...PAGES.contact} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">CONTACT</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "18ch" }}>{CONTACT_PAGE.headline}</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">{CONTACT_PAGE.sub}</p>
      </section>

      <section className="container-x py-16 rule-top">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12">
          <div>
            <ContactForm />
          </div>
          <aside>
            <p className="mono-cap text-ink-mute mb-4">WHO READS WHAT</p>
            <ul className="space-y-3">
              {CONTACT_PREFIXES.map((p) => (
                <li key={p.prefix}>
                  <span className="font-mono text-pulse text-[12px]">{p.prefix}</span>
                  <span className="body-s text-ink-2 ml-2">{p.desc}</span>
                </li>
              ))}
            </ul>
            <p className="mono-cap text-ink-mute mt-10 mb-3">DIRECT</p>
            <a href={`mailto:${SITE.email}`} className="body-l font-700 hover:text-pulse">{SITE.email}</a>
            <p className="mono-cap text-ink-mute mt-2">{SITE.location}</p>
          </aside>
        </div>
      </section>
    </PageShell>
  );
}
