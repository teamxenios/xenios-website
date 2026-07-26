import type { ProductLane } from "./catalog";
import type {
  CartAudienceEligibility,
  CartInventoryEligibility,
  CartProductSelection,
  CartProductSelectionFailureCode,
  CartPurchaseAudience,
} from "./cart-product-selection";

export const MEMBER_CATALOG_SORTS = [
  "name_ascending",
  "name_descending",
  "recently_updated",
] as const;

export type MemberCatalogSort = (typeof MEMBER_CATALOG_SORTS)[number];

export type MemberCatalogQuery = {
  query?: string;
  lane?: ProductLane | "all";
  category?: string | "all";
  sort?: MemberCatalogSort;
};

export type MemberCatalogMediaPresentation = {
  mediaId: string;
  productId: string;
  href: string;
  altText: string;
  sourceVersion: string;
};

export type MemberCatalogLotCoaPresentation = {
  productId: string;
  variantId: string;
  state: "verified" | "required" | "not_applicable";
  sourceVersion: string;
  evaluatedAt: string;
};

export type MemberCatalogProjectionSource = {
  audienceEligibility: CartAudienceEligibility | null;
  inventoryEligibility: readonly CartInventoryEligibility[];
  mediaPresentations: readonly MemberCatalogMediaPresentation[];
  lotCoaPresentations: readonly MemberCatalogLotCoaPresentation[];
  evaluatedAt: string;
  currency: string;
};

export type MemberCatalogPrice = {
  id: string;
  amountCents: number;
  currency: string;
  effectiveAt: string;
  expiresAt: string | null;
  version: number;
};

export type MemberCatalogReadiness = {
  ready: true;
  verifiedInputCount: number;
  inputVersions: Array<{ id: string; version: number }>;
  domainVersions: Array<{ domain: string; version: number }>;
};

export type MemberCatalogVariant = {
  id: string;
  productId: string;
  sku: string;
  label: string;
  strength: string | null;
  size: string | null;
  format: string | null;
  presentation: string | null;
  shippingClass: string | null;
  price: MemberCatalogPrice | null;
  availability: "available" | "unavailable";
  lotCoaState: MemberCatalogLotCoaPresentation["state"];
  selection: CartProductSelection | null;
  selectionFailure: CartProductSelectionFailureCode | null;
};

export type MemberCatalogDisplayState =
  | "available"
  | "unavailable"
  | "documentation_pending"
  | "pricing_pending"
  | "catalog_only";

export type MemberCatalogCard = {
  id: string;
  slug: string;
  displayName: string;
  aliases: string[];
  lane: ProductLane;
  category: string;
  classification: string;
  summary: string;
  displayState: MemberCatalogDisplayState;
  media: MemberCatalogMediaPresentation | null;
  price: MemberCatalogPrice | null;
  readiness: MemberCatalogReadiness | null;
  selection: CartProductSelection | null;
  variantCount: number;
  updatedAt: string;
};

export type MemberProductDetail = MemberCatalogCard & {
  audience: CartPurchaseAudience;
  currency: string;
  evaluatedAt: string;
  canonicalName: string;
  overview: string | null;
  specifications: string | null;
  researchInformation: string | null;
  storageInformation: string | null;
  shippingInformation: string | null;
  returnInformation: string | null;
  disclaimers: string | null;
  reviewDate: string | null;
  variants: MemberCatalogVariant[];
  relatedProducts: MemberCatalogCard[];
  researchOnlyBoundary: boolean;
};

export type MemberCatalog = {
  audience: CartPurchaseAudience;
  currency: string;
  evaluatedAt: string;
  items: MemberCatalogCard[];
  categories: string[];
  lanes: ProductLane[];
};

export type MemberCatalogResult =
  | { ok: true; catalog: MemberCatalog }
  | { ok: false; code: "invalid_projection" };

export type MemberProductDetailResult =
  | { ok: true; product: MemberProductDetail }
  | { ok: false; code: "not_found" | "invalid_projection" };
