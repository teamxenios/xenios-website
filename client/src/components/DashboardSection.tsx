import Section from "./Section";
import { content } from "@/lib/content";

export default function DashboardSection() {
  return (
    <Section id="foryou" className="bg-foreground text-background py-32" fullWidth>
      <div className="container mx-auto px-6 text-center mb-16">
        <h2 className="text-4xl md:text-6xl font-display font-medium tracking-tight mb-6">
          {content.dashboard.headline}
        </h2>
        <p className="text-xl text-muted-foreground/80 max-w-2xl mx-auto">
          {content.dashboard.description}
        </p>
      </div>
      
      <div className="container mx-auto px-6">
        <div className="relative aspect-[16/9] bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-800">
           <img 
            src="/dashboard-mockup.png" 
            alt="Dashboard Interface" 
            className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity duration-500"
          />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/50 to-transparent"></div>
        </div>
      </div>
    </Section>
  );
}
