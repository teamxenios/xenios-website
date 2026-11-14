// Private, pure preflight. All inputs are server-loaded, never customer assertions.
// A result authorizes no action: the live issuer must load these under its private
// transaction, authorize the acting principal and enforce current seller/category clearance.
import type { RequestIntentDetail, RequestIntentLine } from "../../../../shared/research/assisted-order/request-intent";
import type { AssistedOrderQuoteRequestLines } from "./ports";

type SourceLine = Pick<RequestIntentLine, "productId" | "variantId" | "sourceVariantId" | "quantity" | "catalogVersion" | "workflowMode" | "researchUseOnly" | "clinicalReviewRequired">;
type Intent = Pick<RequestIntentDetail, "kind" | "status" | "requestId" | "publicReference"> & { readonly lines: readonly SourceLine[] };
type IssueLine = Awaited<ReturnType<AssistedOrderQuoteRequestLines["linesFor"]>>[number];

// Persisted crosswalk and clearance evidence, supplied only by the approved
// issuing authority. An XRI product/variant or owner hash is NOT an issue line ID.
export type XriApprovedLineBinding = Readonly<{
  xriRequestId: string; xriReference: string; issueRequestId: string;
  issueLineId: string; sellerId: string; approvalEvidenceId: string;
  clearedForQuotation: boolean; source: SourceLine;
}>;
export type BoundQuoteLine = Readonly<{
  requestLineId: string; productId: string; variantId: string; quantity: number;
}>;
const refuse = (): never => { throw new Error("Quote source lines are not fully verified."); };
const present = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s === s.trim();
const key = (line: Pick<SourceLine, "productId" | "variantId">) => JSON.stringify([line.productId,line.variantId]);

export function bindReviewedXriQuoteLines(
  intent: Intent, target: Readonly<{ requestId: string; sellerId: string; lines: readonly IssueLine[] }>,
  // Only lines intentionally included in this proposed private quote.
  bindings: readonly XriApprovedLineBinding[],
): readonly BoundQuoteLine[] {
  if (!intent || !target || intent.kind !== "unapproved_selection_request" || intent.status !== "pending_review"
    || !present(intent.requestId) || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(intent.requestId)
    || intent.publicReference !== "XRI-" + intent.requestId.replace(/-/g, "").toUpperCase()
    || !present(target.requestId) || !present(target.sellerId) || !Array.isArray(bindings)
    || bindings.length === 0 || bindings.length > 200 || !Array.isArray(intent.lines) || !Array.isArray(target.lines)) return refuse();

  const sources = new Map(intent.lines.map(l => [key(l), l]));
  const issueLines = new Map(target.lines.map(l => [l.lineId, l]));
  if (sources.size !== intent.lines.length || issueLines.size !== target.lines.length) return refuse();
  const usedSource = new Set<string>(), usedTarget = new Set<string>();
  return Object.freeze(bindings.map(link => {
    if (!link || !link.source || link.xriRequestId !== intent.requestId || link.xriReference !== intent.publicReference
      || link.issueRequestId !== target.requestId || link.sellerId !== target.sellerId
      || link.clearedForQuotation !== true || !present(link.approvalEvidenceId) || !present(link.issueLineId)) return refuse();
    const k = key(link.source), saved = sources.get(k), issued = issueLines.get(link.issueLineId);
    if (!saved || !issued || !present(saved.productId) || !present(saved.variantId) || !present(saved.sourceVariantId)
      || !present(saved.catalogVersion) || !present(saved.workflowMode)
      || typeof saved.clinicalReviewRequired !== "boolean" || typeof saved.researchUseOnly !== "boolean"
      || !Number.isSafeInteger(saved.quantity) || saved.quantity < 1 || saved.quantity > 100
      || saved.sourceVariantId !== link.source.sourceVariantId || saved.quantity !== link.source.quantity
      || saved.catalogVersion !== link.source.catalogVersion || saved.workflowMode !== link.source.workflowMode
      || saved.researchUseOnly !== link.source.researchUseOnly || saved.clinicalReviewRequired !== link.source.clinicalReviewRequired
      || saved.productId !== issued.productId || saved.variantId !== issued.variantId || saved.quantity !== issued.quantity
      || usedSource.has(k) || usedTarget.has(link.issueLineId)) return refuse();
    usedSource.add(k); usedTarget.add(link.issueLineId);
    return Object.freeze({requestLineId: issued.lineId, productId: saved.productId, variantId: saved.variantId, quantity: saved.quantity});
  }));
}
