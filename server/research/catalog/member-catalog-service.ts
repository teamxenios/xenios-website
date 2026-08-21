import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminProductDetail,
  AdminProductMedia,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type {
  CartAudienceEligibility,
  CartInventoryEligibility,
} from "@shared/research/cart-product-selection";
import {
  MEMBER_CATALOG_SIGNED_MEDIA_TTL_SECONDS,
  type MemberCatalog,
  type MemberCatalogLotCoaPresentation,
  type MemberCatalogMediaPresentation,
  type MemberCatalogProjectionSource,
  type MemberCatalogQuery,
  type MemberProductDetail,
} from "@shared/research/member-catalog";
import type { DomainReadiness, RequiredInput } from "@shared/research/required-inputs";
import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";
import type { MemberRow } from "../member-auth";
import {
  buildRequiredInputProductionRepository,
  type RequiredInputRepository,
} from "../required-inputs";
import {
  projectMemberCatalog,
  projectMemberProductDetail,
  type MemberCatalogProjectionInput,
} from "./member-catalog-projection";
import {
  createProductionProductControlReader,
  type ProductCatalogReader,
} from "./product-control-reader";

const MEDIA_BUCKET = "research-product-media";
const CURRENCY = "USD";

export type InventoryLotRow = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  sku: string;
  disposition: string;
  version: number;
  updated_at: string;
};

export type MemberCatalogServiceDependencies = {
  configured(): boolean;
  db(): SupabaseClient;
  products: ProductCatalogReader;
  requiredInputs: Pick<RequiredInputRepository, "list" | "readinessAll">;
  now(): Date;
};

export type MemberCatalogRequestContext = {
  member: MemberRow;
  query?: MemberCatalogQuery;
  slug?: string;
};

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * The provenance of one member's audience authorization.
 *
 * Exported because server/index.ts resolves the same grant for the pricing
 * adapter. Two hand-written copies of this object would drift the moment either
 * side added a field, and a drifted sourceVersion means the catalog and the
 * price it quotes claim to have been authorized by different facts.
 */
export function memberAudienceSourceVersion(member: MemberRow): string {
  return fingerprint({
    memberId: member.id,
    status: member.status,
    billingState: member.billing_state ?? null,
    updatedAt: member.updated_at ?? member.created_at,
  });
}

/**
 * The server-authorized audience for one member, at one instant.
 *
 * Exported so Private Early Access resolves its audience through this exact
 * derivation rather than through a second one written beside it. A browser
 * never reaches this: the member row it reads is the one the server-side guard
 * already authenticated.
 */
export function memberAudience(
  member: MemberRow,
  evaluatedAt: string,
): CartAudienceEligibility {
  return {
    audience: "member",
    state: "authorized",
    sourceVersion: memberAudienceSourceVersion(member),
    evaluatedAt,
  };
}

function approvedPrimaryMedia(products: readonly AdminProductDetail[]) {
  return products.flatMap((product) =>
    product.media.filter(
      (media) =>
        media.productId === product.id &&
        media.kind === "primary_image" &&
        media.state === "approved" &&
        Boolean(media.approvedBy),
    ),
  );
}

async function signedMediaPresentations(
  db: SupabaseClient,
  products: readonly AdminProductDetail[],
  evaluatedAt: string,
): Promise<MemberCatalogMediaPresentation[]> {
  const expiresAt = new Date(
    Date.parse(evaluatedAt) + MEMBER_CATALOG_SIGNED_MEDIA_TTL_SECONDS * 1000,
  ).toISOString();
  const presentations = await Promise.all(
    approvedPrimaryMedia(products).map(
      async (
        media: AdminProductMedia,
      ): Promise<MemberCatalogMediaPresentation | null> => {
      const expectedStorageKey = `${media.productId}/${media.id}/${media.filename}`;
      if (media.storageKey !== expectedStorageKey) return null;
      const { data, error } = await db.storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(media.storageKey, MEMBER_CATALOG_SIGNED_MEDIA_TTL_SECONDS);
      if (error || !data?.signedUrl) return null;
      return {
        mediaId: media.id,
        productId: media.productId,
        href: data.signedUrl,
        altText: media.altText,
        filename: media.filename,
        sourceVersion: fingerprint({
          id: media.id,
          updatedAt: media.updatedAt,
          storageKey: media.storageKey,
          state: media.state,
        }),
        policy: "xenios_signed_storage_v1" as const,
        expiresAt,
      };
      },
    ),
  );
  return presentations.filter((value) => value !== null);
}

