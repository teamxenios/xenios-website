/**
 * The Early Access retail catalog's pricing source: one bulk read, cached, and
 * safe when Product Control is briefly unreachable.
 *
 * THE DEFECT THIS REPLACES, measured live on 2026-08-21. Pricing the catalog
 * went through `LiveProductControlReader.readCatalog()`, which reads the
 * product list twice and calls `get()` twice per product, at seven queries per
 * `get()`. With 236 published public products that is 3,306 Supabase round
 * trips for ONE catalog request: 27-37 seconds, and under sustained requests
 * Supabase answered Cloudflare 522. The read then failed, and because the
 * request-scoped source is deliberately all-or-nothing, all 417 real prices
 * collapsed to "Price on request" for the customer.
 *
 * That collapse is the part that matters. Failing closed is right when the
 * answer is unknown, but "this product has no price" is not unknown — it is a
 * FALSE STATEMENT about 417 products whose prices are approved and unchanged.
 * A customer cannot tell the two apart, and neither can an operator reading a
 * screenshot.
 *
 * SO THIS DOES THREE THINGS, in order of how much they matter:
 *
 *   1. BULK READ. Three queries instead of 3,306. Nothing else changes:
 *      Product Control still owns price truth and every resolver check runs
 *      unchanged on the same rows.
 *
 *   2. CACHE. A short TTL, so a burst of customers costs one read rather than
 *      one read each. The cached value is the CANONICAL catalog, not a
 *      customer-shaped projection, so it can carry no session, no identity and
 *      no buyer-scoped price — the audience is applied per request, downstream,
 *      by the resolver that already owns that decision.
 *
 *   3. STALE-WHILE-REVALIDATE. If a refresh fails while a recent good snapshot
 *      exists, keep serving that snapshot and retry in the background. A
 *      transient upstream blip must not rewrite the customer's understanding of
 *      what things cost. Beyond the staleness ceiling the snapshot is dropped
 *      and the failure surfaces honestly, because at some point "I cannot reach
 *      the price authority" IS the truth and pretending otherwise would quote
 *      prices nobody has re-verified for hours.
 *
 * WHAT IS DELIBERATELY NOT CACHED: anything customer-scoped. No session, no
 * email, no member row, no audience decision, no assembled customer payload.
 * The cache holds one thing — the published Product Control catalog — which is
 * identical for every viewer by construction, so there is no key under which
 * one customer's price could be served to another.
 */

import type { AdminProductDetail } from "@shared/research/product-admin";
import type { BulkPricingProductSource } from "./authoritative-price-resolver";

/** The read this source needs. `SupabaseProductAdminRepository` satisfies it. */
export interface BulkPricingCatalogReader {
  listForPricing(): Promise<AdminProductDetail[]>;
}

export interface BulkCatalogPricingOptions {
  /** How long a snapshot is served without any refresh attempt. */
  ttlMs?: number;
  /**
   * How long a snapshot may still be served AFTER a refresh has failed.
   * Past this the snapshot is dropped and the error is raised, because a price
   * nobody has been able to re-verify for this long should not be quoted.
   */
  staleWhileErrorMs?: number;
  /** Injectable clock, so the tests do not sleep. */
  now?: () => number;
  /** Where a background refresh failure is reported. */
  onError?: (message: string, error: unknown) => void;
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_STALE_WHILE_ERROR_MS = 15 * 60_000;

type Snapshot = {
  readonly catalog: readonly AdminProductDetail[];
  readonly byId: ReadonlyMap<string, AdminProductDetail | null>;
  readonly readAt: number;
};

/**
 * Index by product id preserving the uniqueness rule the unwrapped source has
 * always applied: a product is answerable only when the catalog holds it
 * exactly once. A duplicated id maps to null so it stays unpriceable rather
 * than resolving to an arbitrary one of its rows.
 */
function indexById(
  catalog: readonly AdminProductDetail[],
): Map<string, AdminProductDetail | null> {
  const index = new Map<string, AdminProductDetail | null>();
  for (const product of catalog) {
    index.set(product.id, index.has(product.id) ? null : product);
  }
  return index;
}

export class BulkCatalogPricingSource implements BulkPricingProductSource {
  private snapshot: Snapshot | null = null;
  private inFlight: Promise<Snapshot> | null = null;
  private readonly ttlMs: number;
  private readonly staleWhileErrorMs: number;
  private readonly now: () => number;
  private readonly onError: (message: string, error: unknown) => void;

  constructor(
    private readonly reader: BulkPricingCatalogReader,
    options: BulkCatalogPricingOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.staleWhileErrorMs =
      options.staleWhileErrorMs ?? DEFAULT_STALE_WHILE_ERROR_MS;
    this.now = options.now ?? (() => Date.now());
    this.onError =
      options.onError ??
      ((message, error) => console.error(message, error));
  }

  /** Diagnostics for the smoke and the tests. Carries no catalog content. */
  stats(): Readonly<{ hasSnapshot: boolean; ageMs: number | null }> {
    return Object.freeze({
      hasSnapshot: this.snapshot !== null,
      ageMs: this.snapshot === null ? null : this.now() - this.snapshot.readAt,
    });
  }

  private async refresh(): Promise<Snapshot> {
    // One refresh at a time. Without this, a burst arriving on a cold cache
    // would each start their own 3-query read and reproduce a smaller version
    // of the stampede this class exists to remove.
    if (this.inFlight) return this.inFlight;
    const pending = (async () => {
      const catalog = await this.reader.listForPricing();
      const next: Snapshot = {
        catalog,
        byId: indexById(catalog),
        readAt: this.now(),
      };
      this.snapshot = next;
      return next;
    })();
    this.inFlight = pending;
    try {
      return await pending;
    } finally {
      this.inFlight = null;
    }
  }

  private async current(): Promise<Snapshot> {
    const snapshot = this.snapshot;
    if (snapshot !== null && this.now() - snapshot.readAt < this.ttlMs) {
      return snapshot;
    }
    try {
      return await this.refresh();
    } catch (error) {
      // THE POINT OF THIS CLASS. A failed refresh with a recent snapshot in
      // hand must not turn every approved price into "Price on request".
      const held = this.snapshot;
      if (held !== null && this.now() - held.readAt <= this.staleWhileErrorMs) {
        this.onError(
          "Product Control pricing refresh failed; serving the last verified catalog snapshot.",
          error,
        );
        return held;
      }
      // No snapshot, or one too old to stand behind. Raise, so the caller can
      // say the catalog is temporarily unavailable rather than quietly
      // publishing a catalog in which nothing has a price.
      this.snapshot = null;
      throw error;
    }
  }

  async readCatalogForPricing(): Promise<readonly AdminProductDetail[]> {
    return (await this.current()).catalog;
  }

  async readProductForPricing(
    productId: string,
  ): Promise<AdminProductDetail | null> {
    return (await this.current()).byId.get(productId) ?? null;
  }
}
