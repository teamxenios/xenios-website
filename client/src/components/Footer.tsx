import { Link } from "wouter";
import { content, SITE } from "@/lib/content";
import Wordmark from "./Wordmark";
import Counter from "./Counter";

export default function Footer() {
  const cols = content.footer.columns;

  function Col({ title, items }: { title: string; items: { label: string; href: string }[] }) {
    return (
      <div>
        <p className="mono-cap text-ink-mute mb-5">{title}</p>
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.href}>
              {item.href.startsWith("/") && !item.href.endsWith(".txt") ? (
                <Link
                  href={item.href}
                  data-testid={`link-footer-${item.label.replace(/\s+/g, "-").toLowerCase()}`}
                  className="text-[15px] font-600 hover:text-pulse transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  href={item.href}
                  data-testid={`link-footer-${item.label.replace(/\s+/g, "-").toLowerCase()}`}
                  className="text-[15px] font-600 hover:text-pulse transition-colors"
                >
                  {item.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <footer className="bg-paper rule-top" data-testid="footer-main">
      <div className="container-x py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-12">
          <div className="lg:col-span-1">
            <Wordmark size="lg" asLink={false} />
            <p className="mt-6 body-m text-ink-2">{content.footer.tagline}</p>
            <p className="mt-2 mono-cap text-ink-mute">{SITE.location}</p>
            <div className="mt-6">
              <Counter variant="line" suffix="on the waitlist" />
            </div>
            <div className="mt-6 space-y-2">
              <a
                href={`mailto:${content.contact.email}`}
                data-testid="link-footer-email"
                className="block text-[15px] font-600 hover:text-pulse transition-colors"
              >
                {content.contact.email}
              </a>
              {content.socials.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`link-social-${s.label.split(",")[0].toLowerCase()}`}
                  className="block text-[15px] font-600 hover:text-pulse transition-colors"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          <Col title="PRODUCT" items={cols.product as any} />
          <Col title="COMPANY" items={cols.company as any} />
          <Col title="RESOURCES" items={cols.resources as any} />
          <Col title="LEGAL" items={cols.legal as any} />
        </div>

        <div className="rule-top mt-16 pt-6 flex flex-col md:flex-row justify-between gap-4">
          <p className="mono-cap text-ink-mute" data-testid="text-copyright">
            {content.footer.copyright} · The AI-adjunct operations system for coaches, trainers, and practitioners.
          </p>
          <p className="mono-cap text-ink-mute">
            Austin, TX · Remote first
          </p>
        </div>
      </div>
    </footer>
  );
}
