import type { ProductLane } from "@shared/research/catalog";
import {
  PRODUCT_EDUCATION_PRODUCTS,
  type ProductEducationChannel,
  type ProductEducationProductBinding,
} from "./productEducation.generated";

export const EVIDENCE_LABELS = [
  "Established active ingredient",
  "Clinical-stage / investigational",
  "Early human / limited",
  "Preclinical / limited",
  "Legacy / highly uncertain",
  "Related compound / not a peptide",
  "Product-specific / formulation-specific",
] as const;

export type EvidenceLabel = (typeof EVIDENCE_LABELS)[number];

export type ProductEducationProfile = {
  key: string;
  displayName: string;
  aliases: readonly string[];
  whatItIs: string;
  whyPeopleAreInterested: string;
  commonlyDiscussedGoals: readonly string[];
  researchAreas: readonly string[];
  mechanismContext: string;
  observedResearch: string;
  evidenceSourceSummary: string;
  humanEvidence: string;
  evidenceLabel: EvidenceLabel;
  unknowns: readonly string[];
  doesNotProve: readonly string[];
  potentialClinicalRelevance: string;
  regulatoryAndClinicalStatus: string;
  researchAvailability: string;
  careAvailability: string;
  lastReviewed: string;
  sourceNotes: readonly string[];
};

export type ProductEducationLookup = {
  canonicalName: string;
  displayName: string;
  aliases?: readonly string[];
  lane?: ProductLane | string;
  variantLabel?: string | null;
};

type GuideCategory =
  | "metabolic"
  | "tissue"
  | "growth"
  | "mitochondrial"
  | "neuro"
  | "reproductive"
  | "skin"
  | "support";

type GuideEntry = {
  names: readonly string[];
  summary: string;
  evidenceLabel: EvidenceLabel;
  category: GuideCategory;
};

const CATEGORY_CONTEXT: Record<
  GuideCategory,
  { goals: readonly string[]; researchAreas: readonly string[] }
> = {
  metabolic: {
    goals: ["metabolic signaling", "energy balance", "body-weight and glucose-related research"],
    researchAreas: ["incretin, amylin, mitochondrial, or nutrient-sensing pathways", "metabolic markers and energy homeostasis"],
  },
  tissue: {
    goals: ["tissue biology", "recovery research", "inflammatory or barrier signaling"],
    researchAreas: ["cell migration, extracellular-matrix, or collagen models", "inflammatory, gastrointestinal, skin, or immune pathways"],
  },
  growth: {
    goals: ["growth-hormone-axis research", "endocrine signaling", "muscle-biology research"],
    researchAreas: ["GHRH, ghrelin-receptor, GH, or IGF signaling", "experimental growth and regeneration models"],
  },
  mitochondrial: {
    goals: ["mitochondrial function", "cellular energy", "oxidative-stress and aging research"],
    researchAreas: ["mitochondrial membranes and redox biology", "cellular stress, energy, and aging models"],
  },
  neuro: {
    goals: ["cognition and attention research", "stress or sleep signaling", "neuroplasticity research"],
    researchAreas: ["neurotrophin, neurotransmitter, or synaptic pathways", "preclinical and limited human neurobehavioral research"],
  },
  reproductive: {
    goals: ["reproductive-axis signaling", "sexual-response research", "pigmentation or social-signaling research"],
    researchAreas: ["GnRH, gonadotropin, melanocortin, or oxytocin pathways", "defined prescription contexts and separate investigational uses"],
  },
  skin: {
    goals: ["skin appearance", "collagen and extracellular-matrix research", "hair or wound-biology research"],
    researchAreas: ["topical formulation and cosmetic signaling", "skin, hair-follicle, collagen, or wound models"],
  },
  support: {
    goals: [],
    researchAreas: ["product-specific handling, formulation, or support use"],
  },
};

