import { Link } from "wouter";

export default function Footer() {
  return (
    <footer className="bg-foreground text-background py-24 border-t border-zinc-800">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-12 mb-24">
          <div className="col-span-2">
            <Link href="/">
              <a className="text-3xl font-display font-bold tracking-tight mb-6 block">MONO.</a>
            </Link>
            <p className="text-zinc-400 max-w-sm">
              The operating system for high-performance biology. Designed in Zürich, Switzerland.
            </p>
          </div>
          
          <div>
            <h4 className="font-mono text-xs uppercase tracking-widest text-zinc-500 mb-6">Platform</h4>
            <ul className="space-y-4">
              <li><a href="#" className="hover:text-white text-zinc-400 transition-colors">Features</a></li>
              <li><a href="#" className="hover:text-white text-zinc-400 transition-colors">Science</a></li>
              <li><a href="#" className="hover:text-white text-zinc-400 transition-colors">Integrations</a></li>
              <li><a href="#" className="hover:text-white text-zinc-400 transition-colors">Pricing</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-mono text-xs uppercase tracking-widest text-zinc-500 mb-6">Company</h4>
            <ul className="space-y-4">
              <li><a href="#" className="hover:text-white text-zinc-400 transition-colors">About</a></li>
              <li><a href="#" className="hover:text-white text-zinc-400 transition-colors">Careers</a></li>
              <li><a href="#" className="hover:text-white text-zinc-400 transition-colors">Blog</a></li>
              <li><a href="#" className="hover:text-white text-zinc-400 transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-zinc-800 flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-zinc-500">
          <div>
            © 2026 Mono Inc. All rights reserved.
          </div>
          <div className="flex gap-8">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">TW</a>
            <a href="#" className="hover:text-white transition-colors">IG</a>
            <a href="#" className="hover:text-white transition-colors">LI</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
