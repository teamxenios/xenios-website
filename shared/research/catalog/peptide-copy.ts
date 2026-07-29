/**
 * xenios research: customer-facing copy for the private peptide catalog.
 *
 * Dependency free except for the catalog's own types, so any surface can render
 * it without pulling in commerce or server code.
 *
 * ---------------------------------------------------------------------------
 * THE VOICE
 * ---------------------------------------------------------------------------
 *
 * Premium, discreet, research forward, authoritative. Short sentences. Plain
 * English. No hype, no urgency, no flattery, no exclamation. Zero em dashes.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS COPY MAY NEVER SAY
 * ---------------------------------------------------------------------------
 *
 * No clinical claim, no disease indication, no statement of effect on a person,
 * no dosing or administration guidance of any kind, no purity, sterility, or
 * endotoxin statement, no certificate-of-analysis assertion, no regulatory
 * guarantee. The phrase "FDA-approved" never appears here; where the workbook
 * records it as a factual regulatory status of a molecule it lives on that
 * product's `regulatoryNote` in peptide-catalog.ts and nowhere else.
 *
 * `researchContext` entries are RESEARCH AREAS, meaning the published fields a
 * compound appears in. They are not statements that the compound does anything
 * for anyone. `RESEARCH_CONTEXT_DISCLOSURE` states that in the copy itself, and
 * a surface rendering research context must render it alongside.
 *
 * `storageAndHandling` deliberately states no temperature, no light condition,
 * and no shelf life. No supplier document establishing those facts exists for
 * these items (see SUPPLIER_ATTACHMENT_VERIFICATION_REPORT.md), so publishing a
 * condition would be inventing one.
 *
 * A test enforces all of the above against a denylist.
 */

import {
  PEPTIDE_CATALOG,
  primaryVariant,
  productsInTier,
  type PeptideProduct,
} from "./peptide-catalog";

/**
 * The standing line that must accompany any rendered research context. It keeps
 * a list of study areas from reading as a list of benefits.
 */
export const RESEARCH_CONTEXT_DISCLOSURE =
  "Research context lists the published fields a compound appears in. It is not a statement of what the compound does for any person, and it is not guidance for use.";

/** The standing line that must accompany any rendered price or availability. */
export const CATALOG_STATUS_DISCLOSURE =
  "Every item in this catalog is held to the same documentation gate. Availability and pricing are recorded on each product and are not final until the documentation and the pricing formula are confirmed.";

export interface PeptideCopy {
  internalProductCode: string;
  /**
   * The SKU of the product's primary (workbook) variant.
   *
   * Copy is written at PRODUCT level, not variant level, because positioning and
   * research context describe the compound and do not change with vial size.
   * This field pins the copy to the product through a stable identifier that a
   * test can verify against the catalog.
   */
  primarySku: string;
  /** One line. The positioning statement a member reads first. */
  positioning: string;
  /** Two to three sentences. What the item is and why it is in the range. */
  overview: string;
  /** Published research areas. Never a benefit list. */
  researchContext: readonly string[];
  /** Handling framing only. States no condition that is not documented. */
  storageAndHandling: string;
}

const VIAL_STORAGE =
  "Handling follows the profile recorded against each lot. Xenios publishes storage conditions only after the supplier document that establishes them is on file, so none are stated here yet. The recorded handling profile travels with the shipment.";

const CAPSULE_STORAGE =
  "Capsule bottles are handled under the profile recorded against each lot. Xenios publishes storage conditions only after the supplier document that establishes them is on file, so none are stated here yet. The recorded handling profile travels with the shipment.";

