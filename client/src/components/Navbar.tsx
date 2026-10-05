import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { BRAND } from "@/clarity/brand";

const PRIMARY = [
  { label: "For Individuals", href: "/individuals" },
  { label: "For Practices", href: "/practices" },
  { label: "Partners", href: "/partners" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Quality", href: "/quality" },
  { label: "About", href: "/about" },
  { label: "Careers", href: "/careers" },
] as const;

const MORE = [
  { label: "Explore Products", href: "/products" },
  { label: "Check Status", href: "/status" },
  { label: "Suppliers", href: "/suppliers" },
  { label: "FAQ", href: "/faq" },
  { label: "Support", href: "/support" },
] as const;

const AUDIENCE_MENUS = {
  "/individuals": [
    { label: "For Individuals", href: "/individuals" },
    { label: "Start Care", href: "/care/schedule" },
    { label: "Explore Products", href: "/products" },
    { label: "How Research orders work", href: "/research" },
    { label: "Check Status", href: "/status" },
  ],
  "/practices": [
    { label: "For Practices", href: "/practices" },
    { label: "How referrals work", href: "/practices/referrals" },
    { label: "Practice workspace", href: "/practices/workspace" },
    { label: "Care for your clients", href: "/practices/care" },
    { label: "Submit Inquiry", href: "/practices#inquiry" },
  ],
} as const;

type AudienceMenuKey = keyof typeof AUDIENCE_MENUS;

const OVERLAY_ID = "clarity-navigation";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [audienceMenu, setAudienceMenu] = useState<AudienceMenuKey | null>(null);
  const [location] = useLocation();
  const headerRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setOpen(false);
    setAudienceMenu(null);
  }, [location]);

  useEffect(() => {
    if (!audienceMenu) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setAudienceMenu(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const key = audienceMenu;
      setAudienceMenu(null);
      window.requestAnimationFrame(() => headerRef.current?.querySelector<HTMLButtonElement>(`[data-audience-menu="${key}"]`)?.focus());
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [audienceMenu]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      const first = items.item(0);
      const last = items.item(items.length - 1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <header ref={headerRef} className="clarity-nav" data-testid="nav-main">
        <div className="container-x clarity-nav-inner">
          <Link href="/" aria-label={`${BRAND.healthDisplayName} home`} className="clarity-brand-link">
            <span className="wordmark-mark" aria-hidden="true" />
            <span className="clarity-brand-name">{BRAND.healthDisplayName}</span>
          </Link>
          <nav className="clarity-desktop-nav" aria-label="Primary">
            {PRIMARY.map((item) => <PrimaryNavItem key={item.href} item={item} current={location} openMenu={audienceMenu} setOpenMenu={(value) => { setOpen(false); setAudienceMenu(value); }} />)}
          </nav>
          <nav className="clarity-condensed-nav" aria-label="Primary">
            {PRIMARY.slice(0, 4).map((item) => <PrimaryNavItem key={item.href} item={item} current={location} openMenu={audienceMenu} setOpenMenu={(value) => { setOpen(false); setAudienceMenu(value); }} />)}
          </nav>
          <div className="clarity-nav-actions">
            <Link href="/sign-in" className="clarity-header-link">Sign In</Link>
            <Link href="/care/schedule" className="btn btn-primary clarity-header-care">Start Care</Link>
            <button
              ref={triggerRef}
              type="button"
              onClick={() => { setAudienceMenu(null); setOpen(true); }}
              className="clarity-menu-button"
              aria-label="Open site menu"
              aria-expanded={open}
              aria-controls={open ? OVERLAY_ID : undefined}
            >Menu</button>
          </div>
        </div>
      </header>
      {open && (
        <div id={OVERLAY_ID} className="clarity-nav-overlay" role="dialog" aria-modal="true" aria-label="Site navigation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div ref={panelRef} className="clarity-nav-panel">
            <div className="clarity-nav-panel-head">
              <span className="clarity-brand-name">{BRAND.healthDisplayName}</span>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="clarity-menu-button" aria-label="Close menu">Close</button>
            </div>
            <p className="mono-cap text-pulse mt-8">CHOOSE A PATH</p>
            <nav className="clarity-nav-menu" aria-label="Full site navigation">
              {[...PRIMARY, ...MORE].map((item) => <NavLink key={item.href} {...item} current={location} onClick={() => setOpen(false)} />)}
            </nav>
            <div className="clarity-nav-panel-actions">
              <Link href="/care/schedule" onClick={() => setOpen(false)} className="btn btn-primary">Start Care</Link>
              <Link href="/products" onClick={() => setOpen(false)} className="btn btn-secondary">Explore Products</Link>
              <Link href="/sign-in" onClick={() => setOpen(false)} className="btn btn-secondary">Sign In</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PrimaryNavItem({ item, current, openMenu, setOpenMenu }: {
  item: (typeof PRIMARY)[number];
  current: string;
  openMenu: AudienceMenuKey | null;
  setOpenMenu: (value: AudienceMenuKey | null) => void;
}) {
  if (!(item.href in AUDIENCE_MENUS)) return <NavLink {...item} current={current} />;
  const key = item.href as AudienceMenuKey;
  const open = openMenu === key;
  const active = current === key || current.startsWith(`${key}/`);
  return (
    <div className="clarity-nav-popover">
      <button
        type="button"
        className={`clarity-nav-link clarity-nav-popover-trigger ${active ? "is-active" : ""}`}
        aria-expanded={open}
        data-audience-menu={key}
        onClick={() => setOpenMenu(open ? null : key)}
      >
        {item.label}<span aria-hidden="true" className="clarity-nav-chevron">⌄</span>
      </button>
      {open && (
        <nav className="clarity-nav-popover-panel" aria-label={`${item.label} links`}>
          {AUDIENCE_MENUS[key].map((menuItem) => (
            <NavLink key={menuItem.href} {...menuItem} current={current} onClick={() => setOpenMenu(null)} />
          ))}
        </nav>
      )}
    </div>
  );
}

function NavLink({ label, href, current, onClick }: { label: string; href: string; current: string; onClick?: () => void }) {
  const active = current === href || (href !== "/" && current.startsWith(`${href}/`));
  return <Link href={href} onClick={onClick} aria-current={active ? "page" : undefined} className={`clarity-nav-link ${active ? "is-active" : ""}`}>{label}</Link>;
}
