import { Link } from "wouter";
import "./public-editorial.css";

export const PUBLIC_EDITORIAL_LINKS = [
  { href: "/research/access-hub", label: "Access Hub" },
  { href: "/research/how-it-works", label: "How it works" },
  { href: "/research/about", label: "About" },
  { href: "/research/faq", label: "FAQ" },
  { href: "/research/policies", label: "Policies" },
  { href: "/research/contact", label: "Contact" },
  { href: "/research/support", label: "Support" },
  { href: "/care", label: "Care" },
  { href: "/research/sign-in", label: "Sign in" },
] as const;

const PUBLIC_FOOTER_LINKS = [
  ...PUBLIC_EDITORIAL_LINKS,
  { href: "/research/privacy", label: "Privacy" },
  { href: "/research/terms", label: "Terms" },
] as const;

function EditorialLinks({ current, mobile = false }: { current?: string; mobile?: boolean }) {
  return (
    <nav
      aria-label={mobile ? "Research information mobile" : "Research information"}
      className={mobile ? "public-editorial-menu-links" : "public-editorial-nav"}
    >
      {PUBLIC_EDITORIAL_LINKS.map((item) => {
        const active = current === item.href
          || (item.href === "/research/policies" && current?.startsWith("/research/policies/") === true);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`${active ? "btn btn-primary" : "btn btn-ghost"} public-editorial-action`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PublicEditorialNav({ current }: { current?: string }) {
  return (
    <div className="public-editorial-navigation">
      <EditorialLinks current={current} />
      <details className="public-editorial-menu">
        <summary>Explore Research</summary>
        <EditorialLinks current={current} mobile />
      </details>
    </div>
  );
}

export function PublicEditorialFooter() {
  return (
    <footer className="public-editorial-footer rule-top">
      <div className="container-x public-editorial-footer-grid">
        <div>
          <Link href="/research" className="wordmark public-editorial-footer-brand" data-testid="link-research-home-footer">
            <span className="wordmark-mark" aria-hidden="true" />
            xenios <span className="text-ink-mute" style={{ fontWeight: 600 }}>research</span>
          </Link>
          <p className="body-s text-ink-mute mt-3 max-w-[44ch]">
            Clear nonclinical Research access, visible documentation status, and a separate provider-governed Care pathway.
          </p>
        </div>
        <nav aria-label="Research public footer" className="public-editorial-footer-links">
          {PUBLIC_FOOTER_LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="body-s text-ink-2 public-editorial-footer-link">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function PublicBoundaryNote() {
  return (
    <aside className="card bg-paper-2" aria-label="Research and Care boundary">
      <p className="mono-label text-ink-mute">A firm boundary</p>
      <h2 className="body-l font-700 mt-2">Research access is not clinical care.</h2>
      <p className="body-s text-ink-2 mt-3 max-w-[68ch]">
        Research-designated materials are for legitimate nonclinical research only. Diagnosis, treatment,
        prescribing, individualized guidance, clinical records, and pharmacy activity belong to authorized
        providers and systems in the separate Care pathway.
      </p>
      <div className="mt-5 public-editorial-actions">
        <Link href="/research/access-hub" className="btn btn-secondary public-editorial-action">Compare access paths</Link>
        <Link href="/care" className="btn btn-ghost public-editorial-action">Understand Care</Link>
      </div>
    </aside>
  );
}
