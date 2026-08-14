import {
  KRIS_PRICE_PENDING,
  isKrisPurchaseMode,
  type KrisCatalogItemView,
  type KrisCatalogPage,
  type KrisPriceView,
  type KrisPurchaseMode,
} from "@shared/research/kris-launch-a/contract";
import { krisPurchaseMode } from "@shared/research/kris-launch-a/purchase-mode";

/**
 * The browser-side purchase-mode pin.
 *
 * The contract already says the server decides `purchaseMode` and that the
 * browser "must never upgrade a row to purchasable on its own". This module is
 * where that sentence becomes enforced code instead of a convention: every row
 * that enters from the wire is passed back through the SAME closed matrix the
 * server uses (shared/research/kris-launch-a/purchase-mode), keyed on nothing
 * but the row's own channel and price. The wire value may agree with the
 * matrix or be MORE restrictive; it may never be less.
 *
 * Why this exists: QA drove a real drifted envelope through the previous
 * candidate decoder, a clinical_provider_only row arriving mutated to
 * direct_eligible with canBuyNow true and a bound order handoff, and the
 * surface would have rendered Buy Now on a provider-workflow product. The pin
 * closes exactly that class:
 *
 *   - a wire row claiming direct_eligible whose own channel or price refuses
 *     it is downgraded to the matrix's verdict, and its order handoff and
 *     canBuyNow are discarded with it;
 *   - a wire mode outside the contract's closed vocabulary is replaced by the
 *     matrix's verdict rather than guessed at;
 *   - a wire row MORE restrictive than the matrix is kept as sent, because
 *     the server sees bindings and readiness this row's fields cannot carry;
 *   - canBuyNow is true only when the pinned mode is direct_eligible AND the
 *     exact order handoff is present, restating the contract's invariant as
 *     an assignment instead of a comment.
 *
 * A malformed or absent price object is treated as pending, which the matrix
 * turns into price_pending: the fail-closed direction, and the same one the
 * server takes for a row with no approved price.
 */

function priceForPin(value: KrisPriceView | undefined | null): KrisPriceView {
  return value && value.state === "priced" ? value : KRIS_PRICE_PENDING;
}

export function pinKrisItemView<T extends KrisCatalogItemView>(item: T): T {
  const derived = krisPurchaseMode({
    channel: item.channel,
    price: priceForPin(item.price),
  });
  const wire: KrisPurchaseMode = isKrisPurchaseMode(item.purchaseMode)
    ? item.purchaseMode
    : derived;
  const mode: KrisPurchaseMode =
    wire === "direct_eligible" && derived !== "direct_eligible" ? derived : wire;
  const direct = mode === "direct_eligible";
  const legacyOrder = direct ? item.legacyOrder : null;
  const canBuyNow = direct && item.canBuyNow === true && legacyOrder !== null;
  if (
    mode === item.purchaseMode &&
    legacyOrder === item.legacyOrder &&
    canBuyNow === item.canBuyNow
  ) {
    return item;
  }
  return { ...item, purchaseMode: mode, legacyOrder, canBuyNow };
}

/** Pin every row of a page. A page with nothing to change is returned as is. */
export function pinKrisPage(page: KrisCatalogPage): KrisCatalogPage {
  const items = page.items.map(pinKrisItemView);
  const changed = items.some((item, index) => item !== page.items[index]);
  return changed ? { ...page, items } : page;
}
