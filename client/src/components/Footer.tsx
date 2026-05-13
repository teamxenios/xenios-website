import { Link } from "wouter";
import { content } from "@/lib/content";

export default function Footer() {
  return (
    <footer className="bg-ink text-mono-100 pt-20 pb-10" data-testid="footer-main">
      <div className="container mx-auto px-6 lg:px-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-16">
          <div className="col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 mb-6">
              <span className="font-display text-3xl lowercase tracking-tight text-cream font-bold">xenios</span>
              <span className="w-2 h-2 rounded-full bg-orange" aria-hidden />
            </Link>
            <p className="text-mono-300 max-w-xs text-sm leading-relaxed">
              The AI-native operating system for health coaches. Built in Austin, TX.
            </p>
          </div>

          {content.footer.columns.map((col) => (
            <div key={col.title}>
              <h4 className="font-mono text-xs uppercase tracking-widest text-mono-300 mb-5">
                {col.title}
              </h4>
              <ul className="space-y-3">
                {col.links.map((link) => {
                  const isExternal = link.href.startsWith("mailto:") || link.href.startsWith("http");
                  const isHash = link.href.includes("#");
                  const testId = `link-footer-${link.label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
                  if (isExternal || isHash) {
                    return (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          className="text-sm text-mono-100 hover:text-orange transition-colors"
                          data-testid={testId}
                        >
                          {link.label}
                        </a>
                      </li>
                    );
                  }
                  return (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-mono-100 hover:text-orange transition-colors"
                        data-testid={testId}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-hairline-ink flex flex-col md:flex-row justify-between gap-6 text-xs text-mono-300">
          <div className="flex flex-col gap-2">
            <p>{content.footer.copyright}</p>
            <p className="text-mono-300/70 max-w-md leading-relaxed">{content.footer.disclaimer}</p>
          </div>
          <div className="flex gap-5 items-start">
            {content.contact.socials.map((s) => (
              <a
                key={s.label}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-orange transition-colors"
                data-testid={`link-footer-social-${s.label.toLowerCase()}`}
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
