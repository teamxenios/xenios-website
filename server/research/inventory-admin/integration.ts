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
import {
  parseProductCommerceReadinessProjection,
} from "./row-parsers";

export type ProductCommerceReadinessDb = Pick<SupabaseClient, "rpc">;

export interface InventoryAdminProductionWiring {
  configured(): boolean;
  admin(): SupabaseClient;
}

const defaultWiring: InventoryAdminProductionWiring = {
  configured: supabaseConfigured,
  admin: getSupabaseAdmin,
};

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
    if (result.data === null) return null;
    return parseProductCommerceReadinessProjection(result.data);
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
