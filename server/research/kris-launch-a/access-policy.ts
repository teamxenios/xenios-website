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
 * Every policy is `purchasable: false`. Launch A is browse, login and price.
 * Nothing here sells, and the browser contract has no add-to-cart member for a
 * surface to reach for even if it wanted one.
 */
const POLICIES: Readonly<Record<KrisChannel, Omit<KrisAccessPolicy, "channel">>> = {
  clinical_provider_only: {
    statusLabel: "Provider workflow required",
    notices: [
      "Provider workflow required.",
      "Subject to applicable state availability and pharmacy requirements.",
    ],
    purchasable: false,
  },
  ruo_research: {
    statusLabel: "Research use only",
    notices: [
      "Research use only.",
      "Subject to availability and documentation.",
    ],
    purchasable: false,
  },
  classification_pending: {
    statusLabel: "Classification pending",
    notices: [
      "Classification, form and documentation must be confirmed before activation.",
    ],
    purchasable: false,
  },
  supplement: {
    statusLabel: "Supplement",
    notices: ["Subject to availability."],
    purchasable: false,
  },
  nonclinical_topical: {
    statusLabel: "Nonclinical / topical",
    notices: ["Subject to availability."],
    purchasable: false,
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

/** Every channel that must never present a purchase path. That is all of them. */
export function krisChannelPermitsPurchase(channel: KrisChannel): boolean {
  return POLICIES[channel].purchasable;
}

export { KRIS_CHANNEL_LABELS };
