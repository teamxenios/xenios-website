// xenios research: member facing copy for the twenty NutriDyn supplements.
//
// The rule that shapes every line here: THIS COPY DESCRIBES THE CATALOG, NOT THE
// BODY. It says where a formula sits in the founder workbook, which protocol group
// it belongs to, and what it is grouped with. It never says what a formula does to
// a person.
//
// That is not timidity, it is the only honest position available. The workbook gives
// us protocol placement and pairing logic. It does not give us a serving size, an
// ingredient panel, a clinical outcome, or a study. So the copy is written from what
// we hold, and everything else stays unwritten until a document arrives.
//
// Concretely, no line here:
//   - states an ingredient amount, a serving size, or servings per container
//   - names a disease, a diagnosis, or a treatment
//   - claims an effect, an outcome, or a benefit to a person
//   - gives a dose, a schedule, or an instruction to take anything
//   - quotes or paraphrases marketing text from any brand site
//
// Every line is original prose written from the workbook's own factual columns. A
// test in this directory enforces the banned patterns, the sentence counts, and the
// one to one coverage of the catalog.

import { SUPPLEMENT_CATALOG } from "./supplement-catalog";

export interface SupplementCopy {
  /** The catalog slug this copy belongs to. */
  slug: string;
  /** One line. Where this formula sits in the catalog. */
  positioning: string;
  /** Two or three sentences. What the record is and how it is grouped. */
  overview: string;
  /** Why the workbook groups it where it does, written from the Pairing Map. */
  whyItPairs: string;
}

