/**
 * Search matching for the quote-request picker.
 *
 * The listed words are compared as tokens, not as one exact substring, so spelling a hyphen as a
 * space or dropping it, or writing an amount with or without a space, finds the same rows:
 * "bpc-157", "bpc 157" and "bpc157" are one query, and so are "5mg" and "5 mg".
 *
 * - A token is a run of letters or a number. Everything else separates tokens. A hyphen or
 *   apostrophe between two letters is dropped first, so "ghk-cu" is "ghkcu" and "men's" is "mens".
 *   A "+" right after letters stays on the word, so "nad+" finds "NAD+" and not "Gonadorelin".
 *   A number may start with its decimal point, so ".25mg" is 0.25 mg and never 25 mg.
 *   "µg" reads as "mcg", and a thousands comma is dropped, so "10,000" is "10000". In the query
 *   every comma between digits is dropped, so "10,0" typed on the way to "10,000" keeps HCG 10,000 IU.
 * - Every query token must match. A number and its unit stay paired. An explicit per-mL
 *   concentration must occur together in the listing. When a blend names and measures each
 *   component separately, a component search uses that component's listed strength.
 * - A word matches inside a listed word, as before ("hexa" finds "Dihexa").
 * - A query word of five or more letters ending in "s" also matches a listed word ending in the
 *   word without it, so "capsules" finds "CAPSULE" and "vials" finds "vial".
 * - An amount is a number followed by a unit (mg, mcg, ml, iu, g, gm, unit), or by the start of
 *   one. It matches only that whole number followed by a listed word that starts with the query's
 *   unit, so "5 mg" finds "5 mg" and "5MG/ML" but not "15 mg", "2.5 mg", "50 mg" or "5 mcg".
 * - Any other number that opens the query matches inside a listed number, as on #448: "57" finds
 *   "BPC-157". After another token, the last number must start a listed number, so a query typed
 *   one key at a time keeps its rows ("bpc 157 1" still shows "10 mg", and "synthetic 1" does not
 *   show "Synthetic 21"). Any other number must equal a listed one: "tb 500 bpc 157" finds
 *   "BPC-157/TB-500".
 *
 * The identifier the row carries is still found by its exact characters.
 * Matching only: nothing here changes a row, its order or what the picker returns.
 */

type Token = { readonly kind: "word" | "number"; readonly text: string };