export const PEPTIDE_COPY: readonly PeptideCopy[] = [
  {
    internalProductCode: "PEP-001",
    primarySku: "R360-BPC157_TB500-15MG_15MG-VIAL",
    positioning: "The recovery pairing members ask for by name.",
    overview:
      "BPC-157 and TB-500 supplied together in one vial, at the strength the founder workbook records. The pairing exists because members and their practitioners were already sourcing the two separately, and a single vial removes a step. It sits behind the same documentation gate as every other item in this catalog.",
    researchContext: [
      "Tissue and connective tissue repair literature",
      "Anti-fibrotic signalling research",
      "Recovery protocol design in functional medicine practice",
    ],
    storageAndHandling: VIAL_STORAGE,
  },
  {
    internalProductCode: "PEP-002",
    primarySku: "R360-BPC157_TB500_GHKCU-10MG_10MG_50MG-VIAL",
    positioning: "The most complete vial in the recovery range.",
    overview:
      "BPC-157 and TB-500 with GHK-Cu, the copper tripeptide studied in skin and collagen biology. It is the widest single-vial combination Xenios lists, which is why practitioners running recovery and aesthetic protocols side by side tend to ask for it first. Its documentation status is published on the product record rather than implied by its price.",
    researchContext: [
      "Tissue repair and angiogenesis literature",
      "Collagen and skin biology research",
      "Combined recovery and aesthetic protocol design",
    ],
    storageAndHandling: VIAL_STORAGE,
  },
  {
    internalProductCode: "PEP-003",
    primarySku: "R360-TB500_BPC157_GHKCU_KPV-5MG_5MG_10MG_5MG-VIAL",
    positioning: "A four-compound stack built around joint protocol work.",
    overview:
      "KLOW brings TB-500, BPC-157, GHK-Cu, and KPV into one vial in the ratio the founder workbook records. It was assembled for joint and cartilage protocol design rather than as a general recovery blend. The recorded composition differs from the signed supplier document, and both values are held on the product record until that is settled.",
    researchContext: [
      "Degenerative joint research literature",
      "Cartilage and connective tissue research",
      "Inflammatory signalling literature",
    ],
    storageAndHandling: VIAL_STORAGE,
  },
  {
    internalProductCode: "PEP-004",
    primarySku: "R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL",
    positioning: "Three immune-signalling compounds, one vial.",
    overview:
      "Thymosin alpha-1, KPV, and LL-37 supplied together at the strengths the founder workbook records. Practitioners who were stocking three separate vials hold one instead. It carries the highest wholesale cost in the range, and its price is unsettled pending the founder's formula decision.",
    researchContext: [
      "Immune signalling and modulation literature",
      "Antimicrobial peptide research",
      "Gut barrier and systemic immunity research",
    ],
    storageAndHandling: VIAL_STORAGE,
  },
  {
    internalProductCode: "PEP-005",
    primarySku: "R360-CJC1295_IPAMORELIN-5MG_5MG-VIAL",
    positioning: "The backbone most longevity protocol design is built around.",
    overview:
      "CJC-1295 with ipamorelin, at the strengths the founder workbook records. It is the most reordered configuration in the range, which is the practical reason it is stocked this way rather than as two vials. Availability still runs through the same approval step as everything else here.",
    researchContext: [
      "Growth hormone axis research",
      "Body composition and recovery literature",
      "Longevity protocol design",
    ],
    storageAndHandling: VIAL_STORAGE,
  },
  {
    internalProductCode: "PEP-006",
    primarySku: "R360-PT141-10MG-VIAL",
    positioning: "The most directly requested item in the range.",
    overview:
      "PT-141, also known as bremelanotide, supplied as a research material at 10 mg. Demand for it is concentrated rather than broad, and it is stocked because members ask for it by name. Its documentation state is no different from the rest of the catalog, and that state is published on the record.",
    researchContext: [
      "Melanocortin receptor research",
      "Sexual health research literature",
      "Central and peripheral mechanism studies",
    ],
    storageAndHandling: VIAL_STORAGE,
  },
  {
    internalProductCode: "PEP-007",
    primarySku: "R360-TESAMORELIN-10MG-VIAL",
    positioning: "The strongest regulatory pedigree in the range.",
    overview:
      "Tesamorelin, supplied as a research material at the strength the founder workbook records. Its regulatory status is kept on the product record rather than used as marketing, which is the standing rule here. The signed supplier document states a different strength, and both values are held until that conflict is resolved.",
    researchContext: [
      "Growth hormone releasing factor research",
      "Visceral adipose tissue literature",
      "Body composition research",
    ],
    storageAndHandling: VIAL_STORAGE,
  },
  {
    internalProductCode: "PEP-008",
    primarySku: "R360-GONADORELIN-5MG-VIAL",
    positioning: "The quiet workhorse of hormone protocol design.",
    overview:
      "Gonadorelin at the strength the founder workbook records. It appears in protocol design as a supporting element rather than a headline, and it reorders steadily for exactly that reason. The signed supplier document states a lower strength, and the difference is recorded on the product.",
    researchContext: [
      "Gonadotropin-releasing hormone research",
      "LH and FSH signalling literature",
      "Hormone axis protocol design",
    ],
    storageAndHandling: VIAL_STORAGE,
  },
  {
    internalProductCode: "PEP-009",
    primarySku: "R360-NAD-500MG-VIAL",
    positioning: "The item that appears alongside almost everything else.",
    overview:
      "NAD+ supplied at 500 mg per the founder workbook. It is a dinucleotide coenzyme rather than a peptide, and the catalog records it that way instead of filing it under a class it does not belong to. It is consumable, so it turns over faster than anything else in the range.",
    researchContext: [
      "Cellular energy metabolism research",
      "Sirtuin and mitochondrial function literature",
      "Longevity protocol design",
    ],
    storageAndHandling: VIAL_STORAGE,
  },
  {
    internalProductCode: "PEP-010",
    primarySku: "R360-MOTSC-10MG-VIAL",
    positioning: "A mitochondrial-derived peptide with a fast-moving literature.",
    overview:
      "MOTS-c at 10 mg per the founder workbook. It is one of three items in the catalog still in regulatory review, so it is listed as request access only rather than offered for direct purchase. That position moves on documentation, not on demand.",
    researchContext: [
      "Mitochondrial-derived peptide research",
      "Metabolic flexibility literature",
      "Insulin signalling research",
    ],
    storageAndHandling: VIAL_STORAGE,
  },
  {
    internalProductCode: "PEP-011",
    primarySku: "R360-EPITHALON-10MG-VIAL",
    positioning: "A four-amino-acid peptide at the center of the longevity literature.",
    overview:
      "Epithalon at 10 mg, recorded under the canonical spelling selected in the supplier reconciliation. Epitalon stays searchable as an alias so existing references keep working. It is in regulatory review, so it is listed as request access only.",
    researchContext: [
      "Telomere biology research",
      "Epigenetic regulation literature",
      "Longevity protocol design",
    ],
    storageAndHandling: VIAL_STORAGE,
  },
  {
    internalProductCode: "PEP-012",
    primarySku: "R360-SS31-10MG-VIAL",
    positioning: "The highest-value single vial in the mitochondrial range.",
    overview:
      "SS-31, also known as elamipretide, at the strength the founder workbook records. It anchors mitochondrial and neurological protocol design, which is why it holds the highest per-vial cost among the single compounds here. The signed supplier document states a lower strength, and both values are on the record.",
    researchContext: [
      "Mitochondrial membrane research",
      "Cardiolipin binding literature",
      "Neurological and cardiac research contexts",
    ],
    storageAndHandling: VIAL_STORAGE,
  },
  {
    internalProductCode: "PEP-013",
    primarySku: "R360-SLUPP332-250MCGX100-CAP",
    positioning: "An oral route for members who decline injectables.",
    overview:
      "SLU-PP-332 supplied as capsules, 100 count at 250 mcg per capsule per the founder workbook. It is in the range because a meaningful share of members will not run an injectable protocol at all. The signed supplier document states a different capsule strength and count, and both are recorded.",
    researchContext: [
      "Estrogen-related receptor research",
      "Appetite and neuropeptide signalling literature",
      "Oral protocol design",
    ],
    storageAndHandling: CAPSULE_STORAGE,
  },
  {
    internalProductCode: "PEP-014",
    primarySku: "R360-DIHEXA-10MGX60-CAP",
    positioning: "The oral anchor of neurological protocol design.",
    overview:
      "Dihexa supplied as capsules, 60 count at 10 mg per capsule per the founder workbook. It carries the higher wholesale cost of the two oral items in the range, and it is stocked because neurological protocol design was otherwise entirely injectable. The signed supplier document states a different count, and both are recorded.",
    researchContext: [
      "Hepatocyte growth factor and c-Met research",
      "Synaptogenesis literature",
      "Cognitive research contexts",
    ],
    storageAndHandling: CAPSULE_STORAGE,
  },
  {
    internalProductCode: "PEP-015",
    primarySku: "R360-SEMAX_SELANK_DSIP-10MG_10MG_2MG-VIAL",
    positioning: "Three separate research areas held in one vial.",
    overview:
      "Semax, Selank, and DSIP supplied together at the strengths the founder workbook records. Combining cognitive, mood, and sleep research areas in a single vial is unusual, and it is the practical reason members hold fewer items. It is in regulatory review, so it is listed as request access only.",
    researchContext: [
      "Nootropic peptide research",
      "Neuropeptide and mood research",
      "Sleep regulation research",
    ],
    storageAndHandling: VIAL_STORAGE,
  },
] as const;

