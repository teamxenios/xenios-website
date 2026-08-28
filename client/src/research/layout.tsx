import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import Wordmark from "@/components/Wordmark";
import {
  isResearchAccessStatePath,
  isResearchActivatePath,
  isResearchApplicationStatusPath,
  normalizeResearchPath,
  isResearchResetPasswordPath,
} from "@shared/research/paths";
import { useResearch } from "./core";
import { ACCOUNT_PORTAL_ROUTES } from "./lib/routes";
import { isPublicLotRoutePath } from "./quality/routes";
import {
  PublicEditorialFooter,
  PublicEditorialNav,
} from "./pages/PublicEditorialNav";

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

// Launch scope: Blueprint and Tracker (health programs) are deferred until
// after launch and held out of the chrome; Cart joins the commerce launch
// surface. Their routes stay registered and stable.
const MEMBER_NAV = [
  { label: "Home", href: "/research/member" },
  { label: "Products", href: "/research/member/products" },
  { label: "Full catalog", href: "/research/member/catalog" },
  { label: "Requests", href: "/research/member/product-requests" },
  { label: "Guides", href: "/research/member/guides" },
  { label: "Cart", href: "/research/member/cart" },
  { label: "Orders", href: "/research/member/orders" },
  { label: "Membership", href: "/research/member/membership" },
  { label: "Account", href: "/research/account" },
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
    <main className="container-x" style={{ paddingTop: "var(--space-hero-top)", paddingBottom: "var(--space-hero-bottom)" }}>
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
    </main>
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
  const [location] = useLocation();
  const normalizedLocation = normalizeResearchPath(location) ?? undefined;

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
        <div className="container-x" style={{ paddingBottom: 12 }}>
          <PublicEditorialNav current={normalizedLocation} />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <PublicEditorialFooter />
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

function isResearchSignInPath(path: string): boolean {
  return normalizeResearchPath(path) === "/research/sign-in";
}

// The six REGISTERED account-portal routes, exactly — never a prefix, so the
// parked identity/organization family under /research/account stays gated
// until it is mounted on purpose.
const ACCOUNT_PORTAL_PATHS = new Set<string>(Object.values(ACCOUNT_PORTAL_ROUTES));

function isAccountPortalPath(path: string): boolean {
  const normalized = normalizeResearchPath(path);
  return ACCOUNT_PORTAL_PATHS.has(normalized);
}

function isPublicResearchPath(path: string): boolean {
  const normalized = normalizeResearchPath(path);
  if (!normalized) return false;

  // THE EARLY ACCESS ORDERING JOURNEY (founder decision, 2026-08-20: no
  // customer-facing password at all).
  //
  // Without these the server side of the decision was invisible: every Early
  // Access API was open and minting anonymous sessions, and the browser still
  // rendered the shared review password page before the customer ever reached
  // the catalog. A visitor saw "Enter the access password to continue" on a
  // journey that no longer has a password, and nothing on the server reported a
  // problem, because nothing was wrong there.
  //
  // Path-exact for the surfaces themselves, plus the anchored order-request
  // family, so this stays an allowlist rather than a prefix exemption over
  // everything under /research/early-access.
  if (
    normalized === "/research/early-access"
    || normalized === "/research/early-access/order-request"
    || normalized.startsWith("/research/early-access/order-request/")
  ) {
    return true;
  }

  return normalized === "/research"
    || normalized === "/research/access-hub"
    || normalized === "/research/supplier-access"
    || normalized === "/research/organizations"
    || normalized === "/research/partners"
    || normalized === "/research/affiliates"
    || normalized === "/research/apply"
    || normalized === "/research/apply/review"
    || normalized === "/research/apply/success"
    || normalized === "/research/apply/status"
    || normalized === "/research/application/status"
    || normalized === "/research/application-status"
    || normalized === "/research/support"
    || normalized === "/research/about"
    || normalized === "/research/how-it-works"
    || normalized === "/research/faq"
    || normalized === "/research/quality"
    || normalized === "/research/testing"
    || normalized === "/research/documents"
    || normalized === "/research/policies"
    || normalized === "/research/contact"
    || normalized === "/research/privacy"
    || normalized === "/research/terms"
    || normalized.startsWith("/research/policies/")
    || isPublicLotRoutePath(path);
}

// Account access works from a fresh browser WITHOUT the shared review
// password. Sign-in, password recovery, activation, and token-scoped
// application status render in isolated account chrome. None of these routes
// exposes catalog or member data without its own stronger credential.
export default function ResearchLayout({ children }: { children: ReactNode }) {
  const { gate } = useResearch();
  const [location] = useLocation();
  const normalizedLocation = normalizeResearchPath(location);

  // Use the same decoded, case-folded helper as the router, tracking guard,
  // and server headers. Plain, trailing-slash, case, and encoded forms must
  // all mount the isolated recovery experience outside the shared gate.
  if (
    isResearchResetPasswordPath(location) ||
    isResearchSignInPath(location) ||
    isResearchActivatePath(location) ||
    isResearchAccessStatePath(location) ||
    isResearchApplicationStatusPath(location)
  ) {
    return <RecoveryChrome>{children}</RecoveryChrome>;
  }
  // THE CUSTOMER ACCOUNT PORTAL (release integration, 2026-08-27). The six
  // registered account routes are member-guarded at mount (RequireMember) and
  // Bearer-guarded at every API read, so the shared review password adds no
  // protection here — only a lockout: a signed-out customer must land on
  // sign-in with the exact returnTo, not on the reviewer password page. Bare
  // children on purpose: AccountPortalShell is the sole chrome, the same
  // pattern as the gateway, so the portal does not render doubled headers.
  if (isAccountPortalPath(location)) {
    return <>{children}</>;
  }
  // The public Research journey must not depend on the legacy shared review
  // password. The gateway exposes only Apply and Member Login; application,
  // status, support, and policy routes contain no member/catalog data. This
  // keeps a missing preview-password configuration from disabling the public
  // journey while every member/catalog route remains protected.
  if (isPublicResearchPath(location)) {
    return normalizedLocation === "/research"
      ? <>{children}</>
      : <MinimalChrome>{children}</MinimalChrome>;
  }
  if (gate === "unconfigured") return <Unconfigured />;
  if (gate === "checking") {
    return (
      <div className="container-x" style={{ paddingTop: "var(--space-hero-top)" }}>
        <p className="mono-cap text-ink-mute">xenios research</p>
      </div>
    );
  }
  if (gate === "locked") return <PasswordPage />;

  if (isMemberAreaPath(location)) return <MemberChrome>{children}</MemberChrome>;
  return <MinimalChrome>{children}</MinimalChrome>;
}
