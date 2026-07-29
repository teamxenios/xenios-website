// xenios research: positioning copy for the four brand catalogs.
//
// The rule that shapes every line here: THIS COPY DESCRIBES THE CATALOG, NOT THE
// PRODUCTS. There are 911 rows and there are four blurbs, one per brand, plus one
// line per classification. That ratio is deliberate. The workbook records what exists
// in each brand's public catalog and when it was verified. It records no ingredient,
// no amount, no serving size, no study, and no outcome, so per product copy would
// have to be invented, and inventing it is the one thing this lane may not do.
//
// Concretely, no line here:
//   - describes an individual product
//   - states an ingredient, an amount, a serving size, or a presentation
//   - names a disease, a diagnosis, or a treatment
//   - claims an effect, an outcome, or a benefit to a person
//   - quotes, paraphrases, or rewrites marketing text from any brand
//   - repeats a brand's own positioning language back at a member
//
// Every line is original prose written from the workbook's structural columns: how
// many rows, of what classification, verified how. The row counts quoted in the copy
// are checked against the catalog itself by a test, so the prose cannot drift away
// from the data it describes.

import {
  BRAND_CLASSIFICATIONS,
  BRAND_COMPANY_NAMES,
  BRANDS,
  type Brand,
  type BrandClassification,
} from "./brand-catalog";

// ---------------------------------------------------------------------------
// Brand level copy
// ---------------------------------------------------------------------------

export interface BrandCopy {
  brand: Brand;
  /** The company name, taken from the catalog module rather than retyped. */
  companyName: string;
  /** One line. Where this catalog sits among the four. */
  positioning: string;
  /** Two or three sentences. What the catalog is, structurally. */
  overview: string;
  /** One or two sentences. What we hold, and what we plainly do not. */
  whatWeHold: string;
}

export const BRAND_COPY: readonly BrandCopy[] = [
  {
    brand: "momentous",
    companyName: BRAND_COMPANY_NAMES.momentous,
    positioning:
      "The smallest of the four catalogs, and the only one the workbook breaks into products, variants, and stacks.",
    overview:
      "Momentous is 76 rows, and the workbook reads them structurally rather than alphabetically: individual products, travel and flavor variants, and multi product stacks are each their own catalog type. That is why one formula can appear more than once under different presentations, and why a count of rows here is not a count of distinct formulas. Seventy five rows are human supplements and one is a topical lotion, which keeps its own classification rather than being folded in.",
    whatWeHold:
      "Every row was read from the brand's own live product page or its official help catalog on a single verified date, so what we hold is what was public that day and nothing at all about what any of it contains.",
  },
  {
    brand: "pure_encapsulations",
    companyName: BRAND_COMPANY_NAMES.pure_encapsulations,
    positioning:
      "The largest catalog of the four, held as an exact snapshot of the brand's own A-Z index.",
    overview:
      "This is 413 rows, every one of them read from the brand's official A-Z listing rather than from individual product pages. The workbook records no variant, no price, and no supplier detail for any of them. So what we hold is a complete index of what the brand publishes, which is a different and much smaller thing than knowing any one row well enough to offer it.",
    whatWeHold:
      "One catalog url covers all 413 rows. A row here is a name in a public index, not yet something we could describe, price, or source.",
  },
  {
    brand: "life_extension",
    companyName: BRAND_COMPANY_NAMES.life_extension,
    positioning:
      "A 384 row A-Z snapshot, and the only catalog here that is not entirely human supplements.",
    overview:
      "Life Extension's official index carries ten rows the workbook flags as something other than a human dietary supplement: two pet mixes, three coffees and an olive oil, and four personal care items. They keep their own classification here rather than being counted as supplements. That is why this brand's human supplement total is 374 and not 384, and the difference is visible rather than quietly absorbed.",
    whatWeHold:
      "As with the other A-Z snapshot, the workbook gives a name, a catalog type, a classification, and a verified date for each row, and nothing beyond that.",
  },
  {
    brand: "superpower",
    companyName: BRAND_COMPANY_NAMES.superpower,
    positioning:
      "A blood testing and health service catalog, held apart from every product listing.",
    overview:
      "Superpower's 38 rows are testing panels, an annual membership, blood collection services, and marketplace categories, so not one of them is a good that could be shipped. Several are unambiguously clinical, including prostate screening, a partner cancer screening add on, celiac and autoimmune panels, and prescription marketplace access. They are recorded here as a service catalog and they are not offered.",
    whatWeHold:
      "Whether a testing service belongs in front of a member is a Care rail decision with a named clinician behind it, not a catalog decision. These rows stay on display only until that decision exists.",
  },
];

