import type { ReactNode } from "react";
import type { GradientPreset } from "@/lib/content";

interface Props {
  preset: GradientPreset;
  eyebrow?: string;
  title?: string;
  children?: ReactNode;
  className?: string;
  testId?: string;
}

const DARK_PRESETS: GradientPreset[] = ["grad-04-meridian", "grad-06-horizon"];

export default function AtmosCard({ preset, eyebrow, title, children, className = "", testId }: Props) {
  const isDark = DARK_PRESETS.includes(preset);
  return (
    <div
      className={`grad ${preset} card ${isDark ? "deep" : ""} ${className}`}
      data-testid={testId}
      data-preset={preset}
    >
      {eyebrow && (
        <p
          className={`mono-cap mb-5 ${isDark ? "text-paper/80" : "text-ink-mute"}`}
          data-testid={testId ? `${testId}-eyebrow` : undefined}
        >
          {eyebrow}
        </p>
      )}
      {title && (
        <h3 className={`display-s mb-4 ${isDark ? "text-paper" : "text-ink"}`} data-testid={testId ? `${testId}-title` : undefined}>
          {title}
        </h3>
      )}
      {children && <div className={`body-m ${isDark ? "text-paper/90" : "text-ink-2"}`}>{children}</div>}
    </div>
  );
}
