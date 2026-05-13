import { Link } from "wouter";

interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
  asLink?: boolean;
}

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-xl",
  md: "text-2xl md:text-3xl",
  lg: "text-4xl md:text-5xl",
};

export default function Wordmark({ size = "md", className = "", asLink = true }: Props) {
  const inner = (
    <span className={`wordmark ${SIZE[size]} ${className}`} data-testid="text-wordmark">
      xenios<span className="wordmark-period">.</span>
    </span>
  );
  return asLink ? (
    <Link href="/" data-testid="link-home" className="inline-block">
      {inner}
    </Link>
  ) : inner;
}
