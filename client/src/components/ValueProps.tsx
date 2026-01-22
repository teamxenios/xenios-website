import Section from "./Section";
import { content } from "@/lib/content";

export default function ValueProps() {
  return (
    <Section id="included">
      <div className="mb-16 max-w-2xl">
        <h2 className="text-4xl md:text-5xl font-display font-medium tracking-tight mb-6">
          {content.valueProps.headline} <br />
          <span className="text-muted-foreground">{content.valueProps.headlineAccent}</span>
        </h2>
        <p className="text-xl text-muted-foreground">
          {content.valueProps.description}
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {content.valueProps.items.map((prop, i) => (
          <div key={i} className="p-8 bg-secondary/30 rounded-2xl hover:bg-secondary/50 transition-colors">
            <prop.icon className="w-8 h-8 mb-6 text-foreground" strokeWidth={1.5} />
            <h3 className="text-xl font-display font-medium mb-3">{prop.title}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {prop.desc}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
