import { content } from "@/lib/content";

export default function BiomarkerTicker() {
  const items = content.ticker;
  
  return (
    <div className="w-full bg-background border-b border-border py-12 overflow-hidden">
      <div 
        className="flex gap-4 animate-ticker"
        style={{ 
          width: 'max-content',
          willChange: 'transform',
        }}
      >
        {[...items, ...items].map((item, i) => (
          <div 
            key={i} 
            className="flex-none w-[280px] sm:w-[320px] md:w-[360px] p-6 border border-border rounded-xl bg-card hover:border-primary transition-colors group cursor-default box-border"
          >
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
  );
}
