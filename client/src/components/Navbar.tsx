import { Link } from "wouter";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-display font-bold tracking-tight">
          MONO.
        </Link>
        
        <div className="hidden md:flex items-center gap-8">
          <button onClick={() => scrollToSection("features")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Features
          </button>
          <button onClick={() => scrollToSection("faq")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            FAQ
          </button>
          <button onClick={() => scrollToSection("waitlist")} className="bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity">
            Get Access
          </button>
        </div>
      </div>
    </nav>
  );
}
