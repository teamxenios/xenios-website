import { Link, useLocation } from "wouter";
import { BRAND } from "@/clarity/brand";

const GROUPS = [
  { label: "Individuals", links: [["Start Care", "/care/schedule"], ["Explore Products", "/products"], ["How It Works", "/how-it-works"], ["Check Status", "/status"], ["FAQ", "/faq"]] },
  { label: "Practices & partners", links: [["For Practices", "/practices"], ["Become a Partner", "/partners"], ["Suppliers", "/suppliers"], ["Workspace for coaches", "/workspace"]] },
  { label: "Company", links: [["About", "/about"], ["Careers", "/careers"], ["Quality", "/quality"], ["Press", "/press"], ["Investors", "/investors"]] },
  { label: "Support", links: [["Support", "/support"], ["Contact", "/contact"], ["Sign In", "/sign-in"]] },
  { label: "Legal", links: [["Privacy", "/privacy"], ["Terms", "/terms"], ["Research Use Policy", "/research/policies"], ["Disclosures", "/disclosures"], ["Accessibility", "/research/policies/accessibility"]] },
] as const;

export default function Footer() {
  const [location] = useLocation();
  const careAdjacent = location === "/care" || location.startsWith("/care/");
  return (
    <footer className="clarity-footer" data-testid="footer-main">
      <div className="container-x">
        <div className="clarity-footer-top">
          <div className="clarity-footer-brand">
            <Link href="/" className="clarity-brand-link" aria-label={`${BRAND.publicName} home`}><span className="wordmark-mark" aria-hidden="true" /><span className="clarity-brand-name">{BRAND.publicName}</span></Link>
            <p className="body-m text-ink-2">Care, research products and tools for the professionals who support people's health.</p>
            <a href={`mailto:${BRAND.supportEmail}`} className="clarity-footer-link">{BRAND.supportEmail}</a>
          </div>
          {GROUPS.map((group) => (
            <nav key={group.label} aria-label={`${group.label} footer links`}>
              <p className="mono-cap text-ink-mute">{group.label}</p>
              <div className="clarity-footer-links">{group.links.map(([label, href]) => <Link key={`${label}-${href}`} href={href} className="clarity-footer-link">{label}</Link>)}</div>
            </nav>
          ))}
        </div>
        {careAdjacent && <p className="clarity-emergency">If this is an emergency, call 911.</p>}
        <div className="clarity-footer-bottom"><p data-testid="text-copyright">{BRAND.copyright}</p></div>
      </div>
    </footer>
  );
}
