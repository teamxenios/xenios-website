/**
 * Search matching for the quote-request picker.
 *
 * The listed words are compared as tokens, not as one exact substring, so spelling a hyphen as a
 * space or dropping it, or writing an amount with or without a space, finds the same rows:
 * "bpc-157", "bpc 157" and "bpc157" are one query, and so are "5mg" and "5 mg".
 *
 * - A token is a run of letters, a number or "%". Everything else separates tokens. A hyphen or
 *   apostrophe between two letters is dropped first, so "ghk-cu" is "ghkcu" and "men's" is "mens".
 *   A "+" right after letters stays on the word, so "nad+" finds "NAD+" and not "Gonadorelin".
 *   A number may start with its decimal point, so ".25mg" is 0.25 mg and never 25 mg.
 *   "µg" reads as "mcg", and a thousands comma is dropped, so "10,000" is "10000". In the query
 *   every comma between digits is dropped, so "10,0" typed on the way to "10,000" keeps HCG 10,000 IU.
 * - Every query token must match, in any order.
 * - A word matches inside a listed word ("hexa" finds "Dihexa"). A query word of five or more
 *   letters ending in "s" also matches a listed word ending in the word without it, so "capsules"
 *   finds "CAPSULE" and "vials" finds "vial".
 * - A number that is not part of an amount and opens the query matches inside a listed number:
 *   "57" finds "BPC-157". After another token, the last number must start a listed number, so a
 *   query typed one key at a time keeps its rows ("synthetic 1" does not show "Synthetic 21"), and
 *   any other number must equal a listed one: "tb 500 bpc 157" finds "BPC-157/TB-500".
 *
 * Amounts. An amount is a number followed by a unit (mg, mcg, ml, iu, g, gm, unit, units, %).
 * In the query the unit may be only its start ("10 m"). An amount matches only that whole number
 * with a listed unit starting with the query's unit, so "5 mg" finds "5 mg" and "5MG/ML" but not
 * "15 mg", "2.5 mg", "50 mg" or "5 mcg". An amount also belongs to the name written before it:
 * - Each listed part, and each line of a part, is read as its own phrase. In a phrase, an amount
 *   belongs to the words and numbers written before it, since the phrase start, the last ")", ","
 *   or ";", a "(" before a word, or a "+", "&" or spaced "/" after the last amount. "BPC-157 5 mg +
 *   TB-500 10 mg" gives BPC-157 5 mg and TB-500 10 mg, and "CREAM (GHK-CU 3% / NIACINAMIDE 4%)"
 *   gives GHK-Cu 3% and niacinamide 4%.
 * - Amounts joined by "-" or "/" are one list ("3-3-3-10MG", "5 mg/650 mcg", "114MCG/27MCG"), and
 *   every amount in it belongs to all of the names before it. The label does not say which amount
 *   is which name's, so search does not pair them by order either.
 * - "/" then ml, g or gm, with or without a number, is what the amount is per, for every amount in
 *   the list: "10MG/0.1ML" is 10 mg per 0.1 ml, and "0.25MG/100MG/0.25MG/GM" is each per gram.
 *   "per mL" is what every amount before it in the same brackets is per: "(Thiamine 10mg, ...
 *   Pyridoxine 2mg per mL)" gives 10 mg/ml and 2 mg/ml. In the query "2mg per ml" is "2mg/ml".
 * - An amount with no name before it ("(5ML)", "(1.2mg vial)", "INJ. (10ML)") belongs to the row.
 * In the query, an amount belongs to the one name typed beside it: the word and its numbers before
 * it, or after it when its clause starts with an amount ("5 mg bpc-157"). A ";" or "," between two
 * amounts starts a new clause. "shade mix blue-500 5 mg" ties 5 mg to "blue 500", and "5 mg
 * red-157; blue-500 10 mg" ties 5 mg to "red 157" and 10 mg to "blue 500". The query amount must be an amount of the listed part with that whole
 * name, or one that belongs to the row: "tb-500 5 mg" does not find "BPC-157 (5mg) / TB-500
 * (10mg)", nor "cashmere cream ghk-cu 4%" "CASHMERE CREAM (GHK-CU 3% / NIACINAMIDE 4%)". When
 * only part of the name is a listed part's ("blue41" beside "Red-41" and "Blue-42"), only the
 * row's amounts will do. When no listed part has any of the name ("klow 5 mg", "5 mg"), or the
 * query names several parts before the amount with "+", "&", "," or "/" ("DSIP + Selank 2mg"),
 * any listed amount will do. A query amount with "/" or "per" must match the listed amount and
 * what it is per: "10mg/0.1ml" finds "10MG/0.1ML" and not "Thiamine 10mg, ... Magnesium
 * Chloride 0.1mL".
 *
 * The identifier the row carries is still found by its exact characters, when the query is long
 * enough to be one: at least IDENTIFIER_QUERY_MIN characters. Identifiers are hex, so a short
 * query ("b12", "12", "ad") would otherwise find rows whose id happens to contain it.
 * Matching only: nothing here changes a row, its order or what the picker returns.
 */

