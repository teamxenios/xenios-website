import {
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from "react";
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
  { href: MEMBER_ROUTES.productRequests, label: "Product requests" },
  { href: MEMBER_ROUTES.guides, label: "Guides" },
  { href: MEMBER_ROUTES.documents, label: "Documents" },
  { href: MEMBER_ROUTES.documentCenter, label: "Document center" },
  { href: MEMBER_ROUTES.cart, label: "Cart" },
  { href: MEMBER_ROUTES.orders, label: "Orders" },
  { href: MEMBER_ROUTES.subscriptions, label: "Subscriptions" },
  { href: MEMBER_ROUTES.questions, label: "Questions" },
  { href: MEMBER_ROUTES.referrals, label: "Referrals" },
  { href: "/research/partners/links", label: "Recommend Xenios" },
  { href: MEMBER_ROUTES.membership, label: "Account access" },
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
      {/* Not a landmark: the section chrome in layout.tsx already renders the
          page's one <main>, and this shell always composes inside it. A
          second <main> here would nest landmarks, which assistive tech
          reports as two "main" regions on one page. */}
      <div className="mt-8">{children}</div>
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
      {/* Not a landmark: see the comment in ResearchMemberShell above. */}
      <div className="mt-8">{children}</div>
    </div>
  );
}

// Admin shell: information-dense operations chrome for /admin/research.
// The browser never grants authority; every panel's data comes from
// admin-authorized APIs and denial renders as an honest state.
type AdminNavItem = { href: string; label: string };
type AdminNavGroup = { label: string; items: AdminNavItem[] };

const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Founder",
    items: [
      { href: ADMIN_ROUTES.commandCenter, label: "Command center" },
    ],
  },
  {
    label: "Care",
    items: [
      { href: ADMIN_ROUTES.careRequests, label: "Care requests" },
    ],
  },
  {
    label: "Members",
    items: [
      { href: ADMIN_ROUTES.applications, label: "Applications" },
      { href: ADMIN_ROUTES.members, label: "Members" },
      { href: ADMIN_ROUTES.plans, label: "Plans" },
      { href: ADMIN_ROUTES.blueprintReview, label: "Plan review" },
      { href: ADMIN_ROUTES.questions, label: "Questions" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: ADMIN_ROUTES.products, label: "Products" },
      { href: ADMIN_ROUTES.productConfiguration, label: "Product configuration" },
      { href: ADMIN_ROUTES.productRequests, label: "Product requests" },
      { href: ADMIN_ROUTES.inventory, label: "Inventory" },
      { href: ADMIN_ROUTES.orders, label: "Orders" },
      { href: ADMIN_ROUTES.fulfillment, label: "Fulfillment" },
      { href: ADMIN_ROUTES.commerceQueues, label: "Commerce queues" },
    ],
  },
  {
    label: "Activation",
    items: [
      { href: ADMIN_ROUTES.activationQueue, label: "Payment verification" },
      { href: ADMIN_ROUTES.activationBridge, label: "Payment bridge" },
      { href: ADMIN_ROUTES.activationChecklist, label: "Day 15 checklist" },
      { href: ADMIN_ROUTES.activationReconciliation, label: "Reconciliation" },
      { href: ADMIN_ROUTES.activationReadiness, label: "Readiness" },
      { href: ADMIN_ROUTES.esignDocuments, label: "E-signatures" },
    ],
  },
  {
    label: "Content & partners",
    items: [
      { href: ADMIN_ROUTES.guides, label: "Guides" },
      { href: ADMIN_ROUTES.partners, label: "Partners" },
      { href: ADMIN_ROUTES.referralLifecycle, label: "Referral lifecycle" },
      { href: ADMIN_ROUTES.resourceHub, label: "Resource Hub" },
    ],
  },
  {
    label: "Governance",
    items: [
      { href: ADMIN_ROUTES.security, label: "Security" },
      { href: ADMIN_ROUTES.privacy, label: "Privacy" },
      { href: ADMIN_ROUTES.capabilities, label: "Capabilities" },
      { href: ADMIN_ROUTES.requiredInputs, label: "Required inputs" },
      { href: ADMIN_ROUTES.audit, label: "Audit" },
    ],
  },
];

