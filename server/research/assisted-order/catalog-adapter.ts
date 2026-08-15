import type {
  AssistedOrderCatalogItem,
  AssistedOrderCatalogPage,
  AssistedOrderCatalogQuery,
  AssistedOrderLineInput,
} from "../../../shared/research/assisted-order/contract";
import type {
  AssistedOrderCatalogPort,
  AssistedOrderViewer,
  ResolvedAssistedOrderLine,
} from "./ports";

/**
 * Adapts the current canonical Product Control/master-catalog reader without
 * duplicating catalog storage. Fable should wire the callbacks to the existing
 * general catalog service used by the member-safe master catalog.
 */
export class CallbackAssistedOrderCatalogAdapter
  implements AssistedOrderCatalogPort
{
  public constructor(
    private readonly callbacks: Readonly<{
      list(
        viewer: AssistedOrderViewer,
        query: AssistedOrderCatalogQuery,
      ): Promise<AssistedOrderCatalogPage>;
      resolve(
        viewer: AssistedOrderViewer,
        productId: string,
        variantId: string,
      ): Promise<AssistedOrderCatalogItem | null>;
      fingerprint(item: AssistedOrderCatalogItem): string;
    }>,
  ) {}

  public list(
    viewer: AssistedOrderViewer,
    query: AssistedOrderCatalogQuery,
  ): Promise<AssistedOrderCatalogPage> {
    return this.callbacks.list(viewer, query);
  }

  public async resolveLine(
    viewer: AssistedOrderViewer,
    line: AssistedOrderLineInput,
  ): Promise<ResolvedAssistedOrderLine> {
    const item = await this.callbacks.resolve(
      viewer,
      line.productId,
      line.variantId,
    );
    if (!item) {
      throw new Error("Catalog item is unavailable or not authorized.");
    }
    return Object.freeze({
      lineId: "assigned-by-service",
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      specification: item.specification,
      format: item.format,
      packBasis: item.packBasis,
      quantity: line.quantity,
      minimumQuantity: item.minimumQuantity,
      maximumQuantity: item.maximumQuantity,
      quantityIncrement: item.quantityIncrement,
      workflowMode: item.workflowMode,
      customerActionLabel: item.actionLabel,
      unitPriceCents: item.unitPriceCents,
      lineEstimateCents: null,
      currency: item.currency,
      catalogVersion: item.catalogVersion,
      priceVersion: item.priceVersion,
      accessNotice: item.accessNotice,
      researchUseOnly: item.researchUseOnly,
      authoritativeFingerprint: this.callbacks.fingerprint(item),
    });
  }
}
