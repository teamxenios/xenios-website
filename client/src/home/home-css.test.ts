import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { list, parse } from "postcss";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./home.css", import.meta.url)), "utf8");
const stylesheet = parse(css);

describe("homepage stylesheet isolation", () => {
  it("scopes every selector and every custom property to the homepage", () => {
    let ruleCount = 0;
    stylesheet.walkRules((rule) => {
      ruleCount += 1;
      for (const selector of list.comma(rule.selector)) {
        expect(selector.trim(), selector).toMatch(/^\.xenios-home-next(?:\s|:|$)/u);
      }
    });
    expect(ruleCount).toBeGreaterThan(50);
    stylesheet.walkDecls((declaration) => {
      if (declaration.prop.startsWith("--")) {
        expect(declaration.parent?.type).toBe("rule");
        expect((declaration.parent as { selector?: string }).selector).toBe(".xenios-home-next");
      }
    });
  });

  it("bundles the single serif and mark without remote stylesheet or asset URLs", () => {
    expect(css).not.toMatch(/https?:|@import/u);
    const fonts: string[] = [];
    stylesheet.walkAtRules("font-face", (rule) => { fonts.push(rule.toString()); });
    expect(fonts).toHaveLength(1);
    expect(fonts[0]).toContain('font-family: "Xenios Home Instrument Serif"');
    expect(fonts[0]).toContain("font-display: swap");
    expect(fonts[0]).toContain("./assets/instrument-serif-latin-italic.woff2");
    expect(css).toContain("./assets/xenios-mark-glyph.png");
  });
});