/**
 * What one exact unit's inventory lots yield: whether it can be fulfilled, and
 * whether its lot documentation is satisfied. Both are derived from the same
 * allocatable-lot read, so they can never disagree about the same lots.
 */
export type VariantInventoryFacts = {
  inventory: CartInventoryEligibility;
  lotCoa: MemberCatalogLotCoaPresentation;
};

/**
 * The narrow read Private Early Access needs from this module.
 *
 * It is an interface rather than a direct function import so the Early Access
 * adapter can be tested with no database, and so nothing outside this file can
 * reach the rest of the member catalog service through it.
 */
export interface VariantInventoryFactsReader {
  readVariantInventoryFacts(input: {
    readonly productId: string;
    readonly variant: AdminProductVariant;
    readonly evaluatedAt: string;
  }): Promise<VariantInventoryFacts>;
}

/**
 * Fulfilment and lot documentation for one exact unit.
 *
 * Exported so Private Early Access derives both facts from this query and the
 * `research_lot_is_allocatable` decision rather than reimplementing a
 * safety-critical read. A second implementation of "may this lot be allocated"
 * is a second answer, and the wrong one puts a unit nobody may ship in front of
 * a paying customer.
 */
export async function inventoryFactsForVariant(
  db: SupabaseClient,
  productId: string,
  variant: AdminProductVariant,
  evaluatedAt: string,
): Promise<VariantInventoryFacts> {
  const result = await db
    .from("research_inventory_lots")
    .select("id,product_id,variant_id,sku,disposition,version,updated_at")
    .eq("product_id", productId)
    .eq("variant_id", variant.id)
    .eq("sku", variant.sku)
    .order("id");
  if (result.error) throw new Error("member_catalog_inventory_unavailable");
  const rows = (result.data ?? []) as InventoryLotRow[];
  const readiness = await Promise.all(
    rows.map(async (row) => {
      const allocatable = await db.rpc("research_lot_is_allocatable", {
        p_lot_id: row.id,
        p_as_of: evaluatedAt,
      });
      if (allocatable.error) {
        throw new Error("member_catalog_inventory_unavailable");
      }
      return { row, allocatable: allocatable.data === true };
    }),
  );
  return deriveVariantInventoryFacts(readiness, productId, variant.id, evaluatedAt);
}

/**
 * The one projection from allocatability-annotated lot rows to the two
 * inventory facts. Both the per-variant read above and the bulk read below end
 * here, so a variant read either way carries the identical facts and — the
 * part that breaks silently — the identical `sourceVersion`.
 *
 * That fingerprint is byte-locked to a SQL twin:
 * `research_persistent_cart_inventory_source_version`
 * (supabase/migrations/20260727200000_research_persistent_cart.sql) recomputes
 * it row for row, so the rows here must stay filtered to the exact unit,
 * ordered by lot id, with this property order.
 */
export function deriveVariantInventoryFacts(
  readiness: readonly { row: InventoryLotRow; allocatable: boolean }[],
  productId: string,
  variantId: string,
  evaluatedAt: string,
): VariantInventoryFacts {
  const eligible = readiness.some((item) => item.allocatable);
  const sourceVersion = fingerprint(
    readiness.map(({ row, allocatable }) => ({
      id: row.id,
      productId: row.product_id,
      variantId: row.variant_id,
      sku: row.sku,
      disposition: row.disposition,
      version: row.version,
      updatedAt: row.updated_at,
      allocatable,
    })),
  );
  return {
    inventory: {
      productId,
      variantId,
      state: eligible ? "eligible" : "unavailable",
      reason: eligible ? null : "not_currently_available",
      sourceVersion,
      evaluatedAt,
    },
    lotCoa: {
      productId,
      variantId,
      state: eligible ? "verified" : "required",
      sourceVersion,
      evaluatedAt,
    },
  };
}