export const SUPPLEMENT_COPY: readonly SupplementCopy[] = [
  {
    slug: "longevity-essentials-nad-plus",
    positioning: "The NAD+ formula the workbook places at the base of the longevity protocols.",
    overview:
      "This is the most widely placed supplement in the founder workbook. It appears in the mitochondrial, growth hormone axis, and immune protocol columns, which is why it is carried as a base layer rather than a specialty pick. It is a consumable, so it is built for a standing order rather than a one time trial.",
    whyItPairs:
      "The workbook groups it with the NAD+, MOTS-C, Tesamorelin, and SS-31 research materials, and carries it into both the mitochondrial and longevity bundle and the aging well bundle.",
  },
  {
    slug: "magtein-magnesium-l-threonate",
    positioning: "The magnesium form the workbook reserves for the cognition column.",
    overview:
      "Magtein is the only magnesium in the selection, and the workbook places it in the neurological group rather than the general foundation group. That placement is the whole point of carrying it: it is a specific form chosen for a specific protocol, not a general mineral.",
    whyItPairs:
      "It shares the focus and cognition bundle with Uplift+ and Brain Restore, and the workbook lists it alongside the Dihexa, SS-31, and Semax, Selank, and DSIP research materials.",
  },
  {
    slug: "mito-recharge",
    positioning: "The workbook's phase one anchor for the mitochondrial protocol.",
    overview:
      "Mito Recharge is the formula the workbook opens the mitochondrial protocol with. It sits in one protocol column only, which is unusual in this selection and makes it a clear pick rather than a general purpose choice.",
    whyItPairs:
      "It sits in the mitochondrial and longevity bundle with Longevity Essentials NAD+ and Fruits and Greens, and the workbook lists it against the MOTS-C and SS-31 research materials.",
  },
  {
    slug: "uplift-plus",
    positioning: "A two column formula, carried in both the cognition and the vitality groups.",
    overview:
      "Uplift+ is one of the few records in the selection that the workbook places in two unrelated protocol columns. That breadth is why it is carried. The supplier item code for this row is still open, so it is offered on request rather than through the standard approval flow.",
    whyItPairs:
      "It appears in the focus and cognition bundle with Magtein and Brain Restore, and again in the intimacy and vitality bundle with Omega Pure EPA-DHA 2400.",
  },
  {
    slug: "omega-pure-epa-dha-2400",
    positioning: "The foundation omega-3 in the selection, carried across three columns.",
    overview:
      "The workbook describes this as the foundational omega-3 of the catalog, and places it in the vitality, beauty, and general health groups. It is the record most often used as a base under a more specific pick.",
    whyItPairs:
      "It shares the intimacy and vitality bundle with Uplift+, and the hair, skin, and nails bundle with Rejuvenate+ and Annatto Pro 125.",
  },
  {
    slug: "chondro-jointaide",
    positioning: "The joint structure formula at the center of the recovery protocol.",
    overview:
      "Chondro Jointaide is the primary joint record in the selection and the highest priced of the structural picks. The workbook keeps it in a single protocol column, so it is a deliberate choice for a recovery block rather than a general addition.",
    whyItPairs:
      "It leads the recovery and joint support bundle with Collagen Renew and PRM Resolve, and the workbook pairs the group with the KLOW and BPC-157 with TB-500 and GHK-Cu research blends.",
  },
  {
    slug: "collagen-renew-dynamic-multi",
    positioning: "The connective tissue record that spans three protocol groups.",
    overview:
      "Collagen Renew appears in the recovery, performance, and beauty columns of the workbook, which is the widest spread of any structural formula in the selection. It is the record most likely to already be in a member's plan before a new protocol starts.",
    whyItPairs:
      "It carries three bundles: recovery and joint support, aging well, and performance and training, and the workbook lists it against the CJC and Ipamorelin blend.",
  },
  {
    slug: "inflam-eze",
    positioning: "The anchor of the workbook's immune balance column.",
    overview:
      "Inflam-Eze is the formula the workbook opens its immune balance protocol with, and it carries the highest wholesale position of that group. It sits in one column, so it is a specific pick for a specific block.",
    whyItPairs:
      "It heads the immune balance and gut bundle with PRM Resolve, GI Defend, and UltraBiotic Prebiotic, and the workbook groups that bundle with the Thymosin Alpha-1, KPV, and LL-37 blend.",
  },
  {
    slug: "ultrabiotic-prebiotic",
    positioning: "The gut foundation the workbook carries into two different protocols.",
    overview:
      "This record appears in both the immune balance column and the oral weight support column. The workbook places gut foundation under several protocols rather than inside one, and this is the formula it uses for that job.",
    whyItPairs:
      "It is in the immune balance and gut bundle with Inflam-Eze and GI Defend, and in the oral weight support bundle with Fruits and Greens and UltraBiotic Akkermansia Plus.",
  },
  {
    slug: "gi-defend",
    positioning: "The gut lining record in the workbook's immune balance group.",
    overview:
      "GI Defend is the second gut record in the selection, and the workbook keeps it distinct from the prebiotic rather than reading the two as interchangeable. It carries the gut tag as well as the immune tag, which is why it belongs to that bundle rather than standing alone.",
    whyItPairs:
      "It shares the immune balance and gut bundle with Inflam-Eze, PRM Resolve, and UltraBiotic Prebiotic, and the workbook lists it against the BPC-157 with TB-500 research blend.",
  },
  {
    slug: "hydrate",
    positioning: "The lowest priced record in the selection, and the training day staple.",
    overview:
      "Hydrate is the simplest and least expensive record in the catalog. The workbook keeps it in the performance column only, and reads it as the easy addition to a training block rather than a protocol in itself.",
    whyItPairs:
      "It anchors the performance and training bundle with Collagen Renew, and the workbook pairs that bundle with the CJC and Ipamorelin and BPC-157 with TB-500 research blends.",
  },
  {
    slug: "stress-essentials-balance",
    positioning: "The adaptogenic record the workbook places in the women's hormonal column.",
    overview:
      "Stress Essentials Balance is one of two adaptogenic records in the selection, and the workbook separates them by protocol rather than by formula family. This one sits with the hormonal support group.",
    whyItPairs:
      "It leads the hormonal support for women bundle with PeriMenopause Support and Rejuvenate+, and the workbook groups that bundle with the Gonadorelin and Tesamorelin research materials.",
  },
  {
    slug: "prm-resolve",
    positioning: "The record the workbook carries into both recovery and immune balance.",
    overview:
      "PRM Resolve is placed in two columns that rarely share a formula, which is why the workbook calls out its mechanism as distinct from the rest of the group. It is the bridge record between the recovery block and the immune balance block.",
    whyItPairs:
      "It appears in the recovery and joint support bundle with Chondro Jointaide and Collagen Renew, and again in the immune balance and gut bundle with Inflam-Eze and GI Defend.",
  },
  {
    slug: "fruits-and-greens",
    positioning: "The broad coverage record, carried under two protocols.",
    overview:
      "The workbook uses this as its micronutrient and antioxidant coverage rather than as a protocol specific pick. It appears in both the mitochondrial column and the oral weight support column, and it is one of the least expensive records in the selection.",
    whyItPairs:
      "It sits in the mitochondrial and longevity bundle with Mito Recharge, and in the oral weight support bundle with UltraBiotic Akkermansia Plus and UltraBiotic Prebiotic.",
  },
  {
    slug: "brain-restore",
    positioning: "The workbook's bridge record inside the cognition protocol.",
    overview:
      "Brain Restore is the highest priced record in the selection and sits in the cognition column only. The workbook positions it between the opening and later phases of that protocol, which is why it is carried alongside rather than instead of Magtein.",
    whyItPairs:
      "It completes the focus and cognition bundle with Magtein and Uplift+, and the workbook lists the group against the Dihexa, SS-31, and Semax, Selank, and DSIP research materials.",
  },
  {
    slug: "ultrabiotic-akkermansia-plus",
    positioning: "The single strain record in the oral weight support column.",
    overview:
      "This is the only single strain record in the selection. The workbook keeps it in the oral weight support column and describes the research behind it as emerging, which is exactly how it is carried here: as a considered addition, not a headline.",
    whyItPairs:
      "It shares the oral weight support bundle with Fruits and Greens and UltraBiotic Prebiotic, and the workbook lists it against the SLU-PP-332 and MOTS-C research materials.",
  },
  {
    slug: "annatto-pro-125",
    positioning: "A dual column antioxidant record, carried in beauty and cognition.",
    overview:
      "Annatto Pro 125 appears in both the beauty column and the neurological column of the workbook. It is the only record in the selection with that particular pairing of tags, which is why it is carried rather than a more common antioxidant.",
    whyItPairs:
      "It sits in the hair, skin, and nails bundle with Rejuvenate+ and Omega Pure EPA-DHA 2400, and the workbook lists it against the SS-31 and Dihexa research materials.",
  },
  {
    slug: "rejuvenate-plus",
    positioning: "The beauty anchor, carried into the women's hormonal column as well.",
    overview:
      "Rejuvenate+ is the record the workbook places at the center of its beauty group, and it is one of only three records carried into the hormonal support column too. The supplier item code for this row is still open, so it is offered on request rather than through the standard approval flow.",
    whyItPairs:
      "It leads the hair, skin, and nails bundle with Annatto Pro 125 and Omega Pure EPA-DHA 2400, and appears again in the hormonal support for women bundle with PeriMenopause Support.",
  },
  {
    slug: "perimenopause-support",
    positioning: "The lowest priced record in the women's hormonal group.",
    overview:
      "PeriMenopause Support is the least expensive record in its bundle by a wide margin. The workbook lists it as the standard companion to the rest of that group rather than an optional extra.",
    whyItPairs:
      "It shares the hormonal support for women bundle with Stress Essentials Balance and Rejuvenate+, and the workbook groups that bundle with the Gonadorelin and Tesamorelin research materials.",
  },
  {
    slug: "stress-essentials-calm",
    positioning: "The second adaptogenic record, placed in the aging well column.",
    overview:
      "Stress Essentials Calm is the companion to Stress Essentials Balance, separated from it by protocol rather than by formula family. The workbook places this one with the growth hormone axis and aging well group.",
    whyItPairs:
      "It sits in the aging well bundle with Collagen Renew and Longevity Essentials NAD+, and the workbook lists it against the CJC and Ipamorelin blend and Tesamorelin.",
  },
];

const BY_SLUG: ReadonlyMap<string, SupplementCopy> = new Map(
  SUPPLEMENT_COPY.map((copy) => [copy.slug, copy]),
);

export function findSupplementCopy(slug: string): SupplementCopy | undefined {
  return BY_SLUG.get(slug);
}

/**
 * Copy is required, never optional.
 *
 * A surface that renders a supplement without copy would have to invent something
 * or show a blank, so this throws rather than returning a fallback string.
 */
export function requireSupplementCopy(slug: string): SupplementCopy {
  const copy = BY_SLUG.get(slug);
  if (!copy) {
    throw new Error(`No approved copy for supplement slug: ${slug}`);
  }
  return copy;
}

/** Every catalog slug that has no copy yet. Empty today, and a test keeps it empty. */
export function supplementsMissingCopy(): readonly string[] {
  return SUPPLEMENT_CATALOG.filter((product) => !BY_SLUG.has(product.slug)).map(
    (product) => product.slug,
  );
}
