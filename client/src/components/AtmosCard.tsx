import type { ReactNode } from "react";

export type AtmosPreset = "ember" | "aurora" | "voltage" | "forge" | "denim" | "bone";

interface Props {
  preset: AtmosPreset;
  eyebrow?: string;
  title?: string;
  children?: ReactNode;
  className?: string;
  testId?: string;
}

export default function AtmosCard({ preset, eyebrow, title, children, className = "", testId }: Props) {
  const isDark = preset === "voltage" || preset === "forge" || preset === "denim";
  return (
    <div
      className={`atmos atmos-${preset} card ${className}`}
      data-testid={testId}
      data-preset={preset}
    >
      {eyebrow && (
        <p
          className={`eyebrow mb-6 ${isDark ? "text-orange-warm" : "text-orange-fire"}`}
          data-testid={testId ? `${testId}-eyebrow` : undefined}
        >
          {eyebrow}
        </p>
      )}
      {title && (
        <h3 className="h3-sub mb-4" data-testid={testId ? `${testId}-title` : undefined}>
          {title}
        </h3>
      )}
      {children && <div className="body-base opacity-90">{children}</div>}
    </div>
  );
}