export function copyForCode(internalProductCode: string): PeptideCopy | null {
  return (
    PEPTIDE_COPY.find((entry) => entry.internalProductCode === internalProductCode) ?? null
  );
}

/**
 * Copy for a SKU. Every variant of a product resolves to the same copy, because
 * a second vial size does not change what the compound is.
 */
export function copyForSku(sku: string): PeptideCopy | null {
  const owner = PEPTIDE_CATALOG.find((product) =>
    product.variants.some((variant) => variant.sku === sku),
  );
  return owner ? copyForCode(owner.internalProductCode) : null;
}

export function copyForProduct(product: PeptideProduct): PeptideCopy | null {
  return copyForCode(product.internalProductCode);
}

/**
 * Every string in this module that a member could read. The denylist test scans
 * exactly this set, so adding a customer-facing field without adding it here is
 * caught by the count assertion in the test.
 */
export function customerFacingCopyStrings(): readonly string[] {
  const strings: string[] = [RESEARCH_CONTEXT_DISCLOSURE, CATALOG_STATUS_DISCLOSURE];
  for (const entry of PEPTIDE_COPY) {
    strings.push(entry.positioning, entry.overview, entry.storageAndHandling);
    strings.push(...entry.researchContext);
  }
  return strings;
}

/**
 * Copy is complete only when every WORKBOOK product has exactly one entry.
 *
 * The expansion tier gets no copy because we do not carry those compounds yet,
 * and the regulatory hold tier gets no copy on purpose: writing marketing for a
 * compound we have decided not to display would be building the thing the hold
 * exists to prevent.
 */
export function copyCoversCatalog(): boolean {
  const workbook = productsInTier("workbook", PEPTIDE_CATALOG);
  if (PEPTIDE_COPY.length !== workbook.length) return false;
  return workbook.every((product) => {
    const entry = copyForCode(product.internalProductCode);
    const primary = primaryVariant(product);
    return entry !== null && primary !== null && entry.primarySku === primary.sku;
  });
}
