import { Link } from "wouter";
import { content, SITE } from "@/lib/content";
import Wordmark from "./Wordmark";
import Counter from "./Counter";

export default function Footer() {
  const cols = content.footer.columns;
  return (
    <footer className="bg-paper rule-top" data-testid="footer-main">
      <div className="container-x py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">
          <div>
            <Wordmark size="lg" asLink={false} />
            <p className="mt-6 body-m text-ink-2">{content.footer.tagline}</p>
            <p className="mt-2 mono-cap text-ink-mute">{SITE.location}</p>
            <div className="mt-6">
              <Counter variant="line" suffix="on the waitlist" />
            </div>
          </div>

          <div>
            <p className="mono-cap text-ink-mute mb-5">PRODUCT</p>
            <ul className="space-y-3">
              {cols.product.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-testid={`link-footer-${item.label.replace(/\s+/g, "-").toLowerCase()}`}
                    className="text-[15px] font-600 hover:text-pulse transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mono-cap text-ink-mute mb-5">COMPANY</p>
            <ul className="space-y-3">
              {cols.company.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-testid={`link-footer-${item.label.replace(/\s+/g, "-").toLowerCase()}`}
                    className="text-[15px] font-600 hover:text-pulse transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mono-cap text-ink-mute mb-5">CONNECT</p>
            <a
              href={`mailto:${content.contact.email}`}
              data-testid="link-footer-email"
              className="block text-[15px] font-600 hover:text-pulse transition-colors mb-4"
            >
              {content.contact.email}
            </a>
            <ul className="space-y-3">
              {content.socials.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`link-social-${s.label.split(" ")[0].toLowerCase()}`}
                    className="text-[15px] font-600 hover:text-pulse transition-colors"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rule-top mt-16 pt-6 flex flex-col md:flex-row justify-between gap-4">
          <p className="mono-cap text-ink-mute" data-testid="text-copyright">
            {content.footer.bottom} · {content.footer.disclaimer}
          </p>
          <p className="mono-cap text-ink-mute">
            {content.footer.legal.map((l, i) => (
              <span key={l.href}>
                {i > 0 ? " · " : ""}
                <Link href={l.href} className="underline">{l.label}</Link>
              </span>
            ))}
          </p>
        </div>
      </div>
    </footer>
  );
}
