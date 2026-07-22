import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import Wordmark from "@/components/Wordmark";
import { isResearchResetPasswordPath } from "@shared/research/paths";
import { useResearch } from "./core";

// xenios research: section chrome. Three modes by route (canonical gateway
// architecture):
//  - /research (the gateway): BARE. The gateway page is its own viewport;
//    no navigation, no footer chrome.
//  - member area (products, systems, guides, orders, subscriptions,
//    referrals, profile, and legacy content pages): member navigation.
//  - everything else (apply, sign-in, status, activate, policies): minimal
//    chrome, a small wordmark and a quiet footer.
// The shared-password gate renders here, so every research page is behind it
// with one implementation; an authenticated member bypasses it (core.tsx).

const MEMBER_NAV = [
  { label: "Home", href: "/research/member" },
  { label: "Blueprint", href: "/research/member/blueprint" },
  { label: "Tracker", href: "/research/member/tracker" },
  { label: "Products", href: "/research/member/products" },
  { label: "Guides", href: "/research/member/guides" },
  { label: "Orders", href: "/research/member/orders" },
  { label: "Membership", href: "/research/member/membership" },
  { label: "Profile", href: "/research/member/profile" },
];

// Routes that belong to the member area (member chrome + RequireMember in
// section.tsx). Everything else pre-member gets the minimal chrome.
const MEMBER_AREA_PREFIXES = [
  "/research/member",
  "/research/products",
  "/research/product/",
  "/research/systems",
  "/research/guides",
  "/research/orders",
  "/research/subscriptions",
  "/research/referrals",
  "/research/profile",
  "/research/membership",
  "/research/framework",
  "/research/faq",
  "/research/quality",
  "/research/professionals",
  "/research/access",
  "/research/wholesale",
  "/research/shop",
  "/research/build-a-system",
  "/research/learn",
  "/research/peptides",
  "/research/quantum",
  "/research/supplements",
  "/research/programs",
  "/research/cart",
];

export function isMemberAreaPath(path: string): boolean {
  return MEMBER_AREA_PREFIXES.some(
    (p) => path === p || path === p.replace(/\/$/, "") || path.startsWith(p.endsWith("/") ? p : p + "/"),
  );
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

function MinimalChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col" style={{ minHeight: "100dvh" }}>
      <header className="rule-bottom" style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}>
        <div className="container-x flex items-center justify-between" style={{ minHeight: 60 }}>
          <Link href="/research" className="wordmark" style={{ fontSize: 18, textDecoration: "none" }} data-testid="link-research-home">
            <span className="wordmark-mark" aria-hidden="true"></span>
            xenios <span className="text-ink-mute" style={{ fontWeight: 600 }}>research</span>
          </Link>
          <Link href="/research" className="body-s text-ink-mute hover:text-pulse transition-colors">Back to gateway</Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="rule-top">
        <div
          className="container-x flex flex-wrap justify-center"
          style={{ paddingTop: 24, paddingBottom: 24, gap: 32 }}
        >
          <Link href="/research/policies/privacy" className="body-s text-ink-mute hover:text-pulse transition-colors">Privacy</Link>
          <Link href="/research/policies/terms" className="body-s text-ink-mute hover:text-pulse transition-colors">Terms</Link>
          <a href="mailto:research@xeniostechnology.com" className="body-s text-ink-mute hover:text-pulse transition-colors">Support</a>
        </div>
      </footer>
    </div>
  );
}

