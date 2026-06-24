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
      <span className="wordmark-mark" aria-hidden="true" />
      <span className="wordmark-text">xenios</span>
    </span>
  );
  return asLink ? (
    <Link href="/" data-testid="link-home" className="inline-flex" aria-label="xenios">
      {inner}
    </Link>
  ) : inner;
}
