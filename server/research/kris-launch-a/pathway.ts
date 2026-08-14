/**
 * The truthful next step for every row a buyer cannot buy.
 *
 * Same discipline as purchase-mode: this is a policy function with a closed
 * input domain, not data on the artifact, so a workbook refresh cannot change
 * what a pathway says and a test can cover every row. It is DESCRIPTIVE only.
 * Nothing here is read by the legacy-order resolver, the order route, or any
 * pricing code, and a direct row never receives a pathway at all, so this
 * module cannot widen the purchase door by construction.
 *
 * WHY THE TEXTS ARE GENERIC WHERE THE ARTIFACT IS SILENT
 * ------------------------------------------------------
 * The artifact does not carry per-row requirement detail (which document is
 * missing, which state rule applies). Writing a specific claim here would be
 * inventing a fact. So each text states exactly what the mode means, what is
 * true for every row in that mode, and how to ask a human for the specifics.
 *
 * WHY provider_workflow TEXT IS CHANNEL-AWARE
 * -------------------------------------------
 * Two channels reach the provider mode today: clinical_provider_only rows and
 * the provider-access price-pending edge. The access policy already carries
 * the channel's own notices; the pathway explanation must agree with them, so
 * it is derived from the same channel rather than restated freely.
 */

import type {
  KrisChannel,
  KrisPathwayView,
  KrisPurchaseMode,
} from "@shared/research/kris-launch-a/contract";

/** Member-safe identity used to prefill a concierge request subject. */
export type KrisPathwaySubjectSource = Readonly<{
  displayName: string;
  specification: string;
}>;

function subjectFor(prefix: string, product: KrisPathwaySubjectSource): string {
  const spec = product.specification.trim();
  return spec === ""
    ? `${prefix}: ${product.displayName}`
    : `${prefix}: ${product.displayName} (${spec})`;
}

/**
 * The pathway for one row, or null exactly when the row is direct_eligible.
 *
 * The null is load-bearing: a direct row's next step is the existing Buy Now
 * logic (open or deliberately closed), and describing it here would create a
 * second answer to "can I buy this" that could disagree with `canBuyNow`.
 */
export function krisPathwayView(
  mode: KrisPurchaseMode,
  channel: KrisChannel,
  product: KrisPathwaySubjectSource,
): KrisPathwayView | null {
  switch (mode) {
    case "direct_eligible":
      return null;
    case "provider_workflow":
      return Object.freeze({
        kind: "provider_workflow",
        headline: "Provider workflow required",
        explanation:
          channel === "clinical_provider_only"
            ? "This item is fulfilled through the provider pathway and is not available for direct purchase. An authorized provider workflow, including applicable state availability and pharmacy requirements, governs any order. Request the provider pathway and the team will coordinate the required steps."
            : "This item requires the provider workflow before any order is possible. Request the provider pathway and the team will coordinate the required steps.",
        request: Object.freeze({
          label: "Request provider pathway",
          subject: subjectFor("Provider pathway request", product),
        }),
      });
    case "classification_pending":
      return Object.freeze({
        kind: "classification_pending",
        headline: "Activation pending",
        explanation:
          "Classification, form and documentation for this item have not been confirmed, so it cannot be ordered yet. Register interest and the team will follow up when activation completes.",
        request: Object.freeze({
          label: "Register interest",
          subject: subjectFor("Activation interest", product),
        }),
      });
    case "price_pending":
      return Object.freeze({
        kind: "price_pending",
        headline: "Price pending",
        explanation:
          "This item has no confirmed price and cannot be ordered. It is never sold at a placeholder price. Request a price and the team will confirm one before any order is possible.",
        request: Object.freeze({
          label: "Request price",
          subject: subjectFor("Price request", product),
        }),
      });
  }
}
