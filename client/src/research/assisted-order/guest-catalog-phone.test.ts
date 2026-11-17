import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "client", "src", "research", "assisted-order");
const css = readFileSync(resolve(root, "guest-catalog-phone.css"), "utf8");
const form = readFileSync(resolve(root, "RequestIntentForm.tsx"), "utf8");
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, "");

describe("guest catalog phone stylesheet", () => {
  it("is well formed: the type check and the component suites never parse CSS", () => {
    let depth = 0;
    for (const character of css) {
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it("keeps every rule inside the one phone block whose lower bound follows the reader's text size", () => {
    const blocks = withoutComments.match(/@media[^{]+\{/gu) ?? [];
    expect(blocks).toEqual(["@media (min-width: 20em) and (max-width: 700px) {"]);
    // Nothing before the block opens and nothing after it closes.
    expect(withoutComments.trimStart().startsWith("@media")).toBe(true);
    expect(withoutComments.trimEnd().endsWith("}")).toBe(true);
    const body = withoutComments.slice(withoutComments.indexOf("{") + 1, withoutComments.lastIndexOf("}"));
    let depth = 0;
    for (const character of body) {
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
    // 20em is 320px at the default text size and 640px when the text is doubled,
    // so portrait phones up to 430px keep the existing doubled-text reflow.
    expect(20 * 16).toBe(320);
    expect(20 * 32).toBeGreaterThan(430);
  });

  it("scopes every selector to the guest catalog page, above the stylesheets it follows", () => {
    const selectors = [...withoutComments.matchAll(/(?:^|\})\s*([^{}@]+)\{/gu)].map((match) => match[1].trim());
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector.startsWith(".xenios-order-page.xenios-order-page--guest-catalog "), selector).toBe(true);
    }
  });

  it("keeps base side padding while spacing follows text size, hides nothing and adds no content", () => {
    const body = withoutComments.slice(withoutComments.indexOf("{") + 1, withoutComments.lastIndexOf("}"));
    // Preserve the base text width even when this block matches enlarged text.
    expect(body).toMatch(/padding:\s*\.75rem 10px;/u);
    expect(body.replace(/1px solid|padding:\s*\.75rem 10px;/gu, "")).not.toMatch(/\dpx\b/u);
    expect(withoutComments).not.toMatch(/display:\s*none|visibility:\s*hidden|content:|line-clamp|text-overflow|font-size/u);
  });

  it("is imported by the request form after the base request stylesheet", () => {
    const base = form.indexOf('import "./assisted-order.css";');
    const phone = form.indexOf('import "./guest-catalog-phone.css";');
    expect(base).toBeGreaterThan(-1);
    expect(phone).toBeGreaterThan(base);
  });
});
