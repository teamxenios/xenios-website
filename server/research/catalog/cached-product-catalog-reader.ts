/**
 * A `ProductCatalogReader` served from a short-lived shared snapshot, safe
 * when Product Control is briefly unreachable.
 *
 * This is `BulkCatalogPricingSource`'s exact discipline applied to the catalog
 * read itself (see server/research/pricing/bulk-catalog-pricing-source.ts for
 * the measured incident that discipline comes from):
 *
 *   1. ONE READ PER WINDOW. A burst of customers costs one `readCatalog()`
 *      instead of one each. The wrapped reader is already bulk (listDetails);
 *      this removes the per-request repetition of it.
 *
 *   2. STALE-WHILE-REVALIDATE. A failed refresh with a recent good snapshot
 *      in hand serves the snapshot and reports, instead of turning a transient
 *      upstream blip into a customer-facing "catalog unavailable". Past the
 *      staleness ceiling the failure surfaces honestly.
 *
 *   3. EMPTY-READ GUARD. A SUCCESSFUL read of zero products while a non-empty
 *      snapshot is held is treated as the outage it almost certainly is
 *      (revoked grant, RLS change, wrong key — all resolve successfully with
 *      zero rows). The held snapshot is served, the incident is reported, and
 *      the snapshot is deliberately NOT re-stamped, so the staleness ceiling
 *      keeps running and an empty read can never masquerade as fresh forever.
 *      An empty read with NO prior snapshot is accepted: a genuinely empty
 *      deployment is allowed to say so.
 *
 * WHAT IS DELIBERATELY NOT CACHED: anything customer-scoped. The snapshot is
 * the published Product Control catalog, identical for every viewer by
 * construction. Audience, identity, holds, supplier confirmations and
 * inventory are all resolved downstream, per request, by the readers that own
 * them — a hold recorded now is in the NEXT projection, not the next TTL.
 */

import type { AdminProductDetail } from "@shared/research/product-admin";
import type { ProductCatalogReader } from "./product-control-reader";

export interface CachedProductCatalogReaderOptions {
  /** How long a snapshot is served without any refresh attempt. */
  ttlMs?: number;
  /** How long a snapshot may still be served AFTER a refresh has failed. */
  staleWhileErrorMs?: number;
  /** Injectable clock, so the tests do not sleep. */
  now?: () => number;
  /** Where a degraded read (failed or empty refresh) is reported. */
  onError?: (message: string, error: unknown) => void;
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_STALE_WHILE_ERROR_MS = 15 * 60_000;

type Snapshot = {
  readonly catalog: readonly AdminProductDetail[];
  readonly readAt: number;
};

export class CachedProductCatalogReader implements ProductCatalogReader {
  private snapshot: Snapshot | null = null;
  private inFlight: Promise<Snapshot> | null = null;
  private readonly ttlMs: number;
  private readonly staleWhileErrorMs: number;
  private readonly now: () => number;
  private readonly onError: (message: string, error: unknown) => void;

  constructor(
    private readonly reader: ProductCatalogReader,
    options: CachedProductCatalogReaderOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.staleWhileErrorMs =
      options.staleWhileErrorMs ?? DEFAULT_STALE_WHILE_ERROR_MS;
    this.now = options.now ?? (() => Date.now());
    this.onError =
      options.onError ?? ((message, error) => console.error(message, error));
  }

  /** Diagnostics for smoke checks and tests. Carries no catalog content. */
  stats(): Readonly<{ hasSnapshot: boolean; ageMs: number | null }> {
    return Object.freeze({
      hasSnapshot: this.snapshot !== null,
      ageMs: this.snapshot === null ? null : this.now() - this.snapshot.readAt,
    });
  }

  private async refresh(): Promise<Snapshot> {
    // Single-flight: a burst on a cold cache runs ONE upstream read.
    if (this.inFlight) return this.inFlight;
    const pending = (async () => {
      const catalog = await this.reader.readCatalog();
      const held = this.snapshot;
      if (catalog.length === 0 && held !== null && held.catalog.length > 0) {
        this.onError(
          "Product Control returned an EMPTY catalog on a successful read; " +
            "keeping the last verified snapshot rather than emptying the shelf. " +
            "Check grants, RLS and the service key.",
          new Error("empty_catalog_read"),
        );
        return held;
      }
      const next: Snapshot = { catalog, readAt: this.now() };
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

  async readCatalog(): Promise<AdminProductDetail[]> {
    const snapshot = this.snapshot;
    if (snapshot !== null && this.now() - snapshot.readAt < this.ttlMs) {
      return [...snapshot.catalog];
    }
    try {
      return [...(await this.refresh()).catalog];
    } catch (error) {
      const held = this.snapshot;
      if (held !== null && this.now() - held.readAt <= this.staleWhileErrorMs) {
        this.onError(
          "Product Control catalog refresh failed; serving the last verified snapshot.",
          error,
        );
        return [...held.catalog];
      }
      // No snapshot, or one too old to stand behind. Raise, so the route can
      // answer 503 rather than publishing a shelf nobody has re-verified.
      this.snapshot = null;
      throw error;
    }
  }
}