type Token = { readonly kind: "word" | "number"; readonly text: string };
type Lexeme = Token & { readonly gap: string };
type Amount = { readonly number: string; readonly unit: string; readonly per: Per | null };
type Per = { readonly number: string | null; readonly unit: string };
type Pair = { readonly owner: readonly Token[]; readonly amount: Amount };

const WORD_JOINERS = /(\p{L})[-‐‑'’]+(?=\p{L})/gu;
const THOUSANDS = /(\d),(?=\d{3}(?!\d))/g;
const MICRO = /[µμ](?=g)/g;
const TOKEN = /\p{L}+\+?|\d+(?:\.\d+)?|(?<![\p{L}\d])\.\d+|%/gu;
const NUMBER_RUN = /(?<![\d.])\d+(?:[-‐‑]\d+)+(?![\d.])/g;
const QUERY_DIGIT_COMMA = /(\d),(?=\d)/g;
const UNITS = ["mg", "mcg", "ml", "iu", "g", "gm", "unit", "units", "%"];
const LISTED_UNITS = new Set(UNITS);
const VEHICLES = new Set(["ml", "g", "gm"]);
const SPACE = /^\s*$/;
const LIST_JOIN = /^(?:[-‐‑]|\s*\/\s*)$/;
const PER_JOIN = /^\s*\/\s*$/;
const PHRASE_BREAK = /[),;]/;
// "/" starts a new name only with a space beside it: "3% / ESTRIOL", not "2.5MG/SPRAY".
const NAME_JOIN = /[+&]|\s\/|\/\s/;
// In the query, any of these between the names before an amount names more than one part.
const SEVERAL = /[+&,/]/;
// In the query, either of these between two amounts ends one amount's clause and starts the next.
const CLAUSE_BREAK = /[;,]/;

const isUnitStart = (word: string) => UNITS.some((unit) => unit.startsWith(word));
const sameNumber = (left: string, right: string) => Number(left) === Number(right);

function lex(text: string, query: boolean): Lexeme[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  const folded = (query ? normalized.replace(QUERY_DIGIT_COMMA, "$1") : normalized)
    .replace(MICRO, "mc").replace(THOUSANDS, "$1").replace(WORD_JOINERS, "$1");
  const out: Lexeme[] = [];
  let end = 0;
  for (const match of folded.matchAll(TOKEN)) {
    const value = match[0];
    const at = match.index ?? 0;
    out.push({ kind: /[\d.]/.test(value[0]) ? "number" : "word", text: value, gap: folded.slice(end, at) });
    end = at + value.length;
  }
  return out;
}

const plain = ({ kind, text }: Lexeme): Token => ({ kind, text });

type Chain = { readonly end: number; readonly amounts: readonly Amount[] };

/**
 * The list of amounts that starts at `start`, if any, and how far the numbers joined to it reach.
 * A list is numbers joined by "-" or "/", ending at the last one with a unit; a number without a
 * unit takes the next unit. "/" then a vehicle unit, with or without a number, ends the list as
 * what every amount in it is per.
 */
