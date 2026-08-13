/**
 * A request-scoped read of the Product Control catalog for pricing. Server only.
 *
 * WHY THIS EXISTS
 * ---------------
 * `CatalogPricingProductSource.readProductForPricing` answers one product id by
 * reading the WHOLE Product Control catalog and filtering it. That is correct
 * and it is fine for the one-product pricing route, where a request asks once.
 *
 * The master offerings catalog asks once per variant. A page of twenty-four
 * cards asks about twenty-five variants, and the price-list export asks about up
 * to five thousand, so the whole catalog was being read twenty-five or five
 * thousand times to answer questions that one read already contains. Behind
 * `LiveProductControlReader` each of those reads is two repository `list` calls
 * plus two `get` calls per published product, so the cost is the product of two
 * catalog sizes rather than the sum.
 *
 * WHY REQUEST SCOPED AND NOT LONGER
 * ---------------------------------
 * A cache that outlived one request would quote yesterday's approved price. The
 * master offerings composition already builds a new service per request for
 * exactly this reason (see the header of
 * `server/research/master-offerings/composition.ts`), so one instance of this
 * wrapper lives and dies with one request.
 *
 * WHAT IT DOES NOT CHANGE
 * -----------------------
 * The answer for any product id is the same answer the unwrapped source gives:
 * a product is returned only when the catalog contains it exactly once, and a
 * missing or duplicated id is still null. Every later check in the resolver
 * (published, public, active, variant approved, audience, currency, window,
 * positive amount, identity match) runs unchanged on the same record.
 *
 * One behavior does change, and it is a tightening rather than a loosening. A
 * reader that fails mid-request used to fail only the variants that happened to
 * read after it broke, so one page could mix prices read before the failure with
 * `Price on request` after it. Now the request either sees one catalog snapshot
 * or sees none, and none means `Price on request` everywhere. Both outcomes are
 * fail closed; the second is also self-consistent.
 */

import type { AdminProductDetail } from "@shared/research/product-admin";
import type {
  BulkPricingProductSource,
  PricingProductSource,
} from "./authoritative-price-resolver";

export function isBulkPricingProductSource(
  source: PricingProductSource,
): source is BulkPricingProductSource {
  return (
    typeof (source as Partial<BulkPricingProductSource>)
      .readCatalogForPricing === "function"
  );
}

/**
 * Index by product id, preserving the uniqueness rule exactly.
 *
 * `CatalogPricingProductSource` returns a product only when the catalog holds
 * exactly one row with that id. A duplicated id is recorded here as null so the
 * lookup keeps refusing it, rather than silently picking the first row.
 */
function indexUniqueById(
  catalog: readonly AdminProductDetail[],
): ReadonlyMap<string, AdminProductDetail | null> {
  const index = new Map<string, AdminProductDetail | null>();
  for (const product of catalog) {
    // Present already means "seen once". Seeing it again makes it ambiguous.
    index.set(product.id, index.has(product.id) ? null : product);
  }
  return index;
}

/**
 * Wrap a pricing source so one request reads Product Control once.
 *
 * When the source can hand over the whole catalog, the request reads it a single
 * time and answers every product id from that one snapshot. When it cannot, the
 * wrapper falls back to memoizing per product id, which is never worse than the
 * unwrapped source and still collapses the common case where many offering
 * variants bind to the same Product Control product.
 */
export function createRequestScopedPricingProductSource(
  source: PricingProductSource,
): PricingProductSource {
  if (isBulkPricingProductSource(source)) {
    let snapshot:
      | Promise<ReadonlyMap<string, AdminProductDetail | null>>
      | null = null;
    const readSnapshot = () => {
      if (snapshot === null) {
        const pending = Promise.resolve(source.readCatalogForPricing()).then(
          indexUniqueById,
        );
        // Every caller still awaits and still sees the rejection. This handler
        // only stops a shared rejected promise from being reported as unhandled
        // before the first caller gets to it.
        pending.catch(() => undefined);
        snapshot = pending;
      }
      return snapshot;
    };
    return {
      async readProductForPricing(productId) {
        const index = await readSnapshot();
        return index.get(productId) ?? null;
      },
    };
  }

  const byProductId = new Map<string, Promise<AdminProductDetail | null>>();
  return {
    readProductForPricing(productId) {
      const cached = byProductId.get(productId);
      if (cached !== undefined) return cached;
      const pending = Promise.resolve(source.readProductForPricing(productId));
      pending.catch(() => undefined);
      byProductId.set(productId, pending);
      return pending;
    },
  };
}
