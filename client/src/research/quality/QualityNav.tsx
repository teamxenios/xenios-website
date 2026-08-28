import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";

const LINKS = [
  { href: "/research/quality", label: "Quality system", note: "How material moves from receipt to a recorded decision." },
  { href: "/research/testing", label: "Testing explained", note: "What a test can—and cannot—support." },
  { href: "/research/documents", label: "Documents", note: "Public records and secure member documents." },
] as const;

export function QualityNav({ current }: { current: (typeof LINKS)[number]["href"] }) {
  return (
    <nav className="quality-nav container-x" aria-label="Quality resources">
      {LINKS.filter((item) => item.href !== current).map((item) => (
        <Link className="quality-nav-card" href={item.href} key={item.href}>
          <span>
            <span className="mono-label text-ink-mute">Explore</span>
            <strong>{item.label}</strong>
            <small>{item.note}</small>
          </span>
          <ArrowUpRight aria-hidden="true" size={18} />
        </Link>
      ))}
    </nav>
  );
}

