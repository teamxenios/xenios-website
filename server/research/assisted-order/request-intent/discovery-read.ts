/**
 * The viewer-scoped, read-only discovery snapshot (KAN-60 S1, D0 decision A in KAN-225/14538).
 *
 * It reads the same canonical master catalog, viewer authority, action policy and hold
 * facts as the request-intent catalog (./catalog.ts), and returns the published manifest,
 * the exact dataset identity and one minimal fact per visible variant. The browser
 * evaluates the guide itself.
 *
 * The read takes the viewer and nothing else: no body, query, answer, goal, free text,
 * selection, referral or cart. It writes nothing and logs nothing. Any fact it cannot
 * resolve from a canonical or reviewed source refuses the whole snapshot. A pathway, a
 * dataset identity and "not held" are never inferred from a name or a missing field.
 *
 * Production has no published manifest: UNAVAILABLE_DISCOVERY_MANIFEST is the default
 * port, so this read answers `manifest_unavailable` before it touches the catalog. Only
 * a separately reviewed content/privacy/clinical record may replace that port.
 */
import { projectAssistedOrderCatalogItem } from "../../../../shared/research/assisted-order/action-policy";
import type { BindingPathway, DiscoveryCatalogFact, DiscoveryManifest } from "../../../../shared/research/assisted-order/discovery/contract";
import {
  DISCOVERY_READ_MAX_FACTS, DISCOVERY_READ_SCHEMA_VERSION, discoveryManifestRefusal, discoveryReadUnavailable,
  parseDiscoveryPathways, type DiscoveryReadAvailable, type DiscoveryReadResponse,
} from "../../../../shared/research/assisted-order/discovery/read-contract";
import { directPurchaseRefusal } from "../../../../shared/research/master-offerings/pathway-authority";
import { requestStoreWidening } from "../../../../shared/research/master-offerings/quote-cart";
import { isHcgStrengthReview } from "../../../../shared/research/master-offerings/hcg-strength-review";
import { isFormulationHeld } from "../../../../shared/research/master-offerings/formulation-hold";
import { isResearchFormUnconfirmed } from "../../../../client/src/research/product-media/reviewed-form-holds";
import { authorityFor, type AssistedOrderMasterCatalogInput } from "../production-catalog";
import type { AssistedOrderViewer } from "../ports";
import type { NormalizedMasterOffering, NormalizedMasterOfferingVariant } from "../../master-offerings/model";
import { inquiryReviewStateFor } from "../../master-offerings/inquiry-review-states";
import { isReviewedDatasetVariant } from "../../master-offerings/reviewed-content";
import reviewedContentBatch from "../../master-offerings/data/reviewed-public-content.json";

/** The published manifest, or null. */
export type DiscoveryManifestPort = () => DiscoveryManifest | null;
/** A reviewed discovery pathway classification for one canonical variant, or null when none exists. */
export type DiscoveryPathwayPort = (offeringId: string, variantId: string) => readonly BindingPathway[] | null;
/** The exact dataset identity a loaded variant came from, or null when it is not known. */
export type DiscoveryDatasetPort = (offering: NormalizedMasterOffering, variant: NormalizedMasterOfferingVariant) => string | null;

/** Production default: no manifest is published. */
export const UNAVAILABLE_DISCOVERY_MANIFEST: DiscoveryManifestPort = () => null;
/** Production default: no variant has a reviewed discovery pathway. */
export const UNRESOLVED_DISCOVERY_PATHWAYS: DiscoveryPathwayPort = () => null;
/**
 * The reviewed dataset bytes the catalog registered at load (reviewed-content.ts). A row of
 * any other dataset has no known identity.
 */
export const REVIEWED_DISCOVERY_DATASET: DiscoveryDatasetPort = (offering, variant) =>
  isReviewedDatasetVariant(offering, variant) ? reviewedContentBatch.datasetSha256 : null;

