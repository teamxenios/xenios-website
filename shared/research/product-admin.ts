import type {
  CommerceApprovalState,
  DocumentState,
  ProductAvailability,
  ProductLane,
} from "./catalog";

export const PRODUCT_ADMIN_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "published",
  "archived",
] as const;

export type ProductAdminStatus = (typeof PRODUCT_ADMIN_STATUSES)[number];

export const PRODUCT_VISIBILITY_STATES = [
  "hidden",
  "members_only",
  "public",
] as const;

export type ProductVisibilityState =
  (typeof PRODUCT_VISIBILITY_STATES)[number];

export const VARIANT_ADMIN_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "archived",
] as const;

export type VariantAdminStatus = (typeof VARIANT_ADMIN_STATUSES)[number];

export const PRICE_ADMIN_STATUSES = [
  "draft",
  "approved",
  "active",
  "expired",
  "superseded",
] as const;

export type PriceAdminStatus = (typeof PRICE_ADMIN_STATUSES)[number];

export const PRICE_AUDIENCES = [
  "retail",
  "member",
  "professional",
  "wholesale",
  "compare_at",
] as const;

export type PriceAudience = (typeof PRICE_AUDIENCES)[number];

export const PRODUCT_MEDIA_KINDS = [
  "primary_image",
  "gallery_image",
] as const;

export type ProductMediaKind = (typeof PRODUCT_MEDIA_KINDS)[number];

export const PRODUCT_MEDIA_STATES = [
  "pending_upload",
  "uploaded",
  "in_review",
  "approved",
  "rejected",
  "archived",
] as const;
export const PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS = [
  { key: "products.sku", domain: "products", recordType: "product" },
  { key: "products.family", domain: "products", recordType: "product" },
  {
    key: "product_content.primary_image",
    domain: "product_content",
    recordType: "product",
  },
  {
    key: "product_content.storage_information",
    domain: "product_content",
    recordType: "product",
  },
] as const;


export type ProductMediaState = (typeof PRODUCT_MEDIA_STATES)[number];

export interface AdminProductSummary {
  id: string;
  productCode: string;
  slug: string;
  displayName: string;
  canonicalName: string;
  aliases: string[];
  lane: ProductLane;
  category: string;
  classification: string;
  status: ProductAdminStatus;
  active: boolean;
  visibility: ProductVisibilityState;
  availability: ProductAvailability;
  commerceApproval: CommerceApprovalState;
  qualityDocumentState: DocumentState;
  variantCount: number;
  approvedVariantCount: number;
  missingInputCount: number;
  updatedAt: string;
  publishedAt: string | null;
}

export interface AdminProductVariant {
  id: string;
  productId: string;
  sku: string;
  catalogNumber: string | null;
  label: string;
  strength: string | null;
  size: string | null;
  format: string | null;
  presentation: string | null;
  shippingClass: string | null;
  memberEligible: boolean;
  status: VariantAdminStatus;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductPrice {
  id: string;
  productId: string;
  variantId: string;
  audience: PriceAudience;
  amountCents: number;
  currency: string;
  effectiveAt: string;
  expiresAt: string | null;
  status: PriceAdminStatus;
  approvalNote: string | null;
  version: number;
  createdBy: string;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductMedia {
  id: string;
  productId: string;
  kind: ProductMediaKind;
  state: ProductMediaState;
  storageKey: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  altText: string;
  sortOrder: number;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductContent {
  shortDescription: string | null;
  longDescription: string | null;
  overview: string | null;
  specifications: string | null;
  researchInformation: string | null;
  storageInformation: string | null;
  handlingInformation: string | null;
  shippingInformation: string | null;
  returnInformation: string | null;
  disclaimers: string | null;
  citations: string[];
  reviewDate: string | null;
}

export interface AdminProductDetail extends AdminProductSummary {
  content: AdminProductContent;
  variants: AdminProductVariant[];
  prices: AdminProductPrice[];
  media: AdminProductMedia[];
  history: Array<{
    at: string;
    action: string;
    actor: string;
    detail: string | null;
  }>;
}

export interface AdminProductListFilters {
  query?: string;
  lane?: ProductLane;
  visibility?: ProductVisibilityState;
  status?: ProductAdminStatus;
  commerceApproval?: CommerceApprovalState;
  qualityDocumentState?: DocumentState;
  missingInputsOnly?: boolean;
}

export interface CreateAdminProductInput {
  productCode: string;
  slug: string;
  displayName: string;
  canonicalName: string;
  aliases?: string[];
  lane: ProductLane;
  category: string;
  classification: string;
}

export interface DuplicateAdminProductInput {
  productCode: string;
  slug: string;
  displayName: string;
}

export interface UpdateAdminProductInput {
  displayName?: string;
  canonicalName?: string;
  aliases?: string[];
  lane?: ProductLane;
  category?: string;
  classification?: string;
  active?: boolean;
  visibility?: ProductVisibilityState;
  availability?: ProductAvailability;
  commerceApproval?: CommerceApprovalState;
  qualityDocumentState?: DocumentState;
  content?: Partial<AdminProductContent>;
}

export interface CreateAdminVariantInput {
  sku: string;
  catalogNumber?: string | null;
  label: string;
  strength?: string | null;
  size?: string | null;
  format?: string | null;
  presentation?: string | null;
  shippingClass?: string | null;
  memberEligible?: boolean;
  sortOrder?: number;
}

export type UpdateAdminVariantInput = Partial<CreateAdminVariantInput> & {
  status?: VariantAdminStatus;
  active?: boolean;
};

export interface PrepareAdminMediaInput {
  kind: ProductMediaKind;
  filename: string;
  contentType: string;
  sizeBytes: number;
  altText: string;
  sortOrder?: number;
}

export interface CreateAdminPriceInput {
  variantId: string;
  audience: PriceAudience;
  amountCents: number;
  currency: string;
  effectiveAt: string;
  expiresAt?: string | null;
  approvalNote?: string | null;
}

export interface ProductAdminMutationResult {
  product: AdminProductDetail;
  created: boolean;
}
