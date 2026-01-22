import Section from "./Section";
import { content } from "@/lib/content";

export default function WhatIfSection() {
  return (
    <Section className="bg-background">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <h2 className="text-4xl md:text-5xl font-display font-medium tracking-tight mb-12">
            {content.whatIf.headline}
          </h2>
          <div className="flex flex-col gap-8">
            {content.whatIf.points.map((point, i) => (
              <div key={i} className="flex gap-6 group">
                <span className="text-xl font-mono text-muted-foreground/50 pt-1">0{i + 1}</span>
                <div>
                  <h3 className="text-2xl font-display font-medium mb-2 group-hover:text-primary transition-colors">
                    {point.title}
                  </h3>
                  <p className="text-muted-foreground">{point.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative aspect-[4/5] bg-secondary rounded-2xl overflow-hidden">
          <img 
            src="/lifestyle-abstract.png" 
            alt="Abstract lifestyle" 
            className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
          />
        </div>
      </div>
    </Section>
  );
}
