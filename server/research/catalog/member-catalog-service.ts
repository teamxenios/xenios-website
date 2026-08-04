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

type InventoryLotRow = {
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
      variantId: variant.id,
      state: eligible ? "eligible" : "unavailable",
      reason: eligible ? null : "not_currently_available",
      sourceVersion,
      evaluatedAt,
    },
    lotCoa: {
      productId,
      variantId: variant.id,
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
