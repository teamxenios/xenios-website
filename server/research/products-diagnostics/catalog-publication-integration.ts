import type { Express } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogPublicationPilot } from "../assisted-order/request-intent/published-catalog-display";
import { createCatalogAssetHandler } from "./catalog-publication-asset";
import { createProductControlApprovalMediaBytesReader, createProductControlMediaBytesReader } from "./catalog-publication-blob";
import { createProductControlPublicationAuthorityAdmin, createSupabasePublicationAuthorityStore } from "./publication-authority.mjs";
import type { createProductControlPublicationAdmin } from "./publication-admin.mjs";
import { exactIdentity, type Identity, type PublicationPorts } from "./publication.mjs";

interface ProductControlPilotConfiguration {
  selected: Identity;
  db: SupabaseClient;
  mediaBucket: string;
  requireAdmin: Parameters<typeof createProductControlPublicationAdmin>[0]["requireAdmin"];
  assertBinding: PublicationPorts<object>["assertBinding"];
  isEligible: PublicationPorts<object>["isEligible"];
}

/** Called by the server composition root for a specifically selected pilot. */
export function mountProductControlPublication(
  app: Express, configuration: ProductControlPilotConfiguration,
): CatalogPublicationPilot {
  const selected = Object.freeze(exactIdentity(configuration.selected));
  const admin = createProductControlPublicationAuthorityAdmin({
    requireAdmin: configuration.requireAdmin,
    identityFor: async (productId, variantId) =>
      productId === selected.productId && variantId === selected.variantId ? selected : null,
    ports: {
      store: createSupabasePublicationAuthorityStore(configuration.db),
      readMediaBytes: createProductControlMediaBytesReader(configuration.db, configuration.mediaBucket),
      assertBinding: configuration.assertBinding,
      isEligible: configuration.isEligible,
      readApprovalMediaBytes: createProductControlApprovalMediaBytesReader(configuration.db, configuration.mediaBucket),
    },
  });
  admin.register(app);
  app.use("/api/research/catalog-media", createCatalogAssetHandler({
    selected, readPublishedAsset: admin.service.readPublishedAsset,
  }));
  return { selected, readPublishedRevision: admin.service.readPublishedRevision };
}
