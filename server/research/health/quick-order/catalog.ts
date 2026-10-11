import { createHash } from "node:crypto";
import type { AssistedOrderCatalogItem } from "../../../../shared/research/assisted-order/contract";
import { isMasterOfferingFamily } from "../../../../shared/research/master-offerings/contract";
import { NON_MERCHANDISE_FAMILIES, PROVIDER_PATHWAY_FAMILIES } from "../../../../shared/research/master-offerings/pathway-authority";
import type { AssistedOrderViewer } from "../../assisted-order/ports";
import type { createAssistedOrderMasterCatalogCallbacks } from "../../assisted-order/production-catalog";

const SOURCE_PAGE_SIZE = 100;
const DEFAULT_MAX_SCAN_PAGES = 500;
const US_REGIONS = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
const MODES = new Set(["direct_order_request", "provider_request", "request_pricing", "request_activation", "availability_review"]);

/** This is the public projection, not a product row or a transactional grant. */
export type QuickOrderCanonicalCatalogItem = Readonly<{
  productId: string;
  variantId: string;
  productName: string;
  family: string;
  specification: string | null;
  workflowMode: AssistedOrderCatalogItem["workflowMode"];
  unitPriceCents: number | null;
  currency: "USD";
  catalogVersion: string;
  priceVersion: string | null;
  minimumQuantity: number;
  maximumQuantity: number;
  quantityIncrement: number;
  researchUseOnly: boolean;
  requestable: boolean;
  accessNotice: string | null;
}>;

export type QuickOrderCatalogItem = QuickOrderCanonicalCatalogItem;

export class QuickOrderCatalogUnavailable extends Error {
  readonly code = "catalog_unavailable";
  constructor() { super("The current catalog authority is unavailable."); }
}

export type QuickOrderCanonicalCatalogDependencies = Readonly<{
  /** Pass the callbacks from the existing viewer-authorized master catalog. */
  catalog: Pick<ReturnType<typeof createAssistedOrderMasterCatalogCallbacks>, "list" | "resolve">;
  /** Additional canonical Health visibility. Absence never grants visibility. */
  visibility: ((viewer: AssistedOrderViewer, item: AssistedOrderCatalogItem) => boolean | Promise<boolean>) | null;
  /**
   * An existing authoritative destination policy, never a US-state allowlist
   * masquerading as serviceability. Shipping region is not encounter location.
   * sourceVersion names its decision evidence; this adapter cannot lock it.
   */
  destinationEligibility: ((input: Readonly<{
    viewer: AssistedOrderViewer;
    item: AssistedOrderCatalogItem;
    shippingRegion: string;
  }>) => Promise<Readonly<{ allowed: boolean; sourceVersion: string }> | null>) | null;
  maxScanPages?: number;
}>;

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max &&
    value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value);
}

function assertViewer(viewer: AssistedOrderViewer): void {
  if (!viewer.capabilities.has("assisted_orders:submit") ||
    !((viewer.actorType === "member" && validText(viewer.memberId, 200)) ||
      (viewer.actorType === "early_access_session" && validText(viewer.earlyAccessSessionHash, 200) &&
        validText(viewer.earlyAccessCustomerRef, 200)))) throw new QuickOrderCatalogUnavailable();
}

/**
 * No spread: costs, supplier identity, source selection and private notes never
 * enter this result. No guessed quantity defaults: an unstated cap is closed.
 */
export function projectQuickOrderCanonicalCatalogItem(item: AssistedOrderCatalogItem): QuickOrderCanonicalCatalogItem {
  if (!item || !validText(item.productId, 200) || !validText(item.variantId, 200) ||
    !validText(item.productName, 250) || !isMasterOfferingFamily(item.family) ||
    !MODES.has(item.workflowMode) || typeof item.researchUseOnly !== "boolean" ||
    item.currency !== "USD" || !validText(item.catalogVersion, 500) ||
    !(item.priceVersion === null || validText(item.priceVersion, 160)) ||
    !(item.specification === null || validText(item.specification, 250)) ||
    !(item.accessNotice === null || validText(item.accessNotice, 500)) ||
    !Number.isSafeInteger(item.minimumQuantity) || item.minimumQuantity < 1 ||
    !Number.isSafeInteger(item.maximumQuantity) || item.maximumQuantity === null || item.maximumQuantity < item.minimumQuantity ||
    !Number.isSafeInteger(item.quantityIncrement) || item.quantityIncrement < 1 ||
    !(item.unitPriceCents === null || (Number.isSafeInteger(item.unitPriceCents) && item.unitPriceCents > 0))) {
    throw new QuickOrderCatalogUnavailable();
  }
  // A provider family cannot be promoted by an inconsistent display mode.
  const provider = item.workflowMode === "provider_request" || PROVIDER_PATHWAY_FAMILIES.has(item.family);
  const unavailable = item.workflowMode === "availability_review" || NON_MERCHANDISE_FAMILIES.has(item.family);
  // request_activation preserves its visible state, but does not prove the
  // intended-use classification needed for this Health request form.
  const classificationPending = item.workflowMode === "request_activation";
  const requestable = !provider && !unavailable && !classificationPending && !item.researchUseOnly;
  const publicFacts = {
    productId: item.productId,
    variantId: item.variantId,
    productName: item.productName,
    family: item.family,
    specification: item.specification,
    workflowMode: provider ? "provider_request" as const : unavailable ? "availability_review" as const : item.workflowMode,
    unitPriceCents: provider || classificationPending ? null : item.unitPriceCents,
    currency: "USD" as const,
    priceVersion: provider || classificationPending ? null : item.priceVersion,
    minimumQuantity: item.minimumQuantity,
    maximumQuantity: item.maximumQuantity,
    quantityIncrement: item.quantityIncrement,
    researchUseOnly: item.researchUseOnly,
    requestable,
    accessNotice: provider
      ? "Continue through Xenios Care for provider routing. This form cannot accept a medication order or approve treatment."
      : classificationPending
        ? "Classification or documentation review is required before this item can be requested through Health."
        : item.accessNotice,
  };
  return Object.freeze({
    ...publicFacts,
    // Supplements the legacy catalog path string with actual projected facts.
    // This detects client staleness; it is NOT a transactional version guard.
    catalogVersion: `qo-v1:${digest({ sourceVersion: item.catalogVersion, ...publicFacts })}`,
  });
}