async function inventoryFacts(
  db: SupabaseClient,
  products: readonly AdminProductDetail[],
  evaluatedAt: string,
): Promise<{
  inventoryEligibility: CartInventoryEligibility[];
  lotCoaPresentations: MemberCatalogLotCoaPresentation[];
}> {
  const results = await Promise.all(
    products.flatMap((product) =>
      product.variants.map((variant) =>
        inventoryFactsForVariant(db, product.id, variant, evaluatedAt),
      ),
    ),
  );
  return {
    inventoryEligibility: results.map((result) => result.inventory),
    lotCoaPresentations: results.map((result) => result.lotCoa),
  };
}

/**
 * The production inventory-facts reader.
 *
 * The client is resolved per call rather than captured, so a process that is
 * not configured for Supabase fails on the read instead of at construction, and
 * a caller can hold this object without holding a connection.
 */
export function createSupabaseVariantInventoryFactsReader(dependencies: {
  configured(): boolean;
  db(): SupabaseClient;
}): VariantInventoryFactsReader {
  return {
    async readVariantInventoryFacts({ productId, variant, evaluatedAt }) {
      if (!dependencies.configured()) {
        // Thrown, never answered with an "unavailable" fact. An unavailable
        // fact reads as "we looked and there is no stock"; this is "we did not
        // look", and the caller must be able to tell those apart.
        throw new Error("member_catalog_inventory_unavailable");
      }
      return inventoryFactsForVariant(
        dependencies.db(),
        productId,
        variant,
        evaluatedAt,
      );
    },
  };
}

export function buildProductionVariantInventoryFactsReader(): VariantInventoryFactsReader {
  return createSupabaseVariantInventoryFactsReader({
    configured: supabaseConfigured,
    db: getSupabaseAdmin,
  });
}

/**
 * The set-valued form of `VariantInventoryFactsReader`: the inventory facts
 * for EVERY requested unit, from ONE lot query plus one allocatability RPC per
 * lot actually found — bounded by real lots on the shelf, not by catalog size.
 * Today's per-variant path costs one query per variant before any lot exists.
 *
 * Every unit in the request gets an entry (a unit with no lot rows derives
 * from zero rows, exactly as the per-variant read answers), so a missing key
 * can only mean the unit was never asked for.
 */
export interface BulkVariantInventoryFactsReader {
  readAllVariantInventoryFacts(input: {
    readonly units: readonly {
      readonly productId: string;
      readonly variant: AdminProductVariant;
    }[];
    readonly evaluatedAt: string;
  }): Promise<ReadonlyMap<string, VariantInventoryFacts>>;
}

/** The key `readAllVariantInventoryFacts` maps by. Matches ops/unit-holds. */
function inventoryUnitKey(productId: string, variantId: string): string {
  return `${productId}\n${variantId}`;
}

/** Bounded fan-out for the per-lot allocatability RPCs. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await map(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * One bulk read for a whole catalog's inventory facts.
 *
 * The projection per unit is `deriveVariantInventoryFacts` — the SAME function
 * the per-variant read ends in — over rows grouped to the exact
 * (productId, variantId, sku) triple and kept in lot-id order, so the facts
 * and the byte-locked fingerprint are identical to a per-variant read of the
 * same rows. The allocatability decision stays with the
 * `research_lot_is_allocatable` RPC; nothing here re-implements it.
 *
 * A failed lot query or RPC throws `member_catalog_inventory_unavailable`,
 * exactly as the per-variant read does: "we could not look" must never
 * project as "there is nothing there".
 */
