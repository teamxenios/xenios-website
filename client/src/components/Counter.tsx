import { useWaitlistCount } from "@/hooks/use-waitlist-count";

interface Props {
  prefix?: string;
  suffix?: string;
  size?: "sm" | "md" | "lg" | "xl";
  align?: "left" | "center";
  variant?: "light" | "dark";
  className?: string;
}

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-4xl md:text-5xl",
  md: "text-6xl md:text-7xl",
  lg: "text-7xl md:text-8xl",
  xl: "text-8xl md:text-[140px]",
};

export default function Counter({
  prefix,
  suffix,
  size = "md",
  align = "left",
  variant = "light",
  className = "",
}: Props) {
  const count = useWaitlistCount();
  const isDark = variant === "dark";
  const muted = isDark ? "text-paper/65" : "text-ink-muted";
  const ink = isDark ? "text-paper" : "text-ink";
  const justify = align === "center" ? "items-center text-center" : "items-start text-left";

  return (
    <div className={`flex flex-col gap-3 ${justify} ${className}`} data-testid="counter-waitlist">
      {prefix && <p className={`eyebrow ${muted}`}>{prefix}</p>}
      <p className={`counter-digits ${SIZE[size]} ${ink} tabular`} data-testid="text-count">
        {count.toLocaleString()}
      </p>
      {suffix && <p className={`eyebrow ${muted}`}>{suffix}</p>}
    </div>
  );
}
