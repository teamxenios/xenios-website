import Section from "./Section";
import { Check } from "lucide-react";

const PERSONAL = [
  "Daily Readiness Score",
  "Sleep Stage Analysis",
  "Nutrition Logging",
  "Stress Management",
  "Community Challenges"
];

const PROFESSIONAL = [
  "Coach Dashboard Access",
  "Team Aggregate Data",
  "Injury Risk Prediction",
  "Training Load Management",
  "API Export Capabilities"
];

export default function AudienceSection() {
  return (
    <Section id="forpros">
       <div className="grid md:grid-cols-2 gap-8 lg:gap-16">
         {/* Personal Column */}
         <div className="p-8 lg:p-12 border border-border rounded-3xl bg-background hover:shadow-lg transition-shadow">
           <div className="mb-8">
             <span className="inline-block px-4 py-1 rounded-full bg-secondary text-sm font-medium mb-4">Personal</span>
             <h3 className="text-3xl font-display font-semibold mb-4">Optimize Yourself</h3>
             <p className="text-muted-foreground">For biohackers, athletes, and anyone wanting to master their biology.</p>
           </div>
           <ul className="space-y-4">
             {PERSONAL.map((item, i) => (
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
             <span className="inline-block px-4 py-1 rounded-full bg-background/20 text-background text-sm font-medium mb-4">Professional</span>
             <h3 className="text-3xl font-display font-semibold mb-4">Empower Teams</h3>
             <p className="text-background/70">For coaches, trainers, and organizations managing high-performance rosters.</p>
           </div>
           <ul className="space-y-4">
             {PROFESSIONAL.map((item, i) => (
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
