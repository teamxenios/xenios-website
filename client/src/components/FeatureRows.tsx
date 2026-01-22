import Section from "./Section";
import { cn } from "@/lib/utils";
import { content } from "@/lib/content";

export default function FeatureRows() {
  return (
    <div className="bg-background">
      {content.features.map((feature, i) => (
        <Section key={i} className="py-24">
          <div className={cn(
            "flex flex-col gap-16 items-center",
            feature.align === "right" ? "lg:flex-row-reverse" : "lg:flex-row"
          )}>
            <div className="flex-1">
              <div className="aspect-square bg-secondary/20 rounded-3xl overflow-hidden p-12 flex items-center justify-center">
                 <img 
                  src={feature.image} 
                  alt={feature.title} 
                  className="w-full h-full object-contain mix-blend-multiply opacity-80"
                />
              </div>
            </div>
            <div className="flex-1 space-y-6">
              <h3 className="text-4xl font-display font-medium tracking-tight">
                {feature.title}
              </h3>
              <p className="text-xl text-muted-foreground leading-relaxed max-w-lg">
                {feature.desc}
              </p>
              <button className="text-primary font-medium hover:underline underline-offset-4 decoration-1">
                Learn more
              </button>
            </div>
          </div>
        </Section>
      ))}
    </div>
  );
}
