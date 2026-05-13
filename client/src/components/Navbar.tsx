import { Link } from "wouter";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { content } from "@/lib/content";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 24);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const close = () => setIsOpen(false);

  return (
    <>
      <nav
        className={cn(
          "sticky top-0 left-0 right-0 z-40 transition-all duration-300",
          isScrolled
            ? "bg-paper/80 backdrop-blur-md border-b border-hairline"
            : "bg-paper border-b border-hairline/50"
        )}
        data-testid="nav-main"
      >
        <div className="container mx-auto px-6 lg:px-16 h-[60px] lg:h-[72px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-ink" data-testid="link-nav-home">
            <span className="font-display text-2xl lowercase tracking-tight font-bold">xenios</span>
            <span className="w-1.5 h-1.5 rounded-full bg-orange" aria-hidden />
          </Link>

          <div className="hidden lg:flex items-center gap-8">
            {content.nav.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-mono-500 hover:text-ink transition-colors"
                data-testid={`link-nav-${link.label.toLowerCase()}`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden lg:flex items-center">
            <Link
              href="/waitlist"
              className="bg-orange text-ink px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[hsl(var(--orange-hover))] transition-colors active:scale-[0.98]"
              data-testid="button-nav-cta"
            >
              {content.nav.cta} →
            </Link>
          </div>

          <button
            className="lg:hidden z-50 relative text-ink"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? "Close menu" : "Open menu"}
            data-testid="button-nav-menu"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-paper z-40 flex flex-col px-6 pt-24 pb-8 lg:hidden"
          >
            <div className="flex flex-col gap-1 flex-1">
              {content.nav.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={close}
                  className="text-3xl font-display font-bold text-ink py-3 border-b border-hairline"
                  data-testid={`link-nav-mobile-${link.label.toLowerCase()}`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <Link
              href="/waitlist"
              onClick={close}
              className="bg-orange text-ink w-full text-center py-4 rounded-lg text-base font-semibold mt-8 block"
              data-testid="button-nav-mobile-cta"
            >
              {content.nav.cta} →
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
