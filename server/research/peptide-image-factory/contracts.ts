export const PEPTIDE_VISUAL_TEMPLATES = ["renew_360", "raw_peptides_internal"] as const;
export type PeptideVisualTemplate = (typeof PEPTIDE_VISUAL_TEMPLATES)[number];

export const PEPTIDE_CONTAINER_KINDS = [
  "vial",
  "capsule_bottle",
  "sterile_solution",
  "source_vial",
] as const;
export type PeptideContainerKind = (typeof PEPTIDE_CONTAINER_KINDS)[number];

export const PEPTIDE_SOURCE_ACTIONS = [
  "HELD_PENDING_GATES",
  "REQUEST_ACCESS",
  "UNAVAILABLE",
] as const;
export type PeptideSourceAction = (typeof PEPTIDE_SOURCE_ACTIONS)[number];

export const PEPTIDE_VISUAL_STATES = [
  "held_pending_exact_render",
  "review_pending",
  "approved_exact_variant",
  "unavailable",
] as const;
export type PeptideVisualState = (typeof PEPTIDE_VISUAL_STATES)[number];

export const PEPTIDE_MEDIA_CONTEXTS = ["catalog", "detail", "cart"] as const;
export type PeptideMediaContext = (typeof PEPTIDE_MEDIA_CONTEXTS)[number];

export const GENERATED_RENDER_SOURCE_TYPE = "xenios_generated_render" as const;
export const GENERATED_RENDER_PROVENANCE = "generated_product_render" as const;

export type PeptideMediaPlanEntry = {
  productId: string;
  productName: string;
  variantId: string;
  sku: string;
  strength: string;
  presentation: string;
  container: PeptideContainerKind;
  template: PeptideVisualTemplate;
  sourceAction: PeptideSourceAction;
  visualState: PeptideVisualState;
  sourceWorkbookSha256: string;
};

const SAFE_IDENTIFIER = /^[A-Z0-9][A-Z0-9._+-]{0,119}$/;
const FORBIDDEN_CUSTOMER_CLAIMS =
  /\b(?:lot|expiry|expires|coa|purity|steril(?:e|ity)|endotoxin|dose|dosing|treats?|cures?|potency)\b/i;

export function normalizeContainer(presentation: string): PeptideContainerKind {
  if (presentation === "Capsule bottle") return "capsule_bottle";
  if (presentation === "Sterile solution") return "sterile_solution";
  if (presentation === "Vial / source presentation") return "source_vial";
  if (presentation === "Vial") return "vial";
  throw new RangeError(`Unsupported peptide media presentation: ${presentation}`);
}

export function defaultVisualState(sourceAction: PeptideSourceAction): PeptideVisualState {
  return sourceAction === "UNAVAILABLE" ? "unavailable" : "held_pending_exact_render";
}

export function templateForVariant(variantId: string): PeptideVisualTemplate {
  return variantId.startsWith("RAW-") ? "raw_peptides_internal" : "renew_360";
}

export function validatePeptideMediaPlanEntry(entry: PeptideMediaPlanEntry): string[] {
  const issues: string[] = [];
  for (const [field, value] of [
    ["productId", entry.productId],
    ["variantId", entry.variantId],
    ["sku", entry.sku],
  ] as const) {
    if (!SAFE_IDENTIFIER.test(value)) issues.push(`${field} is not a canonical identifier`);
  }
  for (const [field, value] of [
    ["productName", entry.productName],
    ["strength", entry.strength],
    ["presentation", entry.presentation],
  ] as const) {
    if (value.trim().length === 0 || value.length > 160) issues.push(`${field} is missing or too long`);
  }
  if (FORBIDDEN_CUSTOMER_CLAIMS.test(entry.productName)) {
    issues.push("productName contains a prohibited unverified claim field");
  }
  if (entry.template !== templateForVariant(entry.variantId)) {
    issues.push("template does not match the exact variant namespace");
  }
  if (entry.container !== normalizeContainer(entry.presentation)) {
    issues.push("container does not match the exact presentation");
  }
  if (entry.visualState !== defaultVisualState(entry.sourceAction)) {
    issues.push("source rows must enter the image factory in a held or unavailable state");
  }
  if (!/^[a-f0-9]{64}$/.test(entry.sourceWorkbookSha256)) {
    issues.push("sourceWorkbookSha256 must be a lowercase SHA-256 digest");
  }
  return issues;
}

export function containsForbiddenLabelClaim(text: string): boolean {
  return FORBIDDEN_CUSTOMER_CLAIMS.test(text);
}
