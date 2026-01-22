import Section from "./Section";
import { Check } from "lucide-react";
import { content } from "@/lib/content";

export default function AudienceSection() {
  return (
    <Section id="forpros">
       <div className="grid md:grid-cols-2 gap-8 lg:gap-16">
         {/* Personal Column */}
         <div className="p-8 lg:p-12 border border-border rounded-3xl bg-background hover:shadow-lg transition-shadow">
           <div className="mb-8">
             <span className="inline-block px-4 py-1 rounded-full bg-secondary text-sm font-medium mb-4">{content.audience.personal.label}</span>
             <h3 className="text-3xl font-display font-semibold mb-4">{content.audience.personal.headline}</h3>
             <p className="text-muted-foreground">{content.audience.personal.description}</p>
           </div>
           <ul className="space-y-4">
             {content.audience.personal.features.map((item, i) => (
               <li key={i} className="flex items-center gap-3">
                 <div className="w-6 h-6 rounded-full bg-primary/5 flex items-center justify-center text-primary">
                   <Check size={14} />
                 </div>
                 <span className="font-medium">{item}</span>
               </li>
             ))}
           </ul>
         </div>

         {/* Professional Column */}
         <div className="p-8 lg:p-12 border border-border rounded-3xl bg-foreground text-background hover:shadow-xl transition-shadow">
           <div className="mb-8">
             <span className="inline-block px-4 py-1 rounded-full bg-background/20 text-background text-sm font-medium mb-4">{content.audience.professional.label}</span>
             <h3 className="text-3xl font-display font-semibold mb-4">{content.audience.professional.headline}</h3>
             <p className="text-background/70">{content.audience.professional.description}</p>
           </div>
           <ul className="space-y-4">
             {content.audience.professional.features.map((item, i) => (
               <li key={i} className="flex items-center gap-3">
                 <div className="w-6 h-6 rounded-full bg-background/20 flex items-center justify-center text-background">
                   <Check size={14} />
                 </div>
                 <span className="font-medium">{item}</span>
               </li>
             ))}
           </ul>
         </div>
       </div>
    </Section>
  );
}
