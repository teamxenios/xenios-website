import {
  assistedOrderFormPair,
  requiredAssistedOrderFormAcknowledgments,
} from "../../../shared/research/assisted-order/form";
import { policies, publishedResearchUsePolicyAgreement } from "../../research/policies-data";
import type { AssistedOrderConfigView } from "../../../shared/research/assisted-order/contract";
import type { Agreement } from "./ports";

/** Reads published canonical bytes; never promotes a draft or invents a legal pair.
 * Health audience approval is deliberately separate from document publication.
 */
export function quickOrderAgreements(
  config: AssistedOrderConfigView,
  approvedHealthPairs: readonly { kind: string; version: string }[],
): Agreement[] | null {
  if (!config.enabled || config.requiredAgreements.length === 0) return null;
  const published = publishedResearchUsePolicyAgreement();
  if (!published) return null;
  const agreements: Agreement[] = [];
  for (const pair of config.requiredAgreements) {
    if (!approvedHealthPairs.some((approved) => approved.kind === pair.kind && approved.version === pair.version)) return null;
    // This is the currently published canonical agreement. Other kinds require
    // their real registry/document adapter, never a generic terms URL.
    if (pair.kind !== published.kind || pair.version !== published.version) return null;
    agreements.push({ ...pair, type: "legal", label: policies["research-use"].title, url: "/research/policies/research-use" });
  }
  for (const acknowledgment of requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: false })) {
    agreements.push({ ...assistedOrderFormPair(acknowledgment), type: "form_acknowledgment", label: acknowledgment.copy, url: null });
  }
  return agreements;
}
