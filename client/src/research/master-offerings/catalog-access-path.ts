import type {
  MasterOfferingCardView,
  MasterOfferingDisplayState,
  MasterOfferingVariantSummary,
} from "@shared/research/master-offerings/contract";
import {
  CUSTOMER_ACTIONS,
  CUSTOMER_ACTION_LABELS,
  customerActionFromMasterOfferingAction,
  isCustomerAction,
  type CustomerAction,
} from "@shared/research/launch/customer-action";

/**
 * The access path a buyer sees on a catalog row, stated in the one closed
 * six-word customer vocabulary that already exists at HEAD.
 *
 * WHAT THIS FILE IS. A presentation-only restatement of the action the server
 * already resolved for one exact variant. It reads `variant.action` and
 * `variant.displayState`, both of which arrived from the server, and it can
 * only ever restate or DOWNGRADE what they say. It never reads a workbook,
 * a demand list, an overlay, or an activation record, and it holds no price,
 * quantity, or authority of its own.
 *
 * WHAT THIS FILE IS NOT. It is not a second activation rule. `live` is a
 * server verdict expressed as `add_to_cart` on an `available_now` variant;
 * nothing here can produce that pairing, only refuse to present it when the
 * two halves disagree.
 *
 * WHY THE SIX-WORD VOCABULARY AND NOT A NEW SEVEN-STATE ONE. The launch
 * mandate names `live | request_only | provider_required |
 * documentation_pending | held | unavailable | unknown`. At HEAD the shared
 * contracts carry two vocabularies already: the nine catalog display states
 * (`shared/research/master-offerings/contract.ts`) and the seven product
 * activation statuses (`shared/research/product-activation/contract.ts`), and
 * the browser is forbidden from synthesizing an activation status. So the
 * buyer-facing access path is derived from the resolved ACTION, through the
 * existing `customerActionFromMasterOfferingAction` adapter, which is the one
 * translation both mounted lanes already share. The mapping between the
 * mandate's seven words and HEAD's vocabularies is documented in
 * `docs/research-launch/XENIOS_CATALOG_STATUS_VOCABULARY_2026-08-28.md`.
 */

export type CatalogAccessPath = CustomerAction;

export const CATALOG_ACCESS_PATHS: readonly CatalogAccessPath[] = CUSTOMER_ACTIONS;

export const CATALOG_ACCESS_PATH_LABELS: Readonly<
  Record<CatalogAccessPath, string>
> = CUSTOMER_ACTION_LABELS;

/**
 * One plain sentence per access path, for a legend or an empty state. None of
 * these sentences promises stock, a date, a document, or a clinical outcome.
 */
export const CATALOG_ACCESS_PATH_DESCRIPTIONS: Readonly<
  Record<CatalogAccessPath, string>
> = {
  BUY_NOW: "Direct checkout on the exact variant, through the detail page.",
  REQUEST_QUOTE: "The price is confirmed on request; nothing is charged here.",
  ASSISTED_ORDER: "A request a named person completes; no cart, order, or payment.",
  CARE: "Continues through Care with a provider; not a direct purchase.",
  TEMPORARILY_HELD: "Temporarily held; you can ask to be told when it changes.",
  NOT_AVAILABLE: "Not available, and nothing to request right now.",
};

export function isCatalogAccessPath(value: unknown): value is CatalogAccessPath {
  return isCustomerAction(value);
}

/**
 * The only display state under which the server's own resolver may emit
 * `add_to_cart` (`resolveMasterOfferingAction` requires the exact offering and
 * the exact variant to both be `available_now`). Restated here so the browser
 * can refuse to PRESENT a purchase the server would not have resolved, never
 * so it can grant one.
 */
const PURCHASABLE_DISPLAY_STATE: MasterOfferingDisplayState = "available_now";

/**
 * True when a variant carries a purchase action its own listing state
 * contradicts: `add_to_cart` on anything other than `available_now`. The
 * server rule says this pairing cannot exist, so if the browser ever receives
 * it the honest reading is "the evidence disagrees with itself", and the
 * fail-closed presentation is no purchase affordance at all.
 */
export function isContradictoryPurchase(
  variant: Pick<MasterOfferingVariantSummary, "displayState" | "action">,
): boolean {
  return (
    variant.action.kind === "add_to_cart" &&
    variant.displayState !== PURCHASABLE_DISPLAY_STATE
  );
}

/**
 * The access path of one exact variant.
 *
 * A contradictory purchase downgrades to NOT_AVAILABLE rather than to
 * REQUEST_QUOTE: the adapter's on-request downgrade is for a price that is
 * missing, and this is a listing state that says the item is not for sale.
 * "Not available" is the only word in the vocabulary that promises nothing.
 */
export function accessPathOfVariant(
  variant: Pick<MasterOfferingVariantSummary, "displayState" | "action" | "price">,
): CatalogAccessPath {
  if (isContradictoryPurchase(variant)) return "NOT_AVAILABLE";
  return customerActionFromMasterOfferingAction(variant.action, variant.price);
}

/** Every access path present on a card, in vocabulary order, no duplicates. */
export function accessPathsOfCard(
  product: Pick<MasterOfferingCardView, "variants">,
): readonly CatalogAccessPath[] {
  const present = new Set(product.variants.map(accessPathOfVariant));
  return CATALOG_ACCESS_PATHS.filter((path) => present.has(path));
}

/**
 * The page-local access-path refinement.
 *
 * The catalog query contract has no access-path parameter and the server owns
 * every facet, so this narrows only the page the server already returned. It
 * never pages, never counts the catalog, and its copy must always say "on this
 * page" so a member is not told the whole catalog has three direct-purchase
 * rows when only this page was examined. Cards keep every variant: a card is
 * shown when ANY of its variants takes the chosen path, and the card itself
 * still lists the others, so a variant is never hidden inside a card that is
 * shown.
 */
export function refineCardsByAccessPath<
  T extends Pick<MasterOfferingCardView, "variants">,
>(products: readonly T[], path: CatalogAccessPath | null): readonly T[] {
  if (path === null) return products;
  return products.filter((product) =>
    product.variants.some((variant) => accessPathOfVariant(variant) === path),
  );
}

/** How many cards on this page take each path. Zero counts are kept. */
export function accessPathCountsOnPage(
  products: readonly Pick<MasterOfferingCardView, "variants">[],
): ReadonlyMap<CatalogAccessPath, number> {
  const counts = new Map<CatalogAccessPath, number>(
    CATALOG_ACCESS_PATHS.map((path) => [path, 0] as const),
  );
  for (const product of products) {
    for (const path of accessPathsOfCard(product)) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return counts;
}
