import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx|css|html)$/.test(name) ? [path] : [];
  });
}

const portalRoot = resolve(__dirname);
const catalogRoot = resolve(__dirname, "../catalog-priority");
const adminRoot = resolve(__dirname, "../pages/adminx/client-imports");
const accountPages = ["AccountCare.tsx", "AccountDocuments.tsx", "AccountOrders.tsx", "AccountOverview.tsx", "AccountSubscription.tsx", "AccountSupport.tsx"]
  .map((name) => resolve(__dirname, "../account", name));
const combinedSource = [...sourceFiles(portalRoot), ...accountPages, ...sourceFiles(catalogRoot), ...sourceFiles(adminRoot)]
  .filter((path) => !/\.test\.(ts|tsx)$/.test(path))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

describe("account portal privacy and presentation policy", () => {
  it("contains no named partner/client roster data or public demand counts", () => {
    expect(combinedSource).not.toMatch(/Seth Grant|Vitality Advisors/i);
    expect(combinedSource).not.toMatch(/customerCount|uniqueClientCount|demandRank/);
  });

  it("contains no medical efficacy, dosing, or prescribing claim", () => {
    expect(combinedSource).not.toMatch(/recommended dose|dosing protocol|clinically proven|guaranteed prescription|guaranteed treatment|\b(?:cures?|treats?)\b/i);
  });

  it("pins narrow-screen reflow, touch targets, and reduced motion", () => {
    const css = readFileSync(resolve(__dirname, "account-portal.css"), "utf8");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
