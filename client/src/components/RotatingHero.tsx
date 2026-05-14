import { useEffect, useRef, useState } from "react";
import { ROTATING_ROLES } from "@/lib/content";

export default function RotatingHero({ prefix }: { prefix: string }) {
  const [i, setI] = useState(0);
  const [reduced, setReduced] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    m.addEventListener?.("change", handler);
    return () => m.removeEventListener?.("change", handler);
  }, []);

  useEffect(() => {
    // Freeze rotation under prefers-reduced-motion (a11y: no live announcements)
    if (reduced) return;
    intervalRef.current = setInterval(
      () => setI((p) => (p + 1) % ROTATING_ROLES.length),
      2200
    );
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [reduced]);

  // Static screen-reader text (one of: "for proactive health practitioners")
  // covers the changing visual word so SR users hear it once.
  const SR_LABEL = "for proactive health practitioners";

  return (
    <h1 className="display-xl text-ink text-balance" data-testid="text-hero-h1" style={{ maxWidth: "16ch" }}>
      <span>{prefix} </span>
      {/* Visual rotating word — hidden from assistive tech to avoid repeated announcements */}
      <span className="gradient-pill" aria-hidden="true">
        <span
          key={ROTATING_ROLES[i]}
          className="gradient-pill-word entering"
          data-testid="text-rotating-role"
        >
          {ROTATING_ROLES[i]}
        </span>
      </span>
      <span aria-hidden="true">.</span>
      {/* Single, stable label for screen readers */}
      <span className="sr-only">{SR_LABEL}.</span>
    </h1>
  );
}
