import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
const careSource = readFileSync(resolve(process.cwd(), "client/src/care/section.tsx"), "utf8");
const careStyles = readFileSync(resolve(process.cwd(), "client/src/care/styles.css"), "utf8");
const researchSource = readFileSync(resolve(process.cwd(), "client/src/research/section.tsx"), "utf8");

describe("Care client isolation", () => {
  it("loads Care through its own lazy chunk and route family", () => {
    expect(appSource).toContain('lazy(() => import("@/care/section"))');
    expect(appSource).toContain('<Route path="/care"');
    expect(appSource).toContain('<Route path="/care/*"');
    expect(researchSource).not.toContain("@/care/");
  });

  it("does not simulate active clinical care", () => {
    expect(careSource).toContain("Care is being prepared");
    expect(careSource).toContain("Not yet available");
    expect(careSource).toContain("Research does not unlock Care");
    expect(careSource).not.toMatch(/Book now|Start treatment|Get prescribed|Choose a dose/);
    expect(careSource).not.toContain("<form");
    expect(careSource).not.toContain("<button");
  });

  it("provides an explicit single-column mobile breakpoint", () => {
    expect(careStyles).toContain("@media (max-width: 800px)");
    expect(careStyles).toContain("grid-template-columns: 1fr");
  });
});
