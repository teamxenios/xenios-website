import type { IncomingMessage } from "node:http";
import type { AssistedOrderViewer } from "../../research/assisted-order/ports";
import type { QuickOrderCatalogItem } from "./catalog";

/** Package v0.1 contract, narrowed to canonical request authority. No browser identity. */
export interface QuickOrderSession { actorId: string; csrfToken: string }
export interface Agreement {
  kind: string; version: string; label: string; url: string | null;
  type?: "legal" | "form_acknowledgment";
}
export type CatalogItem = QuickOrderCatalogItem;
export interface Address { line1: string; line2?: string; city: string; region: string; postalCode: string; countryCode: "US" }
export interface RequestLine {
  productId: string; variantId: string; quantity: number;
  expectedCatalogVersion: string; expectedPriceVersion: string | null;
}
export interface NormalizedSubmission {
  schemaVersion: "quick-order-v1"; idempotencyKey: string;
  contact: { fullLegalName: string; email: string; mobilePhone: string; organizationName: string;
    ageConfirmed: true; shippingAddress: Address; billingSameAsShipping: boolean; billingAddress: Address };
  referral: { kind: string; detail: string; declaredCode: string; confirmed: true };
  affiliation: { kind: string; detail: string };
  lines: RequestLine[]; agreements: { kind: string; version: string }[]; requestAcknowledged: true;
}
export interface Estimate { knownSubtotalCents: number; estimateComplete: boolean; currency: "USD"; excludes: string }
export interface PublicReceipt {
  requestId: string; publicReference: string;
  attributionState: "direct_no_referrer" | "captured_unmatched"; estimate: Estimate;
}
export interface AttributionSnapshot {
  schemaVersion: "attribution-v1"; source: string; sourceDetail: string;
  declaredAffiliateCode: string | null; affiliation: { kind: string; detail: string };
  confirmedByCustomer: true; receivedAt: string;
  reviewState: "direct_no_referrer" | "captured_unmatched"; commissionState: "not_authorized";
}
export interface CommitArguments {
  input: NormalizedSubmission; payloadHash: string; attribution: AttributionSnapshot;
  snapshots: Array<{ productId: string; variantId: string; quantity: number;
    workflowMode: CatalogItem["workflowMode"]; unitPriceCents: number | null;
    catalogVersion: string; priceVersion: string | null }>;
  computedEstimate: Estimate; receivedAt: string;
}
export interface QuickOrderPorts {
  productionReady: boolean;
  session(req: IncomingMessage): Promise<QuickOrderSession | null>;
  config(session: QuickOrderSession): Promise<{ enabled: boolean; agreements: Agreement[]; disabledReason?: string }>;
  listCatalog(session: QuickOrderSession, query: { page: number; pageSize: number; search: string }): Promise<{ items: readonly CatalogItem[]; total: number; page: number; pageSize: number }>;
  resolveItem(session: QuickOrderSession, productId: string, variantId: string, customerState: string): Promise<CatalogItem | null>;
  takeRateLimit(session: QuickOrderSession, req: IncomingMessage): Promise<boolean>;
  getExisting(session: QuickOrderSession, key: string): Promise<{ payloadHash: string; publicReceipt: PublicReceipt } | null>;
  commit(session: QuickOrderSession, args: CommitArguments): Promise<PublicReceipt & { persisted: true; replayed?: boolean }>;
  onOperationalError?(event: { code: "quick_order_unavailable" }): void;
}

/** Required extension of the EXISTING assisted-order domain, not a second ledger.
 * No implementation or schema authority is claimed by this interface. Production
 * binding stays disabled until a reviewed canonical implementation can supply it.
 */
export interface QuickOrderAssistedOrderExtension {
  getExisting(viewer: AssistedOrderViewer, actorId: string, key: string): Promise<{ payloadHash: string; publicReceipt: PublicReceipt } | null>;
  commit(viewer: AssistedOrderViewer, actorId: string, args: CommitArguments): Promise<PublicReceipt & { persisted: true; replayed?: boolean }>;
}
