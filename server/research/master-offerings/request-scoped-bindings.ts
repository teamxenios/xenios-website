/**
 * A request-scoped memo over the read-only commerce binding join. Server only.
 *
 * WHY
 * ---
 * Two authorities ask the same question about the same variant inside one
 * request. `price-authority.ts` reads the binding to find the Product Control
 * identity to price, and `product-control-adapter.ts` reads it again to resolve
 * the purchase selection on the detail view. Without a memo the detail path
 * reads every variant's binding twice.
 *
 * Halving the reads is the smaller half of the point. The larger half is that
 * the two authorities now answer from one binding fact, so a price and a
 * purchase verdict rendered on the same page cannot describe two different
 * bindings. That is the same reason the composition resolves identity once per
 * request.
 *
 * WHAT IT DOES NOT CHANGE
 * -----------------------
 * It is still read only: this wrapper exposes exactly `readBinding` and nothing
 * else, so it cannot create, update, or delete a binding any more than the
 * interface it wraps can. It adds no fallback: a null stays null, and a thrown
 * read still reaches the callers' own catch clauses, which is what makes both a
 * missing binding and a broken reader resolve to `Price on request` with no
 * purchase action.
 *
 * It is request scoped for the same reason the price memo is. A binding that
 * outlived the request would let a revoked binding keep quoting a price.
 */

import type { MasterOfferingCommerceIdentityBinding } from "./model";
import type { MasterOfferingCommerceBindingReader } from "./product-control-adapter";

export function createRequestScopedBindingReader(
  bindings: MasterOfferingCommerceBindingReader,
): MasterOfferingCommerceBindingReader {
  const cache = new Map<
    string,
    Promise<MasterOfferingCommerceIdentityBinding | null>
  >();
  return {
    readBinding(input) {
      // Both parts of the identity are in the key. Two offerings that happen to
      // share a variant label must never share a binding answer.
      const key = `${input.offeringId}|${input.offeringVariantId}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const pending = Promise.resolve(bindings.readBinding(input));
      // The callers still await and still see a rejection. This only prevents a
      // shared rejected promise being reported as unhandled before they do.
      pending.catch(() => undefined);
      cache.set(key, pending);
      return pending;
    },
  };
}
