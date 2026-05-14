import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { content } from "@/lib/content";
import Wordmark from "./Wordmark";

const OVERLAY_ID = "nav-mobile-overlay";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Body scroll lock + focus management while overlay open
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into overlay
    const t = setTimeout(() => closeRef.current?.focus(), 0);

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      // Simple focus trap inside the overlay
      const root = overlayRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
      // Restore focus to trigger
      triggerRef.current?.focus();
    };
  }, [open]);

  // Close overlay on route change
  useEffect(() => { setOpen(false); }, [location]);

  return (
    <>
      <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md rule-bottom" data-testid="nav-main" style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}>
        <div className="container-x">
          <div className="flex items-center justify-between" style={{ minHeight: 64 }}>
            <Wordmark size="md" />

            <nav className="hidden md:flex items-center gap-6 lg:gap-8" aria-label="Primary">
              {content.nav.items.map((item) => {
                const active = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-testid={`link-nav-${item.label.toLowerCase()}`}
                    className={`text-[14px] lg:text-[15px] tracking-[-0.005em] transition-colors ${
                      active ? "text-ink font-semibold" : "text-ink-2 hover:text-pulse"
                    }`}
                    style={{ fontWeight: active ? 700 : 600 }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="hidden md:flex items-center">
              <Link href="/waitlist" data-testid="button-nav-waitlist" className="btn btn-primary" style={{ height: 44, padding: "0 18px", fontSize: 14 }}>
                {content.nav.cta}
              </Link>
            </div>

            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="md:hidden -mr-3"
              style={{ width: 48, height: 48, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5 }}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls={OVERLAY_ID}
              data-testid="button-menu-toggle"
            >
              <span style={{ display: "block", width: 22, height: 1.5, background: "var(--ink)", transition: "transform .2s", transform: open ? "translateY(6.5px) rotate(45deg)" : "none" }} />
              <span style={{ display: "block", width: 22, height: 1.5, background: "var(--ink)", opacity: open ? 0 : 1, transition: "opacity .15s" }} />
              <span style={{ display: "block", width: 22, height: 1.5, background: "var(--ink)", transition: "transform .2s", transform: open ? "translateY(-6.5px) rotate(-45deg)" : "none" }} />
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div
          ref={overlayRef}
          id={OVERLAY_ID}
          className="nav-overlay md:hidden"
          data-testid="nav-mobile"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
        >
          <div className="flex items-center justify-between" style={{ minHeight: 48 }}>
            <Wordmark size="md" />
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center" }}
              data-testid="button-menu-close"
            >
              <span style={{ fontSize: 28, lineHeight: 1, color: "var(--ink)" }}>×</span>
            </button>
          </div>
          <nav className="flex flex-col gap-1 mt-8" aria-label="Mobile primary">
            {content.nav.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="display-s py-3"
                style={{ color: "var(--ink)" }}
                data-testid={`link-mobile-${item.label.toLowerCase()}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto pt-8">
            <Link
              href="/waitlist"
              onClick={() => setOpen(false)}
              className="btn btn-primary w-full"
              data-testid="button-mobile-waitlist"
            >
              {content.nav.cta} →
            </Link>
            <p className="mono-cap text-ink-mute mt-6 text-center">team@xeniostechnology.com</p>
          </div>
        </div>
      )}
    </>
  );
}
