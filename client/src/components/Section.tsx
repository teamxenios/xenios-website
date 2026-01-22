import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface SectionProps {
  children: ReactNode;
  className?: string;
  id?: string;
  fullWidth?: boolean;
}

export default function Section({ children, className, id, fullWidth = false }: SectionProps) {
  return (
    <section id={id} className={cn("py-24 border-b border-border last:border-0", className)}>
      <div className={cn("container mx-auto px-6", !fullWidth && "max-w-5xl")}>
        {children}
      </div>
    </section>
  );
}