const BY_BRAND: ReadonlyMap<Brand, BrandCopy> = new Map(
  BRAND_COPY.map((copy) => [copy.brand, copy]),
);

export function findBrandCopy(brand: string): BrandCopy | undefined {
  return BY_BRAND.get(brand as Brand);
}

/**
 * Copy is required, never optional.
 *
 * A surface that rendered a brand without copy would have to invent something or show
 * a blank, so this throws rather than returning a fallback string.
 */
export function requireBrandCopy(brand: Brand): BrandCopy {
  const copy = BY_BRAND.get(brand);
  if (!copy) {
    throw new Error(`No approved copy for brand: ${brand}`);
  }
  return copy;
}

/** Every brand with no copy yet. Empty today, and a test keeps it empty. */
export function brandsMissingCopy(): readonly Brand[] {
  return BRANDS.filter((brand) => !BY_BRAND.has(brand));
}

// ---------------------------------------------------------------------------
// Classification level copy
// ---------------------------------------------------------------------------

/**
 * One line per classification, so a surface can say what a group IS without
 * describing any member of it. This is the level at which the workbook actually
 * supports a sentence.
 */
export interface ClassificationCopy {
  classification: BrandClassification;
  /** Plain language, member facing. Never a condition and never a claim. */
  label: string;
  /** One or two sentences. What this group is, and why it is kept separate. */
  line: string;
}

export const CLASSIFICATION_COPY: readonly ClassificationCopy[] = [
  {
    classification: "human_supplement",
    label: "Human supplements",
    line: "Rows the brand's own catalog lists as a dietary supplement for people. This is the only classification a human supplement listing draws from.",
  },
  {
    classification: "food_beverage",
    label: "Food and drink",
    line: "Coffees and an olive oil that sit inside a supplement brand's index. They are real catalog entries and they are food, so they are counted and shown as food.",
  },
  {
    classification: "personal_care",
    label: "Personal care",
    line: "Toothpaste and skin care carried in a supplement brand's index. Recorded under their own classification, so that a supplement count stays a supplement count.",
  },
  {
    classification: "pet_supplement",
    label: "Pet products",
    line: "Two mixes made for cats and dogs. They are excluded from every human listing by code rather than by convention, because a mistake here would be a real one.",
  },
  {
    classification: "topical_non_supplement",
    label: "Topical, not a supplement",
    line: "A single lotion, applied rather than swallowed. It is not counted with the supplements and it is not described as one.",
  },
  {
    classification: "blood_testing_health_service",
    label: "Blood testing and health services",
    line: "Panels, memberships, and collection services rather than goods. This is a clinical question before it is a commerce question, and it stays with a named human.",
  },
];

const BY_CLASSIFICATION: ReadonlyMap<BrandClassification, ClassificationCopy> = new Map(
  CLASSIFICATION_COPY.map((copy) => [copy.classification, copy]),
);

export function findClassificationCopy(
  classification: string,
): ClassificationCopy | undefined {
  return BY_CLASSIFICATION.get(classification as BrandClassification);
}

export function requireClassificationCopy(
  classification: BrandClassification,
): ClassificationCopy {
  const copy = BY_CLASSIFICATION.get(classification);
  if (!copy) {
    throw new Error(`No approved copy for classification: ${classification}`);
  }
  return copy;
}

/** Every classification with no copy yet. Empty today, and a test keeps it empty. */
export function classificationsMissingCopy(): readonly BrandClassification[] {
  return BRAND_CLASSIFICATIONS.filter(
    (classification) => !BY_CLASSIFICATION.has(classification),
  );
}
