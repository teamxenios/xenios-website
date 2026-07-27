import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";
import type {
  ProductCommerceReadinessProjection,
  ProductCommerceReadinessReader,
} from "../products-diagnostics/product-commerce-readiness";
import type { InventoryLotAdminDependencies } from "./routes";
import {
  SupabaseInventoryLotAdminRepository,
  SupabaseLotQualityAdminRepository,
} from "./production";

export type ProductCommerceReadinessDb = Pick<SupabaseClient, "rpc">;

export interface InventoryAdminProductionWiring {
  configured(): boolean;
  admin(): SupabaseClient;
}

const defaultWiring: InventoryAdminProductionWiring = {
  configured: supabaseConfigured,
  admin: getSupabaseAdmin,
};

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function validProjection(value: unknown): ProductCommerceReadinessProjection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const productId = nullableString(row.productId);
  const variantId = nullableString(row.variantId);
  const sku = nullableString(row.sku);
  if (
    !productId ||
    !variantId ||
    !sku ||
    typeof row.productApproved !== "boolean" ||
    typeof row.productActive !== "boolean" ||
    typeof row.variantApproved !== "boolean" ||
    typeof row.variantActive !== "boolean" ||
    !(row.shippingClass === null || typeof row.shippingClass === "string") ||
    typeof row.exactLotCoaRequired !== "boolean" ||
    typeof row.productDocumentationRequired !== "boolean" ||
    row.activePrice !== null
  ) {
    return null;
  }
  return {
    productId,
    variantId,
    sku,
    productApproved: row.productApproved,
    productActive: row.productActive,
    variantApproved: row.variantApproved,
    variantActive: row.variantActive,
    activePrice: null,
    shippingClass: row.shippingClass,
    exactLotCoaRequired: row.exactLotCoaRequired,
    productDocumentationRequired: row.productDocumentationRequired,
  };
}

export class SupabaseProductCommerceReadinessReader
implements ProductCommerceReadinessReader {
  constructor(private readonly db: ProductCommerceReadinessDb) {}

  async getForVariant(
    variantId: string,
  ): Promise<ProductCommerceReadinessProjection | null> {
    const result = await this.db.rpc(
      "research_inventory_product_variant_projection",
      { p_variant_id: variantId },
    );
    if (result.error) {
      throw new Error("inventory_product_control_unavailable");
    }
    return validProjection(result.data);
  }
}

function unavailableDependencies(): InventoryLotAdminDependencies {
  const unavailable = async (): Promise<never> => {
    throw new Error("inventory_admin_not_configured");
  };
  return {
    inventory: {
      listLots: unavailable,
      createLot: unavailable,
      applyMovement: unavailable,
      setDisposition: unavailable,
      listMovements: unavailable,
    },
    quality: {
      listDocuments: unavailable,
      prepareUpload: unavailable,
      cancelUpload: unavailable,
      confirmUpload: unavailable,
      review: unavailable,
      createReadGrant: unavailable,
    },
  };
}

export function buildInventoryLotAdminIntegrationDependencies(
  wiring: InventoryAdminProductionWiring = defaultWiring,
): InventoryLotAdminDependencies {
  if (!wiring.configured()) return unavailableDependencies();
  const db = wiring.admin();
  const productReadiness = new SupabaseProductCommerceReadinessReader(db);
  return {
    inventory: new SupabaseInventoryLotAdminRepository(db, productReadiness),
    quality: new SupabaseLotQualityAdminRepository(db),
  };
}
