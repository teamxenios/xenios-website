import { loadBindingIndex } from "../master-offerings/production-bindings";
import { projectMasterOfferingVariant } from "../master-offerings/customer-projection";
import { createCatalogContentPreview, type CatalogPreviewReaders } from "./catalog-content-preview";

// Server-only adapter. Same override/fail-closed loading and reviewed-dataset
// registration as the existing catalog. No copied JSON loader or new store.
export function createProductionCatalogContentPreview(catalog: CatalogPreviewReaders["catalog"]) {
  return createCatalogContentPreview({
    bindings: () => loadBindingIndex(),
    catalog,
    project: (offering, variant) => projectMasterOfferingVariant(offering, variant),
  });
}