// Entries are paraphrased only from the approved local Xenios education guide.
// More-specific blend identities intentionally precede their components after sorting.
const GUIDE_ENTRIES: readonly GuideEntry[] = [
  { names: ["bpc 157 tb 500 ghk cu kpv", "klow"], summary: "An experimental blend of BPC-157, thymosin-beta-4-related, copper-peptide, and KPV pathways; the exact combination has no established synergy.", evidenceLabel: "Preclinical / limited", category: "tissue" },
  { names: ["bpc 157 tb 500 ghk cu", "glow"], summary: "An experimental blend of BPC-157, thymosin-beta-4-related, and GHK-Cu matrix pathways; the exact combination has no established synergy.", evidenceLabel: "Preclinical / limited", category: "tissue" },
  { names: ["aod 9604 mots c tesamorelin ipamorelin"], summary: "An experimental combination spanning metabolic, GHRH, and ghrelin-receptor pathways.", evidenceLabel: "Product-specific / formulation-specific", category: "metabolic" },
  { names: ["thymosin alpha 1 kpv ll 37"], summary: "An experimental blend spanning immune-modulatory, inflammatory, and antimicrobial-peptide research pathways.", evidenceLabel: "Preclinical / limited", category: "tissue" },
  { names: ["semax selank dsip"], summary: "An experimental multi-peptide neuroactive blend with no established benefit or synergy for focus, mood, anxiety, or sleep.", evidenceLabel: "Legacy / highly uncertain", category: "neuro" },
  { names: ["cagrilintide semaglutide"], summary: "An investigational combination of amylin-analog and GLP-1-receptor pathways; a Research blend is not an approved product.", evidenceLabel: "Clinical-stage / investigational", category: "metabolic" },
  { names: ["retatrutide cagrilintide"], summary: "An experimental combination of a triple-receptor agonist and an amylin analog; the exact blend is not an established therapy.", evidenceLabel: "Clinical-stage / investigational", category: "metabolic" },
  { names: ["semaglutide bpc 157"], summary: "An experimental combination of GLP-1 signaling and preclinical tissue-biology research; safety and synergy are not established for the exact blend.", evidenceLabel: "Product-specific / formulation-specific", category: "metabolic" },
  { names: ["ghk cu epithalon"], summary: "An experimental combination of copper-peptide matrix research and a pineal tetrapeptide; evidence for the exact blend is not established.", evidenceLabel: "Legacy / highly uncertain", category: "skin" },
  { names: ["cjc 1295 ipamorelin"], summary: "An experimental blend of GHRH-receptor and ghrelin-receptor signaling; DAC and non-DAC forms are not interchangeable.", evidenceLabel: "Early human / limited", category: "growth" },
  { names: ["bpc 157 tb 500", "blend bpc 157 tb 500"], summary: "An experimental blend of BPC-157-related tissue models and thymosin-beta-4-related actin and cell-migration biology.", evidenceLabel: "Preclinical / limited", category: "tissue" },
  { names: ["dsip selank"], summary: "An experimental blend of two neuroactive peptides with different proposed sleep, stress, and signaling pathways; synergy is not established.", evidenceLabel: "Legacy / highly uncertain", category: "neuro" },
  { names: ["thymosin alpha 1 thymulin"], summary: "An experimental blend of thymic immune and neuroendocrine peptide pathways with limited evidence for the exact combination.", evidenceLabel: "Preclinical / limited", category: "tissue" },
  { names: ["5 amino 1mq"], summary: "A non-peptide NNMT-inhibitor research compound studied in adipose metabolism and energy-balance models.", evidenceLabel: "Related compound / not a peptide", category: "metabolic" },
  { names: ["slu pp 332"], summary: "A non-peptide estrogen-related-receptor agonist studied in preclinical oxidative-metabolism models.", evidenceLabel: "Related compound / not a peptide", category: "metabolic" },
  { names: ["bpc 157"], summary: "A synthetic peptide studied in preclinical tissue, gastrointestinal, angiogenesis, nitric-oxide, and collagen models.", evidenceLabel: "Preclinical / limited", category: "tissue" },
  { names: ["tb 500", "thymosin beta 4"], summary: "A thymosin-beta-4-related Research peptide studied in actin, cell-migration, angiogenesis, inflammation, and tissue models.", evidenceLabel: "Preclinical / limited", category: "tissue" },
  { names: ["ghk cu"], summary: "A copper-binding tripeptide studied in extracellular-matrix, collagen, skin, hair, and wound-biology research; evidence depends on route and formulation.", evidenceLabel: "Early human / limited", category: "skin" },
  { names: ["mots c"], summary: "A mitochondrial-derived peptide studied in AMPK, glucose-utilization, stress-adaptation, and metabolic-homeostasis models.", evidenceLabel: "Preclinical / limited", category: "metabolic" },
  { names: ["semax"], summary: "A synthetic ACTH-fragment analog studied in neurotrophin, neuroprotection, attention, and cognition pathways.", evidenceLabel: "Early human / limited", category: "neuro" },
  { names: ["selank"], summary: "A tuftsin-analog neuropeptide studied in stress, GABAergic, neurotrophin, and immune signaling.", evidenceLabel: "Early human / limited", category: "neuro" },
  { names: ["dsip"], summary: "A legacy peptide investigated in sleep, stress, and pain research, with mixed findings and unresolved endogenous biology.", evidenceLabel: "Legacy / highly uncertain", category: "neuro" },
  { names: ["dihexa"], summary: "A highly uncertain peptidomimetic associated with HGF/c-Met and synaptogenesis research; key foundational papers were retracted.", evidenceLabel: "Legacy / highly uncertain", category: "neuro" },
  { names: ["pe 22 28"], summary: "A spadin-derived TREK-1-blocking peptide studied in rodent neurobehavioral and neurogenesis models.", evidenceLabel: "Preclinical / limited", category: "neuro" },
  { names: ["bdnf"], summary: "An endogenous protein growth factor used as an experimental Research material in neuronal-survival and plasticity models.", evidenceLabel: "Preclinical / limited", category: "neuro" },
  { names: ["semaglutide"], summary: "A GLP-1 analog active ingredient with approved prescription products for specific uses; Research material is not automatically an approved branded drug.", evidenceLabel: "Established active ingredient", category: "metabolic" },
  { names: ["tirzepatide"], summary: "A dual GIP and GLP-1 receptor agonist active ingredient with approved prescription products for specific metabolic indications.", evidenceLabel: "Established active ingredient", category: "metabolic" },
  { names: ["liraglutide"], summary: "A long-acting GLP-1 analog active ingredient with approved prescription products for defined uses.", evidenceLabel: "Established active ingredient", category: "metabolic" },
  { names: ["retatrutide", "glp 3"], summary: "An investigational GIP, GLP-1, and glucagon receptor agonist studied in human metabolic trials; it is not FDA-approved.", evidenceLabel: "Clinical-stage / investigational", category: "metabolic" },
  { names: ["cagrilintide"], summary: "An investigational long-acting amylin analog studied in human metabolic research, alone and with semaglutide.", evidenceLabel: "Clinical-stage / investigational", category: "metabolic" },
  { names: ["survodutide"], summary: "An investigational glucagon and GLP-1 receptor agonist studied in human body-weight and liver-disease research.", evidenceLabel: "Clinical-stage / investigational", category: "metabolic" },
  { names: ["aod 9604"], summary: "A modified human-growth-hormone fragment studied in fat-metabolism signaling; evidence is mixed and it is not approved.", evidenceLabel: "Preclinical / limited", category: "metabolic" },
  { names: ["bam15"], summary: "A non-peptide mitochondrial uncoupler studied in animal models of nutrient oxidation and metabolic biology.", evidenceLabel: "Related compound / not a peptide", category: "metabolic" },
  { names: ["tesofensine"], summary: "A non-peptide monoamine reuptake inhibitor studied for appetite and weight-related outcomes; it is not an approved weight-management drug.", evidenceLabel: "Clinical-stage / investigational", category: "metabolic" },
  { names: ["nad"], summary: "A cellular redox coenzyme and metabolite involved in energy, mitochondrial, DNA-repair-enzyme, and sirtuin biology; it is not a peptide.", evidenceLabel: "Related compound / not a peptide", category: "mitochondrial" },
  { names: ["ibutamoren", "mk 677"], summary: "A non-peptide ghrelin-receptor agonist and growth-hormone secretagogue with limited human research; it is investigational.", evidenceLabel: "Early human / limited", category: "growth" },
  { names: ["kpv"], summary: "An alpha-MSH-derived tripeptide studied in preclinical inflammatory, intestinal, skin, and immune pathways.", evidenceLabel: "Preclinical / limited", category: "tissue" },
  { names: ["ara 290", "cibinetide"], summary: "An innate-repair-receptor peptide investigated in small human studies of neuropathy, inflammation, and tissue protection.", evidenceLabel: "Early human / limited", category: "tissue" },
  { names: ["thymosin alpha 1"], summary: "An immunomodulatory thymic peptide with human clinical history that depends on jurisdiction, product, and indication.", evidenceLabel: "Early human / limited", category: "tissue" },
  { names: ["ll 37", "cap 18"], summary: "A human cathelicidin antimicrobial peptide studied in microbial-membrane, innate-immune, inflammatory, wound, and cell-signaling pathways.", evidenceLabel: "Preclinical / limited", category: "tissue" },
  { names: ["glutathione"], summary: "A tripeptide antioxidant involved in cellular redox and detoxification reactions; evidence depends heavily on route and formulation.", evidenceLabel: "Product-specific / formulation-specific", category: "mitochondrial" },
  { names: ["larazotide"], summary: "A tight-junction-modulating peptide studied in human celiac-disease adjunctive trials; it is not an established approved treatment.", evidenceLabel: "Clinical-stage / investigational", category: "tissue" },
  { names: ["cartalax", "aed t 31"], summary: "A short tripeptide studied in preclinical connective-tissue, cartilage, stem-cell, and gene-expression models.", evidenceLabel: "Preclinical / limited", category: "tissue" },
  { names: ["thymalin"], summary: "A thymus-derived polypeptide complex associated with older immune and aging research; standardization and modern evidence are limited.", evidenceLabel: "Legacy / highly uncertain", category: "tissue" },
  { names: ["thymulin"], summary: "A zinc-dependent thymic peptide studied in experimental immune and neuroendocrine signaling.", evidenceLabel: "Preclinical / limited", category: "tissue" },
  { names: ["curcumin"], summary: "A non-peptide plant polyphenol studied in inflammatory and oxidative pathways; absorption and formulation affect the evidence.", evidenceLabel: "Related compound / not a peptide", category: "tissue" },
  { names: ["colostrum"], summary: "A supplement category containing proteins, immunoglobulins, growth factors, and peptides rather than one peptide active ingredient.", evidenceLabel: "Related compound / not a peptide", category: "support" },
  { names: ["cjc 1295 with dac"], summary: "A long-acting albumin-binding GHRH analog with early human GH and IGF-1 research; it remains investigational.", evidenceLabel: "Early human / limited", category: "growth" },
  { names: ["cjc 1295", "modified grf 1 29"], summary: "A short-acting GHRH analog used in research of pituitary GH release; non-DAC and DAC forms are distinct.", evidenceLabel: "Early human / limited", category: "growth" },
  { names: ["sermorelin"], summary: "A GHRH 1-29 analog with historical human use and current provider-led compounded contexts.", evidenceLabel: "Early human / limited", category: "growth" },
  { names: ["tesamorelin"], summary: "A GHRF analog active ingredient with an approved product for one specific HIV-lipodystrophy indication, not general weight management.", evidenceLabel: "Established active ingredient", category: "growth" },
  { names: ["ipamorelin"], summary: "A ghrelin-receptor growth-hormone secretagogue with limited human pharmacology data and no approved therapeutic use.", evidenceLabel: "Early human / limited", category: "growth" },
  { names: ["ghrp 2"], summary: "A synthetic ghrelin-receptor agonist studied in GH-release and downstream endocrine research.", evidenceLabel: "Preclinical / limited", category: "growth" },
  { names: ["ghrp 6"], summary: "A synthetic ghrelin-receptor agonist studied in GH secretion and appetite-related signaling.", evidenceLabel: "Preclinical / limited", category: "growth" },
  { names: ["hexarelin"], summary: "A synthetic ghrelin-receptor GH secretagogue studied in endocrine and cardiac signaling; long-term therapeutic safety is not established.", evidenceLabel: "Preclinical / limited", category: "growth" },
  { names: ["hgh", "somatropin"], summary: "Recombinant human growth hormone with approved prescription products for specific defined indications; it is not a general anti-aging or performance product.", evidenceLabel: "Established active ingredient", category: "growth" },
  { names: ["igf 1 lr3"], summary: "A modified long-acting IGF-1 analog used as a laboratory Research tool; it is not an approved treatment.", evidenceLabel: "Preclinical / limited", category: "growth" },
  { names: ["igf 1 des"], summary: "A truncated IGF-1 analog used in experimental systems; human safety and therapeutic effectiveness are not established.", evidenceLabel: "Preclinical / limited", category: "growth" },
  { names: ["peg mgf", "mgf"], summary: "An IGF-1-splice-variant-related Research compound studied in cell and animal regeneration models.", evidenceLabel: "Preclinical / limited", category: "growth" },
  { names: ["follistatin 344"], summary: "An activin- and myostatin-binding protein used in experimental muscle research; vialed products are not established therapies.", evidenceLabel: "Preclinical / limited", category: "growth" },
  { names: ["ss 31", "elamipretide"], summary: "A mitochondria-targeting tetrapeptide studied in cardiolipin, membrane, oxidative-stress, and energy pathways with human clinical development.", evidenceLabel: "Clinical-stage / investigational", category: "mitochondrial" },
  { names: ["epithalon", "epitalon"], summary: "An experimental pineal tetrapeptide associated with cell and legacy aging research; findings do not establish human age reversal or lifespan extension.", evidenceLabel: "Legacy / highly uncertain", category: "mitochondrial" },
  { names: ["pinealon"], summary: "A legacy EDR tripeptide studied in regional neuronal, oxidative-stress, cognition, and aging literature with limited independent validation.", evidenceLabel: "Legacy / highly uncertain", category: "neuro" },
  { names: ["foxo4 dri"], summary: "A preclinical retro-inverso peptide studied in FOXO4-p53 and senescent-cell models; it is not an established anti-aging therapy.", evidenceLabel: "Preclinical / limited", category: "mitochondrial" },
  { names: ["gonadorelin"], summary: "Synthetic GnRH with established diagnostic and prescription contexts involving pituitary LH and FSH release.", evidenceLabel: "Established active ingredient", category: "reproductive" },
  { names: ["kisspeptin"], summary: "A reproductive-axis peptide studied in human fertility and endocrine research through kisspeptin, GnRH, LH, and FSH signaling.", evidenceLabel: "Clinical-stage / investigational", category: "reproductive" },
  { names: ["hcg", "human chorionic gonadotropin"], summary: "A glycoprotein hormone active ingredient with approved prescription products for defined fertility and endocrine indications.", evidenceLabel: "Established active ingredient", category: "reproductive" },
  { names: ["oxytocin"], summary: "An endogenous peptide active ingredient with approved obstetric uses and separate investigational reproductive and social-signaling research.", evidenceLabel: "Established active ingredient", category: "reproductive" },
  { names: ["pt 141", "bremelanotide"], summary: "A melanocortin-receptor agonist active ingredient with one narrow approved provider use; Research material is not automatically that approved product.", evidenceLabel: "Established active ingredient", category: "reproductive" },
  { names: ["melanotan i", "afamelanotide"], summary: "An alpha-MSH-related MC1R agonist; an approved afamelanotide implant exists for a specific disease, not general tanning.", evidenceLabel: "Established active ingredient", category: "reproductive" },
  { names: ["melanotan ii"], summary: "An unapproved melanocortin-receptor agonist studied in pigmentation, appetite, and sexual-response signaling.", evidenceLabel: "Early human / limited", category: "reproductive" },
  { names: ["snap 8", "acetyl octapeptide 3"], summary: "A topical cosmetic peptide studied in skin-surface SNARE-complex signaling and the appearance of expression lines; formulation and penetration matter.", evidenceLabel: "Product-specific / formulation-specific", category: "skin" },
  { names: ["exosome cream", "radient xo serum"], summary: "A topical exosome-labeled product rather than a peptide; composition, source, characterization, stability, and evidence are product specific.", evidenceLabel: "Product-specific / formulation-specific", category: "skin" },
  { names: ["acetic acid 0 6", "reconstitution solution"], summary: "A formulation or laboratory support solution rather than a peptide; handling depends on the exact label and authorized workflow.", evidenceLabel: "Related compound / not a peptide", category: "support" },
] as const;

