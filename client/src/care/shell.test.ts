import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function relativeLuminance(hex: string): number {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map((value) => parseInt(value, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error("invalid_color");
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

describe("Care Pending shell", () => {
  const source = readFileSync(resolve(__dirname, "./section.tsx"), "utf8");

  it("is truthful and contains no clinical submission control", () => {
    expect(source).toContain("Care is being prepared");
    expect(source).toContain("No treatment, prescription, or medical advice is available here.");
    expect(source).toContain("This site is not emergency care.");
    expect(source).not.toMatch(/<(form|input|textarea|select)\b/i);
    expect(source.match(/<button\b/g)).toHaveLength(1);
    expect(source).toContain("Try again");
  });

  it("shows explicit fail-closed loading and retryable error states", () => {
    expect(source).toContain('{ kind: "loading" }');
    expect(source).toContain('{ kind: "error" }');
    expect(source).toContain("Care remains unavailable while status is confirmed.");
    expect(source).toContain("Care status is temporarily unavailable.");
    expect(source).toContain("No clinical service has been enabled.");
    expect(source).not.toContain(".catch(() => undefined)");
  });

  it("marks card sequence numbers decorative and uses the accessible Xenios accent", () => {
    expect(source).toContain('className="tile-num text-pulse" aria-hidden="true"');
    const globalStyles = readFileSync(resolve(__dirname, "../index.css"), "utf8");
    const foreground = relativeLuminance("7c3aed");
    const white = relativeLuminance("ffffff");
    expect((white + 0.05) / (foreground + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(globalStyles).toContain("--pulse: #7C3AED;");
  });

  it("reuses Xenios chrome and primitives without a second Care identity", () => {
    expect(source).toContain("<PageShell>");
    expect(source).toContain('className="display-m text-balance');
    expect(source).toContain('className="mono-cap text-pulse');
    expect(source).toContain('className="btn btn-primary"');
    expect(source).toContain('className="btn btn-secondary mt-5"');
    expect(source).toContain('className="card');
    expect(source).not.toContain("care-wordmark");
    expect(source).not.toContain("Georgia");
    expect(source).not.toContain("gradient");
    expect(source).not.toContain("--care-");
  });

  it("does not claim a provider, state, pharmacy, price, product, or launch date", () => {
    expect(source).not.toMatch(/\$\d/);
    expect(source).not.toMatch(/\b(available nationwide|all 50 states|launches? on)\b/i);
    expect(source).not.toMatch(/\b(our clinicians|our pharmacy|partner pharmacy)\b/i);
  });
});