export type DiscoveryReadDependencies = Readonly<{
  catalog: AssistedOrderMasterCatalogInput;
  manifest?: DiscoveryManifestPort;
  pathways?: DiscoveryPathwayPort;
  dataset?: DiscoveryDatasetPort;
}>;

export type DiscoveryRead = (viewer: AssistedOrderViewer) => Promise<DiscoveryReadResponse>;

const SCAN_PAGE_SIZE = 100;
const SCAN_MAX_PAGES = 500;

class DiscoveryReadRefusal extends Error {
  constructor(readonly reason: "dataset_unresolved" | "facts_unresolved" | "facts_limit" | "catalog_unavailable") {
    super(reason);
  }
}

/**
 * True when the variant may not be matched to a goal. It is the union of every current
 * restriction the request-intent catalog applies to the same row: a held or pending
 * display state, a formulation, form or strength hold, a reviewed inquiry state, and a
 * coming-soon or non-merchandise row. Over-holding only removes a match. It never hides
 * a catalog row.
 */
function heldForDiscovery(input: AssistedOrderMasterCatalogInput, offering: NormalizedMasterOffering,
  variant: NormalizedMasterOfferingVariant, authority: ReturnType<typeof authorityFor>): boolean {
  const subject = {
    family: offering.family, displayState: offering.displayState, variantDisplayState: variant.displayState,
    specification: variant.label, reviewedHolds: input.reviewedFormulationHolds,
  } as const;
  const refusal = directPurchaseRefusal(subject);
  const { comingSoon, nonMerchandise } = requestStoreWidening(subject);
  return authority.held || authority.classificationPending
    || refusal === "formulation_hold" || refusal === "non_merchandise_family"
    || refusal === "family_outside_launch_scope" || refusal === "classification_pending"
    || comingSoon || nonMerchandise
    || isHcgStrengthReview(offering.id, variant.id)
    || inquiryReviewStateFor(offering.id, variant.id) !== null
    || isResearchFormUnconfirmed(variant.id, offering.id)
    || isFormulationHeld(variant.label, input.reviewedFormulationHolds);
}