function chainAt(lexemes: readonly Lexeme[], start: number, isUnit: (word: string) => boolean): { chain: Chain | null; reach: number } {
  const unitAfter = (at: number) => {
    const next = lexemes[at + 1];
    return next?.kind === "word" && SPACE.test(next.gap) && isUnit(next.text) ? next.text : null;
  };
  const items: { number: string; unit: string | null; end: number }[] = [];
  let per: Per | null = null;
  let perEnd = -1;
  let at = start;
  while (lexemes[at]?.kind === "number") {
    const unit = unitAfter(at);
    const end = unit === null ? at + 1 : at + 2;
    items.push({ number: lexemes[at].text, unit, end });
    const next = lexemes[end];
    if (!next || !LIST_JOIN.test(next.gap)) break;
    if (unit !== null && PER_JOIN.test(next.gap)) {
      if (next.kind === "word" && VEHICLES.has(next.text)) {
        per = { number: null, unit: next.text };
        perEnd = end + 1;
        break;
      }
      const perUnit = next.kind === "number" ? unitAfter(end) : null;
      if (perUnit !== null && VEHICLES.has(perUnit)) {
        per = { number: next.text, unit: perUnit };
        perEnd = end + 2;
        break;
      }
    }
    at = end;
  }
  let last = items.length - 1;
  while (last >= 0 && items[last].unit === null) last -= 1;
  // No number joined here has a unit, so none of them starts a list either.
  if (last < 0) return { chain: null, reach: items[items.length - 1].end };
  // "per" is only read straight after a number with its unit, so that number ends the list.
  const amounts: Amount[] = [];
  let unit = items[last].unit as string;
  for (let index = last; index >= 0; index -= 1) {
    unit = items[index].unit ?? unit;
    amounts.unshift({ number: items[index].number, unit, per });
  }
  const end = per === null ? items[last].end : perEnd;
  return { chain: { end, amounts }, reach: end };
}

type Phrase = {
  /** Lexemes that are not part of an amount, with their place in the phrase. */
  readonly names: readonly { readonly lexeme: Lexeme; readonly at: number }[];
  /** Each list of amounts, the names it belongs to, and the names after it. */
  readonly chains: readonly { readonly chain: Chain; readonly start: number; readonly before: readonly Lexeme[]; readonly after: readonly Lexeme[] }[];
};

/** "per ml" or "per 0.5 ml" at `at`: what the amounts before it in the same brackets are per. */
function perAt(lexemes: readonly Lexeme[], at: number): { per: Per; end: number } | null {
  if (lexemes[at].kind !== "word" || lexemes[at].text !== "per") return null;
  const next = lexemes[at + 1];
  if (next?.kind === "word" && VEHICLES.has(next.text)) return { per: { number: null, unit: next.text }, end: at + 2 };
  const unit = lexemes[at + 2];
  if (next?.kind === "number" && unit?.kind === "word" && SPACE.test(unit.gap) && VEHICLES.has(unit.text)) {
    return { per: { number: next.text, unit: unit.text }, end: at + 3 };
  }
  return null;
}

/**
 * Splits a phrase into names and lists of amounts. In listed text (`listed`), the names an amount
 * belongs to start at the phrase, at ")", "," or ";", at "(" before a word, or at "+", "&" or a
 * spaced "/" after an amount. Words straight after an amount without one of those ("INJ.",
 * "CAPSULE") describe the row, so an amount after them belongs to the row. In the query every run
 * of names counts.
 */
function phrase(lexemes: readonly Lexeme[], isUnit: (word: string) => boolean, listed: boolean): Phrase {
  const names: { lexeme: Lexeme; at: number }[] = [];
  const runs: { names: Lexeme[]; owns: boolean }[] = [{ names: [], owns: true }];
  const found: { chain: Chain; start: number; run: number }[] = [];
  const current = () => runs[runs.length - 1];
  let bracket = 0;
  let at = 0;
  while (at < lexemes.length) {
    const lexeme = lexemes[at];
    if (listed && at > 0) {
      if (PHRASE_BREAK.test(lexeme.gap) || (lexeme.kind === "word" && lexeme.gap.includes("("))) runs.push({ names: [], owns: true });
      else if (!current().owns && current().names.length === 0 && NAME_JOIN.test(lexeme.gap)) current().owns = true;
    }
    if (lexeme.gap.includes("(")) bracket = found.length;
    const per = perAt(lexemes, at);
    if (per) {
      for (let index = bracket; index < found.length; index += 1) {
        const { chain } = found[index];
        if (chain.amounts[0].per === null) found[index] = { ...found[index], chain: { ...chain, amounts: chain.amounts.map((amount) => ({ ...amount, per: per.per })) } };
      }
      at = per.end;
      continue;
    }
    if (lexeme.kind === "number") {
      const { chain, reach } = chainAt(lexemes, at, isUnit);
      if (chain) {
        found.push({ chain, start: at, run: runs.length - 1 });
        runs.push({ names: [], owns: !listed });
        at = chain.end;
        continue;
      }
      // Numbers joined without a unit are names, all of them.
      for (; at < reach; at += 1) {
        names.push({ lexeme: lexemes[at], at });
        current().names.push(lexemes[at]);
      }
      continue;
    }
    names.push({ lexeme, at });
    current().names.push(lexeme);
    at += 1;
  }
  return {
    names,
    chains: found.map(({ chain, start, run }) => ({
      chain, start, before: runs[run].owns ? runs[run].names : [], after: runs[run + 1]?.names ?? [],
    })),
  };
}

