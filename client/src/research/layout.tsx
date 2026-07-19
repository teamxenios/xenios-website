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
  { label: "Framework", href: "/research/framework" },
  { label: "Peptides", href: "/research/peptides" },
  { label: "Quantum", href: "/research/quantum" },
  { label: "Supplements", href: "/research/supplements" },
  { label: "Programs", href: "/research/programs" },
  { label: "Quality", href: "/research/quality" },
  { label: "Learn", href: "/research/learn" },
  { label: "For Professionals", href: "/research/professionals" },
  { label: "Sign in", href: "/research/sign-in" },
];

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
    <div>
      <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md rule-bottom" style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}>
        <div className="container-x">
          <div className="flex items-center justify-between gap-4" style={{ minHeight: 60 }}>
            <Link href="/research" className="wordmark" style={{ fontSize: 18, textDecoration: "none" }} data-testid="link-research-home">
              <span className="wordmark-mark" aria-hidden="true"></span>
              xenios <span className="text-ink-mute" style={{ fontWeight: 600 }}>research</span>
            </Link>
            <nav className="hidden lg:flex items-center gap-5 overflow-x-auto" aria-label="Research navigation">
              {LOCAL_NAV.map((item) => {
                const active = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-[13px] whitespace-nowrap transition-colors ${active ? "text-ink" : "text-ink-2 hover:text-pulse"}`}
                    style={{ fontWeight: active ? 700 : 600 }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-3">
              <Link href="/research/apply" className="btn btn-primary hidden sm:inline-flex" style={{ height: 40, padding: "0 14px", fontSize: 13 }} data-testid="link-apply-membership">
                Apply for Membership
              </Link>
              <Link href="/research/cart" className="btn btn-ghost" style={{ height: 40, padding: "0 10px" }} aria-label={`Cart with ${count} items`} data-testid="link-research-cart">
                <ShoppingBag size={18} aria-hidden="true" />
                <span className="tabular text-[13px]">{count > 0 ? count : ""}</span>
              </Link>
            </div>
          </div>
          <nav className="lg:hidden flex items-center gap-4 overflow-x-auto pb-3 -mt-1" aria-label="Research navigation (mobile)">
            {LOCAL_NAV.map((item) => (
              <Link key={item.href} href={item.href} className={`text-[13px] whitespace-nowrap ${location === item.href ? "text-ink font-700" : "text-ink-2"}`}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="rule-top mt-16">
        <div className="container-x py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div>
              <Wordmark size="sm" />
              <p className="mt-4 body-s text-ink-mute max-w-[36ch]">
                Research materials are not for human or veterinary use. Programs are human-led and non-clinical. Ordering is not open.
              </p>
            </div>
            <div>
              <p className="mono-cap text-ink-mute mb-4">Policies</p>
              <div className="space-y-2">
                {["research-use", "shipping", "returns", "privacy", "terms"].map((slug) => (
                  <Link key={slug} href={`/research/policies/${slug}`} className="block body-s text-ink-2 hover:text-pulse transition-colors capitalize">
                    {slug.replace(/-/g, " ")}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <p className="mono-cap text-ink-mute mb-4">Access</p>
              <div className="space-y-2">
                <Link href="/research/access" className="block body-s text-ink-2 hover:text-pulse transition-colors">Professional access</Link>
                <Link href="/research/wholesale" className="block body-s text-ink-2 hover:text-pulse transition-colors">Wholesale</Link>
                <Link href="/" className="block body-s text-ink-2 hover:text-pulse transition-colors">Back to xenios</Link>
                <button type="button" onClick={() => void logout()} className="block body-s text-ink-mute hover:text-pulse transition-colors" data-testid="button-research-logout">
                  Log out of review access
                </button>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
