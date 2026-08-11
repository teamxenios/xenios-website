import type {
  MasterOfferingCatalogPage,
  MasterOfferingCatalogQuery,
  MasterOfferingDetailView,
} from "@shared/research/master-offerings/contract";
import { projectMasterOfferingDetail } from "./customer-projection";
import type {
  MasterOfferingCommerceResolver,
  NormalizedMasterOffering,
} from "./model";
import { queryMasterOfferings } from "./search";

export interface MasterOfferingCatalogReader {
  readCatalog():
    | Promise<readonly NormalizedMasterOffering[]>
    | readonly NormalizedMasterOffering[];
}

export class MasterOfferingCatalogService {
  constructor(
    private readonly reader: MasterOfferingCatalogReader,
    private readonly commerce: MasterOfferingCommerceResolver,
  ) {}

  async list(
    query: MasterOfferingCatalogQuery,
  ): Promise<MasterOfferingCatalogPage> {
    const products = await this.reader.readCatalog();
    return queryMasterOfferings(products, query);
  }

  async detail(slug: string): Promise<MasterOfferingDetailView | null> {
    const normalized = String(slug ?? "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,191}$/.test(normalized)) return null;
    const products = await this.reader.readCatalog();
    const matches = products.filter(
      (product) => product.visibility === "member" && product.slug === normalized,
    );
    if (matches.length !== 1) return null;
    return projectMasterOfferingDetail(matches[0], this.commerce);
  }
}

export class InMemoryMasterOfferingCatalogReader
  implements MasterOfferingCatalogReader
{
  constructor(private readonly products: readonly NormalizedMasterOffering[]) {}

  readCatalog(): readonly NormalizedMasterOffering[] {
    return this.products;
  }
}
