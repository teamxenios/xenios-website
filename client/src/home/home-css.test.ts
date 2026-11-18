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

  it("keeps interactive outlines and borders distinct from decorative hairlines", () => {
    const tokens: Record<string, string> = {};
    stylesheet.walkDecls(/^--xh-/u, declaration => { tokens[declaration.prop] = declaration.value; });
    function luminance(hex: string) {
      const values = hex.slice(1).match(/.{2}/gu)!.map(value => parseInt(value, 16) / 255)
        .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
    }
    function ratio(a: string, b: string) {
      const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (values[0] + .05) / (values[1] + .05);
    }
    for (const surface of ["#ffffff", tokens["--xh-soft"]]) expect(ratio(tokens["--xh-control"], surface)).toBeGreaterThanOrEqual(3);
    expect(ratio(tokens["--xh-accent"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(tokens["--xh-control"]).not.toBe(tokens["--xh-rule"]);
    const interactive = [".xh-signin", ".xh-btn-secondary", ".xh-explanation summary", ".xh-mobile-nav summary"];
    for (const selector of interactive) {
      let usesStrongBorder = false;
      stylesheet.walkRules(rule => {
        if (rule.selector === ".xenios-home-next " + selector) rule.walkDecls(declaration => {
          if (declaration.prop.startsWith("border") && declaration.value.includes("--xh-control")) usesStrongBorder = true;
        });
      });
      expect(usesStrongBorder, selector).toBe(true);
    }
    expect(css).toContain("outline: 3px solid var(--xh-accent)");
    expect(css).toContain("outline-color: Highlight");
    expect(css).toContain(".xh-band :where(a):focus-visible { outline-color: #fff; }");
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
