import Section from "./Section";
import { Mic, Brain, Command } from "lucide-react";
import { content } from "@/lib/content";

const ICON_MAP: Record<string, any> = {
  Mic: Mic,
  Brain: Brain,
  Command: Command
};

export default function WhatItDoesSection() {
  return (
    <Section id="what-it-does" className="bg-secondary/20">
      <div className="mb-16 max-w-2xl mx-auto text-center">
        <h2 className="text-4xl md:text-5xl font-display font-medium tracking-tight mb-6">
          {content.whatItDoes.headline}
        </h2>
        <p className="text-xl text-muted-foreground">
          {content.whatItDoes.description}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {content.whatItDoes.cards.map((card, i) => {
          const Icon = ICON_MAP[card.icon];
          return (
            <div key={i} className="p-8 border border-border bg-background hover:shadow-lg transition-all duration-300 rounded-2xl group relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Icon className="w-6 h-6 text-foreground" strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl font-display font-medium mb-4">{card.title}</h3>
              <p className="text-muted-foreground leading-relaxed text-balance">
                {card.description}
              </p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
