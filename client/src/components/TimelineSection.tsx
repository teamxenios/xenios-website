import Section from "./Section";
import { content } from "@/lib/content";

export default function TimelineSection() {
  return (
    <Section className="border-t border-border">
      <div className="grid md:grid-cols-3 gap-12 text-center md:text-left">
        {content.timeline.map((step, i) => (
          <div key={i} className="space-y-6 relative">
            <div className="text-5xl font-display font-bold text-muted-foreground/20">{step.number}</div>
            <h3 className="text-2xl font-display font-medium">{step.title}</h3>
            <ul className="space-y-2 text-muted-foreground">
              {step.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