const SORTED_GUIDE_ENTRIES = [...GUIDE_ENTRIES].sort(
  (left, right) => Math.max(...right.names.map((name) => name.length)) - Math.max(...left.names.map((name) => name.length)),
);

const ALWAYS_UNKNOWN = [
  "Long-term human safety may be unknown.",
  "The exact product, route, dose, formulation, and combination may not match published research.",
  "A Research listing does not establish Care formulary availability.",
] as const;

const ALWAYS_DOES_NOT_PROVE = [
  "A mechanism is not proof of a clinical outcome.",
  "Anecdotal reports are not controlled evidence.",
  "A Certificate of Analysis does not establish clinical suitability.",
] as const;

const BLEND_LIMITATION =
  "The presence of individually studied components does not establish the safety, effectiveness, stability, or clinical value of the exact combination.";

function normalizeProductName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function channelOrderForLane(lane: string | undefined): readonly ProductEducationChannel[] {
  if (lane === "research" || lane === "research_material") return ["research"];
  if (lane === "future_clinical" || lane === "clinician_guided_care") return ["clinical"];
  if (lane === "supplement") return ["supplement"];
  if (lane === "laboratory_supply") return ["research", "pending"];
  if (lane === "storage_accessory") return ["nonclinical", "pending"];
  if (lane === "quantum") return ["nonclinical", "pending", "supplement"];
  if (lane === "non_product_program") return ["pending", "nonclinical", "supplement"];
  return ["research", "clinical", "pending", "supplement", "nonclinical"];
}

