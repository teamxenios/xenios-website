import type {
  AdminCsvParseOptions,
  AdminCsvSchema,
  AdminCsvSerializeOptions,
} from "../admin-data-exchange";
import type {
  AdminProductMedia,
  AdminProductPrice,
  AdminProductSummary,
  AdminProductVariant,
  CreateAdminPriceInput,
  CreateAdminProductInput,
  CreateAdminVariantInput,
  PrepareAdminMediaInput,
} from "../product-admin";

export const PRODUCT_CONTROL_CSV_PROFILES = [
  "products",
  "variants",
  "prices",
  "media",
] as const;

export type ProductControlCsvProfile =
  (typeof PRODUCT_CONTROL_CSV_PROFILES)[number];

export type ProductCsvField =
  | "productId"
  | "productCode"
  | "slug"
  | "displayName"
  | "canonicalName"
  | "aliasesJson"
  | "lane"
  | "category"
  | "classification";

export type VariantCsvField =
  | "variantId"
  | "productId"
  | "sku"
  | "catalogNumber"
  | "label"
  | "strength"
  | "size"
  | "format"
  | "presentation"
  | "shippingClass"
  | "memberEligible"
  | "sortOrder";

export type PriceCsvField =
  | "priceId"
  | "productId"
  | "variantId"
  | "audience"
  | "amountCents"
  | "currency"
  | "effectiveAt"
  | "expiresAt";

export type MediaCsvField =
  | "mediaId"
  | "productId"
  | "storageKey"
  | "kind"
  | "filename"
  | "contentType"
  | "sizeBytes"
  | "altText"
  | "sortOrder";

export type ProductControlCsvField =
  | ProductCsvField
  | VariantCsvField
  | PriceCsvField
  | MediaCsvField;

export const PRODUCT_CSV_SCHEMA: AdminCsvSchema<ProductCsvField> = {
  strictHeaders: true,
  columns: [
    { key: "productId", header: "Product ID" },
    { key: "productCode", header: "Product Code" },
    { key: "slug", header: "Slug" },
    { key: "displayName", header: "Display Name" },
    { key: "canonicalName", header: "Canonical Name" },
    { key: "aliasesJson", header: "Aliases JSON" },
    { key: "lane", header: "Lane" },
    { key: "category", header: "Category" },
    { key: "classification", header: "Classification" },
  ],
};

export const VARIANT_CSV_SCHEMA: AdminCsvSchema<VariantCsvField> = {
  strictHeaders: true,
  columns: [
    { key: "variantId", header: "Variant ID" },
    { key: "productId", header: "Product ID" },
    { key: "sku", header: "SKU" },
    { key: "catalogNumber", header: "Catalog Number" },
    { key: "label", header: "Label" },
    { key: "strength", header: "Strength" },
    { key: "size", header: "Size" },
    { key: "format", header: "Format" },
    { key: "presentation", header: "Presentation" },
    { key: "shippingClass", header: "Shipping Class" },
    { key: "memberEligible", header: "Member Eligible" },
    { key: "sortOrder", header: "Sort Order" },
  ],
};

export const PRICE_CSV_SCHEMA: AdminCsvSchema<PriceCsvField> = {
  strictHeaders: true,
  columns: [
    { key: "priceId", header: "Price ID" },
    { key: "productId", header: "Product ID" },
    { key: "variantId", header: "Variant ID" },
    { key: "audience", header: "Audience" },
    { key: "amountCents", header: "Amount Cents" },
    { key: "currency", header: "Currency" },
    { key: "effectiveAt", header: "Effective At" },
    { key: "expiresAt", header: "Expires At" },
  ],
};

export const MEDIA_CSV_SCHEMA: AdminCsvSchema<MediaCsvField> = {
  strictHeaders: true,
  columns: [
    { key: "mediaId", header: "Media ID" },
    { key: "productId", header: "Product ID" },
    { key: "storageKey", header: "Storage Key" },
    { key: "kind", header: "Kind" },
    { key: "filename", header: "Filename" },
    { key: "contentType", header: "Content Type" },
    { key: "sizeBytes", header: "Size Bytes" },
    { key: "altText", header: "Alt Text" },
    { key: "sortOrder", header: "Sort Order" },
  ],
};

export const PRODUCT_CONTROL_CSV_SCHEMAS = {
  products: PRODUCT_CSV_SCHEMA,
  variants: VARIANT_CSV_SCHEMA,
  prices: PRICE_CSV_SCHEMA,
  media: MEDIA_CSV_SCHEMA,
} as const;

export interface ProductCsvDraftCommand {
  kind: "product_draft";
  productId: string;
  input: CreateAdminProductInput;
}

