import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  index: number;
}

export default function FeatureCard({ icon: Icon, title, description, index }: FeatureCardProps) {
  return (
    <div className={cn(
      "group p-8 border border-border hover:bg-card hover:text-card-foreground transition-all duration-300",
      "flex flex-col gap-4 items-start"
    )}>
      <div className="p-3 bg-secondary text-secondary-foreground rounded-none group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
        <Icon size={24} strokeWidth={1.5} />
      </div>
      <h3 className="text-xl font-display font-medium tracking-tight">{title}</h3>
      <p className="text-muted-foreground leading-relaxed group-hover:text-card-foreground/80">
        {description}
      </p>
    </div>
  );
}