export function resolveProductEducationBinding(
  lookup: ProductEducationLookup,
): ProductEducationProductBinding | null {
  const names = [lookup.canonicalName, lookup.displayName, ...(lookup.aliases ?? [])]
    .map(normalizeProductName)
    .filter(Boolean);
  const channels = channelOrderForLane(lookup.lane);
  for (const channel of channels) {
    const match = PRODUCT_EDUCATION_PRODUCTS.find(
      (product) => product.channel === channel && names.includes(product.normalizedName),
    );
    if (match) return match;
  }
  return null;
}

function guideEntryFor(names: readonly string[]): GuideEntry | null {
  const normalizedNames = names.map(normalizeProductName).filter(Boolean);
  return (
    SORTED_GUIDE_ENTRIES.find((entry) =>
      entry.names.some((alias) =>
        normalizedNames.some(
          (name) => name === alias || ` ${name} `.includes(` ${alias} `),
        ),
      ),
    ) ?? null
  );
}

function humanEvidenceFor(label: EvidenceLabel): string {
  if (label === "Established active ingredient") {
    return "Human evidence and approved products exist in specific contexts for the active ingredient. That evidence does not automatically apply to this exact formulation, source, concentration, combination, or proposed use.";
  }
  if (label === "Clinical-stage / investigational") {
    return "Human studies exist, but the compound or proposed use remains investigational. Study results do not establish routine clinical use for this exact product.";
  }
  if (label === "Early human / limited") {
    return "Some human data exist, but the evidence is small, incomplete, route-specific, formulation-specific, or insufficient for routine outcome claims.";
  }
  if (label === "Preclinical / limited") {
    return "The approved source describes mainly cell, animal, mechanistic, or otherwise preclinical evidence. Preclinical findings do not establish a human treatment benefit.";
  }
  if (label === "Legacy / highly uncertain") {
    return "Human evidence is absent, limited, old, inconsistent, regionally concentrated, or affected by major uncertainty. It does not establish a dependable clinical outcome.";
  }
  if (label === "Related compound / not a peptide") {
    return "Evidence depends on the exact non-peptide compound, product, route, formulation, and intended context. The catalog identity alone does not establish a human benefit.";
  }
  return "No reviewed human-evidence summary has been published for this exact formulation. Any clinical interpretation requires the exact source record and licensed review.";
}