const WORD_JOINERS = /(\p{L})[-‐‑'’]+(?=\p{L})/gu;
const THOUSANDS = /(\d),(?=\d{3}(?!\d))/g;
const MICRO = /[µμ](?=g)/g;
const TOKEN = /\p{L}+\+?|\d+(?:\.\d+)?|(?<![\p{L}\d])\.\d+/gu;
const NUMBER_RUN = /(?<![\d.])\d+(?:[-‐‑]\d+)+(?![\d.])/g;
const QUERY_DIGIT_COMMA = /(\d),(?=\d)/g;
const UNITS = ["mg", "mcg", "ml", "iu", "g", "gm", "unit", "units"];
const isUnit = (word: string) => UNITS.some((unit) => unit.startsWith(word));
const NUMBER_TEXT = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const AMOUNT = new RegExp(String.raw`(?<![\d.])(${NUMBER_TEXT})\s*(${UNITS.join("|")})(?![\p{L}\d])`, "gu");
const CONCENTRATION = new RegExp(AMOUNT.source + String.raw`\s*/\s*(?:(${NUMBER_TEXT})\s*)?ml(?![\p{L}\d])`, "gu");
const COMPONENT_SEPARATOR = /(?:\+|,|\/(?!\s*(?:mg|mcg|ml|iu|g|gm|units?)\b))\s*(?=\p{L})/u;

function foldText(text: string, query = false): string {
  const normalized = text.normalize("NFKC").toLowerCase();
  return (query ? normalized.replace(QUERY_DIGIT_COMMA, "$1") : normalized)
    .replace(MICRO, "mc").replace(THOUSANDS, "$1").replace(WORD_JOINERS, "$1");
}

function tokens(text: string): Token[] {
  return [...text.matchAll(TOKEN)].map(([value]) => ({ kind: /[\d.]/.test(value[0]) ? "number" : "word", text: value }));
}

const sameNumber = (left: string, right: string) => Number(left) === Number(right);

function matchesConcentrations(fields: readonly string[], search: string): boolean {
  for (const [, amount, unit, volume = "1"] of search.matchAll(CONCENTRATION)) {
    if (!fields.some(field => [...field.matchAll(CONCENTRATION)].some(
      ([, ownAmount, ownUnit, ownVolume = "1"]) =>
        sameNumber(amount, ownAmount) && unit === ownUnit && sameNumber(volume, ownVolume),
    ))) return false;
  }
  return true;
}

function matchesComponentStrength(fields: readonly string[], search: string): boolean {
  const [strength, second] = search.matchAll(AMOUNT);
  if (!strength || second || strength[2] === "ml") return true;
  const [expression, amount, unit] = strength;
  const before = tokens(search.slice(0, strength.index)).reverse();
  const after = tokens(search.slice(strength.index + expression.length));
  const nearbyTerms = [...before, ...after];
  if (!nearbyTerms.length) return true;

  return fields.every(field => {
    const components = field.split(COMPONENT_SEPARATOR).flatMap(part => {
      const [listedStrength] = part.matchAll(AMOUNT);
      if (!listedStrength || listedStrength[2] === "ml") return [];
      const name = tokens(part.slice(0, listedStrength.index));
      return name.some(term => term.kind === "word") ? [{ name, strength: listedStrength }] : [];
    });
    if (components.length < 2) return true;

    // Match the name closest to the queried amount. A leading blend name may be in a
    // different clause, so stop when the surrounding terms stop describing this component.
    let candidates = components;
    for (const term of nearbyTerms) {
      const matching = candidates.filter(component => component.name.some(own => own.kind === term.kind
        && (term.kind === "number" ? sameNumber(own.text, term.text) : own.text.includes(term.text))));
      if (matching.length) candidates = matching;
      else if (candidates !== components) break;
    }
    return candidates === components || candidates.some(({ strength: part }) => part[2] === unit && sameNumber(part[1], amount));
  });
}

/** The listed text of one row, read once. `identifier` is matched by its exact characters only. */
export type CatalogSearchText = { readonly tokens: readonly Token[]; readonly fields: readonly string[]; readonly identifier: string };

export function catalogSearchText(listed: readonly (string | null | undefined)[], identifier: string): CatalogSearchText {
  const fields = listed.filter((part): part is string => !!part);
  const text = fields.join(" ");
  // Numbers joined by hyphens ("PE-22-28") are separate numbers, so "3-3-3-10MG" keeps its amount.
  // Their joined form is also listed, as numbers only, so "pe2228" finds them too.
  const joined = [...text.matchAll(NUMBER_RUN)].map(([run]): Token => ({ kind: "number", text: run.replace(/\D/g, "") }));
  const normalized = fields.map(field => foldText(field));
  return { tokens: [...tokens(normalized.join(" ")), ...joined], fields: normalized, identifier: identifier.toLowerCase() };
}

/** True when every token of `query` matches the row. A blank query matches every row. */
export function matchesCatalogSearch(row: CatalogSearchText, query: string): boolean {
  const search = query.trim().toLowerCase();
  if (!search) return true;
  if (row.identifier.includes(search)) return true;
  const folded = foldText(search, true);
  const wanted = tokens(folded);
  if (wanted.length === 0) return false;
  const listed = row.tokens;
  for (let index = 0; index < wanted.length; index += 1) {
    const token = wanted[index];
    const next = wanted[index + 1];
    if (token.kind === "word") {
      const singular = token.text.length >= 5 && token.text.endsWith("s") ? token.text.slice(0, -1) : null;
      if (!listed.some((own) => own.kind === "word"
        && (own.text.includes(token.text) || (singular !== null && own.text.endsWith(singular))))) return false;
    } else if (next?.kind === "word" && isUnit(next.text)) {
      // An amount: this whole number, then a listed word starting with the query's unit.
      if (!listed.some((own, at) => own.kind === "number" && sameNumber(own.text, token.text)
        && listed[at + 1]?.kind === "word" && listed[at + 1].text.startsWith(next.text))) return false;
      index += 1;
    } else if (index === 0) {
      if (!listed.some((own) => own.kind === "number" && own.text.includes(token.text))) return false;
    } else if (next === undefined) {
      if (!listed.some((own) => own.kind === "number" && own.text.startsWith(token.text))) return false;
    } else if (!listed.some((own) => own.kind === "number" && sameNumber(own.text, token.text))) {
      return false;
    }
  }
  return matchesConcentrations(row.fields, folded) && matchesComponentStrength(row.fields, folded);
}