export function createSupabaseBulkVariantInventoryFactsReader(dependencies: {
  configured(): boolean;
  db(): SupabaseClient;
  /** RPC fan-out bound. Default 8: parallel enough, no stampede. */
  rpcConcurrency?: number;
}): BulkVariantInventoryFactsReader {
  const rpcConcurrency = dependencies.rpcConcurrency ?? 8;
  return {
    async readAllVariantInventoryFacts({ units, evaluatedAt }) {
      if (!dependencies.configured()) {
        throw new Error("member_catalog_inventory_unavailable");
      }
      const facts = new Map<string, VariantInventoryFacts>();
      if (units.length === 0) return facts;
      const db = dependencies.db();
      const productIds = Array.from(
        new Set(units.map((unit) => unit.productId)),
      );
      const result = await db
        .from("research_inventory_lots")
        .select("id,product_id,variant_id,sku,disposition,version,updated_at")
        .in("product_id", productIds)
        .order("id");
      if (result.error) throw new Error("member_catalog_inventory_unavailable");
      const rows = (result.data ?? []) as InventoryLotRow[];

      // Only lots that belong to a REQUESTED unit are decided. The grouping
      // filter is the per-variant query's WHERE clause, applied in memory.
      const requested = new Map(
        units.map((unit) => [
          inventoryUnitKey(unit.productId, unit.variant.id),
          unit,
        ]),
      );
      const rowsByUnit = new Map<string, InventoryLotRow[]>();
      for (const row of rows) {
        const key = inventoryUnitKey(row.product_id ?? "", row.variant_id ?? "");
        const unit = requested.get(key);
        if (unit === undefined) continue;
        if (row.sku !== unit.variant.sku) continue;
        const bucket = rowsByUnit.get(key);
        if (bucket) bucket.push(row);
        else rowsByUnit.set(key, [row]);
      }

      const decidedRows = Array.from(rowsByUnit.values()).flat();
      const allocatableByLot = new Map<string, boolean>();
      await mapWithConcurrency(decidedRows, rpcConcurrency, async (row) => {
        const allocatable = await db.rpc("research_lot_is_allocatable", {
          p_lot_id: row.id,
          p_as_of: evaluatedAt,
        });
        if (allocatable.error) {
          throw new Error("member_catalog_inventory_unavailable");
        }
        allocatableByLot.set(row.id, allocatable.data === true);
      });

      for (const [key, unit] of Array.from(requested.entries())) {
        const unitRows = rowsByUnit.get(key) ?? [];
        const readiness = unitRows.map((row) => ({
          row,
          allocatable: allocatableByLot.get(row.id) === true,
        }));
        facts.set(
          key,
          deriveVariantInventoryFacts(
            readiness,
            unit.productId,
            unit.variant.id,
            evaluatedAt,
          ),
        );
      }
      return facts;
    },
  };
}

export function buildProductionBulkVariantInventoryFactsReader(): BulkVariantInventoryFactsReader {
  return createSupabaseBulkVariantInventoryFactsReader({
    configured: supabaseConfigured,
    db: getSupabaseAdmin,
  });
}

export class MemberCatalogService {
  constructor(private readonly dependencies: MemberCatalogServiceDependencies) {}

  private async projectionInput(
    member: MemberRow,
  ): Promise<MemberCatalogProjectionInput> {
    if (!this.dependencies.configured()) {
      throw new Error("member_catalog_not_configured");
    }
    const evaluatedAt = this.dependencies.now().toISOString();
    const products = await this.dependencies.products.readCatalog();
    const db = this.dependencies.db();
    const [requiredInputs, readiness, mediaPresentations, inventory] =
      await Promise.all([
        this.dependencies.requiredInputs.list(),
        this.dependencies.requiredInputs.readinessAll(),
        signedMediaPresentations(db, products, evaluatedAt),
        inventoryFacts(db, products, evaluatedAt),
      ]);
    const source: MemberCatalogProjectionSource = {
      audienceEligibility: memberAudience(member, evaluatedAt),
      inventoryEligibility: inventory.inventoryEligibility,
      mediaPresentations,
      lotCoaPresentations: inventory.lotCoaPresentations,
      evaluatedAt,
      currency: CURRENCY,
    };
    return {
      products,
      requiredInputs: requiredInputs as RequiredInput[],
      readiness: readiness as DomainReadiness[],
      source,
    };
  }

  async list({
    member,
    query,
  }: MemberCatalogRequestContext): Promise<MemberCatalog> {
    return projectMemberCatalog(await this.projectionInput(member), query);
  }

  async detail({
    member,
    slug,
  }: MemberCatalogRequestContext): Promise<MemberProductDetail | null> {
    return projectMemberProductDetail(
      await this.projectionInput(member),
      slug ?? "",
    );
  }
}

export function buildMemberCatalogProductionService(): MemberCatalogService {
  return new MemberCatalogService({
    configured: supabaseConfigured,
    db: getSupabaseAdmin,
    products: createProductionProductControlReader(),
    requiredInputs: buildRequiredInputProductionRepository(),
    now: () => new Date(),
  });
}
