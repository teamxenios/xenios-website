import {
  GENERATED_RENDER_PROVENANCE,
  GENERATED_RENDER_SOURCE_TYPE,
  PEPTIDE_MEDIA_CONTEXTS,
  containsForbiddenLabelClaim,
  type PeptideMediaContext,
  type PeptideMediaPlanEntry,
} from "./contracts";

export type PeptideReviewAsset = {
  variantId: string;
  sku: string;
  strength: string;
  presentation: string;
  sourceWorkbookSha256: string;
  sourceType: typeof GENERATED_RENDER_SOURCE_TYPE;
  provenanceTag: typeof GENERATED_RENDER_PROVENANCE;
  renderedLabelText: string;
  contexts: readonly PeptideMediaContext[];
  transparent: boolean;
  rawPeptidesRightsEvidence: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
};

export type PeptideMediaApprovalDecision =
  | { approved: true }
  | { approved: false; reasons: string[] };

function isIsoTimestamp(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

export function evaluatePeptideMediaApproval(
  plan: PeptideMediaPlanEntry,
  asset: PeptideReviewAsset,
): PeptideMediaApprovalDecision {
  const reasons: string[] = [];
  for (const field of ["variantId", "sku", "strength", "presentation", "sourceWorkbookSha256"] as const) {
    if (asset[field] !== plan[field]) reasons.push(`${field} does not match the exact planned variant`);
  }
  if (asset.sourceType !== GENERATED_RENDER_SOURCE_TYPE) reasons.push("source type is not a Xenios generated render");
  if (asset.provenanceTag !== GENERATED_RENDER_PROVENANCE) reasons.push("generated render provenance is false");
  if (!asset.transparent) reasons.push("transparent review master is missing");
  for (const context of PEPTIDE_MEDIA_CONTEXTS) {
    if (!asset.contexts.includes(context)) reasons.push(`${context} presentation is missing`);
  }
  if (!asset.renderedLabelText.includes(plan.productName)) reasons.push("exact product name is absent from the label");
  if (!asset.renderedLabelText.includes(plan.strength)) reasons.push("exact strength is absent from the label");
  if (!asset.renderedLabelText.includes(plan.sku)) reasons.push("exact SKU is absent from the label");
  if (containsForbiddenLabelClaim(asset.renderedLabelText)) reasons.push("label contains an unverified claim field");
  if (plan.template === "raw_peptides_internal" && !asset.rawPeptidesRightsEvidence) {
    reasons.push("Raw Peptides rights evidence is not on file");
  }
  if (!asset.approvedBy?.trim()) reasons.push("named media approver is missing");
  if (!isIsoTimestamp(asset.approvedAt)) reasons.push("media approval timestamp is missing or invalid");
  return reasons.length === 0 ? { approved: true } : { approved: false, reasons };
}
