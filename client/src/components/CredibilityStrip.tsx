import { content } from "@/lib/content";
import { CheckCircle2 } from "lucide-react";

export default function CredibilityStrip() {
  return (
    <div className="border-b border-border bg-background py-8">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-12">
          <p className="text-sm font-mono uppercase tracking-widest text-muted-foreground whitespace-nowrap">
            {content.credibility.statement}
          </p>
          
          <div className="flex flex-wrap justify-center md:justify-end gap-x-8 gap-y-4">
            {content.credibility.items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-primary flex-shrink-0" />
                <span className="text-sm font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
