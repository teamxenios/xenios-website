import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { contactEmail, earlyAccessCta, menuGroups, navSocials, primaryNav, type NavLink } from "@/lib/nav";
import Wordmark from "./Wordmark";

const OVERLAY_ID = "nav-mobile-overlay";

function SmartLink({ item, className, onClick }: { item: NavLink; className?: string; onClick?: () => void }) {
  if (item.external) {
    return (
      <a href={item.href} className={className} onClick={onClick}>
        {item.label}
      </a>
    );
  }
  return (
    <Link href={item.href} className={className} onClick={onClick}>
      {item.label}
    </Link>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => closeRef.current?.focus(), 0);

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      triggerRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [location]);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md rule-bottom" data-testid="nav-main" style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}>
        <div className="container-x">
          <div className="flex items-center justify-between gap-4" style={{ minHeight: 64 }}>
            <Wordmark size="md" />

            <nav className="hidden lg:flex items-center gap-6" aria-label="Primary">
              {primaryNav.map((item) => {
                const active = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-testid={`link-nav-${item.label.replace(/[^a-z]+/gi, "-").toLowerCase()}`}
                    className={`text-[14px] tracking-[-0.005em] transition-colors ${active ? "text-ink font-semibold" : "text-ink-2 hover:text-pulse"}`}
                    style={{ fontWeight: active ? 700 : 600 }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-3">
              <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(true)}
                className="btn btn-ghost"
                style={{ height: 44, padding: "0 14px", fontSize: 14 }}
                aria-label="Open full site menu"
                aria-expanded={open}
                aria-controls={OVERLAY_ID}
                data-testid="button-menu-toggle"
              >
                <span aria-hidden="true" className="mr-2">☰</span>
                Menu
              </button>
              <Link href={earlyAccessCta.href} data-testid="button-nav-waitlist" className="btn btn-primary hidden sm:inline-flex" style={{ height: 44, padding: "0 18px", fontSize: 14 }}>
                {earlyAccessCta.label}
              </Link>
            </div>
          </div>
        </div>
      </header>

      {open && (
        <div
          ref={overlayRef}
          id={OVERLAY_ID}
          className="nav-overlay"
          data-testid="nav-menu-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeMenu();
          }}
        >
          <div ref={panelRef} className="min-h-full flex flex-col bg-paper text-ink px-6 py-5 md:px-10 md:py-8">
            <div className="flex items-center justify-between gap-4 rule-bottom pb-5">
              <Wordmark size="md" />
              <button
                ref={closeRef}
                type="button"
                onClick={closeMenu}
                aria-label="Close menu"
                className="btn btn-ghost"
                style={{ height: 44, padding: "0 14px" }}
                data-testid="button-menu-close"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_2fr] gap-10 lg:gap-16 py-10 flex-1">
              <div>
                <p className="mono-cap text-pulse mb-5">FULL SITE MENU</p>
                <h2 className="display-l max-w-[10ch] mb-6">Find the right path.</h2>
                <p className="body-l text-ink-2 max-w-[34ch] mb-8">
                  Product, trust, careers, and investor pages are grouped so coaches and partners can move quickly.
                </p>
                <Link href={earlyAccessCta.href} onClick={closeMenu} className="btn btn-primary" data-testid="button-menu-early-access">
                  {earlyAccessCta.label}
                </Link>
                <div className="mt-8 space-y-2">
                  <a href={`mailto:${contactEmail}`} className="block body-m text-ink hover:text-pulse transition-colors">{contactEmail}</a>
                  {navSocials.map((social) => (
                    <a key={social.url} href={social.url} target="_blank" rel="noopener noreferrer" className="block body-m text-ink-2 hover:text-pulse transition-colors">
                      {social.label}
                    </a>
                  ))}
                </div>
              </div>

              <nav className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-8" aria-label="Full site navigation">
                {menuGroups.map((group) => (
                  <section key={group.label}>
                    <p className="mono-cap text-ink-mute mb-5">{group.label}</p>
                    <div className="space-y-3">
                      {group.items.map((item) => {
                        const active = location === item.href;
                        return (
                          <SmartLink
                            key={`${group.label}-${item.href}`}
                            item={item}
                            onClick={closeMenu}
                            className={`block text-[15px] font-600 transition-colors ${active ? "text-pulse" : "text-ink hover:text-pulse"}`}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
              </nav>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
