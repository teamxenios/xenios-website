import type {
  MasterOfferingCatalogPage,
  MasterOfferingCatalogQuery,
  MasterOfferingDetailView,
  MasterOfferingVariantView,
} from "@shared/research/master-offerings/contract";
import {
  projectMasterOfferingCard,
  projectMasterOfferingDetail,
  projectMasterOfferingVariant,
} from "./customer-projection";
import {
  DEFAULT_MASTER_OFFERING_ACTION_CAPABILITIES,
  type MasterOfferingActionCapabilities,
} from "./action";
import type {
  AsyncMasterOfferingCommerceResolver,
  MasterOfferingCommerceResolver,
  NormalizedMasterOffering,
} from "./model";
import {
  noMasterOfferingPrices,
  priceOfferingVariants,
  type MasterOfferingPriceAuthority,
} from "./price-authority";
import type { MasterOfferingPriceMap } from "./price-projection";
import {
  buildMasterOfferingPriceList,
  MASTER_OFFERING_PRICE_LIST_MAX_ROWS,
} from "./price-list-export";
import type { MasterOfferingPriceListDocument } from "@shared/research/master-offerings/pricing-contract";
import { matchMasterOfferings, selectMasterOfferings } from "./search";
import type { MasterOfferingPriceView } from "@shared/research/master-offerings/pricing-contract";

export interface MasterOfferingCatalogReader {
  readCatalog():
    | Promise<readonly NormalizedMasterOffering[]>
    | readonly NormalizedMasterOffering[];
  /**
   * One member-visible offering by slug, when the reader can do it without
   * walking the catalog.
   *
   * OPTIONAL on purpose. Every existing reader, including the in-memory one the
   * tests use, stays valid without implementing it, and `detail` falls back to
   * the scan it always did. A reader that DOES implement it must keep the
   * scan's two properties: member visibility only, and an ambiguous slug
   * resolves to nothing rather than to the first match.
   */
  readBySlug?(
    slug: string,
  ):
    | Promise<NormalizedMasterOffering | null>
    | NormalizedMasterOffering
    | null;
}

/**
 * A priced page of member-safe offerings, plus the normalized offerings behind
 * it. The export lane needs both: the card view for display parity and the
 * normalized form for the variant rows.
 */
export interface PricedMasterOfferingSelection {
  page: MasterOfferingCatalogPage;
  offerings: readonly NormalizedMasterOffering[];
  prices: MasterOfferingPriceMap;
}

async function priceMany(
  authority: MasterOfferingPriceAuthority,
  offerings: readonly NormalizedMasterOffering[],
): Promise<MasterOfferingPriceMap> {
  const merged = new Map<string, MasterOfferingPriceView>();
  for (const offering of offerings) {
    const priced = await priceOfferingVariants(authority, offering);
    // Array.from, not direct iteration: this repository's TypeScript target
    // rejects iterating a Map without downlevelIteration.
    for (const [variantId, view] of Array.from(priced.entries())) {
      merged.set(variantId, view);
    }
  }
  return merged;
}

export class MasterOfferingCatalogService {
  constructor(
    private readonly reader: MasterOfferingCatalogReader,
    private readonly commerce: AsyncMasterOfferingCommerceResolver,
    /**
     * Defaults to the fail-closed authority, so a caller that composes no
     * pricing gets `Price on request` everywhere rather than a silent gap.
     */
    private readonly prices: MasterOfferingPriceAuthority = noMasterOfferingPrices,
    /** Off by default: the shipped mapping stays the shipped mapping. */
    private readonly capabilities: MasterOfferingActionCapabilities = DEFAULT_MASTER_OFFERING_ACTION_CAPABILITIES,
  ) {}

  /** One page of cards, priced. */
  async list(
    query: MasterOfferingCatalogQuery,
  ): Promise<MasterOfferingCatalogPage> {
    return (await this.select(query)).page;
  }

  /**
   * The same paging as `list`, keeping the normalized offerings and the price
   * map so the price-list export can render variant rows without re-reading or
   * re-pricing anything.
   */
  async select(
    query: MasterOfferingCatalogQuery,
  ): Promise<PricedMasterOfferingSelection> {
    const products = await this.reader.readCatalog();
    const selection = selectMasterOfferings(products, query);
    const prices = await priceMany(this.prices, selection.offerings);
    return {
      offerings: selection.offerings,
      prices,
      page: {
        ok: true,
        page: selection.page,
        pageSize: selection.pageSize,
        total: selection.total,
        totalPages: selection.totalPages,
        products: selection.offerings.map((offering) =>
          projectMasterOfferingCard(offering, prices),
        ),
      },
    };
  }

