import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ROTATING_ROLES } from "@/lib/content";

// v6 — fixed-width pill, locks to widest measured span so the headline never reflows.
export default function RotatingHero({ prefix }: { prefix: string }) {
  const [i, setI] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [pillW, setPillW] = useState<number | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    m.addEventListener?.("change", handler);
    return () => m.removeEventListener?.("change", handler);
  }, []);

  // Measure widest role string and lock the pill width.
  useLayoutEffect(() => {
    if (!measureRef.current) return;
    const widths: number[] = [];
    Array.from(measureRef.current.children).forEach((c) => {
      widths.push((c as HTMLElement).getBoundingClientRect().width);
    });
    if (widths.length) setPillW(Math.ceil(Math.max(...widths)));
    const onResize = () => {
      if (!measureRef.current) return;
      const ws = Array.from(measureRef.current.children).map((c) => (c as HTMLElement).getBoundingClientRect().width);
      if (ws.length) setPillW(Math.ceil(Math.max(...ws)));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (reduced) return;
    intervalRef.current = setInterval(
      () => setI((p) => (p + 1) % ROTATING_ROLES.length),
      2200,
    );
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [reduced]);

  const SR_LABEL = "for coaches, trainers, and practitioners";

  return (
    <h1 className="display-xl text-ink text-balance" data-testid="text-hero-h1" style={{ maxWidth: "16ch" }}>
      <span>{prefix} </span>
      <span
        className="gradient-pill"
        aria-hidden="true"
        style={pillW ? { minWidth: pillW, display: "inline-flex", justifyContent: "center" } : undefined}
      >
        <span
          key={ROTATING_ROLES[i]}
          className="gradient-pill-word entering"
          data-testid="text-rotating-role"
        >
          {ROTATING_ROLES[i]}
        </span>
      </span>
      <span className="sr-only">{SR_LABEL}.</span>

      {/* Hidden measurement layer — renders all role strings for width lock */}
      <span
        aria-hidden="true"
        ref={measureRef}
        style={{ position: "absolute", left: "-99999px", top: 0, visibility: "hidden", whiteSpace: "nowrap" }}
      >
        {ROTATING_ROLES.map((r) => (
          <span key={r} className="gradient-pill-word" style={{ display: "inline-block" }}>{r}</span>
        ))}
      </span>
    </h1>
  );
}
