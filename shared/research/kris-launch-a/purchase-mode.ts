import type {
  KrisChannel,
  KrisPriceView,
  KrisPurchaseMode,
} from "./contract";

/**
 * What KIND of transaction each catalog row is, decided once, on the server.
 *
 * WHY THIS IS ONE FUNCTION AND NOT A FIELD ON THE ARTIFACT
 * -------------------------------------------------------
 * The mode is a policy conclusion, not data. If it lived in the generated file
 * a workbook refresh could silently move a clinical row into direct purchase,
 * and the review that caught it would be a diff of 420 JSON lines. Here it is a
 * function with a closed input domain and a test over every row.
 *
 * WHY MODE AND ACCESS ARE SEPARATE AXES
 * -------------------------------------
 * They answer different questions and they disagree on two rows.
 *
 *   BAM15 500 mcg   mode = price_pending   access = Research use only
 *   Syringes        mode = price_pending   access = Provider workflow required
 *
 * The mode says what a buyer may do; the access policy says what the product
 * is. Collapsing them into one field would have forced a choice on exactly the
 * two rows a reader looks at hardest, and either answer would have been wrong.
 *
 * PRECEDENCE, most restrictive first
 * ----------------------------------
 * price_pending, then classification_pending, then provider_workflow, then
 * direct_eligible. Every branch above the last one is a refusal, so the only
 * way to reach a purchasable verdict is to fall through all of them.
 *
 * WHAT direct_eligible DOES AND DOES NOT MEAN
 * -------------------------------------------
 * It means the CHANNEL permits a direct purchase. It is not a promise that this
 * unit can be ordered right now. The separately resolved legacy-order handoff
 * must carry an exact Product Control identity, and the order route revalidates
 * it at placement. A catalog cannot authorize a sale, and this one does not.
 */

/** The channels that may ever offer a direct purchase. Closed, and short. */
const DIRECT_PURCHASE_CHANNELS: ReadonlySet<KrisChannel> = new Set<KrisChannel>([
  "ruo_research",
  "supplement",
  "nonclinical_topical",
]);

export function krisPurchaseMode(input: {
  channel: KrisChannel;
  price: KrisPriceView;
}): KrisPurchaseMode {
  // No approved price, no transaction. This is first because it is true
  // regardless of what the channel would otherwise allow, and because a
  // "purchasable" row with no price is the shape of a $0 bug.
  if (input.price.state !== "priced") return "price_pending";

  // The supplier has not told us what this is yet. Nothing may be offered on a
  // product whose form and documentation are still unconfirmed.
  if (input.channel === "classification_pending") return "classification_pending";

  // Clinical items are visible and priced, and route to the provider workflow.
  // Ordinary commerce must not be able to reach them, so this is a branch and
  // not a flag on an otherwise purchasable row.
  if (input.channel === "clinical_provider_only") return "provider_workflow";

  // Fall through only. An unrecognized channel is NOT purchasable: if a new
  // channel appears in a future workbook it lands here and is refused until
  // somebody adds it to the set above on purpose.
  return DIRECT_PURCHASE_CHANNELS.has(input.channel)
    ? "direct_eligible"
    : "classification_pending";
}

/** True for exactly one mode. Written as a function so call sites read plainly. */
export function krisModePermitsLegacyOrder(mode: KrisPurchaseMode): boolean {
  return mode === "direct_eligible";
}
