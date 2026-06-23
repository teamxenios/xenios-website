import { Link } from "wouter";
import { contactEmail, menuGroups, navSocials } from "@/lib/nav";
import { content } from "@/lib/content";
import Wordmark from "./Wordmark";
import Counter from "./Counter";

function FooterLink({ label, href, external }: { label: string; href: string; external?: boolean }) {
  const className = "block text-[15px] font-600 text-ink hover:text-pulse transition-colors";
  if (external) {
    return <a href={href} className={className}>{label}</a>;
  }
  return <Link href={href} className={className}>{label}</Link>;
}

export default function Footer() {
  return (
    <footer className="bg-paper rule-top" data-testid="footer-main">
      <div className="container-x py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.3fr_repeat(4,1fr)] gap-10 lg:gap-12">
          <div>
            <Wordmark size="lg" asLink={false} />
            <p className="mt-6 body-m text-ink-2 max-w-[28ch]">{content.footer.tagline}</p>
            <p className="mt-3 mono-cap text-ink-mute">Remote first. Austin preferred.</p>
            <div className="mt-6">
              <Counter variant="line" suffix="on the waitlist" />
            </div>
            <div className="mt-6 space-y-2">
              <a href={`mailto:${contactEmail}`} data-testid="link-footer-email" className="block text-[15px] font-600 text-ink hover:text-pulse transition-colors">
                {contactEmail}
              </a>
              {navSocials.map((social) => (
                <a key={social.url} href={social.url} target="_blank" rel="noopener noreferrer" data-testid={`link-social-${social.label.split(",")[0].toLowerCase()}`} className="block text-[15px] font-600 text-ink hover:text-pulse transition-colors">
                  {social.label}
                </a>
              ))}
            </div>
          </div>

          {menuGroups.map((group) => (
            <nav key={group.label} aria-label={`${group.label} footer links`}>
              <p className="mono-cap text-ink-mute mb-5">{group.label}</p>
              <div className="space-y-3">
                {group.items.map((item) => (
                  <FooterLink key={`${group.label}-${item.href}`} {...item} />
                ))}
              </div>
            </nav>
          ))}
        </div>

        <div className="rule-top mt-16 pt-6 flex flex-col md:flex-row justify-between gap-4">
          <p className="mono-cap text-ink-mute" data-testid="text-copyright">
            © 2026 Xenios Technologies, Inc. · An AI workspace for health and performance professionals.
          </p>
          <p className="mono-cap text-ink-mute">Austin, TX · Remote first</p>
        </div>
      </div>
    </footer>
  );
}
