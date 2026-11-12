/**
 * The Research text sizes restated in rem must equal the site's px sizes at the default 16px root,
 * so a reader at the default size sees no change, and every rule must stay inside the Research tree.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const site = readFileSync(resolve("client/src/index.css"), "utf8");
const research = readFileSync(resolve("client/src/research/type-scale.css"), "utf8");
const section = readFileSync(resolve("client/src/research/section.tsx"), "utf8");

/** The font-size declared by the first rule whose selector is exactly `selector`. */
function fontSize(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp("(?:^|\\})\\s*" + escaped + "\\s*\\{([^}]*)\\}", "m").exec(css);
  if (!match) throw new Error("no rule for " + selector);
  const size = /font-size:\s*([^;]+);/.exec(match[1]);
  if (!size) throw new Error("no font-size in " + selector);
  return size[1].trim();
}

/** Lengths in a size value, in px at a 16px root, vw terms dropped (they are identical in both). */
function pxAt16(value: string): number[] {
  return [...value.matchAll(/(\d*\.?\d+)(px|rem)(?![\w-])/g)].map(([, n, unit]) => Number(n) * (unit === "rem" ? 16 : 1));
}

describe("Research text that follows the reader's text size", () => {
  for (const name of ["body-s", "body-m", "body-l"]) {
    it(`.${name} equals the site's size at a 16px root and is set only in rem`, () => {
      const original = fontSize(site, "." + name);
      const restated = fontSize(research, ":where(.research-type-scale) ." + name);
      expect(restated).not.toMatch(/\dpx/);
      expect(pxAt16(restated)).toEqual(pxAt16(original));
      expect(restated.replace(/[\d.]+(px|rem)/g, "L")).toBe(original.replace(/[\d.]+(px|rem)/g, "L"));
    });
  }

  it("scopes every rule to the Research tree", () => {
    const selectors = [...research.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)].map(([, s]) => s.trim());
    expect(selectors.length).toBe(3);
    for (const selector of selectors) expect(selector.startsWith(":where(.research-type-scale) ")).toBe(true);
  });

  it("stacks the public footer links at enlarged text from the same width as at the default size", () => {
    const editorial = readFileSync(resolve("client/src/research/pages/public-editorial.css"), "utf8");
    const px = /@media \(max-width: (\d+)px\) \{[^@]*?\.public-editorial-footer-links \{\s*grid-template-columns: minmax\(0, 1fr\);/.exec(editorial);
    const em = /@media \(max-width: ([\d.]+)em\) \{\s*\.public-editorial-footer-links \{\s*grid-template-columns: minmax\(0, 1fr\);/.exec(editorial);
    expect(px && em).toBeTruthy();
    expect(Number(em![1]) * 16).toBe(Number(px![1]));
  });

  it("sets no Research text size in px, except as the default-size floor of a bounded heading", () => {
    const files = readdirSync(resolve("client/src/research"), { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".css")).map((file) => "client/src/research/" + file.replaceAll("\\", "/"));
    expect(files.length).toBeGreaterThan(5);
    const offenders: string[] = [];
    let bounded = 0;
    for (const file of files) {
      const css = readFileSync(resolve(file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const [, value] of css.matchAll(/font-size\s*:\s*([^;}]+)/g)) {
        if (!/\dpx/.test(value)) continue;
        // max(<px size>, min(<the same size in rem>, <cap in vw>)): equal to the px size at the default
        // 16px, larger with the reader's text, and never wider than its column allows.
        const heading = /^max\((.+), min\((.+), [\d.]+vw\)\)$/.exec(value.trim());
        if (heading && !/rem/.test(heading[1]) && !/\dpx/.test(heading[2]) && pxAt16(heading[1]).join() === pxAt16(heading[2]).join()
          && heading[1].replace(/[\d.]+(px|rem)/g, "L") === heading[2].replace(/[\d.]+(px|rem)/g, "L")) { bounded += 1; continue; }
        offenders.push(file + ": " + value.trim());
      }
    }
    expect(offenders).toEqual([]);
    expect(bounded).toBeGreaterThan(0);
  });

  it("switches the gateway header to its menu at enlarged text from the same width as at the default size", () => {
    const gateway = readFileSync(resolve("client/src/research/pages/gateway-editorial.css"), "utf8");
    const px = /@media \(max-width: (\d+)px\) \{[^@]*?\.rg-header-nav-desktop \{ display: none; \}\s*\.rg-mobile-menu \{ display: block; \}/.exec(gateway);
    const em = /@media \(max-width: ([\d.]+)em\) \{\s*\.rg-header-nav-desktop \{ display: none; \}\s*\.rg-mobile-menu \{ display: block; \}\s*\}/.exec(gateway);
    expect(px && em).toBeTruthy();
    expect(Number(em![1]) * 16).toBe(Number(px![1]));
  });

  it("renders the scope around the Research layout without a box of its own", () => {
    expect(section).toContain('import "./type-scale.css";');
    expect(section).toMatch(/<div className="research-type-scale" style=\{\{ display: "contents" \}\}>\s*<ResearchLayout>/);
  });
});
