import { Link } from "wouter";
import "./public-editorial.css";

export const PUBLIC_EDITORIAL_LINKS = [
  { href: "/care", label: "Care" },
  { href: "/research/access-hub", label: "Research" },
  { href: "/research/how-it-works", label: "How it works" },
  { href: "/research/quality", label: "Quality" },
  { href: "/research/faq", label: "FAQ" },
  { href: "/research/about", label: "About" },
  { href: "/research/partners", label: "Partners" },
  { href: "/research/policies", label: "Policies" },
  { href: "/research/contact", label: "Contact" },
  { href: "/research/support", label: "Support" },
  { href: "/research/sign-in", label: "Sign in" },
] as const;

const PUBLIC_FOOTER_LINKS = [
  ...PUBLIC_EDITORIAL_LINKS,
  { href: "/research/privacy", label: "Privacy" },
  { href: "/research/terms", label: "Terms" },
  { href: "/research/policies/accessibility", label: "Accessibility" },
] as const;

type EditorialGateway = { href: string; label: string };

function EditorialLinks({
  current,
  mobile = false,
  gateway,
}: {
  current?: string;
  mobile?: boolean;
  gateway?: EditorialGateway;
}) {
  return (
    <nav
      aria-label={mobile ? "Research information mobile" : "Research information"}
      className={mobile ? "public-editorial-menu-links" : "public-editorial-nav"}
    >
      {mobile && gateway ? (
        // Shown only below 640px, where the header drops its own Back to
        // gateway link to keep brand and menu on one row.
        <Link href={gateway.href} className="btn btn-ghost public-editorial-action public-editorial-menu-gateway">
          {gateway.label}
        </Link>
      ) : null}
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

/**
 * The public Research navigation: a full link row above 900px and the
 * Explore Xenios menu at or below it. `part` lets the chrome place the two in
 * different rows, so the phone menu can share the brand row; the default
 * renders both together, as before.
 */
export function PublicEditorialNav({
  current,
  part = "all",
  gateway,
}: {
  current?: string;
  part?: "all" | "links" | "menu";
  gateway?: EditorialGateway;
}) {
  const menu = (
    <details className="public-editorial-menu">
      <summary>Explore Xenios</summary>
      <EditorialLinks current={current} mobile gateway={gateway} />
    </details>
  );
  if (part === "links") return <EditorialLinks current={current} />;
  if (part === "menu") return menu;
  return (
    <div className="public-editorial-navigation">
      <EditorialLinks current={current} />
      {menu}
    </div>
  );
}

export function PublicEditorialFooter() {
  return (
    <footer className="public-editorial-footer rule-top">
      <div className="container-x public-editorial-footer-grid">
        <div>
          <Link href="/health" className="wordmark public-editorial-footer-brand" data-testid="link-health-home-footer">
            <span className="wordmark-mark" aria-hidden="true" />
            xenios <span className="text-ink-mute" style={{ fontWeight: 600 }}>care + research</span>
          </Link>
          <p className="body-s text-ink-mute mt-3 max-w-[44ch]">
            Provider-guided Care, evidence-led Research access, and clear separation between clinical decisions, product facts, and operational status.
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
      <h2 className="body-l font-700 mt-2">Care and Research are separate by design.</h2>
      <p className="body-s text-ink-2 mt-3 max-w-[68ch]">
        Use Xenios Care for personal medical evaluation, clinical records, prescribing, pharmacy fulfillment,
        and follow-up. Use Xenios Research for legitimate nonclinical research materials, evidence, documentation,
        and Research-only access. A Research account, listing, request, or purchase never creates a clinical decision.
      </p>
      <div className="mt-5 public-editorial-actions">
        <Link href="/research/access-hub" className="btn btn-secondary public-editorial-action">Explore Research</Link>
        <Link href="/care" className="btn btn-ghost public-editorial-action">Begin Care</Link>
      </div>
    </aside>
  );
}
