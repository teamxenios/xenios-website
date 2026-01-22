import { Link } from "wouter";
import { useState, useEffect } from "react";
import { Menu, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { content } from "@/lib/content";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    setIsOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <>
      <nav 
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out",
          isScrolled 
            ? "bg-background/80 backdrop-blur-md border-b border-border py-4 shadow-sm" 
            : "bg-transparent py-8 border-b border-transparent"
        )}
      >
        <div className="container mx-auto px-6 flex items-center justify-between">
          <Link href="/">
            <a className={cn(
              "z-50 relative transition-transform duration-300 block",
              isScrolled ? "scale-90 origin-left" : "scale-100"
            )}>
              <img src="/xenios-logo-white.png" alt="XENIOS" className="h-8 w-auto invert dark:invert-0" />
            </a>
          </Link>
          
          <div className="hidden lg:flex items-center gap-8">
            {content.nav.links.map((link) => (
              <button 
                key={link.id}
                onClick={() => scrollToSection(link.id)} 
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors relative group"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 w-0 h-px bg-foreground transition-all duration-300 group-hover:w-full"></span>
              </button>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-4">
            <button className="text-sm font-medium hover:text-muted-foreground transition-colors">
              Login
            </button>
            <button 
              onClick={() => scrollToSection("waitlist")} 
              className={cn(
                "px-6 py-2 text-sm font-medium transition-all duration-300 rounded-full hover:scale-105 active:scale-95",
                isScrolled ? "bg-primary text-primary-foreground" : "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
              )}
            >
              {content.nav.cta}
            </button>
          </div>

          <button 
            className="lg:hidden z-50 relative text-foreground hover:scale-110 transition-transform"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: "-100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "-100%" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 bg-background z-40 flex flex-col justify-center px-6 lg:hidden"
          >
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Discover</span>
                {content.nav.links.map((link) => (
                  <button 
                    key={link.id}
                    onClick={() => scrollToSection(link.id)} 
                    className="text-4xl font-display font-medium text-left hover:text-muted-foreground transition-colors hover:translate-x-2 duration-200"
                  >
                    {link.label}
                  </button>
                ))}
              </div>

              <div className="h-px bg-border w-full my-4" />

              <div className="flex flex-col gap-4">
                 <button 
                  onClick={() => scrollToSection("waitlist")} 
                  className="text-4xl font-display font-medium text-left flex items-center gap-4 hover:translate-x-2 duration-200"
                >
                  {content.nav.cta} <ArrowRight className="w-8 h-8" />
                </button>
              </div>

               <div className="h-px bg-border w-full my-4" />

              <div className="grid grid-cols-2 gap-8">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Social</span>
                  {content.contact.socials.map((social, i) => (
                    <a key={i} href={social.url} target="_blank" rel="noopener noreferrer" className="text-lg hover:underline decoration-1 underline-offset-4">{social.label}</a>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Contact</span>
                  <a href={`mailto:${content.contact.email}`} className="text-lg hover:underline decoration-1 underline-offset-4">{content.contact.email}</a>
                  <span className="text-lg text-muted-foreground">{content.contact.phone}</span>
                  <span className="text-lg text-muted-foreground">{content.contact.location}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
