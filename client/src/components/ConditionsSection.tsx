import Section from "./Section";
import { content } from "@/lib/content";

export default function ConditionsSection() {
  return (
    <Section id="conditions" className="bg-secondary/30">
      <h2 className="text-4xl font-display font-medium tracking-tight mb-16">
        {content.conditions.headline}
      </h2>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12">
        {content.conditions.categories.map((cat, i) => (
          <div key={i} className="space-y-6">
            <h3 className="text-lg font-mono uppercase tracking-widest text-muted-foreground border-b border-border pb-2">
              {cat.category}
            </h3>
            <ul className="space-y-3">
              {cat.items.map((item, j) => (
                <li key={j} className="text-lg font-display hover:text-muted-foreground transition-colors cursor-default">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
