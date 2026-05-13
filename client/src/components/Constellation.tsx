import { useEffect, useRef, useState } from "react";
import { content } from "@/lib/content";

// 16 satellite labels in two concentric rings of 8.
// Inner ring radius = R1; outer ring radius = R2.
// SVG viewBox is 1200x800 (responsive via preserveAspectRatio).
const NODES = content.ecosystemNodes;

// Curated satellite-to-satellite connections — "the dots that don't currently
// talk to each other, now do". Each entry is [innerIndex 0-7, outerIndex 8-15].
// Indices map to NODES order:
// inner 0..7 = wearables, continuous glucose, lab panels, longevity markers,
//              GLP-1 protocols, sleep & HRV, nutrition logs, training load
// outer 8..15 = recovery data, supplement stacks, hormone panels, mental performance,
//               calendars, billing, client comms, referring physicians
const SECONDARY: [number, number][] = [
  [0, 8],   // wearables ↔ recovery data
  [1, 10],  // CGM ↔ hormone panels
  [2, 15],  // lab panels ↔ referring physicians
  [3, 10],  // longevity markers ↔ hormone panels
  [4, 9],   // GLP-1 ↔ supplement stacks
  [5, 11],  // sleep & HRV ↔ mental performance
  [6, 9],   // nutrition logs ↔ supplement stacks
  [7, 8],   // training load ↔ recovery data
  [0, 12],  // wearables ↔ calendars
  [4, 14],  // GLP-1 ↔ client comms
  [2, 13],  // lab panels ↔ billing
  [3, 11],  // longevity ↔ mental performance
];

export default function Constellation() {
  const ref = useRef<SVGSVGElement>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // Render static final state immediately — never hide content.
      setAnimate(true);
      return;
    }
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setAnimate(true);
            obs.disconnect();
          }
        });
      },
      { threshold: 0.18 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const W = 1200;
  const H = 800;
  const cx = W / 2;
  const cy = H / 2;
  const R1 = 220; // inner ring
  const R2 = 350; // outer ring

  const innerNodes = NODES.slice(0, 8).map((label, i) => {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    return {
      label,
      x: cx + Math.cos(angle) * R1,
      y: cy + Math.sin(angle) * R1,
      ring: "inner" as const,
      idx: i,
    };
  });

  const outerNodes = NODES.slice(8, 16).map((label, i) => {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2 + Math.PI / 8; // offset
    return {
      label,
      x: cx + Math.cos(angle) * R2,
      y: cy + Math.sin(angle) * R2,
      ring: "outer" as const,
      idx: i + 8,
    };
  });

  const allNodes = [...innerNodes, ...outerNodes];

  return (
    <div className="w-full" data-testid="constellation">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        style={{ maxHeight: "720px" }}
        role="img"
        aria-label="Constellation diagram showing the xenios center surrounded by 16 health ecosystem signals: wearables, continuous glucose, lab panels, longevity markers, GLP-1 protocols, sleep & HRV, nutrition logs, training load, recovery data, supplement stacks, hormone panels, mental performance, calendars, billing, client comms, and referring physicians — all connected by lines to the center and across the ecosystem."
      >
        {/* Secondary connections (satellite-to-satellite, dimmer) */}
        <g stroke="#0E0E0C" strokeOpacity="0.18" strokeWidth="1" fill="none">
          {SECONDARY.map(([a, b], i) => {
            const na = allNodes[a];
            const nb = allNodes[b];
            const dur = animate ? 0.8 : 0;
            const delay = animate ? 0.6 + i * 0.04 : 0;
            return (
              <line
                key={`sec-${i}`}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                style={{
                  strokeDasharray: 1000,
                  strokeDashoffset: animate ? 0 : 1000,
                  transition: `stroke-dashoffset ${dur}s ease-out ${delay}s`,
                }}
              />
            );
          })}
        </g>

        {/* Primary connections (satellite to center) */}
        <g stroke="#0E0E0C" strokeOpacity="0.85" strokeWidth="1.5" fill="none">
          {allNodes.map((n, i) => {
            const dur = animate ? 0.45 : 0;
            const delay = animate ? i * 0.05 : 0;
            return (
              <line
                key={`pri-${i}`}
                x1={cx}
                y1={cy}
                x2={n.x}
                y2={n.y}
                style={{
                  strokeDasharray: 600,
                  strokeDashoffset: animate ? 0 : 600,
                  transition: `stroke-dashoffset ${dur}s ease-out ${delay}s`,
                }}
              />
            );
          })}
        </g>

        {/* Satellite nodes */}
        {allNodes.map((n, i) => {
          const delay = animate ? 0.35 + i * 0.05 : 0;
          const labelOffsetY = n.y < cy ? -22 : 28;
          const anchor: "start" | "middle" | "end" =
            Math.abs(n.x - cx) < 30 ? "middle" : n.x < cx ? "end" : "start";
          const labelX = anchor === "middle" ? n.x : anchor === "start" ? n.x + 14 : n.x - 14;
          return (
            <g
              key={`node-${i}`}
              style={{
                opacity: animate ? 1 : 0,
                transition: `opacity 0.35s ease-out ${delay}s`,
              }}
              className="constellation-node"
            >
              <circle cx={n.x} cy={n.y} r={6} fill="#F4EFE6" stroke="#0E0E0C" strokeWidth="1.5" />
              <circle cx={n.x} cy={n.y} r={3} fill="#0E0E0C" />
              <text
                x={labelX}
                y={n.y + labelOffsetY * 0}
                dy={labelOffsetY > 0 ? labelOffsetY : labelOffsetY}
                textAnchor={anchor}
                fontFamily="JetBrains Mono, ui-monospace, monospace"
                fontWeight={500}
                fontSize={n.ring === "inner" ? "16" : "15"}
                fill="#2A2A26"
                style={{ letterSpacing: "0.02em" }}
              >
                {n.label}
              </text>
            </g>
          );
        })}

        {/* Center node — xenios. wordmark */}
        <g>
          <circle cx={cx} cy={cy} r={62} fill="#F4EFE6" stroke="#0E0E0C" strokeWidth="2" />
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            fontFamily="Inter Tight, system-ui, sans-serif"
            fontWeight={900}
            fontSize="36"
            fill="#0E0E0C"
            style={{ letterSpacing: "-0.025em" }}
          >
            xenios<tspan fill="#FF5A1F">.</tspan>
          </text>
        </g>
      </svg>
    </div>
  );
}