function adminRouteIsActive(location: string, href: string): boolean {
  if (href === ADMIN_ROUTES.home) return location === href;
  return location === href || location.startsWith(href + "/");
}

function AdminNavLink({
  item,
  location,
  overview = false,
}: {
  item: AdminNavItem;
  location: string;
  overview?: boolean;
}) {
  const active = adminRouteIsActive(location, item.href);
  return (
    <Link
      href={item.href}
      className={`${overview ? "ra-admin-nav-overview" : "ra-admin-nav-link"} ${
        active ? "ra-admin-nav-active" : ""
      }`}
      aria-current={active ? "page" : undefined}
    >
      {item.label}
    </Link>
  );
}

function AdminNavGroup({
  group,
  location,
}: {
  group: AdminNavGroup;
  location: string;
}) {
  const containsCurrentRoute = group.items.some((item) =>
    adminRouteIsActive(location, item.href),
  );
  const [open, setOpen] = useState(containsCurrentRoute);
  const summaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (containsCurrentRoute) setOpen(true);
  }, [containsCurrentRoute]);

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    setOpen(event.currentTarget.open);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    setOpen(false);
    summaryRef.current?.focus();
  }

  return (
    <details
      className="ra-admin-nav-group"
      open={open}
      onToggle={handleToggle}
      onKeyDown={handleKeyDown}
    >
      <summary ref={summaryRef} className="ra-admin-nav-summary">
        <span>{group.label}</span>
        <span className="ra-admin-nav-indicator" aria-hidden="true" />
      </summary>
      <div className="ra-admin-nav-links" hidden={!open}>
        {group.items.map((item) => (
          <AdminNavLink key={item.href} item={item} location={location} />
        ))}
      </div>
    </details>
  );
}

function AdminGroupedNav() {
  const [location] = useLocation();
  const overview = { href: ADMIN_ROUTES.home, label: "Overview" };

  return (
    <nav aria-label="Research operations areas" className="ra-admin-nav">
      <AdminNavLink item={overview} location={location} overview />
      {ADMIN_NAV_GROUPS.map((group) => (
        <AdminNavGroup key={group.label} group={group} location={location} />
      ))}
    </nav>
  );
}

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
        <Link href="/admin" className="wordmark ra-admin-top-link" style={{ fontSize: 16, textDecoration: "none" }}>
          <span className="wordmark-mark" aria-hidden="true"></span>
          xenios <span className="text-ink-mute" style={{ fontWeight: 600 }}>research ops</span>
        </Link>
        <Link href="/" className="body-s text-ink-mute ra-admin-top-link" style={{ textDecoration: "none" }}>Back to site</Link>
      </div>
      <AdminGroupedNav />
      <PageHeader eyebrow="Operations" title={title} lead={lead} actions={actions} />
      {/* Unlike the member/partner/public shells above, this one keeps a real
          <main>: /admin/research mounts standalone in App.tsx
          (adminx-section.tsx), with no ResearchLayout/MemberChrome wrapper
          providing an outer main, so this is the page's only landmark, not a
          nested one. Verified by reading App.tsx and adminx-section.tsx: the
          admin route tree renders no chrome above this shell. */}
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
  contentMaxWidth = 720,
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  /** Public decision surfaces may opt into a wider, responsive card grid. */
  contentMaxWidth?: number | string;
  children: ReactNode;
}) {
  return (
    <div className="research-app container-x" style={{ paddingTop: 40, paddingBottom: 64 }}>
      <PageHeader eyebrow={eyebrow} title={title} lead={lead} />
      {/* Not a landmark: see the comment in ResearchMemberShell above. */}
      <div className="mt-8 min-w-0" style={{ maxWidth: contentMaxWidth }}>
        {children}
      </div>
    </div>
  );
}

export const ResearchAppShell = ResearchPublicShell;
