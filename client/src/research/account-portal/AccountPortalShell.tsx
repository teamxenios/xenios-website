import { useContext, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ACCOUNT_PORTAL_ROUTES } from "../lib/routes";
import { ResearchContext } from "../core";
import "./account-portal.css";

const NAV_ITEMS = [
  { href: ACCOUNT_PORTAL_ROUTES.home, label: "Overview" },
  { href: ACCOUNT_PORTAL_ROUTES.orders, label: "Orders" },
  { href: ACCOUNT_PORTAL_ROUTES.subscription, label: "Membership" },
  { href: ACCOUNT_PORTAL_ROUTES.care, label: "Care status" },
  { href: ACCOUNT_PORTAL_ROUTES.documents, label: "Documents" },
  { href: ACCOUNT_PORTAL_ROUTES.support, label: "Support" },
] as const;

export function AccountPortalShell({
  eyebrow = "Private account",
  title,
  lead,
  actions,
  currentPath,
  children,
}: {
  eyebrow?: string;
  title: string;
  lead: string;
  actions?: ReactNode;
  currentPath?: string;
  children: ReactNode;
}) {
  const [location, navigate] = useLocation();
  const research = useContext(ResearchContext);
  const [signingOut, setSigningOut] = useState(false);
  const activeLocation = currentPath ?? location;

  async function signOut() {
    if (!research || signingOut) return;
    setSigningOut(true);
    try {
      await research.signOutMember();
      navigate("/research");
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <div className="research-app account-portal container-x">
      <header className="account-portal-header">
        <div>
          <p className="account-portal-kicker">XENIOS <span aria-hidden="true">/</span> RESEARCH + CARE</p>
          <p className="body-s account-portal-trust">One private record for membership, orders, Care operations, and support.</p>
        </div>
        <div className="account-portal-controls">
          <span className="account-private-mark">Private account</span>
          {research ? (
            <button className="btn btn-ghost" type="button" onClick={() => void signOut()} disabled={signingOut}>
              {signingOut ? "Signing out" : "Sign out"}
            </button>
          ) : null}
        </div>
      </header>

      <nav className="account-portal-nav" aria-label="Account areas">
        {NAV_ITEMS.map((item) => {
          const active = activeLocation === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`account-portal-nav-link ${active ? "account-portal-nav-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <section className="account-page-heading">
        <div className="min-w-0">
          <p className="mono-cap account-page-eyebrow">{eyebrow}</p>
          <h1 className="account-page-title">{title}</h1>
          <p className="account-page-lead">{lead}</p>
        </div>
        {actions ? <div className="account-page-actions">{actions}</div> : null}
      </section>

      {/* The account routes render bare (no chrome main), so this is the page's
          single main landmark (P2-2). */}
      <main className="account-page-body">{children}</main>
      <footer className="account-portal-footer">
        <p>Administrative account information only. Care, provider review, and pharmacy fulfillment remain separate.</p>
        <Link href="/research/privacy">Privacy</Link>
      </footer>
    </div>
  );
}
