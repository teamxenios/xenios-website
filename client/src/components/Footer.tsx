import { Link } from "wouter";
import { content } from "@/lib/content";
import Wordmark from "./Wordmark";

export default function Footer() {
  return (
    <footer className="bg-paper rule-top" data-testid="footer-main">
      <div className="container-x py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div>
            <Wordmark size="lg" asLink={false} />
            <p className="mt-6 body-m text-ink-2 max-w-xs">{content.footer.tagline}</p>
            <p className="mt-2 mono-cap text-ink-mute">{content.contact.location}</p>
          </div>

          <div>
            <p className="mono-cap text-ink-mute mb-6">SITEMAP</p>
            <ul className="space-y-3 columns-2 md:columns-1 gap-x-8">
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

          <div className="space-y-8">
            <div>
              <p className="mono-cap text-ink-mute mb-4">CONNECT</p>
              <a
                href={`mailto:${content.contact.email}`}
                data-testid="link-footer-email"
                className="block text-[15px] font-600 hover:text-pulse transition-colors mb-3"
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
        </div>

        <div className="rule-top mt-16 pt-6 flex flex-col md:flex-row justify-between gap-4">
          <p className="mono-cap text-ink-mute" data-testid="text-copyright">
            {content.footer.bottom}
          </p>
          <p className="mono-cap text-ink-mute">
            {content.footer.disclaimer} · <Link href="/privacy" className="underline">privacy</Link> · <Link href="/terms" className="underline">terms</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
