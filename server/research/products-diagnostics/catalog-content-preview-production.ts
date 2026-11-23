import { loadBindingIndex } from "../master-offerings/production-bindings";
import { createMasterOfferingCatalogReaderFromEnv } from "../master-offerings/dataset-reader";
import { projectMasterOfferingVariant } from "../master-offerings/customer-projection";
import { createCatalogContentPreview } from "./catalog-content-preview";

// Server-only adapter. Same override/fail-closed loading and reviewed-dataset
// registration as the existing catalog. No copied JSON loader or new store.
export const readCatalogContentPreview = createCatalogContentPreview({
  bindings: () => loadBindingIndex(),
  catalog: () => {
    const reader = createMasterOfferingCatalogReaderFromEnv();
    if (!reader) throw new Error("catalog_unavailable");
    return reader.readCatalog();
  },
  project: (offering, variant) => projectMasterOfferingVariant(offering, variant),
});