function availabilityFor(lane: string | undefined) {
  if (lane === "future_clinical" || lane === "clinician_guided_care") {
    return {
      researchAvailability: "A provider-only formulation is not automatically available through Xenios Research. Any separate Research listing retains its own source, documentation, price, and authorization.",
      careAvailability: "Available only through independent review by a U.S.-licensed clinician and current pharmacy serviceability. A listing does not guarantee suitability, a prescription, or fulfillment.",
    };
  }
  if (lane === "research" || lane === "research_material" || lane === "laboratory_supply") {
    return {
      researchAvailability: "Available through Xenios Research only when the exact approved catalog, documentation, pricing, and availability records permit. It remains nonclinical.",
      careAvailability: "A Research listing does not establish Care formulary availability, clinical suitability, or a prescription pathway.",
    };
  }
  if (lane === "supplement") {
    return {
      researchAvailability: "Availability depends on the exact approved supplement record, label, pricing verification, and operational status.",
      careAvailability: "A supplement listing is not a clinical recommendation and does not establish Care eligibility or formulary status.",
    };
  }
  return {
    researchAvailability: "Availability depends on the exact approved classification, product record, documentation, pricing rule, and operational status.",
    careAvailability: "This listing does not establish Care eligibility, clinical suitability, a prescription, or pharmacy serviceability.",
  };
}

