import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE_SOURCES = [
  "Home.tsx",
  "About.tsx",
  "Product.tsx",
  "ForCoaches.tsx",
  "IcpPage.tsx",
].map((file) => ({ file, source: readFileSync(resolve(__dirname, file), "utf8") }));

describe("public accessibility regressions", () => {
  it("uses the defined on-dark ghost composition instead of the nonexistent class", () => {
    for (const { file, source } of PAGE_SOURCES) {
      expect(source, file).not.toContain("btn-ghost-on-dark");
    }
    const css = readFileSync(resolve(__dirname, "..", "index.css"), "utf8");
    expect(css).toMatch(/\.btn-on-dark\.btn-ghost\s*\{/);
  });

  it("keeps the Calendly container fluid at the 320px supported viewport", () => {
    const source = readFileSync(resolve(__dirname, "Book.tsx"), "utf8");
    expect(source).not.toContain('minWidth: "320px"');
    expect(source).toContain('minWidth: 0, width: "100%"');
  });

  it("keeps public consent checkboxes at the 44px touch-target minimum", () => {
    const checkboxSource = readFileSync(resolve(__dirname, "../components/TouchCheckbox.tsx"), "utf8");
    expect(checkboxSource).toContain("flex min-h-11 min-w-11 items-center gap-3");
    expect(checkboxSource).toContain("h-4 w-4 shrink-0 accent-[var(--pulse)]");

    for (const file of ["../components/WaitlistForm.tsx", "EarlyInterest.tsx"]) {
      const source = readFileSync(resolve(__dirname, file), "utf8");
      expect(source, file).toMatch(/<TouchCheckbox\b/);
    }
  });

  it("reserves space and defers decoding for below-the-fold concept images", () => {
    const source = readFileSync(resolve(__dirname, "Concepts.tsx"), "utf8");
    expect(source).toContain("width={640}");
    expect(source).toContain("height={192}");
    expect(source).toContain('loading="lazy"');
    expect(source).toContain('decoding="async"');
  });
});
