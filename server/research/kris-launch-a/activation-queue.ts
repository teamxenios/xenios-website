/**
 * The activation backlog: every row that is visible but cannot be sold yet,
 * as an ordered work queue for operations.
 *
 * Two queues, because the work is different work:
 *
 *   - classification: the 32 rows whose channel is still unconfirmed. The work
 *     is supplier documentation and Product Control review, and it ends with a
 *     deliberate channel change in the NEXT artifact, which the reconciler
 *     then surfaces (and flags, if the change opens a purchase path).
 *   - pricing: the rows with no confirmed price. The work is a price decision,
 *     and it ends with an overlay entry, never with a fallback.
 *
 * Provider rows are deliberately NOT a queue: provider_workflow is a standing
 * pathway, not a backlog item.
 *
 * This is a derivation over the loaded dataset, so it can never disagree with
 * what members see, and it carries only fields the member-safe artifact
 * already carries. Activating an item happens in the artifact pipeline and its
 * review, never by mutating anything here.
 */

import type { KrisPriceProfile } from "@shared/research/kris-launch-a/contract";
import { KRIS_PRICE_PENDING } from "@shared/research/kris-launch-a/contract";
import type { LoadedKrisDataset } from "./dataset-reader";
import { krisPurchaseMode } from "./purchase-mode";

export interface KrisActivationQueueEntry {
  id: string;
  slug: string;
  displayName: string;
  specification: string;
  family: string;
  channel: string;
  suppliedNote: string;
  /** What completes this entry. Generic on purpose: no per-row fact is invented. */
  completes: string;
}

export interface KrisActivationQueues {
  classification: readonly KrisActivationQueueEntry[];
  pricing: readonly KrisActivationQueueEntry[];
}

/**
 * Pinned collation: the queue order must not drift with the host's default
 * locale or ICU build, because operations reads these queues as a stable
 * worklist. "en" is a deliberate pin, not a default.
 */
const QUEUE_COLLATOR = new Intl.Collator("en");

const CLASSIFICATION_COMPLETES =
  "Confirm classification, form and documentation, then re-channel the row in the next artifact; the reconciler flags the change if it opens a purchase path.";
const PRICING_COMPLETES =
  "Record the authorized price as an overlay entry in the next artifact; the row must never inherit a fallback price.";

export function krisActivationQueues(
  dataset: LoadedKrisDataset,
  profile: KrisPriceProfile = "KRIS_VOLUME_PARTNER",
): KrisActivationQueues {
  const classification: KrisActivationQueueEntry[] = [];
  const pricing: KrisActivationQueueEntry[] = [];

  for (const product of dataset.products) {
    const price = dataset.prices.get(profile)?.get(product.id) ?? KRIS_PRICE_PENDING;
    const mode = krisPurchaseMode({ channel: product.channel, price });
    if (mode !== "classification_pending" && mode !== "price_pending") continue;

    const entry: KrisActivationQueueEntry = {
      id: product.id,
      slug: product.slug,
      displayName: product.displayName,
      specification: product.specification,
      family: product.family,
      channel: product.channel,
      suppliedNote: product.suppliedNote,
      completes:
        mode === "price_pending" ? PRICING_COMPLETES : CLASSIFICATION_COMPLETES,
    };
    (mode === "price_pending" ? pricing : classification).push(entry);
  }

  const byFamilyThenName = (a: KrisActivationQueueEntry, b: KrisActivationQueueEntry) =>
    a.family === b.family
      ? QUEUE_COLLATOR.compare(a.displayName, b.displayName)
      : QUEUE_COLLATOR.compare(a.family, b.family);

  classification.sort(byFamilyThenName);
  pricing.sort(byFamilyThenName);

  return Object.freeze({
    classification: Object.freeze(classification),
    pricing: Object.freeze(pricing),
  });
}
