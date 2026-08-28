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

describe("Care public shell and explicit dispatcher", () => {
  const sectionSource = readFileSync(resolve(__dirname, "./section.tsx"), "utf8");
  const pagesSource = readFileSync(resolve(__dirname, "./CarePublicPages.tsx"), "utf8");
  const schedulingSource = readFileSync(
    resolve(__dirname, "./TebraSchedulingExperience.tsx"),
    "utf8",
  );
  const portalSource = readFileSync(
    resolve(__dirname, "./TebraPortalHandoff.tsx"),
    "utf8",
  );
  const configurationSource = readFileSync(
    resolve(__dirname, "./useTebraPublicConfiguration.ts"),
    "utf8",
  );
  const publicSurfaceSource = [pagesSource, schedulingSource, portalSource].join("\n");

  it("is truthful and contains no clinical submission control", () => {
    expect(pagesSource).toContain("A request is not a clinical decision.");
    expect(pagesSource).toContain("This site is not emergency care.");
    expect(pagesSource).toContain("A request is tentative until the practice confirms it.");
    expect(schedulingSource).toContain("does not guarantee an");
    expect(schedulingSource).toContain("clinical acceptance, treatment, or a prescription");
    expect(publicSurfaceSource).not.toMatch(/<(form|input|textarea|select)\b/i);
  });

  it("shows explicit fail-closed loading and retryable error states", () => {
    expect(schedulingSource).toContain('state.kind === "loading"');
    expect(schedulingSource).toContain('state.kind === "error"');
    expect(portalSource).toContain('state.kind === "loading"');
    expect(portalSource).toContain('state.kind === "error"');
    expect(schedulingSource).toContain("Scheduling remains unavailable");
    expect(portalSource).toContain("No account or portal session has been created here.");
    expect(configurationSource).toContain('setState({ kind: "error" })');
    expect(configurationSource).not.toContain(".catch(() => undefined)");
  });

  it("marks card sequence numbers decorative and uses the accessible Xenios accent", () => {
    expect(pagesSource).toContain('className="tile-num text-pulse" aria-hidden="true"');
    const globalStyles = readFileSync(resolve(__dirname, "../index.css"), "utf8");
    const foreground = relativeLuminance("7c3aed");
    const white = relativeLuminance("ffffff");
    expect((white + 0.05) / (foreground + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(globalStyles).toContain("--pulse: #7C3AED;");
  });

  it("reuses Xenios chrome and primitives without a second Care identity", () => {
    expect(pagesSource).toContain("<PageShell>");
    expect(pagesSource).toContain('className="display-m text-balance');
    expect(pagesSource).toContain('className="mono-cap text-pulse');
    expect(publicSurfaceSource).toContain('className="btn btn-primary min-h-11');
    expect(publicSurfaceSource).toContain('className="btn btn-secondary min-h-11');
    expect(publicSurfaceSource).toContain('className="card');
    expect(publicSurfaceSource).not.toContain("care-wordmark");
    expect(publicSurfaceSource).not.toContain("Georgia");
    expect(publicSurfaceSource).not.toContain("gradient");
    expect(publicSurfaceSource).not.toContain("--care-");
  });

  it("does not claim a provider, state, pharmacy, price, product, or launch date", () => {
    expect(publicSurfaceSource).not.toMatch(/\$\d/);
    expect(publicSurfaceSource).not.toMatch(/\b(available nationwide|all 50 states|launches? on)\b/i);
    expect(publicSurfaceSource).not.toMatch(/\b(our clinicians|our pharmacy|partner pharmacy)\b/i);
  });

  it("dispatches every public Care path explicitly and fails closed by default", () => {
    expect(sectionSource).toContain("normalizeCarePath(location)");
    for (const route of [
      "home",
      "schedule",
      "portal",
      "howItWorks",
      "providerReview",
      "support",
    ]) {
      expect(sectionSource).toContain(`case CARE_PUBLIC_PATHS.${route}:`);
    }
    expect(sectionSource).toContain("default:");
    expect(sectionSource).toContain("return <CareNotFoundPage />;");
    expect(sectionSource).not.toMatch(/(?:startsWith|includes)\(.*CARE_PUBLIC_PATHS/);
  });

  it("preserves the prior PR1 baseline evidence and its explicit revalidation warning", () => {
    const evidenceDirectory = resolve(
      __dirname,
      "../../../docs/care/evidence",
    );
    const artifacts = [
      "care-pr1-desktop-loading.jpg",
      "care-pr1-desktop-disabled.jpg",
      "care-pr1-desktop-error.jpg",
      "care-pr1-mobile-375-error.jpg",
      "care-pr1-mobile-320-error.jpg",
      "care-pr1-zoom-200-reflow-equivalent.jpg",
    ];

    for (const artifact of artifacts) {
      const image = readFileSync(resolve(evidenceDirectory, artifact));
      expect([...image.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
      expect(image.length).toBeGreaterThan(10_000);
    }

    const evidence = readFileSync(
      resolve(evidenceDirectory, "PR1_UI_EVIDENCE.md"),
      "utf8",
    );
    expect(evidence).toContain("1440 × 900");
    expect(evidence).toContain("375 × 812");
    expect(evidence).toContain("320 × 640");
    expect(evidence).toContain("200% reflow equivalent");
    expect(evidence).toContain(
      "Website 6 must still repeat native 200% browser zoom",
    );
  });
});
