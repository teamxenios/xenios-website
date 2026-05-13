import { useWaitlistCount } from "@/hooks/use-waitlist-count";

interface Props {
  variant?: "line" | "bignum";
  size?: "sm" | "md" | "lg" | "xl";
  align?: "left" | "center";
  onDark?: boolean;
  suffix?: string;
  className?: string;
}

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-3xl md:text-4xl",
  md: "text-5xl md:text-6xl",
  lg: "text-7xl md:text-8xl",
  xl: "text-8xl md:text-[140px]",
};

export default function Counter({
  variant = "line",
  size = "md",
  align = "left",
  onDark = false,
  suffix,
  className = "",
}: Props) {
  const count = useWaitlistCount();
  const muted = onDark ? "text-paper/70" : "text-ink-mute";
  const ink = onDark ? "text-paper" : "text-ink";

  if (variant === "line") {
    const justify = align === "center" ? "justify-center text-center" : "justify-start text-left";
    return (
      <div className={`flex items-center gap-3 ${justify} ${className}`} data-testid="counter-waitlist">
        <span className={`counter-line ${ink}`}>
          <span className="counter-dot" aria-hidden="true"></span>
          <span data-testid="text-count" className="tabular">
            LIVE • {count.toLocaleString()}
          </span>
          {suffix && <span className={`ml-2 ${muted} normal-case font-medium tracking-normal`}>{suffix}</span>}
        </span>
      </div>
    );
  }

  // bignum
  const justify = align === "center" ? "items-center text-center" : "items-start text-left";
  return (
    <div className={`flex flex-col gap-3 ${justify} ${className}`} data-testid="counter-waitlist">
      <p className={`counter-bignum ${SIZE[size]} ${ink}`} data-testid="text-count">
        {count.toLocaleString()}
      </p>
      {suffix && <p className={`mono-cap ${muted}`}>{suffix}</p>}
    </div>
  );
}