  /** How many member-safe offerings match, without pricing or projecting any. */
  async count(query: MasterOfferingCatalogQuery): Promise<number> {
    const products = await this.reader.readCatalog();
    return selectMasterOfferings(products, query).total;
  }

  /**
   * The whole matching member-safe catalog as a price list.
   *
   * It refuses rather than truncating. A price list that quietly dropped rows
   * would be read as "this is everything", which is exactly the kind of untrue
   * artifact a downloadable file must never be.
   */
  async priceList(input: {
    query: MasterOfferingCatalogQuery;
    audience: "member" | "admin";
    generatedAt: string;
    maxRows?: number;
  }): Promise<
    | { ok: true; document: MasterOfferingPriceListDocument }
    | { ok: false; code: "too_large"; rowCount: number; maxRows: number }
  > {
    const maxRows = input.maxRows ?? MASTER_OFFERING_PRICE_LIST_MAX_ROWS;
    const products = await this.reader.readCatalog();
    const offerings = matchMasterOfferings(products, input.query);
    const rowCount = offerings.reduce(
      (total, offering) =>
        total +
        offering.variants.filter((variant) => variant.visibility === "member")
          .length,
      0,
    );
    if (rowCount > maxRows) {
      return { ok: false, code: "too_large", rowCount, maxRows };
    }
    const prices = await priceMany(this.prices, offerings);
    return {
      ok: true,
      document: buildMasterOfferingPriceList({
        offerings,
        prices,
        audience: input.audience,
        generatedAt: input.generatedAt,
        capabilities: this.capabilities,
      }),
    };
  }

  /**
   * Find one member-visible offering, preferring the reader's index.
   *
   * The fallback is the original scan, kept verbatim so a reader without an
   * index behaves exactly as before, including refusing an ambiguous slug by
   * counting matches rather than taking the first.
   */
  private async findMemberOffering(
    slug: string,
  ): Promise<NormalizedMasterOffering | null> {
    if (typeof this.reader.readBySlug === "function") {
      const found = await this.reader.readBySlug(slug);
      if (found === null || found === undefined) return null;
      return found.visibility === "member" && found.slug === slug ? found : null;
    }
    const products = await this.reader.readCatalog();
    const matches = products.filter(
      (product) => product.visibility === "member" && product.slug === slug,
    );
    return matches.length === 1 ? matches[0] : null;
  }

  async detail(slug: string): Promise<MasterOfferingDetailView | null> {
    const normalized = String(slug ?? "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,191}$/.test(normalized)) return null;
    const offering = await this.findMemberOffering(normalized);
    if (offering === null) return null;
    const resolved = new Map(
      await Promise.all(
        offering.variants.map(async (variant) => [
          variant.id,
          await this.commerce(offering, variant),
        ] as const),
      ),
    );
    const commerce: MasterOfferingCommerceResolver = (_product, variant) =>
      resolved.get(variant.id) ?? { binding: null, selection: null };
    const prices = await priceOfferingVariants(this.prices, offering);
    return projectMasterOfferingDetail(
      offering,
      commerce,
      prices,
      this.capabilities,
    );
  }

  /**
   * One variant of one offering.
   *
   * `detail` resolves commerce and price for EVERY variant of the offering,
   * because a detail page shows them all. A caller that wants one variant, such
   * as a variant-scoped deep link or a cart handoff re-check, should not pay
   * for the others: an offering with five variants costs five binding reads and
   * five price resolutions to answer about one.
   *
   * The authority is unchanged. This resolves the same commerce and the same
   * price authority for that single variant, so it can no more invent an Add to
   * Cart than the detail path can.
   */
  async variant(
    slug: string,
    variantId: string,
  ): Promise<MasterOfferingVariantView | null> {
    const normalized = String(slug ?? "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,191}$/.test(normalized)) return null;
    const wanted = String(variantId ?? "").trim();
    if (wanted === "") return null;

    const offering = await this.findMemberOffering(normalized);
    if (offering === null) return null;
    const variant = offering.variants.find(
      (candidate) =>
        candidate.id === wanted && candidate.visibility === "member",
    );
    if (variant === undefined) return null;

    const resolution = await this.commerce(offering, variant);
    // priceFor directly, not priceOfferingVariants: that helper prices every
    // variant of the offering, which is exactly the cost this method exists to
    // avoid. Same authority, same argument order, one variant.
    const price = await this.prices.priceFor(offering, variant);
    return projectMasterOfferingVariant(
      offering,
      variant,
      () => resolution,
      price,
      this.capabilities,
    );
  }
}

export class InMemoryMasterOfferingCatalogReader
  implements MasterOfferingCatalogReader
{
  constructor(private readonly products: readonly NormalizedMasterOffering[]) {}

  readCatalog(): readonly NormalizedMasterOffering[] {
    return this.products;
  }
}
