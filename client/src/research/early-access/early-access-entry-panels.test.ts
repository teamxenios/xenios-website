import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const research = resolve(process.cwd(), "client", "src", "research");
const here = join(research, "early-access");
const css = readFileSync(join(here, "early-access-entry-panels.css"), "utf8");
const route = readFileSync(join(here, "EarlyAccessRoute.tsx"), "utf8");
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, "");

const WAIVER = ".xenios-ea-entry-waiver > section.card";
const CONTACT = ".xenios-ea-entry-request .xenios-order-page.xenios-ea-entry-contact";
const HOOKS = ["xenios-ea-entry-waiver", "xenios-ea-entry-request", "xenios-ea-entry-contact"] as const;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

describe("guest entry panel stylesheet", () => {
  it("is well formed: the type check and the component suites never parse CSS", () => {
    let depth = 0;
    for (const character of css) {
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it("scopes every selector to a guest mount class, so no other mount of these components matches", () => {
    const selectors = [...withoutComments.matchAll(/(?:^|[{}])\s*([^{}@]+)\{/gu)]
      .flatMap((match) => match[1].split(","))
      .map((selector) => selector.trim());
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector.startsWith(WAIVER) || selector.startsWith(CONTACT), selector).toBe(true);
    }
  });

  it("hides nothing, adds no content and leaves pointer and layout behaviour alone", () => {
    expect(withoutComments).not.toMatch(
      /display\s*:|visibility\s*:|content\s*:|pointer-events|line-clamp|text-overflow|position\s*:|opacity\s*:|\bheight\s*:|overflow\s*:/u,
    );
  });

  it("puts the two wrapper classes on the guest request mount and nowhere else", () => {
    const files = sourceFiles(research);
    const uses = (hook: string) => files.filter((path) => readFileSync(path, "utf8").includes(hook))
      .map((path) => path.slice(research.length + 1).replace(/\\/gu, "/"));
    expect(uses(HOOKS[0])).toEqual(["early-access/EarlyAccessRoute.tsx"]);
    expect(uses(HOOKS[1])).toEqual(["early-access/EarlyAccessRoute.tsx"]);
    expect(uses(HOOKS[2])).toEqual(["early-access/PreCatalogContact.tsx"]);
    for (const hook of HOOKS.slice(0, 2)) expect(route.split(hook).length - 1, hook).toBe(1);

    const lines = route.split(/\r?\n/u);
    const guestWaiver = lines.findIndex((line) => line.includes('data-testid="quick-order-agreement-mount"'));
    expect(lines[guestWaiver]).toContain(HOOKS[0]);
    // The lazy catalog's wrapper is the next element after the guest policy mount closes.
    const guestRequest = lines.findIndex((line, index) => index > guestWaiver && line.includes(HOOKS[1]));
    expect(guestRequest - guestWaiver).toBeLessThanOrEqual(4);
    expect(lines[guestRequest + 1]).toContain("<Suspense");
    // The member route's policy mount and its catalog mount carry neither class.
    const memberWaiver = lines.find((line) => line.includes('data-testid="early-access-agreement-mount"'));
    expect(memberWaiver).toBeDefined();
    expect(memberWaiver).not.toContain("xenios-ea-entry");
    const memberCatalog = lines.find((line) => line.includes('data-testid="early-access-full-catalog"'));
    expect(memberCatalog).toBeDefined();
    expect(memberCatalog).not.toContain("xenios-ea-entry");
  });

  it("is imported by the route that owns the guest mount", () => {
    expect(route).toContain('import "./early-access-entry-panels.css";');
  });
});
