import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";
import {
  SupabaseIdempotencyStore,
  type IdempotencyRow,
} from "../commerce/persistence/idempotency-store";
import {
  ProductAdminService,
  type ProductAdminIdempotency,
  type ProductAdminRepository,
  type ProductReleaseGate,
} from "./product-admin";
import {
  SupabaseProductAdminRepository,
  productAdminIdempotency,
  productReleaseGateFromRequiredInputs,
} from "./product-admin-production";

export interface ProductAdminProductionWiring {
  configured(): boolean;
  admin(): SupabaseClient;
}

const defaultWiring: ProductAdminProductionWiring = {
  configured: supabaseConfigured,
  admin: getSupabaseAdmin,
};

function productAdminUnavailable(): Error {
  return new Error("product_admin_not_configured");
}

function unavailableRepository(): ProductAdminRepository {
  const unavailable = async (): Promise<never> => {
    throw productAdminUnavailable();
  };
  return {
    list: unavailable,
    get: unavailable,
    create: unavailable,
    duplicate: unavailable,
    update: unavailable,
    setLifecycle: unavailable,
    createVariant: unavailable,
    updateVariant: unavailable,
    createPrice: unavailable,
    approvePrice: unavailable,
    createMediaUpload: unavailable,
    confirmMediaUpload: unavailable,
    updateMedia: unavailable,
  };
}

const unavailableReleaseGate: ProductReleaseGate = {
  async evaluate() {
    throw productAdminUnavailable();
  },
};

const unavailableIdempotency: ProductAdminIdempotency = {
  async run() {
    throw productAdminUnavailable();
  },
};

/**
 * Website 2-owned production composition. Routes are always registered so a
 * missing Supabase dependency returns stable JSON instead of an API 404, while
 * every configured mutation uses the durable idempotency store and the exact
 * canonical required-input readiness gate.
 */
export function buildProductAdminProductionService(
  wiring: ProductAdminProductionWiring = defaultWiring,
): ProductAdminService {
  if (!wiring.configured()) {
    return new ProductAdminService(
      unavailableRepository(),
      unavailableReleaseGate,
      unavailableIdempotency,
    );
  }

  const db = wiring.admin();
  return new ProductAdminService(
    new SupabaseProductAdminRepository(db),
    productReleaseGateFromRequiredInputs(db),
    productAdminIdempotency(
      new SupabaseIdempotencyStore(db as unknown as IdempotencyRow),
    ),
  );
}
