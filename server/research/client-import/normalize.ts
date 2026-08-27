// Product-interest normalization for client-list imports.
//
// These rules were derived from the 2026-08-26 partner demand file (201
// person-product records) and map free-text product strings onto canonical
// interest keys. The rules operate on PRODUCT strings only — nothing in this
// module ever sees or stores a person's name.
//
// Two honesty rules, from the blitz brief:
//   * Spelling variants of one product map to ONE key (recorded, not silent:
//     the staged record keeps the verbatim string alongside the key).
//   * A string joining two products with "&"/"and" is split into separate
//     interests AND flagged as a possible blend request — the split is a
//     recorded judgment for a human to confirm, never a silent merge.

export type InterestRule = Readonly<{ key: string; pattern: RegExp }>;

/** Order matters: more specific blends before their component products. */
export const CANONICAL_INTEREST_RULES: readonly InterestRule[] = Object.freeze([
  { key: "bpc157-tb500-mgf-wolverine", pattern: /wolverine|bpc[\s-]?157\s*\/\s*tb[\s-]?500\s*\/\s*mgf/i },
  { key: "bpc157-tb500-kpv-ghkcu", pattern: /bpc[\s-]?157\/tb[\s-]?500\/kpv\/ghk|bpc[\s-]?157\/tb500\/kpv\/ghk/i },
  { key: "bpc157-tb500-kpv", pattern: /bpc[\s-]?157\/tb[\s-]?500\/kpv$|bpc[\s-]?157\/tb500\/kpv$/i },
  { key: "bpc157-tb500-ghkcu", pattern: /bpc[\s-]?157\/tb[\s-]?500\/ghk/i },
  { key: "bpc157-tb500", pattern: /^(interested in )?bpc[\s-]?157\s*\/\s*tb[\s-]?500\s*(\(|$)|^bpc\/tb-?500/i },
  { key: "bpc157-caps", pattern: /bpc[\s-]?157\s*(500\s*mcg)?\s*caps/i },
  { key: "bpc157", pattern: /^bpc[\s-]?157(\s*\(\d+mg\))?$/i },
  { key: "aod-motsc-tesa-ipa", pattern: /aod\s*\/?\s*mot'?s?-?c\s*\/\s*tesamorelin\s*\/\s*ipamorelin|aod\/mots-?c\/tesamorelin\/ipamorelin/i },
  { key: "tesa-ipa-motsc", pattern: /tesamorelin\/ipamorelin\/mots?-?c/i },
  { key: "cjc-ipa-igf", pattern: /cjc.*ipamorelin.*igf|igf-?lr3.*cjc/i },
  { key: "cjc-ipa-aod", pattern: /cjc.*ipamorelin.*aod/i },
  { key: "cjc-ipa", pattern: /^cjc(-1295)?\s*\/\s*ipamorelin$/i },
  { key: "retatrutide", pattern: /^r\s*\(?\d+\s*mg\)?$|^r \d+mg$|retatrutide/i },
  { key: "tesamorelin", pattern: /^t\s*\(?\d+\s*mg\)?$|^tesamorelin$/i },
  { key: "motsc", pattern: /^mot'?s?-?c(\s*\(\d+mg\))?$/i },
  { key: "semax-selank", pattern: /semax\s*\/\s*sel[ae]nk|semak\/selank/i },
  { key: "selank", pattern: /^selank$/i },
  { key: "pt141", pattern: /pt-?141/i },
  { key: "thymosin-a1-kpv-ll37", pattern: /(ta-?1|thymosin alpha-?1).*(kpv|ll-?37)|ll-?37.*kpv/i },
  { key: "thymosin-a1", pattern: /^thymosin alpha-?1$/i },
  { key: "kpv", pattern: /^kpv$/i },
  { key: "nad", pattern: /^nad\+?\s*\(?\d*\s*(mg)?\)?$/i },
  { key: "dsip", pattern: /^dsip$/i },
  { key: "igf1lr3-motsc", pattern: /igf-?1?[\s-]?\/?lr3\s*\/\s*mot'?s?-?c/i },
  { key: "igf1lr3", pattern: /^igf-?1?\s*[\/-]?\s*lr3$/i },
  { key: "ghkcu-epithalon-motsc", pattern: /ghk-?cu\s*\/\s*epithalon\s*\/\s*mots-?c/i },
  { key: "ghkcu-epithalon", pattern: /ghk-?cu\s*\+\s*epithalon/i },
  { key: "ghkcu-topical", pattern: /ghk-?cu topical/i },
  { key: "ghkcu-caps", pattern: /ghk-?cu caps/i },
  { key: "ghkcu", pattern: /^ghk-?cu(\s*\(\d+mg\))?$/i },
  { key: "epithalon", pattern: /^epithalon(\s*\(\d+mg\))?$/i },
  { key: "slu-pp-332", pattern: /slu-?pp-?332/i },
  { key: "tesofensine", pattern: /tesofensine/i },
  { key: "ibutamoren", pattern: /ibutamoren|mk-?677/i },
  { key: "tirzepatide", pattern: /tirzepatide/i },
  { key: "melanotan-1", pattern: /melanotan\s*-?\s*1$/i },
  { key: "melanotan-2", pattern: /melanotan\s*-?\s*2$/i },
  { key: "ara-290", pattern: /ara-?290/i },
  { key: "ss-31", pattern: /ss-?31/i },
  { key: "kisspeptin", pattern: /kisspeptin/i },
  { key: "dihexa", pattern: /dihexa/i },
  { key: "sermorelin", pattern: /^sermorelin$/i },
  { key: "ghrp-6", pattern: /ghrp-?6/i },
  { key: "klow", pattern: /klow/i },
  { key: "aod-9604", pattern: /^aod(-9604)?(\s*\(\d+mg\))?$/i },
  { key: "glutathione-revive", pattern: /glutathione.*revive|revive.*glutathione/i },
  { key: "exosomes-1oz", pattern: /exosomes?\s*1\s*oz/i },
  { key: "hormone-eval-labs", pattern: /labs? for hormone|hormone eval/i },
  { key: "not-applicable", pattern: /^n\/a$/i },
]);

/**
 * Split a raw demand string into individual interests. Blend slashes are
 * preserved ("BPC-157/TB-500" stays one interest); commas and "&"/"and"
 * separate interests.
 */
export function splitInterests(raw: string): readonly string[] {
  return raw
    .split(/,| & | and /i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** True when the raw string carries an "&"/"and" join — a possible blend. */
export function isAmbiguousBlendString(raw: string): boolean {
  return / & | and /i.test(raw);
}

export function canonicalizeInterest(interest: string): string | null {
  for (const rule of CANONICAL_INTEREST_RULES) {
    if (rule.pattern.test(interest)) return rule.key;
  }
  return null;
}

/**
 * Person-name normalization for duplicate detection. Used as a KEY only.
 * NFKC first (P1-11): decomposed and precomposed spellings of one name must
 * collapse to one person; control/format characters (bidi overrides included)
 * are stripped so no invisible character can split or spoof an identity.
 */
export function normalizedNameKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
