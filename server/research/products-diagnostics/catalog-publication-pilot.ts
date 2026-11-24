import type { Express } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedMasterOffering } from "../master-offerings/model";
import { loadBindingIndex } from "../master-offerings/production-bindings";
import { reviewedHeldSpecifications } from "../master-offerings/reviewed-holds";
import { isPublishableSupplement } from "../master-offerings/catalog-publication-eligibility";
import { mountProductControlPublication } from "./catalog-publication-integration";
import { exactIdentity, type Identity } from "./publication.mjs";

type PilotConfiguration = Parameters<typeof mountProductControlPublication>[1];

/** The four IDs persist across a rights or eligibility change so staff can withdraw
 * the selected revision. Each display, seal and publish still checks current data. */
export function registerCatalogPublicationPilotApi(app: Express, deps: {
  env: NodeJS.ProcessEnv;
  getDatabase: () => SupabaseClient | null;
  createCatalogReader: (env: NodeJS.ProcessEnv) => { readCatalog(): readonly NormalizedMasterOffering[] } | null;
  requireAdmin: PilotConfiguration["requireAdmin"];
  mediaBucket: string;
  reportUnavailable: () => void;
}) {
  const raw = deps.env.XENIOS_CATALOG_PUBLICATION_PILOT;
  if (!raw) return;

  let selected: Identity;
  let db: SupabaseClient | null;
  try {
    selected = exactIdentity(JSON.parse(raw));
    db = deps.getDatabase();
  } catch {
    deps.reportUnavailable();
    return;
  }
  if (!db) {
    deps.reportUnavailable();
    return;
  }
  let catalog: ReturnType<typeof deps.createCatalogReader> = null;
  const selectedPair = (id: Identity) => id.productId === selected.productId && id.variantId === selected.variantId
    && id.offeringId === selected.offeringId && id.offeringVariantId === selected.offeringVariantId;
  return mountProductControlPublication(app, {
    selected, db, requireAdmin: deps.requireAdmin, mediaBucket: deps.mediaBucket,
    async assertBinding(id) {
      if (!selectedPair(id)) return false;
      const { index, problem } = loadBindingIndex({ env: deps.env });
      const binding = index.get(id.offeringId + "|" + id.offeringVariantId);
      return problem === null && binding?.offeringVariantId === id.offeringVariantId
        && binding.productId === id.productId && binding.variantId === id.variantId;
    },
    async isEligible(id) {
      if (!selectedPair(id)) return false;
      catalog ??= deps.createCatalogReader(deps.env);
      if (!catalog) return false;
      const matches = catalog.readCatalog().filter(offering => offering.id === id.offeringId);
      if (matches.length !== 1) return false;
      const variants = matches[0].variants.filter(variant => variant.id === id.offeringVariantId);
      return variants.length === 1 && isPublishableSupplement(matches[0], variants[0], reviewedHeldSpecifications());
    },
  });
}
