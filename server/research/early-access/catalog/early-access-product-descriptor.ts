import type { AdminProductDetail, AdminProductVariant } from "@shared/research/product-admin";

/**
 * THE SERVER-AUTHORITATIVE PRODUCT DESCRIPTOR.
 *
 * FOUNDER REVIEW REQUIRED BEFORE PUBLIC SCALE.
 *
 * WHY THIS FILE EXISTS. Every Early Access card was showing "Product
 * information for this item is still being confirmed." for a mundane reason:
 * the description comes from `research_product_content` where
 * `section = 'shortDescription'`, and `initialize-product-control.ts` never
 * wrote a single content row, so all 22 units resolve to null and the
 * projection falls back to its withheld sentence. A catalogue that says
 * nothing about 22 products is not a catalogue.
 *
 * WHAT THIS FILE MAY SAY, AND WHY IT MAY SAY IT. It composes a descriptor
 * from the CANONICAL PRODUCT RECORD ONLY: the canonical name Product Control
 * already holds, the classification it already assigns, the strength and
 * presentation of the exact variant, and the alternative names already
 * recorded. Every clause restates a field; not one word is authored research
 * narrative. That is deliberate, and it is the repository's own rule: the
 * product records under `content/research-products/` mark every compound
 * either "No Member-Facing Copy" or "Restricted. Draft only, not approved
 * for publication", and only Samuel Boadu moves a field to Copy Approved.
 * The single written copy permission that does exist, in
 * `content/research-products/p007-tesamorelin.md`, allows exactly this shape:
 * "the canonical name and the description of the molecule as a growth
 * hormone releasing factor analog, presented as a description and not as a
 * promise of effect."
 *
 * WHAT THIS FILE MAY NEVER SAY. No effect, no benefit, no outcome, no
 * indication, no population, no protocol, no comparison, no superlative. The
 * forbidden-term screen in early-access-catalog.ts still runs over whatever
 * this returns, so a term that turns a catalogue entry into an instruction
 * withholds the description entirely rather than shipping it.
 *
 * WHERE IT SITS IN THE AUTHORITY CHAIN. Below Product Control and above the
 * withheld sentence:
 *
 *   1. `content.shortDescription` from Product Control  (a named human wrote it)
 *   2. this descriptor                                   (the canonical record restated)
 *   3. EARLY_ACCESS_WITHHELD_DESCRIPTION                 (we know nothing safe to say)
 *
 * So the moment approved copy is written through the existing Product
 * Control admin path, it supersedes this file for that product with no code
 * change. This is a floor, not a ceiling.
 */

/**
 * How a classification READS to a customer.
 *
 * A label, not a mechanism claim: it says how the Xenios catalogue files the
 * compound, in the same way "antihistamine" files a molecule without
 * promising an outcome. A classification with no entry here contributes
 * nothing to the sentence rather than being guessed at or shown raw, because
 * "gh_secretagogue" on a customer's screen is a leaked internal token.
 */
const CLASSIFICATION_LABEL: Readonly<Record<string, string>> = Object.freeze({
  repair_peptide: "a repair peptide",
  immune_peptide: "an immune peptide",
  neuro_peptide: "a neuro peptide",
  metabolic_peptide: "a metabolic peptide",
  mitochondrial_peptide: "a mitochondrial peptide",
  mitochondrial_cofactor: "a mitochondrial cofactor",
  gh_secretagogue: "a growth hormone secretagogue",
  sexual_health_peptide: "a sexual health peptide",
  hormone_analogue: "a hormone analogue",
  blend: "a research blend",
});

/**
 * The Research Use Only position, stated on every unit.
 *
 * It is the one sentence the Research Use Policy already binds every customer
 * to, so repeating it on the product itself cannot overstate anything, and a
 * catalogue of research materials that never says this on the product is
 * relying entirely on a policy the customer accepted once.
 */
