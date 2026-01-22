import { cn } from "@/lib/utils";

const LOGOS = [
  "Acme Corp", "Quantum", "Echo", "Nebula", "Vertex", "Horizon", "Pinnacle"
];

export default function Ticker() {
  return (
    <div className="w-full overflow-hidden border-b border-border bg-background py-6">
      <div className="relative flex w-full overflow-hidden">
        <div className="animate-marquee flex min-w-full items-center justify-around gap-12 whitespace-nowrap px-12">
          {LOGOS.map((logo, i) => (
            <span key={i} className="text-2xl font-display font-bold text-muted-foreground/40 uppercase tracking-widest">
              {logo}
            </span>
          ))}
        </div>
        <div className="animate-marquee flex min-w-full items-center justify-around gap-12 whitespace-nowrap px-12 absolute top-0 left-0 ml-[100%]">
          {LOGOS.map((logo, i) => (
            <span key={`clone-${i}`} className="text-2xl font-display font-bold text-muted-foreground/40 uppercase tracking-widest">
              {logo}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