function genericIdentityText(
  displayName: string,
  binding: ProductEducationProductBinding | null,
  variantLabel: string | null | undefined,
) {
  const formulation = variantLabel?.trim() || binding?.variants[0]?.formulation;
  const dosageForm = binding?.variants[0]?.dosageForm;
  const details = [formulation, dosageForm].filter(Boolean).join(" · ");
  return details
    ? `${displayName} is the exact catalog identity for the selected ${details} record. Its pathway and product-specific source records govern how it may be described or accessed.`
    : `${displayName} is an exact catalog identity. Its pathway and product-specific source records govern how it may be described or accessed.`;
}

export function getProductEducationProfile(
  lookup: ProductEducationLookup,
): ProductEducationProfile {
  const displayName = lookup.displayName || lookup.canonicalName;
  const aliases = [...new Set((lookup.aliases ?? []).filter(Boolean))];
  const names = [lookup.canonicalName, displayName, ...aliases];
  const guide = guideEntryFor(names);
  const binding = resolveProductEducationBinding(lookup);
  const category = guide ? CATEGORY_CONTEXT[guide.category] : null;
  const isClinical = lookup.lane === "future_clinical" || lookup.lane === "clinician_guided_care";
  const isResearch = lookup.lane === "research" || lookup.lane === "research_material" || lookup.lane === "laboratory_supply";
  const isBlend = names.some((name) => name.includes("+") || /\bblend\b/i.test(name));
  const evidenceLabel = guide?.evidenceLabel ?? "Product-specific / formulation-specific";
  const availability = availabilityFor(lookup.lane);

  const whyPeopleAreInterested = isClinical && !guide
    ? "People may seek this formulation in connection with goals discussed with a licensed clinical team. The exact clinical rationale, expected benefit, risks, alternatives, and monitoring depend on the individual assessment and prescribed formulation."
    : category && category.goals.length > 0
      ? `People commonly discuss ${displayName} in connection with ${category.goals.join(", ")}. That reflects public interest, anecdotal reports, practitioner conversation, and market attention. It does not establish that the product is safe, effective, or appropriate for a particular person.`
      : `People commonly discuss ${displayName} in connection with product-specific research, formulation, or access questions. That attention does not establish that the product is safe, effective, or appropriate for a particular person.`;

  const genericUncertainty = isResearch
    ? "No reviewed outcome summary has been published for this exact Research formulation. Preclinical findings, mechanisms, and market interest do not establish a human treatment benefit."
    : "No reviewed outcome summary has been published for this exact formulation. Product identity and pathway status do not establish a benefit or personal suitability.";

  return {
    key: `${lookup.lane ?? binding?.channel ?? "unclassified"}:${normalizeProductName(lookup.canonicalName || displayName)}`,
    displayName,
    aliases,
    whatItIs: guide
      ? `${genericIdentityText(displayName, binding, lookup.variantLabel)} The approved Xenios education guide describes it as ${guide.summary.charAt(0).toLowerCase()}${guide.summary.slice(1)}`
      : genericIdentityText(displayName, binding, lookup.variantLabel),
    whyPeopleAreInterested,
    commonlyDiscussedGoals: category?.goals ?? [],
    researchAreas: category?.researchAreas ?? [],
    mechanismContext: guide
      ? `Researchers discuss the biological context summarized in the approved guide: ${guide.summary} A proposed mechanism remains a research hypothesis, not proof of a personal outcome.`
      : "No reviewed mechanism summary has been published for this exact formulation. A name, ingredient, or proposed mechanism is not proof of a clinical outcome.",
    observedResearch: guide
      ? `The approved guide summarizes research interest in ${guide.summary.charAt(0).toLowerCase()}${guide.summary.slice(1)} Those observations do not establish an outcome for the exact catalog formulation.`
      : genericUncertainty,
    evidenceSourceSummary: guide
      ? "The approved local Xenios education guide supplies the scientific-context summary and evidence label. Exact product, variant, pathway, price, documentation, and availability fields remain source-authoritative in the catalog."
      : "The exact canonical product and variant record supplies identity and pathway context. No additional scientific claim is inferred when the approved education guide does not describe the exact formulation.",
    humanEvidence: humanEvidenceFor(evidenceLabel),
    evidenceLabel,
    unknowns: [
      ...ALWAYS_UNKNOWN,
      ...(isBlend ? [BLEND_LIMITATION] : []),
    ],
    doesNotProve: [
      ...ALWAYS_DOES_NOT_PROVE,
      ...(isBlend ? [BLEND_LIMITATION] : []),
    ],
    potentialClinicalRelevance: isClinical
      ? "Potential clinical relevance, risks, alternatives, monitoring, and the exact prescribed formulation can be determined only by the licensed clinical team after individual review."
      : "Research interest does not create clinical relevance for an individual. Any clinical question belongs to a separate licensed-care pathway and source-authoritative formulary review.",
    regulatoryAndClinicalStatus: evidenceLabel === "Established active ingredient"
      ? "FDA-approved products exist for specific uses of this active ingredient. That does not mean every compounded formulation, Research material, source, concentration, combination, or proposed use is FDA-approved."
      : isClinical
        ? "This is a provider-only formulation. It requires licensed clinical review, an appropriate prescription when applicable, and pharmacy serviceability. The exact formulation is not represented as FDA-approved unless its source record establishes that fact."
        : "This listing does not establish an approved drug, indication, treatment, or clinical use. Research material and provider medication are not interchangeable.",
    ...availability,
    lastReviewed: "August 31, 2026",
    sourceNotes: guide
      ? ["Exact canonical catalog and selected variant record", "Xenios Peptide and Research Compound Education Guide, approved local edition"]
      : ["Exact canonical catalog and selected variant record", "Customer-safe product-specific limitation when no exact guide entry is available"],
  };
}
