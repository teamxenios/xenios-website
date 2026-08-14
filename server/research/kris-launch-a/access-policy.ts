import {
  KRIS_CHANNEL_LABELS,
  type KrisAccessPolicy,
  type KrisChannel,
} from "@shared/research/kris-launch-a/contract";

/**
 * What each channel permits, as code rather than data.
 *
 * WHY THIS IS NOT READ FROM THE SPREADSHEET
 * -----------------------------------------
 * The Kris workbook carries an "Access / Notes" cell per row, and for 418 rows
 * it says exactly what the channel requires. For the two rows with no price yet
 * it says "Price pending." INSTEAD, not as well.
 *
 * So a surface that rendered the supplied note alone would drop "Research use
 * only" from BAM15 500 mcg and "Provider workflow required" from the syringes,
 * on precisely the two rows a reader is most likely to look at twice. The
 * status a channel carries cannot depend on whether a price happened to be
 * ready.
 *
 * The supplied note is still shown, faithfully and in full. It is shown IN
 * ADDITION to these notices, never in place of them.
 *
 * This policy carries classification and safety copy only. Purchase authority
 * is the separate server purchase-mode plus exact legacy-order binding.
 * Nothing here sells. A separate exact binding is required before the browser
 * can enter the existing order journey.
 */
const POLICIES: Readonly<Record<KrisChannel, Omit<KrisAccessPolicy, "channel">>> = {
  clinical_provider_only: {
    statusLabel: "Provider workflow required",
    notices: [
      "Provider workflow required.",
      "Subject to applicable state availability and pharmacy requirements.",
    ],
  },
  ruo_research: {
    statusLabel: "Research use only",
    notices: [
      "Research use only.",
      "Subject to availability and documentation.",
    ],
  },
  classification_pending: {
    statusLabel: "Classification pending",
    notices: [
      "Classification, form and documentation must be confirmed before activation.",
    ],
  },
  supplement: {
    statusLabel: "Supplement",
    notices: ["Subject to availability."],
  },
  nonclinical_topical: {
    statusLabel: "Nonclinical / topical",
    notices: ["Subject to availability."],
  },
};

export function krisAccessPolicy(channel: KrisChannel): KrisAccessPolicy {
  return { channel, ...POLICIES[channel] };
}

/**
 * Read on every detail view. Signing in reaches a catalog, not a permission to
 * buy, and the copy says so rather than leaving it to be inferred.
 */
export const KRIS_CATALOG_DISCLOSURES: readonly string[] = [
  "Prices shown are Kris partner prices and are confidential.",
  "Availability, documentation and applicable provider requirements govern every item.",
  "Signing in gives access to this catalog. It does not authorize a purchase.",
];

export { KRIS_CHANNEL_LABELS };