export function createQuickOrderCanonicalCatalog(deps: QuickOrderCanonicalCatalogDependencies) {
  const maxScanPages = deps.maxScanPages ?? DEFAULT_MAX_SCAN_PAGES;
  if (!Number.isSafeInteger(maxScanPages) || maxScanPages < 1 || maxScanPages > DEFAULT_MAX_SCAN_PAGES) {
    throw new QuickOrderCatalogUnavailable();
  }

  async function visible(viewer: AssistedOrderViewer, item: AssistedOrderCatalogItem): Promise<boolean> {
    if (!deps.visibility) throw new QuickOrderCatalogUnavailable();
    const result = await deps.visibility(viewer, item);
    if (typeof result !== "boolean") throw new QuickOrderCatalogUnavailable();
    return result;
  }

  async function scan(viewer: AssistedOrderViewer, search: string) {
    const rows: QuickOrderCanonicalCatalogItem[] = [];
    const sourceFacts: QuickOrderCanonicalCatalogItem[] = [];
    const identities = new Set<string>();
    const variants = new Set<string>();
    let expectedTotal: number | null = null;
    for (let page = 1; page <= maxScanPages; page += 1) {
      const result = await deps.catalog.list(viewer, { page, pageSize: SOURCE_PAGE_SIZE, search });
      if (!result || !Number.isSafeInteger(result.total) || result.total < 0 ||
        result.total > maxScanPages * SOURCE_PAGE_SIZE || result.page !== page ||
        result.pageSize !== SOURCE_PAGE_SIZE || !Array.isArray(result.items) ||
        result.items.length > SOURCE_PAGE_SIZE || (expectedTotal !== null && result.total !== expectedTotal)) {
        throw new QuickOrderCatalogUnavailable();
      }
      expectedTotal = result.total;
      const remaining = expectedTotal - (page - 1) * SOURCE_PAGE_SIZE;
      if (result.items.length !== Math.min(SOURCE_PAGE_SIZE, Math.max(0, remaining))) {
        throw new QuickOrderCatalogUnavailable();
      }
      for (const item of result.items) {
        const projected = projectQuickOrderCanonicalCatalogItem(item);
        const key = JSON.stringify([projected.productId, projected.variantId]);
        if (identities.has(key) || variants.has(projected.variantId)) throw new QuickOrderCatalogUnavailable();
        identities.add(key);
        variants.add(projected.variantId);
        sourceFacts.push(projected);
        if (await visible(viewer, item)) rows.push(projected);
      }
      if (page * SOURCE_PAGE_SIZE >= expectedTotal) {
        return { rows, fingerprint: digest({ total: expectedTotal, sourceFacts, rows }) };
      }
    }
    throw new QuickOrderCatalogUnavailable();
  }

  return Object.freeze({
    async listCatalog(viewer: AssistedOrderViewer, query: Readonly<{ page: number; pageSize: number; search: string }>) {
      assertViewer(viewer);
      if (!deps.visibility || !Number.isSafeInteger(query.page) || query.page < 1 || query.page > 99_999 || query.pageSize !== 24 ||
        typeof query.search !== "string" || query.search.length > 120 || /[\u0000-\u001f\u007f]/u.test(query.search)) {
        throw new QuickOrderCatalogUnavailable();
      }
      const search = query.search.trim();
      // Two bounded, complete reads detect observed reorder/content/visibility
      // drift. Matching reads are not proof of an atomic catalog snapshot.
      const first = await scan(viewer, search);
      const second = await scan(viewer, search);
      if (first.fingerprint !== second.fingerprint) throw new QuickOrderCatalogUnavailable();
      const start = (query.page - 1) * query.pageSize;
      return Object.freeze({
        items: Object.freeze(second.rows.slice(start, start + query.pageSize)),
        total: second.rows.length,
        page: query.page,
        pageSize: query.pageSize,
      });
    },

    async resolveItem(viewer: AssistedOrderViewer, productId: string, variantId: string, shippingRegion: string) {
      assertViewer(viewer);
      if (!validText(productId, 200) || !validText(variantId, 200) || !US_REGIONS.has(shippingRegion) ||
        !deps.destinationEligibility) return null;
      const item = await deps.catalog.resolve(viewer, productId, variantId);
      if (!item || item.productId !== productId || item.variantId !== variantId || !(await visible(viewer, item))) return null;
      const projected = projectQuickOrderCanonicalCatalogItem(item);
      if (!projected.requestable) return null;
      const eligibility = await deps.destinationEligibility({ viewer, item, shippingRegion });
      if (!eligibility || eligibility.allowed !== true || !validText(eligibility.sourceVersion, 500)) return null;
      // commit must repeat/guard this decision with the real transactional
      // authority. This successful read alone grants no persistence capability.
      return projected;
    },
  });
}