function pairs(parsed: Phrase, ownerOf: (entry: Phrase["chains"][number]) => readonly Lexeme[]): Pair[] {
  return parsed.chains.flatMap((entry) => {
    const owner = ownerOf(entry).map(plain);
    const listed = entry.chain.amounts.map((amount): Pair => ({ owner, amount }));
    // The amount an amount is per ("0.1ML" of "10MG/0.1ML") is also an amount of the row.
    const per = entry.chain.amounts[0].per;
    return per?.number ? [...listed, { owner: [], amount: { number: per.number, unit: per.unit, per: null } }] : listed;
  });
}

/** The listed text of one row, read once. `identifier` is matched by its exact characters only. */
export type CatalogSearchText = {
  readonly tokens: readonly Token[];
  readonly pairs: readonly Pair[];
  readonly identifier: string;
};

export function catalogSearchText(listed: readonly (string | null | undefined)[], identifier: string): CatalogSearchText {
  const parts = listed.filter((part): part is string => !!part);
  const text = parts.join(" ");
  // Numbers joined by hyphens ("PE-22-28") are separate numbers, so "3-3-3-10MG" keeps its amount.
  // Their joined form is also listed, as numbers only, so "pe2228" finds them too.
  const joined = [...text.matchAll(NUMBER_RUN)].map(([run]): Token => ({ kind: "number", text: run.replace(/\D/g, "") }));
  const lines = parts.flatMap((part) => part.split("\n"));
  return {
    tokens: [...lex(text, false).map(plain), ...joined],
    pairs: lines.flatMap((line) => pairs(phrase(lex(line, false), (word) => LISTED_UNITS.has(word), true), (entry) => entry.before)),
    identifier: identifier.toLowerCase(),
  };
}

type Query = {
  readonly names: readonly { readonly token: Token; readonly first: boolean; readonly last: boolean }[];
  readonly amounts: readonly { readonly name: readonly Token[]; readonly several: boolean; readonly amount: Amount }[];
};

function wordMatches(own: Token, word: string, start = false): boolean {
  if (own.kind !== "word") return false;
  if (start ? own.text.startsWith(word) : own.text.includes(word)) return true;
  return word.length >= 5 && word.endsWith("s") && own.text.endsWith(word.slice(0, -1));
}

/**
 * The one name a query amount is typed beside: a word and the numbers written with it. Before the
 * amount that is the last word and the numbers after it ("shade mix blue-500 5 mg" gives "blue
 * 500"); after an amount, the first word and the numbers after it.
 */
function nameBeside(run: readonly Lexeme[], after: boolean): Token[] {
  const unit: Token[] = [];
  if (after) {
    let at = 0;
    while (run[at]?.kind === "number") unit.push(plain(run[at++]));
    if (run[at]) unit.push(plain(run[at++]));
    while (run[at]?.kind === "number") unit.push(plain(run[at++]));
    return unit;
  }
  let at = run.length - 1;
  while (run[at]?.kind === "number") unit.push(plain(run[at--]));
  if (run[at]) unit.push(plain(run[at]));
  return unit;
}