export const EARLY_ACCESS_RESEARCH_USE_SENTENCE =
  "Research use only: not for human or veterinary use.";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Community and protocol vocabulary that may not reach a customer even when
 * the canonical record happens to carry it.
 *
 * This is not hypothetical: one product's recorded aliases include "KLOW
 * Peptide Stack". "Stack" is how forums describe combining compounds in a
 * regimen, and printing it on a catalogue card would put protocol language in
 * front of a customer under cover of "it was in the record". An alias
 * carrying one of these is DROPPED; the rest of the descriptor is unaffected,
 * because losing one alternative name costs nothing and printing this costs
 * the claim boundary.
 */
const PROTOCOL_ALIAS_TERMS = ["stack", "cycle", "protocol", "regimen", "blend kit"] as const;

function aliasCarriesProtocolLanguage(alias: string): boolean {
  const lowered = alias.toLowerCase();
  return PROTOCOL_ALIAS_TERMS.some((term) =>
    new RegExp(`\\b${term}(s|es)?\\b`).test(lowered),
  );
}

/**
 * The alternative names worth showing, deduplicated against the names the
 * card ALREADY displays. An alias that merely repeats the product name is
 * noise, and "Also recorded as Cagrilintide" on the Cagrilintide card is the
 * kind of filler this whole change exists to remove.
 */
function distinctAliases(product: AdminProductDetail): string[] {
  const shown = new Set(
    [cleanText(product.displayName), cleanText(product.canonicalName)]
      .flatMap((name) => [name, name.replace(/\s+Research Material$/i, "")])
      .map((name) => name.toLowerCase())
      .filter((name) => name.length > 0),
  );
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const raw of product.aliases ?? []) {
    const alias = cleanText(raw);
    if (alias.length === 0) continue;
    const key = alias.toLowerCase();
    if (shown.has(key) || seen.has(key)) continue;
    if (aliasCarriesProtocolLanguage(alias)) continue;
    // An alias that is only the canonical name with the catalogue's own
    // suffix attached is the same name wearing a hat.
    if (shown.has(key.replace(/\s+research material$/i, ""))) continue;
    seen.add(key);
    aliases.push(alias);
  }
  return aliases;
}

/** The molecule as the canonical record names it, without the shelf label. */
function moleculeName(product: AdminProductDetail): string {
  const canonical = cleanText(product.canonicalName);
  const display = cleanText(product.displayName);
  const chosen = canonical.length > 0 ? canonical : display;
  return chosen.replace(/\s+Research (Material|Blend)$/i, "").trim();
}

/**
 * Compose the descriptor for one exact unit, or "" when the record carries
 * too little to say anything true.
 *
 * Returning "" is a real answer: the caller falls back to the withheld
 * sentence, which is the honest thing to show about a product whose canonical
 * record we cannot read.
 */
export function earlyAccessProductDescriptor(
  product: AdminProductDetail,
  variant: AdminProductVariant | null,
): string {
  const molecule = moleculeName(product);
  if (molecule.length === 0) return "";

  const classification = CLASSIFICATION_LABEL[cleanText(product.classification)] ?? "";
  const strength = cleanText(variant?.strength);
  const presentation = cleanText(variant?.presentation) || cleanText(variant?.format);

  // Sentence one: what it is, and what this exact unit is.
  //
  // The presentation Product Control records ALREADY carries the strength
  // ("Single vial, 5 mg"), so naming both produced "a 5 mg Single vial, 5 mg".
  // The presentation wins when it is there, and the bare strength stands in
  // only when it is not.
  const identity = classification.length > 0 ? `${molecule}, ${classification}` : molecule;
  const unit =
    presentation.length > 0
      ? presentation.charAt(0).toLowerCase() + presentation.slice(1)
      : strength.length > 0
        ? `${strength} vial`
        : "";
  const first =
    unit.length > 0
      ? `Supplied as a ${unit}, for laboratory research.`
      : "Supplied for laboratory research.";

  // The other names the same material is known by, which is what stops a
  // customer ordering the same compound twice under two names.
  const aliases = distinctAliases(product);
  const alsoKnown = aliases.length > 0 ? ` Also recorded as ${aliases.join(", ")}.` : "";

  return `${identity}. ${first}${alsoKnown} ${EARLY_ACCESS_RESEARCH_USE_SENTENCE}`;
}
