import { Link } from "wouter";
import { content } from "@/lib/content";

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
              {content.footer.tagline}
            </p>
          </div>
          
          <div>
            <h4 className="font-mono text-xs uppercase tracking-widest text-zinc-500 mb-6">{content.footer.columns.platform.title}</h4>
            <ul className="space-y-4">
              {content.footer.columns.platform.links.map((link, i) => (
                <li key={i}><a href="#" className="hover:text-white text-zinc-400 transition-colors">{link}</a></li>
              ))}
            </ul>
          </div>
          
          <div>
            <h4 className="font-mono text-xs uppercase tracking-widest text-zinc-500 mb-6">{content.footer.columns.company.title}</h4>
            <ul className="space-y-4">
              {content.footer.columns.company.links.map((link, i) => (
                <li key={i}><a href="#" className="hover:text-white text-zinc-400 transition-colors">{link}</a></li>
              ))}
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-zinc-800 flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-zinc-500">
          <div>
            {content.footer.bottom.copyright}
          </div>
          <div className="flex gap-8">
            {content.footer.bottom.legal.map((item, i) => (
              <a key={i} href="#" className="hover:text-white transition-colors">{item}</a>
            ))}
          </div>
          <div className="flex gap-6">
            {content.footer.bottom.social.map((item, i) => (
              <a key={i} href="#" className="hover:text-white transition-colors">{item}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