function readQuery(search: string): Query {
  const lexemes = lex(search, true);
  const parsed = phrase(lexemes, isUnitStart, false);
  const seen = new Set<string>();
  const names = parsed.names.flatMap(({ lexeme, at }) => {
    const first = at === 0;
    const last = at === lexemes.length - 1;
    // A repeated name token adds nothing, so a long repeated query costs no more than a short one.
    const key = `${lexeme.kind}:${lexeme.text}:${first}:${last}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ token: plain(lexeme), first, last }];
  });
  // A ";" or "," between two amounts ends a clause: "5 mg red-157; blue-500 10 mg" is two. The names
  // before the break are the earlier amount's, and the names after it the later amount's.
  const chains = parsed.chains;
  const zones = chains.map((entry) => ({ before: entry.before, after: entry.after, opens: false }));
  zones.forEach((zone, index) => {
    const next = zones[index + 1];
    if (index === 0) zone.opens = true;
    if (!next) return;
    const shared = zone.after;
    let at = shared.findIndex((lexeme) => CLAUSE_BREAK.test(lexeme.gap));
    if (at < 0 && CLAUSE_BREAK.test(lexemes[chains[index + 1].start].gap)) at = shared.length;
    if (at < 0) return;
    zone.after = shared.slice(0, at);
    next.before = shared.slice(at);
    next.opens = true;
  });
  // In each clause, an amount typed before any name takes the name after it, as does every amount
  // after it in that clause ("5 mg red-157 10 mg blue-500"); otherwise each takes the name before it.
  // An amount with no name after it takes the name before it ("5 mg red-157 blue-500 10 mg").
  let amountFirst = false;
  const kept = new Set<string>();
  const amounts = chains.flatMap((entry, index) => {
    const zone = zones[index];
    if (zone.opens) amountFirst = zone.before.length === 0;
    const useAfter = amountFirst && zone.after.length > 0;
    const run = useAfter ? zone.after : zone.before;
    const name = nameBeside(run, useAfter);
    // "dsip + selank 2mg" or "bpc-157/tb-500 5mg" names several parts for one amount.
    const several = run.slice(1).some((lexeme) => SEVERAL.test(lexeme.gap));
    const wanted = entry.chain.amounts.map((amount) => ({ name, several, amount }));
    // The amount a query amount is per ("0.1ml" of "10mg/0.1ml") must also be listed.
    const per = entry.chain.amounts[0].per;
    if (per?.number) wanted.push({ name: [], several: false, amount: { number: per.number, unit: per.unit, per: null } });
    return wanted.filter((one) => {
      // A repeated amount adds nothing, so a long repeated query costs no more than a short one.
      const key = JSON.stringify(one);
      if (kept.has(key)) return false;
      kept.add(key);
      return true;
    });
  });
  return { names, amounts };
}

function nameMatches(listed: readonly Token[], { token, first, last }: Query["names"][number]): boolean {
  if (token.kind === "word") return listed.some((own) => wordMatches(own, token.text));
  if (first) return listed.some((own) => own.kind === "number" && own.text.includes(token.text));
  if (last) return listed.some((own) => own.kind === "number" && own.text.startsWith(token.text));
  return listed.some((own) => own.kind === "number" && sameNumber(own.text, token.text));
}

/** Whether a listed amount's names include this query token. A word must start a listed word, so "l" is L's and not ILE's. */
function owns(owner: readonly Token[], token: Token): boolean {
  return owner.some((own) => (token.kind === "word"
    ? wordMatches(own, token.text, true)
    : own.kind === "number" && sameNumber(own.text, token.text)));
}

function amountMatches(listed: Amount, wanted: Amount): boolean {
  if (!sameNumber(listed.number, wanted.number) || !listed.unit.startsWith(wanted.unit)) return false;
  if (wanted.per === null) return true;
  return listed.per !== null && listed.per.unit.startsWith(wanted.per.unit)
    && sameNumber(listed.per.number ?? "1", wanted.per.number ?? "1");
}

let lastQuery: { readonly search: string; readonly query: Query } | null = null;

/** The shortest query matched against a row's identifier: a pasted id or a long part of one. */
export const IDENTIFIER_QUERY_MIN = 8;

/** True when every token of `query` matches the row. A blank query matches every row. */
export function matchesCatalogSearch(row: CatalogSearchText, query: string): boolean {
  const search = query.trim().toLowerCase();
  if (!search) return true;
  if (search.length >= IDENTIFIER_QUERY_MIN && row.identifier.includes(search)) return true;
  // The picker checks one query against every row, so the query is read once.
  if (lastQuery?.search !== search) lastQuery = { search, query: readQuery(search) };
  const { names, amounts } = lastQuery.query;
  if (names.length === 0 && amounts.length === 0) return false;
  if (!names.every((name) => nameMatches(row.tokens, name))) return false;
  return amounts.every(({ name, several, amount }) => {
    let pool: readonly Pair[] = row.pairs;
    if (!several && name.length > 0) {
      const rowLevel = row.pairs.filter((pair) => pair.owner.length === 0);
      // The listed amounts of the part with this whole name, and the amounts of the whole row.
      const named = row.pairs.filter((pair) => pair.owner.length > 0 && name.every((token) => owns(pair.owner, token)));
      if (named.length > 0) pool = [...named, ...rowLevel];
      // Part of the name is another part's ("blue41" beside Red-41 and Blue-42): only the row's.
      else if (row.pairs.some((pair) => pair.owner.length > 0 && name.some((token) => owns(pair.owner, token)))) pool = rowLevel;
    }
    return pool.some((pair) => amountMatches(pair.amount, amount));
  });
}
