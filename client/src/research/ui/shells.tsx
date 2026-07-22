import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { MEMBER_ROUTES, PARTNER_ROUTES, ADMIN_ROUTES } from "../lib/routes";

// ---------------------------------------------------------------------------
// Shells (Supreme build). The SECTION chrome (password gate, member top nav,
// recovery chrome) lives in layout.tsx and is security-reviewed; these shells
// compose INSIDE it: page-level headers plus family sub-navigation. Partner
// and admin families render their own full shells because their navigation
// is distinct from the member area.
// ---------------------------------------------------------------------------

function SubNav({ items, label }: { items: Array<{ href: string; label: string }>; label: string }) {
  const [location] = useLocation();
  return (
    <nav aria-label={label} className="ra-subnav">
      {items.map((item) => {
        const active = location === item.href || location.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`ra-subnav-link ${active ? "ra-subnav-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PageHeader({ eyebrow, title, lead, actions }: { eyebrow: string; title: string; lead?: string; actions?: ReactNode }) {
  return (
    <header className="ra-pagehead">
      <p className="mono-cap text-pulse">{eyebrow}</p>
      <div className="flex flex-wrap items-end justify-between gap-4 mt-2">
        <h1 className="display-s text-balance" style={{ maxWidth: "24ch" }}>{title}</h1>
        {actions && <div className="flex gap-3">{actions}</div>}
      </div>
      {lead && <p className="body-m text-ink-2 mt-3 max-w-[58ch]">{lead}</p>}
    </header>
  );
}

// Member family shell: header + the deep-area sub-navigation. Renders inside
// the member chrome (layout.tsx), so it deliberately has no top bar.
// Launch scope: the health-program areas (Blueprint, Xenios 30, Xenios 90) and
// the health tracker are deferred until after launch. Their routes stay
// registered and stable (no broken links, no deleted code), but they are
// hidden from the primary navigation so the launch surface is the commerce,
// membership, and operations platform. Restore the four entries below when the
// health programs return to scope.
const MEMBER_SUBNAV = [
  { href: MEMBER_ROUTES.home, label: "Home" },
  { href: MEMBER_ROUTES.assessment, label: "Assessment" },
  { href: MEMBER_ROUTES.goals, label: "Goals" },
  { href: MEMBER_ROUTES.products, label: "Products" },
  { href: MEMBER_ROUTES.guides, label: "Guides" },
  { href: MEMBER_ROUTES.documents, label: "Documents" },
  { href: MEMBER_ROUTES.cart, label: "Cart" },
  { href: MEMBER_ROUTES.orders, label: "Orders" },
  { href: MEMBER_ROUTES.subscriptions, label: "Subscriptions" },
  { href: MEMBER_ROUTES.questions, label: "Questions" },
  { href: MEMBER_ROUTES.referrals, label: "Referrals" },
  { href: MEMBER_ROUTES.membership, label: "Membership" },
  { href: MEMBER_ROUTES.profile, label: "Profile" },
  { href: MEMBER_ROUTES.security, label: "Security" },
  { href: MEMBER_ROUTES.privacy, label: "Privacy" },
];

export function ResearchMemberShell({
  eyebrow = "Member",
  title,
  lead,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="research-app container-x" style={{ paddingTop: 28, paddingBottom: 64 }}>
      <SubNav items={MEMBER_SUBNAV} label="Member areas" />
      <PageHeader eyebrow={eyebrow} title={title} lead={lead} actions={actions} />
      <main className="mt-8">{children}</main>
    </div>
  );
}

// Partner shell: renders under the section's minimal chrome with its own
// identity row and sub-navigation. Partners never see member navigation.
const PARTNER_SUBNAV = [
  { href: PARTNER_ROUTES.dashboard, label: "Dashboard" },
  { href: PARTNER_ROUTES.links, label: "Links" },
  { href: PARTNER_ROUTES.campaigns, label: "Campaigns" },
  { href: PARTNER_ROUTES.events, label: "Events" },
  { href: PARTNER_ROUTES.leads, label: "Leads" },
  { href: PARTNER_ROUTES.conversions, label: "Conversions" },
  { href: PARTNER_ROUTES.commissions, label: "Commissions" },
  { href: PARTNER_ROUTES.payouts, label: "Payouts" },
  { href: PARTNER_ROUTES.organizations, label: "Organizations" },
  { href: PARTNER_ROUTES.training, label: "Training" },
  { href: PARTNER_ROUTES.resources, label: "Resources" },
  { href: PARTNER_ROUTES.compliance, label: "Compliance" },
  { href: PARTNER_ROUTES.support, label: "Support" },
  { href: PARTNER_ROUTES.security, label: "Security" },
];

export function ResearchPartnerShell({
  eyebrow = "Partners",
  title,
  lead,
  actions,
  showNav = true,
  children,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  actions?: ReactNode;
  showNav?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="research-app container-x" style={{ paddingTop: 28, paddingBottom: 64 }}>
      {showNav && <SubNav items={PARTNER_SUBNAV} label="Partner areas" />}
      <PageHeader eyebrow={eyebrow} title={title} lead={lead} actions={actions} />
      <main className="mt-8">{children}</main>
    </div>
  );
}

// Admin shell: information-dense operations chrome for /admin/research.
// The browser never grants authority; every panel's data comes from
// admin-authorized APIs and denial renders as an honest state.
const ADMIN_SUBNAV = [
  { href: ADMIN_ROUTES.home, label: "Overview" },
  { href: ADMIN_ROUTES.applications, label: "Applications" },
  { href: ADMIN_ROUTES.members, label: "Members" },
  { href: ADMIN_ROUTES.plans, label: "Plans" },
  { href: ADMIN_ROUTES.products, label: "Products" },
  { href: ADMIN_ROUTES.inventory, label: "Inventory" },
  { href: ADMIN_ROUTES.orders, label: "Orders" },
  { href: ADMIN_ROUTES.fulfillment, label: "Fulfillment" },
  { href: ADMIN_ROUTES.commerceQueues, label: "Commerce queues" },
  { href: ADMIN_ROUTES.questions, label: "Questions" },
  { href: ADMIN_ROUTES.guides, label: "Guides" },
  { href: ADMIN_ROUTES.partners, label: "Partners" },
  { href: ADMIN_ROUTES.security, label: "Security" },
  { href: ADMIN_ROUTES.privacy, label: "Privacy" },
  { href: ADMIN_ROUTES.capabilities, label: "Capabilities" },
  { href: ADMIN_ROUTES.audit, label: "Audit" },
];

export function ResearchAdminShell({
  title,
  lead,
  actions,
  children,
}: {
  title: string;
  lead?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="research-app ra-admin container-x" style={{ paddingTop: 20, paddingBottom: 64 }}>
      <div className="flex items-center justify-between gap-4 ra-admin-top">
        <Link href="/admin" className="wordmark" style={{ fontSize: 16, textDecoration: "none" }}>
          <span className="wordmark-mark" aria-hidden="true"></span>
          xenios <span className="text-ink-mute" style={{ fontWeight: 600 }}>research ops</span>
        </Link>
        <Link href="/" className="body-s text-ink-mute" style={{ textDecoration: "none" }}>Back to site</Link>
      </div>
      <SubNav items={ADMIN_SUBNAV} label="Research operations areas" />
      <PageHeader eyebrow="Operations" title={title} lead={lead} actions={actions} />
      <main className="mt-6">{children}</main>
    </div>
  );
}

// Public/App shells: thin composition helpers for access-family pages that
// render under the section's minimal chrome.
export function ResearchPublicShell({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <div className="research-app container-x" style={{ paddingTop: 40, paddingBottom: 64 }}>
      <PageHeader eyebrow={eyebrow} title={title} lead={lead} />
      <main className="mt-8" style={{ maxWidth: 720 }}>{children}</main>
    </div>
  );
}

export const ResearchAppShell = ResearchPublicShell;