export function createDiscoveryRead(deps: DiscoveryReadDependencies): DiscoveryRead {
  const manifestPort = deps.manifest ?? UNAVAILABLE_DISCOVERY_MANIFEST;
  const pathwayPort = deps.pathways ?? UNRESOLVED_DISCOVERY_PATHWAYS;
  const datasetPort = deps.dataset ?? REVIEWED_DISCOVERY_DATASET;
  const input = deps.catalog;

  // Every visible variant this viewer may see, with one dataset identity for all of them.
  async function scan(viewer: AssistedOrderViewer): Promise<{ facts: DiscoveryCatalogFact[]; dataset: string }> {
    const service = input.serviceFor(viewer);
    if (!service) throw new DiscoveryReadRefusal("catalog_unavailable");
    const facts: DiscoveryCatalogFact[] = [];
    const seenOfferings = new Set<string>();
    const seenVariants = new Set<string>();
    let dataset: string | null = null;
    let total: number | null = null;
    for (let page = 1; page <= SCAN_MAX_PAGES; page += 1) {
      const selection = await service.select({ page, pageSize: SCAN_PAGE_SIZE });
      if (!Number.isSafeInteger(selection.page.total) || selection.page.total < 0
        || selection.page.page !== page || selection.page.pageSize < 1) throw new DiscoveryReadRefusal("catalog_unavailable");
      if (total !== null && total !== selection.page.total) throw new DiscoveryReadRefusal("catalog_unavailable");
      total = selection.page.total;
      for (const offering of selection.offerings) {
        if (seenOfferings.has(offering.id)) throw new DiscoveryReadRefusal("catalog_unavailable");
        seenOfferings.add(offering.id);
        // The same offering-based topology the request-intent catalog requires (catalog.ts): one variant per offering.
        if (offering.variants.length !== 1) throw new DiscoveryReadRefusal("catalog_unavailable");
        const variant = offering.variants[0];
        if (seenVariants.has(variant.id)) throw new DiscoveryReadRefusal("catalog_unavailable");
        seenVariants.add(variant.id);
        // Viewer scope comes from serviceFor(viewer): it returns only what this viewer may see.
        // Every row it returns must then project, exactly as catalog.ts requires; a row that
        // does not is a disagreement between authorities, which refuses rather than being skipped.
        const authority = authorityFor(offering, variant, selection.prices.get(variant.id),
          input.bindingFor(variant.id), input.catalogVersion, input.reviewedFormulationHolds);
        if (!projectAssistedOrderCatalogItem(authority)) throw new DiscoveryReadRefusal("catalog_unavailable");
        const identity = datasetPort(offering, variant);
        if (identity === null || (dataset !== null && identity !== dataset)) throw new DiscoveryReadRefusal("dataset_unresolved");
        dataset = identity;
        const pathways = parseDiscoveryPathways(pathwayPort(offering.id, variant.id));
        if (!pathways) throw new DiscoveryReadRefusal("facts_unresolved");
        // A provider-workflow row may only be classified for clinical information. A reviewed
        // classification that says otherwise contradicts the canonical pathway authority.
        if (authority.providerWorkflowRequired
          && pathways.some((pathway) => pathway === "personal_wellness" || pathway === "laboratory_research")) {
          throw new DiscoveryReadRefusal("facts_unresolved");
        }
        if (facts.length >= DISCOVERY_READ_MAX_FACTS) throw new DiscoveryReadRefusal("facts_limit");
        facts.push(Object.freeze({
          offeringId: offering.id, variantId: variant.id, visible: true,
          held: heldForDiscovery(input, offering, variant, authority), pathways,
        }));
      }
      if (seenOfferings.size === total) {
        if (dataset === null) throw new DiscoveryReadRefusal("dataset_unresolved");
        return { facts, dataset };
      }
      if (seenOfferings.size > total || selection.offerings.length === 0) throw new DiscoveryReadRefusal("catalog_unavailable");
    }
    // Never call a truncated catalog complete.
    throw new DiscoveryReadRefusal("catalog_unavailable");
  }

  return async (viewer) => {
    let manifest: DiscoveryManifest | null;
    try { manifest = manifestPort(); } catch { return discoveryReadUnavailable("manifest_invalid"); }
    // No manifest, no catalog read.
    if (manifest === null) return discoveryReadUnavailable("manifest_unavailable");
    let snapshot: { facts: DiscoveryCatalogFact[]; dataset: string };
    try {
      snapshot = await scan(viewer);
    } catch (error) {
      return discoveryReadUnavailable(error instanceof DiscoveryReadRefusal ? error.reason : "catalog_unavailable");
    }
    const served = new Set(snapshot.facts.map((fact) => `${fact.offeringId}\u0000${fact.variantId}`));
    // Bindings for a variant this viewer cannot see are removed, so no hidden identity is served.
    // The checks run on the narrowed manifest, which is exactly what the browser re-checks.
    let narrowed: DiscoveryManifest;
    try {
      narrowed = { ...manifest, bindings: manifest.bindings.filter((binding) => served.has(`${binding.offeringId}\u0000${binding.variantId}`)) };
    } catch {
      return discoveryReadUnavailable("manifest_invalid");
    }
    const refusal = discoveryManifestRefusal(narrowed, snapshot.dataset);
    if (refusal) return discoveryReadUnavailable(refusal);
    const response: DiscoveryReadAvailable = {
      schemaVersion: DISCOVERY_READ_SCHEMA_VERSION, state: "available", manifest: narrowed,
      catalogDatasetSha256: snapshot.dataset, facts: Object.freeze(snapshot.facts), fullCatalogAvailable: true,
    };
    return Object.freeze(response);
  };
}