export interface VariantCsvDraftCommand {
  kind: "variant_draft";
  variantId: string;
  productId: string;
  input: Required<
    Pick<CreateAdminVariantInput, "sku" | "label" | "memberEligible" | "sortOrder">
  > &
    Omit<
      CreateAdminVariantInput,
      "sku" | "label" | "memberEligible" | "sortOrder"
    >;
}

export interface PriceCsvDraftCommand {
  kind: "price_draft";
  priceId: string;
  productId: string;
  input: CreateAdminPriceInput;
}

/**
 * Metadata only. `storageKey` is an existing private object reference. This
 * contract cannot upload, sign, expose, approve, or otherwise operate on it.
 */
export interface MediaCsvDraftCommand {
  kind: "media_metadata_draft";
  mediaId: string;
  productId: string;
  storageKey: string;
  input: Required<Pick<PrepareAdminMediaInput, "sortOrder">> &
    Omit<PrepareAdminMediaInput, "sortOrder">;
}

export interface ProductControlCsvDraftBundle {
  products?: readonly ProductCsvDraftCommand[];
  variants?: readonly VariantCsvDraftCommand[];
  prices?: readonly PriceCsvDraftCommand[];
  media?: readonly MediaCsvDraftCommand[];
}

export interface ProductControlCsvBindingContext {
  productIds?: readonly string[];
  variantProductIds?: Readonly<Record<string, string>>;
}

export const PRODUCT_CONTROL_CSV_DOMAIN_ERROR_CODES = [
  "required_value",
  "invalid_identifier",
  "invalid_text",
  "invalid_json",
  "invalid_enum",
  "invalid_boolean",
  "invalid_integer",
  "invalid_date",
  "invalid_date_range",
  "invalid_storage_reference",
  "duplicate_identifier",
  "duplicate_business_key",
  "unknown_product_binding",
  "unknown_variant_binding",
  "variant_product_mismatch",
] as const;

export type ProductControlCsvDomainErrorCode =
  (typeof PRODUCT_CONTROL_CSV_DOMAIN_ERROR_CODES)[number];

export type ProductControlCsvErrorCode =
  | import("../admin-data-exchange").AdminCsvErrorCode
  | ProductControlCsvDomainErrorCode;

/**
 * Stable coordinate-only validation metadata. Values, rows, files, object keys,
 * storage paths, and provider/decoder messages are deliberately excluded.
 */
export interface ProductControlCsvValidationError {
  code: ProductControlCsvErrorCode;
  profile: ProductControlCsvProfile;
  scope: "file" | "header" | "row" | "field";
  message: string;
  row?: number;
  column?: number;
  field?: ProductControlCsvField;
}

export type ProductControlCsvResult<T> =
  | {
      ok: true;
      commands: readonly T[];
      byteLength: number;
    }
  | {
      ok: false;
      errors: readonly ProductControlCsvValidationError[];
    };

export type ProductControlCsvRelationshipResult =
  | { ok: true }
  | {
      ok: false;
      errors: readonly ProductControlCsvValidationError[];
    };

export type ProductControlCsvExportResult =
  | {
      ok: true;
      csv: string;
      bytes: Uint8Array;
      byteLength: number;
    }
  | {
      ok: false;
      errors: readonly ProductControlCsvValidationError[];
    };

export interface ProductControlCsvParseOptions extends AdminCsvParseOptions {
  bindings?: ProductControlCsvBindingContext;
}

export type ProductControlCsvSerializeOptions = AdminCsvSerializeOptions;

export type ProductCsvExportSource = Pick<
  AdminProductSummary,
  | "id"
  | "productCode"
  | "slug"
  | "displayName"
  | "canonicalName"
  | "aliases"
  | "lane"
  | "category"
  | "classification"
>;

export type VariantCsvExportSource = Pick<
  AdminProductVariant,
  | "id"
  | "productId"
  | "sku"
  | "catalogNumber"
  | "label"
  | "strength"
  | "size"
  | "format"
  | "presentation"
  | "shippingClass"
  | "memberEligible"
  | "sortOrder"
>;

export type PriceCsvExportSource = Pick<
  AdminProductPrice,
  | "id"
  | "productId"
  | "variantId"
  | "audience"
  | "amountCents"
  | "currency"
  | "effectiveAt"
  | "expiresAt"
>;

export type MediaCsvExportSource = Pick<
  AdminProductMedia,
  | "id"
  | "productId"
  | "kind"
  | "storageKey"
  | "filename"
  | "contentType"
  | "sizeBytes"
  | "altText"
  | "sortOrder"
>;
