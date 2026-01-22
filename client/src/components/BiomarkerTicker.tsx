import { motion } from "framer-motion";
import { content } from "@/lib/content";

export default function BiomarkerTicker() {
  return (
    <div className="w-full bg-background border-b border-border py-12 overflow-hidden">
      <div className="relative flex w-full">
         <div className="flex animate-marquee hover:[animation-play-state:paused] gap-6 px-3">
          {content.ticker.map((item, i) => (
            <div key={i} className="flex-none w-64 p-6 border border-border rounded-xl bg-card hover:border-primary transition-colors group cursor-default">
              <div className="flex justify-between items-start mb-4">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{item.label}</span>
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-display font-medium tracking-tight">{item.value}</span>
                <span className="text-sm text-muted-foreground">{item.unit}</span>
              </div>
              <p className="text-sm text-muted-foreground leading-tight group-hover:text-foreground transition-colors">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
        <div className="flex animate-marquee hover:[animation-play-state:paused] gap-6 px-3 absolute top-0 left-0 ml-[100%]">
          {content.ticker.map((item, i) => (
            <div key={`clone-${i}`} className="flex-none w-64 p-6 border border-border rounded-xl bg-card hover:border-primary transition-colors group cursor-default">
               <div className="flex justify-between items-start mb-4">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{item.label}</span>
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-display font-medium tracking-tight">{item.value}</span>
                <span className="text-sm text-muted-foreground">{item.unit}</span>
              </div>
              <p className="text-sm text-muted-foreground leading-tight group-hover:text-foreground transition-colors">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
