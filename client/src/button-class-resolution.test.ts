import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The defect this guards (audit GAP-013): six CTAs across five marketing pages
 * used the class `btn-ghost-on-dark`, which matched NO stylesheet rule. The
 * design system defines the two-class selector `.btn-on-dark.btn-ghost`. So the
 * anchors fell back to the browser default link colour (blue) on a near-black
 * section: a measured 2.05:1 contrast, failing WCAG AA, on two conversion CTAs
 * among them. Nothing failed. Typecheck cannot see a class name, and jsdom
 * tests do not load the stylesheet, so the design system silently did nothing.
 *
 * This test closes that gap the only way a class-name typo can be closed:
 * every `btn-*` class used in JSX must resolve to at least one rule in
 * index.css. It is intentionally a source scan, which is honest about what it
 * proves: the class EXISTS in the stylesheet. It does not prove the rule
 * produces sufficient contrast, and that belongs in the browser layer when one
 * exists.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = resolve(HERE, "index.css");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      walk(full, out);
    } else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Every `btn-…` token appearing in a className string anywhere in the tree. */
function usedButtonClasses(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const file of walk(HERE)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const value = m[1] ?? m[2] ?? "";
      for (const token of value.split(/\s+/)) {
        const cls = token.trim();
        if (!/^btn-[a-z0-9-]+$/.test(cls)) continue;
        const seen = used.get(cls) ?? [];
        const rel = file.slice(HERE.length + 1).replace(/\\/g, "/");
        if (!seen.includes(rel)) seen.push(rel);
        used.set(cls, seen);
      }
    }
  }
  return used;
}

describe("button class resolution", () => {
  const css = readFileSync(CSS, "utf8");
  const used = usedButtonClasses();

  it("finds button classes to check, so this test can never pass vacuously", () => {
    expect(used.size).toBeGreaterThan(3);
    expect([...used.keys()]).toContain("btn-primary");
  });

  it("every btn-* class used in JSX resolves to a rule in index.css", () => {
    const unresolved: string[] = [];
    for (const [cls, files] of used) {
      // A class resolves if it appears as a selector token anywhere: on its own
      // (.btn-ghost) or as part of a compound selector (.btn-on-dark.btn-ghost).
      const pattern = new RegExp("\\." + cls.replace(/-/g, "\\-") + "(?![a-zA-Z0-9_-])");
      if (!pattern.test(css)) unresolved.push(`${cls} (used in ${files.join(", ")})`);
    }
    expect(unresolved).toEqual([]);
  });

  it("the on-dark ghost pairing the marketing pages rely on is defined", () => {
    expect(css).toMatch(/\.btn-on-dark\.btn-ghost\b/);
  });

  it("the retired single-class form is gone from the tree", () => {
    expect(used.has("btn-ghost-on-dark")).toBe(false);
  });
});
