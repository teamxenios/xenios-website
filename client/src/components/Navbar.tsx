import { useState } from "react";
import { Link, useLocation } from "wouter";
import { content } from "@/lib/content";
import Wordmark from "./Wordmark";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur-md rule-bottom" data-testid="nav-main">
      <div className="container-x">
        <div className="flex items-center justify-between h-16 md:h-20">
          <Wordmark size="md" />

          <nav className="hidden md:flex items-center gap-6 lg:gap-10">
            {content.nav.items.map((item) => {
              const active = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`link-nav-${item.label.toLowerCase()}`}
                  className={`text-[15px] tracking-[-0.005em] transition-colors ${
                    active ? "text-ink font-semibold" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center">
            <Link href="/waitlist" data-testid="button-nav-waitlist" className="btn btn-primary">
              {content.nav.cta}
            </Link>
          </div>

          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 -mr-2"
            aria-label="Toggle menu"
            data-testid="button-menu-toggle"
          >
            <div className="w-6 h-px bg-ink mb-1.5" />
            <div className="w-6 h-px bg-ink mb-1.5" />
            <div className="w-6 h-px bg-ink" />
          </button>
        </div>

        {open && (
          <div className="md:hidden pb-6 space-y-4 rule-top pt-4" data-testid="nav-mobile">
            {content.nav.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block text-lg font-medium"
                data-testid={`link-mobile-${item.label.toLowerCase()}`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/waitlist"
              onClick={() => setOpen(false)}
              className="btn btn-primary w-full"
              data-testid="button-mobile-waitlist"
            >
              {content.nav.cta}
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
