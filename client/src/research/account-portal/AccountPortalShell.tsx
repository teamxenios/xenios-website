import { useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ACCESS_ROUTES, ACCOUNT_PORTAL_ROUTES, MEMBER_ROUTES, PARTNER_ROUTES } from "../lib/routes";
import { ResearchContext } from "../core";
import { getPartnerSelf } from "../adapters/partner";
import { usePartnerResource } from "../pages/partners/shared";
import {
  ACCOUNT_PORTAL_EXTENSION_ROUTES,
  isAccountOrderDetailPath,
} from "./routes";
import "./account-portal.css";

const NAV_ITEMS = [
  { href: ACCOUNT_PORTAL_ROUTES.home, label: "Overview" },
  { href: ACCOUNT_PORTAL_ROUTES.orders, label: "Commerce" },
  { href: MEMBER_ROUTES.fullCatalog, label: "Browse products" },
  { href: ACCOUNT_PORTAL_ROUTES.subscription, label: "Membership" },
  { href: ACCOUNT_PORTAL_ROUTES.care, label: "Care status" },
  { href: ACCOUNT_PORTAL_EXTENSION_ROUTES.interests, label: "Interests" },
  { href: ACCOUNT_PORTAL_ROUTES.documents, label: "Documents" },
  { href: ACCOUNT_PORTAL_EXTENSION_ROUTES.profile, label: "Profile" },
  { href: ACCOUNT_PORTAL_EXTENSION_ROUTES.security, label: "Security" },
  { href: ACCOUNT_PORTAL_ROUTES.support, label: "Support" },
] as const;

function PartnerWorkspaceNavigation({ token }: { token: string }) {
  const { state, data, denied } = usePartnerResource(getPartnerSelf, token);
  if (state === "ok" && data?.partner) {
    return <Link href={PARTNER_ROUTES.dashboard} className="account-portal-nav-link">Partner workspace</Link>;
  }
  // A missing owned relation is not an account failure. Other failures do not
  // imply that this member lacks a partner relationship or that it is approved.
  if (denied?.code === "partner_not_found") return null;
  return <span className="account-portal-nav-link" role="status">
    {state === "loading" ? "Checking partner access…" : "Partner access not confirmed"}
  </span>;
}

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

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | Xenios Research`;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  async function signOut() {
    if (!research || signingOut) return;
    setSigningOut(true);
    try {
      await research.signOutMember();
      navigate(ACCESS_ROUTES.gateway);
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <div className="research-app account-portal container-x">
      <a className="account-skip-link" href="#account-main-content">
        Skip to account content
      </a>
      <header className="account-portal-header">
        <div>
          <p className="account-portal-kicker">XENIOS <span aria-hidden="true">/</span> RESEARCH + CARE</p>
          <p className="body-s account-portal-trust">One private view for membership, commerce history, Care operations, and support.</p>
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
          const active = activeLocation === item.href
            || (item.href === ACCOUNT_PORTAL_ROUTES.orders && isAccountOrderDetailPath(activeLocation));
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
        {research?.memberToken ? <PartnerWorkspaceNavigation key={research.memberToken} token={research.memberToken} /> : null}
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
      <main id="account-main-content" className="account-page-body" tabIndex={-1}>{children}</main>
      <footer className="account-portal-footer">
        <p>Administrative account information only. Care, provider review, and pharmacy fulfillment remain separate.</p>
        <Link href={ACCESS_ROUTES.privacy}>Privacy</Link>
      </footer>
    </div>
  );
}
