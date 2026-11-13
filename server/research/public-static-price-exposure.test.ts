import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * NO STATIC PUBLIC FILE STATES A PRICE.
 *
 * Everything under client/public is copied into the built site and served to
 * anyone, with no login and no route in front of it. A route test cannot see
 * it. Under the quote-only release no numeric catalog price is shown to an
 * ordinary customer, so no file here may state a dollar amount or carry a
 * retail price label.
 *
 * This test reads the files themselves. Pages and data files may not contain a
 * dollar sign followed by a digit. Scripts and stylesheets are checked only
 * for an amount with cents, because "$1" is ordinary code there.
 */

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = resolve(here, "../../client/public");

const DOCUMENT_TYPES = [".html", ".htm", ".txt", ".xml", ".json", ".svg", ".md", ".csv", ".webmanifest"];
const CODE_TYPES = [".js", ".mjs", ".css"];

// A figure with a magnitude letter, such as "$710M+", is a company fact and
// not a price, so an amount directly followed by a letter is not counted.
const ANY_AMOUNT = /\$\s?\d[\d,]*(?:\.\d{2})?(?![\dA-Za-z])/g;
const AMOUNT_WITH_CENTS = /\$\s?\d[\d,]*\.\d{2}(?!\d)/g;
const PRICE_LABEL = /retail\s+price|price\s*\/\s*unit/gi;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function filesUnder(root: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path));
    else found.push(path);
  }
  return found;
}

/** Every amount or price label a file's text states, by the rule for its type. */
export function statedPrices(name: string, text: string): string[] {
  const type = extensionOf(name);
  if (DOCUMENT_TYPES.includes(type)) {
    return [...(text.match(ANY_AMOUNT) ?? []), ...(text.match(PRICE_LABEL) ?? [])];
  }
  if (CODE_TYPES.includes(type)) return text.match(AMOUNT_WITH_CENTS) ?? [];
  return [];
}

describe("the price detector", () => {
  it("finds an amount and a retail label in a page", () => {
    const row = '<div class="price"><span>Retail price / unit</span><p>$472.50</p></div>';
    expect(statedPrices("index.html", row)).toEqual(["$472.50", "Retail price"]);
    expect(statedPrices("list.json", '{"label":"$49"}')).toEqual(["$49"]);
    expect(statedPrices("index.html", "<p>Price / unit</p>")).toEqual(["Price / unit"]);
  });

  it("does not read a company figure with a magnitude letter as a price", () => {
    expect(statedPrices("llms.txt", "operators behind $710M+ in prior exits")).toEqual([]);
    expect(statedPrices("llms.txt", "membership is $50 due at activation")).toEqual(["$50"]);
  });

  it("does not read ordinary code as a price, and still finds an amount with cents in a script", () => {
    expect(statedPrices("site.js", 'value.replace(/(a)(b)/, "$1-$2"); const text = `${count} of ${total}`;')).toEqual([]);
    expect(statedPrices("site.js", 'label.textContent = "$19.99";')).toEqual(["$19.99"]);
  });

  it("finds nothing in a page that states no price", () => {
    expect(statedPrices("index.html", "<p>127 research entries are preserved in source order.</p>")).toEqual([]);
  });
});

describe("the static public folder", () => {
  const files = filesUnder(PUBLIC_ROOT);
  const checked = files.filter((path) => [...DOCUMENT_TYPES, ...CODE_TYPES].includes(extensionOf(path)));

  it("is really being read: it has pages, and the microsite research page is one of them", () => {
    expect(checked.length).toBeGreaterThan(20);
    const names = checked.map((path) => relative(PUBLIC_ROOT, path).split("\\").join("/"));
    expect(names).toContain("hino/research/index.html");
    expect(names).toContain("robots.txt");
  });

  it("states no dollar amount and carries no retail price label, in any file", () => {
    const offenders = checked
      .map((path) => ({
        file: relative(PUBLIC_ROOT, path).split("\\").join("/"),
        count: statedPrices(path, readFileSync(path, "utf8")).length,
      }))
      .filter((entry) => entry.count > 0);
    expect(offenders).toEqual([]);
  });

  it("still lists every research entry on the microsite research page", () => {
    const page = readFileSync(join(PUBLIC_ROOT, "hino/research/index.html"), "utf8");
    expect(page.match(/class="catalog-item__identity"/g)?.length).toBe(127);
    expect(page.match(/class="catalog-item__format"/g)?.length).toBe(127);
    expect(page).toContain("Research use only.");
    expect(page).toContain("5-Amino-1MQ");
  });
});
