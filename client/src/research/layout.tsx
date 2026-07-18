import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingBag } from "lucide-react";
import Wordmark from "@/components/Wordmark";
import { useResearch } from "./core";

// xenios research: section chrome. Native to the xenios design system: paper,
// ink, mono-cap eyebrows, 4px geometry. The password gate renders here, so
// every research page is behind it with one implementation.

const LOCAL_NAV = [
  { label: "Overview", href: "/research" },
  { label: "Membership", href: "/research/membership" },
  { label: "Blueprint", href: "/research/blueprint" },
  { label: "Programs", href: "/research/programs" },
  { label: "Guides", href: "/research/learn" },
  { label: "Trust", href: "/research/trust" },
  { label: "Referrals", href: "/research/referrals" },
  { label: "Professionals", href: "/research/professionals" },
];

function isActive(location: string, href: string) {
  return href === "/research" ? location === href : location === href || location.startsWith(`${href}/`);
}

function PasswordPage() {
  const { submitPassword } = useResearch();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !password.trim()) return;
    setBusy(true);
    setError(null);
    const failure = await submitPassword(password);
    if (failure) setError(failure);
    setBusy(false);
  }

  return (
    <div className="container-x" style={{ paddingTop: "var(--space-hero-top)", paddingBottom: "var(--space-hero-bottom)" }}>
      <div style={{ maxWidth: 480 }}>
        <p className="mono-cap text-pulse mb-6">xenios research</p>
        <h1 className="display-m text-balance">This area is under review.</h1>
        <p className="mt-6 body-l text-ink-2">
          The research section is open to invited reviewers while the catalog, quality documentation, and legal review are completed. Enter the access password to continue.
        </p>
        <form onSubmit={onSubmit} className="mt-10 space-y-4" data-testid="form-research-access">
          <div>
            <label htmlFor="research-password" className="form-label">Access password</label>
            <input
              id="research-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input-field"
              data-testid="input-research-password"
            />
          </div>
          {error && (
            <p className="body-s" role="alert" style={{ color: "var(--error)" }} data-testid="text-research-access-error">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || !password.trim()} className="btn btn-primary" data-testid="button-research-access">
            {busy ? "Checking" : "Enter"}
          </button>
        </form>
        <p className="mt-8 body-s text-ink-mute">
          No password? Ask the xenios team for review access. Nothing in this section is for human or veterinary use, and ordering is not open.
        </p>
      </div>
    </div>
  );
}

function Unconfigured() {
  return (
    <div className="container-x" style={{ paddingTop: "var(--space-hero-top)", paddingBottom: "var(--space-hero-bottom)" }}>
      <p className="mono-cap text-ink-mute mb-6">xenios research</p>
      <h1 className="display-m">This area is not available.</h1>
      <p className="mt-6 body-l text-ink-2">The research section is not configured on this deployment.</p>
    </div>
  );
}

export default function ResearchLayout({ children }: { children: ReactNode }) {
  const { gate, count, logout } = useResearch();
  const [location] = useLocation();

  if (gate === "unconfigured") return <Unconfigured />;
  if (gate === "checking") {
    return (
      <div className="container-x" style={{ paddingTop: "var(--space-hero-top)" }}>
        <p className="mono-cap text-ink-mute">xenios research</p>
      </div>
    );
  }
  if (gate === "locked") return <PasswordPage />;

  return (
    <div className="research-root">
      <header className="xr-header" style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}>
        <div className="container-x">
          <div className="xr-header-main">
            <Link href="/research" className="wordmark xr-research-brand" data-testid="link-research-home">
              <span className="wordmark-mark" aria-hidden="true"></span>
              xenios <em>research</em>
            </Link>
            <nav className="xr-desktop-nav" aria-label="Research navigation">
              {LOCAL_NAV.map((item) => {
                const active = isActive(location, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="xr-header-actions">
              <Link href="/research/apply" className="btn btn-primary xr-apply-link" style={{ height: 42, padding: "0 14px", fontSize: 13 }} data-testid="link-apply-membership">
                Apply for Membership
              </Link>
              <Link href="/research/cart" className="xr-cart-link" aria-label={`Cart with ${count} items`} data-testid="link-research-cart">
                <ShoppingBag size={18} aria-hidden="true" />
                <span className="tabular text-[13px]">{count > 0 ? count : ""}</span>
              </Link>
            </div>
          </div>
          <nav className="xr-mobile-nav" aria-label="Research navigation (mobile)">
            {LOCAL_NAV.map((item) => {
              const active = isActive(location, item.href);
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="xr-footer">
        <div className="container-x xr-footer-grid">
          <div>
            <Wordmark size="sm" />
            <p className="mt-4 body-s text-ink-mute max-w-[42ch]">
              A private whole-life membership in review. Research materials are not for human or veterinary use. Programs are educational and non-clinical. Ordering is not open.
            </p>
            <p className="mono-label text-ink-mute mt-5">Private preview · noindex</p>
          </div>
          <div className="xr-footer-links">
            <div>
              <p className="mono-cap text-ink-mute">Membership</p>
              <Link href="/research/membership">Membership</Link>
              <Link href="/research/membership/compare">Compare options</Link>
              <Link href="/research/blueprint">Whole-Life Blueprint</Link>
              <Link href="/research/referrals">Member referrals</Link>
            </div>
            <div>
              <p className="mono-cap text-ink-mute">Trust</p>
              <Link href="/research/trust">Trust center</Link>
              <Link href="/research/how-your-data-is-used">How data is used</Link>
              <Link href="/research/quality">Quality standards</Link>
              <Link href="/research/faq">FAQ</Link>
            </div>
            <div>
              <p className="mono-cap text-ink-mute">Explore</p>
              <Link href="/research/learn">Research Guides</Link>
              <Link href="/research/programs">Programs</Link>
              <Link href="/research/professionals">Professionals</Link>
              <Link href="/research/ambassadors">Ambassadors</Link>
            </div>
            <div>
              <p className="mono-cap text-ink-mute">Access</p>
              <Link href="/research/access">Request access</Link>
              <Link href="/research/wholesale">Wholesale</Link>
              <Link href="/">Back to xenios</Link>
              <button type="button" onClick={() => void logout()} data-testid="button-research-logout">
                Log out of review access
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
