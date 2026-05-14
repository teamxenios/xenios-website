import { Link } from "wouter";
import { content } from "@/lib/content";
import Wordmark from "./Wordmark";
import Counter from "./Counter";

export default function Footer() {
  return (
    <footer className="bg-paper rule-top" data-testid="footer-main">
      <div className="container-x py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">
          <div>
            <Wordmark size="lg" asLink={false} />
            <p className="mt-6 body-m text-ink-2">{content.footer.tagline}</p>
            <div className="mt-6">
              <Counter variant="line" suffix="on the waitlist" />
            </div>
            <p className="mt-4 mono-cap text-ink-mute">{content.contact.location}</p>
          </div>

          <div>
            <p className="mono-cap text-ink-mute mb-5">SITEMAP</p>
            <ul className="space-y-3">
              {content.footer.sitemap.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-testid={`link-footer-${item.label.toLowerCase()}`}
                    className="text-[15px] font-600 hover:text-pulse transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mono-cap text-ink-mute mb-5">CONTACT</p>
            <a
              href={`mailto:${content.contact.email}`}
              data-testid="link-footer-email"
              className="block text-[15px] font-600 hover:text-pulse transition-colors mb-3"
            >
              {content.contact.email}
            </a>
            <p className="body-s text-ink-mute mt-2">One inbox. The team reads it.</p>
          </div>

          <div>
            <p className="mono-cap text-ink-mute mb-5">FOLLOW</p>
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
            {content.footer.bottom}
          </p>
          <p className="mono-cap text-ink-mute">
            {content.footer.disclaimer}{" "}
            {content.footer.legal.map((l, i) => (
              <span key={l.href}>
                · <Link href={l.href} className="underline">{l.label}</Link>
                {i === content.footer.legal.length - 1 ? "" : ""}
              </span>
            ))}
          </p>
        </div>
      </div>
    </footer>
  );
}
