import type { MasterOfferingAction } from "@shared/research/master-offerings/contract";
import {
  isRuntimeAddToCartAction,
  purchaseQuantityControl,
  type AcceptedExactVariantQuantityCapability,
} from "./integration-packet";

/**
 * The handoff from a catalog CTA into the EXISTING cart.
 *
 * This is not a cart. It builds no line, holds no total, persists nothing, and
 * knows no pricing rule. It takes the action the server already resolved,
 * checks that the quantity is inside the band the accepted authority stated,
 * and hands an exact-variant request to whatever the composition root injects
 * as the real cart. Everything consequential was decided before this file ran.
 *
 * The catalog is deliberately not a source of any field here. Product id,
 * variant id, amount and evaluation instant all come from the `add_to_cart`
 * action, which the server emits only after an exact `CartProductSelection`
 * resolved. A catalog row cannot reach the cart on its own.
 */

export interface CatalogCartRequest {
  productId: string;
  variantId: string;
  /**
   * The Product Control SKU the server's selection named inside the resolved
   * action. The existing member cart is keyed by SKU; echoing the resolved
   * value is the only way this handoff can name a line without inventing
   * identity of its own.
   */
  sku: string;
  quantity: number;
  /** Echoed from the resolved action so the cart can detect a stale price. */
  amountCents: number;
  currency: string;
  evaluatedAt: string;
  /** Stable for the same exact request, so a repeat is one add, not two. */
  idempotencyKey: string;
}

export type CatalogCartOutcome =
  | { ok: true; request: CatalogCartRequest }
  | {
      ok: false;
      reason:
        | "not_purchasable"
        | "quantity_unauthorized"
        | "quantity_out_of_band"
        | "already_in_flight"
        | "cart_refused";
      /** Present when the cart itself refused, so its code can be surfaced. */
      code?: string;
    };

/** The existing cart, injected. This module never implements one. */
export interface ExistingCart {
  addExactVariant(
    request: CatalogCartRequest,
  ): Promise<{ ok: true } | { ok: false; code: string }>;
}

/**
 * A key that is identical for an identical request and different for any
 * change to the exact identity, quantity, or the price instant the buyer saw.
 *
 * This is what makes a double click one add. It deliberately includes
 * `evaluatedAt`: adding the same variant again after the price was re-evaluated
 * is a genuinely new intent, not a duplicate of the old one.
 */
export function catalogCartIdempotencyKey(input: {
  productId: string;
  variantId: string;
  quantity: number;
  evaluatedAt: string;
}): string {
  return [
    "catalog",
    input.productId,
    input.variantId,
    String(input.quantity),
    input.evaluatedAt,
  ].join(":");
}

export function buildCatalogCartRequest(
  action: MasterOfferingAction,
  quantity: number,
  capability: AcceptedExactVariantQuantityCapability | null,
): CatalogCartOutcome {
  if (!isRuntimeAddToCartAction(action)) {
    // A request, waitlist, care, or unavailable action is not a purchase, at
    // any quantity. It also rejects a malformed browser-safe purchase residue
    // before this function can dereference amount or construct an identity.
    return { ok: false, reason: "not_purchasable" };
  }
  const control = purchaseQuantityControl(action, capability);
  if (!control.visible) {
    // No accepted exact-variant capability means nobody has said how many of
    // this variant may be bought. Guessing one is exactly the bug the seam
    // exists to prevent.
    return { ok: false, reason: "quantity_unauthorized" };
  }
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < control.minimum ||
    quantity > control.maximum
  ) {
    // Refuse, never clamp.
    return { ok: false, reason: "quantity_out_of_band" };
  }
  return {
    ok: true,
    request: {
      productId: action.productId,
      variantId: action.variantId,
      sku: action.sku,
      quantity,
      amountCents: action.amount.amountCents,
      currency: action.amount.currency,
      evaluatedAt: action.evaluatedAt,
      idempotencyKey: catalogCartIdempotencyKey({
        productId: action.productId,
        variantId: action.variantId,
        quantity,
        evaluatedAt: action.evaluatedAt,
      }),
    },
  };
}

/**
 * Serialize adds so a double click, an impatient triple click, or two
 * components racing cannot produce two cart lines.
 *
 * The in-flight set is keyed by the idempotency key rather than by a single
 * boolean, so adding a different variant while one add is still in flight is
 * still allowed. Blocking the whole surface would be a worse bug than the one
 * being fixed.
 */
export function createCatalogCartHandoff(cart: ExistingCart) {
  const inFlight = new Set<string>();

  return {
    async add(
      action: MasterOfferingAction,
      quantity: number,
      capability: AcceptedExactVariantQuantityCapability | null,
    ): Promise<CatalogCartOutcome> {
      const built = buildCatalogCartRequest(action, quantity, capability);
      if (!built.ok) return built;
      const key = built.request.idempotencyKey;
      if (inFlight.has(key)) return { ok: false, reason: "already_in_flight" };
      inFlight.add(key);
      try {
        const result = await cart.addExactVariant(built.request);
        return result.ok
          ? built
          : { ok: false, reason: "cart_refused", code: result.code };
      } finally {
        inFlight.delete(key);
      }
    },
    /** Exposed for a surface that wants to disable its own button. */
    isInFlight(key: string): boolean {
      return inFlight.has(key);
    },
  };
}

export type CatalogCartHandoff = ReturnType<typeof createCatalogCartHandoff>;
