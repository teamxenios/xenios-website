import type {
  CommerceApprovalState,
  ProductAvailability,
  ProductLane,
} from "@shared/research/catalog";

export const PRODUCT_FAMILIES = [
  "research_vials",
  "blends",
  "supplements",
  "programs",
  "quantum",
  "laboratory_supplies",
  "diagnostics",
  "clinician_guided_care",
  "storage_and_organization",
] as const;

export type ProductFamily = (typeof PRODUCT_FAMILIES)[number];

export const PRODUCT_FAMILY_LABELS: Record<ProductFamily | "all_products", string> = {
  research_vials: "Research Vials",
  blends: "Blends",
  supplements: "Supplements",
  programs: "Programs",
  quantum: "Quantum",
  laboratory_supplies: "Laboratory Supplies",
  diagnostics: "Diagnostics",
  clinician_guided_care: "Clinician-Guided Care",
  storage_and_organization: "Storage and Organization",
  all_products: "All Products",
};

export const PRODUCT_TRUTH_STATES = [
  "available",
  "request_access",
  "coming_soon",
  "documentation_pending",
  "out_of_stock",
  "under_review",
  "clinician_pathway_pending",
  "not_currently_offered",
] as const;

export type ProductTruthState = (typeof PRODUCT_TRUTH_STATES)[number];

export const PRODUCT_TRUTH_LABELS: Record<ProductTruthState, string> = {
  available: "Available",
  request_access: "Request access",
  coming_soon: "Coming soon",
  documentation_pending: "Documentation pending",
  out_of_stock: "Out of stock",
  under_review: "Under review",
  clinician_pathway_pending: "Clinician pathway pending",
  not_currently_offered: "Not currently offered",
};

export const PRODUCT_PAGE_SECTIONS = [
  "overview",
  "specifications",
  "certificate_of_analysis",
  "research_information",
  "storage_and_handling",
  "shipping_and_returns",
  "documentation",
  "related_products",
  "request_an_alternative",
] as const;

export type ProductPageSection = (typeof PRODUCT_PAGE_SECTIONS)[number];

export type ProductTemplateClass =
  | "research_material"
  | "blend"
  | "supplement"
  | "program"
  | "quantum"
  | "laboratory_supply"
  | "diagnostic"
  | "clinician_guided_care"
  | "storage_accessory";

export interface ProductRecord {
  productId: string;
  slug: string;
  displayName: string;
  family: ProductFamily;
  templateClass: ProductTemplateClass;
  searchAliases: string[];
  sourceLane: ProductLane | null;
  adminEditable: true;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariantRecord {
  variantId: string;
  productId: string;
  sku: string;
  label: string;
  attributes: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ProductLotRecord {
  lotId: string;
  variantId: string;
  lotCode: string;
  state: "pending_release" | "released" | "quarantined" | "exhausted";
  receivedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCertificateRecord {
  certificateId: string;
  lotId: string;
  documentType: "certificate_of_analysis";
  documentState: "pending" | "available" | "withdrawn";
  privateStorageKey: string | null;
  verificationState: "review_pending" | "document_on_file" | "withdrawn";
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductMediaRecord {
  mediaId: string;
  productId: string;
  kind: "primary_image" | "gallery_image" | "document_preview";
  state: "pending" | "approved" | "withdrawn";
  storageKey: string | null;
  altText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductContentRecord {
  contentId: string;
  productId: string;
  section: ProductPageSection;
  state: "draft" | "in_review" | "published" | "withdrawn";
  heading: string | null;
  body: string | null;
  adminEditable: true;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCommerceRecord {
  commerceId: string;
  productId: string;
  truthState: ProductTruthState;
  sourceAvailability: ProductAvailability | null;
  sourceApproval: CommerceApprovalState | null;
  priceCents: number | null;
  inventoryVisible: boolean;
  purchasable: boolean;
  checkoutMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductMaster {
  products: ProductRecord[];
  variants: ProductVariantRecord[];
  lots: ProductLotRecord[];
  certificates: ProductCertificateRecord[];
  media: ProductMediaRecord[];
  content: ProductContentRecord[];
  commerce: ProductCommerceRecord[];
}

export interface ProductFamilySummary {
  family: ProductFamily | "all_products";
  label: string;
  productCount: number;
}

export function emptyProductMaster(): ProductMaster {
  return {
    products: [],
    variants: [],
    lots: [],
    certificates: [],
    media: [],
    content: [],
    commerce: [],
  };
}

