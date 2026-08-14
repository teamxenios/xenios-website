/**
 * The Launch A catalog service: paging, filtering, detail, and price.
 *
 * ONE PRICE AUTHORITY
 * -------------------
 * Every price on this surface comes from the entitled profile's overlay and
 * from nowhere else. There is no fallback price, no "suggested" price from the
 * master catalog, and no computed price. A product the overlay does not carry
 * is `Price pending`, which is a state with its own copy: never $0, never a
 * blank rendered as currency, never a guess.
 *
 * WHAT THE SERVICE READS, AND WHAT IT REFUSES TO READ
 * ---------------------------------------------------
 * A list request traverses the catalog once (it must: the facet counts are
 * counts over the whole match set) and then projects and prices ONLY the page.
 * A detail request reads one product by index and one price by key: no scan, no
 * whole-catalog projection, no N+1 over variants, and no pricing of 419 rows to
 * answer about one.
 */

import {
  type KrisCatalogDetailView,
  type KrisCatalogItemView,
  type KrisCatalogPage,
  type KrisCatalogQuery,
  type KrisPriceProfile,
  type KrisPriceView,
} from "@shared/research/kris-launch-a/contract";
import {
  KrisDatasetUnavailable,
  type KrisCatalogSource,
  type KrisProductRecord,
} from "./dataset-reader";
import { projectKrisDetail, projectKrisItem } from "./projection";
import type { KrisLegacyOrderResolver } from "./projection";
import { selectKrisCatalog, type KrisSelection } from "./search";

/**
 * The address shapes this service will accept.
 *
 * A slug is the public deep link; an id is the specification-scoped address the
 * artifact assigns. Both are checked for shape BEFORE any lookup, so a hostile
 * path segment is refused by pattern rather than by whether it happens to miss
 * the index.
 */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,191}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{2,63}$/;

export interface KrisPricedSelection {
  page: KrisCatalogPage;
  /** The server records behind the page, for a caller that needs both. */
  products: readonly KrisProductRecord[];
  selection: KrisSelection;
}

export class KrisCatalogService {
  constructor(
    private readonly source: KrisCatalogSource,
    /**
     * The profile the VIEWER is entitled to, resolved by entitlement.ts before
     * this service is built. It is not a request parameter and it is not a
     * default: a viewer with no entitlement never reaches a service at all.
     */
    private readonly profile: KrisPriceProfile = "KRIS_VOLUME_PARTNER",
    private readonly resolveLegacyOrder?: KrisLegacyOrderResolver,
  ) {}

  /**
   * Refuse a profile the dataset cannot price.
   *
   * Without this, an entitlement that named a profile the artifact does not
   * carry would render all 420 rows as "Price pending", which is a lie told
   * confidently. An unpriceable profile is an unavailable surface.
   */
  private requireProfile(): void {
    if (!this.source.hasProfile(this.profile)) {
      throw new KrisDatasetUnavailable(
        `dataset carries no overlay for profile ${this.profile}`,
      );
    }
  }

  private price(productId: string): KrisPriceView {
    return this.source.priceFor(this.profile, productId);
  }

  /** One page of items, priced. */
  list(query: KrisCatalogQuery): KrisCatalogPage {
    return this.select(query).page;
  }

  select(query: KrisCatalogQuery): KrisPricedSelection {
    this.requireProfile();
    const selection = selectKrisCatalog(
      this.source.products(),
      query,
      (productId) => {
        const price = this.price(productId);
        return price.state === "priced" ? price.amountCents : null;
      },
    );
    const items: KrisCatalogItemView[] = selection.products.map((product) =>
      projectKrisItem(product, this.price(product.id), this.resolveLegacyOrder),
    );
    return {
      products: selection.products,
      selection,
      page: {
        ok: true,
        profile: this.profile,
        page: selection.page,
        pageSize: selection.pageSize,
        total: selection.total,
        totalPages: selection.totalPages,
        sort: selection.sort,
        facets: selection.facets,
        items,
      },
    };
  }

  /** How many products match, without projecting or pricing any of them. */
  count(query: KrisCatalogQuery): number {
    this.requireProfile();
    return selectKrisCatalog(this.source.products(), query).total;
  }

  /**
   * One product by slug, in O(1).
   *
   * The index lookup replaces the scan the naive version would do; the shape
   * check runs first so an unparsable slug never becomes a lookup at all.
   */
  detail(slug: string): KrisCatalogDetailView | null {
    this.requireProfile();
    // Trimmed but deliberately NOT lowercased. A slug is already lowercase by
    // construction, so folding case here would give every product several
    // working addresses that differ in logs, caches and links while meaning the
    // same row. One product, one address, and the route's own check agrees with
    // this one rather than being stricter than it.
    const normalized = String(slug ?? "").trim();
    if (!SAFE_SLUG.test(normalized)) return null;
    const product = this.source.findBySlug(normalized);
    if (product === null || product.slug !== normalized) return null;
    return projectKrisDetail(product, this.price(product.id), this.resolveLegacyOrder);
  }

  /**
   * One product by its specification id.
   *
   * Launch A has no variant sub-entity: a row IS one specification of one
   * product, which is why the contract has `KrisCatalogItemView` and no variant
   * type. So the sibling lane's variant-scoped read maps here to an
   * id-addressed read, and it exists for the same reason: a variant deep link
   * or a re-check after a profile change should cost one lookup and one price,
   * not a detail projection of everything that shares the name.
   *
   * Service level rather than a route, exactly as the sibling's `variant()` is.
   * Adding a third door would move the repository's route census for a read the
   * slug route already covers.
   */
  specification(id: string): KrisCatalogDetailView | null {
    this.requireProfile();
    const normalized = String(id ?? "").trim();
    if (!SAFE_ID.test(normalized)) return null;
    const product = this.source.findById(normalized);
    if (product === null) return null;
    return projectKrisDetail(product, this.price(product.id), this.resolveLegacyOrder);
  }
}
