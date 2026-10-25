// xenios research: strength comparison for image identity.
//
// This is a truthfulness helper, not a formatting helper. It answers one
// question: does the strength printed on the pictured item match the strength of
// the variant the image is attached to. A wrong answer here puts a 10 mg vial on
// a 5 mg listing, which is exactly the failure the manifest's identity rule
// ("Exact product and variant required") exists to prevent.
//
// Design choices, all fail closed:
//
//   - Comparison is on a normalised token list, not on free text, so "10mg" and
//     "10 MG" match while "10 mg" and "10 mcg" do not.
//   - A multi component strength ("10 mg / 10 mg / 50 mg") compares component by
//     component IN ORDER, because the order is the blend order and swapping two
//     components describes a different product.
//   - Anything we cannot parse compares as NOT equal. An unparsed strength is not
//     evidence of a match.

/** A single parsed component, for example 10 mg. */
export interface StrengthComponent {
  readonly amount: number;
  readonly unit: string;
}

const UNIT_ALIASES: Record<string, string> = {
  mg: "mg",
  mgs: "mg",
  milligram: "mg",
  milligrams: "mg",
  mcg: "mcg",
  ug: "mcg",
  microgram: "mcg",
  micrograms: "mcg",
  g: "g",
  gram: "g",
  grams: "g",
  iu: "iu",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  billion: "billion",
  cfu: "cfu",
};

const COMPONENT_PATTERN = /^([0-9]+(?:\.[0-9]+)?)\s*([a-z]+)$/;

/**
 * Parse a strength string into ordered components. Returns null when any part of
 * the string is not a recognisable amount and unit, so a caller can never treat a
 * partial parse as a full one.
 */
export function parseStrength(value: string | null | undefined): readonly StrengthComponent[] | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return null;

  const parts = trimmed.split("/").map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length === 0) return null;

  const components: StrengthComponent[] = [];
  for (const part of parts) {
    const match = COMPONENT_PATTERN.exec(part.replace(/\s+/g, " "));
    if (!match) return null;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return null;
    const unit = UNIT_ALIASES[match[2]];
    if (!unit) return null;
    components.push({ amount, unit });
  }
  return components;
}

/**
 * True when the variant carries a strength at all. A variant like "Capsules" or
 * "Panel" is a format, not a strength, so an image on it makes no strength claim
 * and is not held to one.
 */
export function variantCarriesStrength(variant: string | null | undefined): boolean {
  return parseStrength(variant) !== null;
}

/**
 * Exact strength equality.
 *
 * Both sides must parse. Unequal component counts, orders, amounts, or units are
 * all a mismatch. There is no tolerance and no unit conversion: 1000 mcg and
 * 1 mg print differently on a label, and the label is what the reader sees.
 */
export function strengthsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = parseStrength(a);
  const right = parseStrength(b);
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i].amount !== right[i].amount) return false;
    if (left[i].unit !== right[i].unit) return false;
  }
  return true;
}

/** Canonical display form, used only in finding messages. */
export function formatStrength(value: string | null | undefined): string {
  const parsed = parseStrength(value);
  if (!parsed) return value === null || value === undefined ? "none declared" : value.trim();
  return parsed.map((component) => `${component.amount} ${component.unit}`).join(" / ");
}