// The signed-out recovery route is intentionally more isolated than other
// pre-member pages: static brand, recovery controls, Member Login, and Support
// only. No gateway, policy, catalog, product, or member-navigation links.
function RecoveryChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col" style={{ minHeight: "100dvh" }}>
      <header className="rule-bottom" style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}>
        <div className="container-x flex items-center" style={{ minHeight: 60 }}>
          <div className="wordmark" style={{ fontSize: 18 }} aria-label="xenios research">
            <span className="wordmark-mark" aria-hidden="true"></span>
            xenios <span className="text-ink-mute" style={{ fontWeight: 600 }}>research</span>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function MemberChrome({ children }: { children: ReactNode }) {
  const { member, signOutMember } = useResearch();
  const [location, navigate] = useLocation();

  return (
    <div>
      <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md rule-bottom" style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}>
        <div className="container-x">
          <div className="flex items-center justify-between gap-4" style={{ minHeight: 60 }}>
            <Link href="/research/member" className="wordmark" style={{ fontSize: 18, textDecoration: "none" }} data-testid="link-research-home">
              <span className="wordmark-mark" aria-hidden="true"></span>
              xenios <span className="text-ink-mute" style={{ fontWeight: 600 }}>research</span>
            </Link>
            <nav className="hidden lg:flex items-center gap-5 overflow-x-auto" aria-label="Member navigation">
              {MEMBER_NAV.map((item) => {
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
            <button
              type="button"
              onClick={() => void signOutMember().then(() => navigate("/research"))}
              className="btn btn-ghost"
              style={{ height: 40, padding: "0 14px", fontSize: 13 }}
              data-testid="button-member-signout"
            >
              {member ? `Sign out${member.firstName ? ` (${member.firstName})` : ""}` : "Sign out"}
            </button>
          </div>
          <nav className="lg:hidden flex items-center gap-4 overflow-x-auto pb-3 -mt-1" aria-label="Member navigation (mobile)">
            {MEMBER_NAV.map((item) => (
              <Link key={item.href} href={item.href} className={`text-[13px] whitespace-nowrap ${location === item.href ? "text-ink font-700" : "text-ink-2"}`}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="rule-top" style={{ marginTop: 64 }}>
        <div
          className="container-x flex flex-wrap items-center justify-between"
          style={{ paddingTop: 40, paddingBottom: 24, gap: 24 }}
        >
          <Wordmark size="sm" />
          <div className="flex flex-wrap" style={{ gap: 32 }}>
            {["research-use", "shipping", "returns", "privacy", "terms"].map((slug) => (
              <Link key={slug} href={`/research/policies/${slug}`} className="body-s text-ink-2 hover:text-pulse transition-colors capitalize">
                {slug.replace(/-/g, " ")}
              </Link>
            ))}
            <a href="mailto:research@xeniostechnology.com" className="body-s text-ink-2 hover:text-pulse transition-colors">Support</a>
          </div>
        </div>
        <div className="container-x" style={{ paddingBottom: 32 }}>
          <p className="body-s text-ink-mute max-w-[64ch]">
            Research materials are not for human or veterinary use. Programs are human-led and non-clinical.
          </p>
        </div>
      </footer>
    </div>
  );
}

// FOUNDER DECISION (2026-07-19): members recover their password from a fresh
// browser WITHOUT the shared review password. Exactly this route renders
// outside the gate, in minimal account chrome; it exposes no catalog, no
// member navigation, and no application data. Everything else stays gated.
export default function ResearchLayout({ children }: { children: ReactNode }) {
  const { gate } = useResearch();
  const [location] = useLocation();

  if (gate === "unconfigured") return <Unconfigured />;
  // Use the same decoded, case-folded helper as the router, tracking guard,
  // and server headers. Plain, trailing-slash, case, and encoded forms must
  // all mount the isolated recovery experience outside the shared gate.
  if (isResearchResetPasswordPath(location)) return <RecoveryChrome>{children}</RecoveryChrome>;
  if (gate === "checking") {
    return (
      <div className="container-x" style={{ paddingTop: "var(--space-hero-top)" }}>
        <p className="mono-cap text-ink-mute">xenios research</p>
      </div>
    );
  }
  if (gate === "locked") return <PasswordPage />;

  // The gateway is its own full-viewport page: no chrome at all.
  if (location === "/research" || location === "/research/") return <>{children}</>;
  if (isMemberAreaPath(location)) return <MemberChrome>{children}</MemberChrome>;
  return <MinimalChrome>{children}</MinimalChrome>;
}
