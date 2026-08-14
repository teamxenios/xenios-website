/**
 * Reconciliation between the committed catalog artifact and its successor.
 *
 * The hot-swap promise is that a new workbook can be ingested without
 * rebuilding the application. The danger in that promise is silence: a
 * regenerated file can retire an item, move a price, or flip a row's channel,
 * and a 420-row JSON diff is where such a change goes to hide. This module
 * turns the swap into an itemized, reviewable event.
 *
 * Both sides must already have passed `loadKrisDataset`, so a poisoned
 * successor (private field, private content, broken attestation, zero price)
 * is refused before it can even be compared.
 *
 * THE ONE TRANSITION THAT IS NEVER ROUTINE
 * ----------------------------------------
 * A row whose mode BECOMES direct_eligible is a row becoming purchasable.
 * The report lists those ids separately and `opensNoPurchasePath` is false
 * whenever any exist. Callers gating a swap on this report must treat that
 * flag as a stop: the change may be legitimate, but it must be approved as
 * what it is, not ride in beside a price refresh.
 */

import {
  KRIS_PRICE_PENDING,
  type KrisPriceProfile,
  type KrisPriceView,
  type KrisPurchaseMode,
} from "@shared/research/kris-launch-a/contract";
import type { KrisProductRecord, LoadedKrisDataset } from "./dataset-reader";
import { krisPurchaseMode } from "./purchase-mode";

/** The member-visible fields whose drift the report itemizes. */
const COMPARED_FIELDS = [
  "slug",
  "displayName",
  "specification",
  "family",
  "channel",
  "format",
  "packBasis",
  "moq",
  "dosageForm",
  "suppliedNote",
] as const;

export interface KrisModeTransition {
  id: string;
  displayName: string;
  from: KrisPurchaseMode;
  to: KrisPurchaseMode;
  /** True when the transition ends in direct_eligible from anything else. */
  opensPurchase: boolean;
}

export interface KrisPriceMovement {
  id: string;
  displayName: string;
  from: KrisPriceView;
  to: KrisPriceView;
}

export interface KrisReconciliationReport {
  profile: KrisPriceProfile;
  added: readonly string[];
  retired: readonly string[];
  changed: ReadonlyArray<{ id: string; fields: readonly string[] }>;
  priceMovements: readonly KrisPriceMovement[];
  modeTransitions: readonly KrisModeTransition[];
  /** The ids becoming purchasable. Empty on every routine refresh. */
  purchaseOpeningIds: readonly string[];
  /** False whenever any row would become purchasable by this swap. */
  opensNoPurchasePath: boolean;
  /** True when the two artifacts are identical under every comparison here. */
  identical: boolean;
}

function priceOf(dataset: LoadedKrisDataset, profile: KrisPriceProfile, id: string): KrisPriceView {
  return dataset.prices.get(profile)?.get(id) ?? KRIS_PRICE_PENDING;
}

function modeOf(dataset: LoadedKrisDataset, profile: KrisPriceProfile, product: KrisProductRecord): KrisPurchaseMode {
  return krisPurchaseMode({ channel: product.channel, price: priceOf(dataset, profile, product.id) });
}

function samePrice(a: KrisPriceView, b: KrisPriceView): boolean {
  if (a.state !== b.state) return false;
  if (a.state === "priced" && b.state === "priced") {
    return a.amountCents === b.amountCents && a.currency === b.currency;
  }
  return true;
}

export function reconcileKrisArtifacts(
  current: LoadedKrisDataset,
  next: LoadedKrisDataset,
  profile: KrisPriceProfile = "KRIS_VOLUME_PARTNER",
): KrisReconciliationReport {
  const added: string[] = [];
  const retired: string[] = [];
  const changed: Array<{ id: string; fields: readonly string[] }> = [];
  const priceMovements: KrisPriceMovement[] = [];
  const modeTransitions: KrisModeTransition[] = [];

  for (const product of next.products) {
    if (!current.byId.has(product.id)) added.push(product.id);
  }

  for (const before of current.products) {
    const after = next.byId.get(before.id);
    if (after === undefined) {
      retired.push(before.id);
      continue;
    }

    const drifted = COMPARED_FIELDS.filter((field) => before[field] !== after[field]);
    if (drifted.length > 0) changed.push({ id: before.id, fields: drifted });

    const priceBefore = priceOf(current, profile, before.id);
    const priceAfter = priceOf(next, profile, after.id);
    if (!samePrice(priceBefore, priceAfter)) {
      priceMovements.push({
        id: before.id,
        displayName: after.displayName,
        from: priceBefore,
        to: priceAfter,
      });
    }

    const modeBefore = modeOf(current, profile, before);
    const modeAfter = modeOf(next, profile, after);
    if (modeBefore !== modeAfter) {
      modeTransitions.push({
        id: before.id,
        displayName: after.displayName,
        from: modeBefore,
        to: modeAfter,
        opensPurchase: modeAfter === "direct_eligible",
      });
    }
  }

  const purchaseOpeningIds = modeTransitions
    .filter((transition) => transition.opensPurchase)
    .map((transition) => transition.id);

  return Object.freeze({
    profile,
    added: Object.freeze(added),
    retired: Object.freeze(retired),
    changed: Object.freeze(changed),
    priceMovements: Object.freeze(priceMovements),
    modeTransitions: Object.freeze(modeTransitions),
    purchaseOpeningIds: Object.freeze(purchaseOpeningIds),
    opensNoPurchasePath: purchaseOpeningIds.length === 0,
    identical:
      added.length === 0 &&
      retired.length === 0 &&
      changed.length === 0 &&
      priceMovements.length === 0 &&
      modeTransitions.length === 0,
  });
}
