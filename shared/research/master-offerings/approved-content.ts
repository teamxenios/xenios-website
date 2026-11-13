import type { CatalogDiscoveryImage } from "./presentation-contract";

/** Reviewed customer copy for one exact source variant. Commerce authority is separate. */
export interface ReviewedProductContent {
  readonly summary: string;
  readonly overview: string;
  readonly brand?: string;
  readonly specifications?: readonly { readonly label: string; readonly value: string }[];
  readonly purpose?: string;
  readonly ingredients?: string;
  readonly label?: string;
  readonly cautions?: string;
  readonly storage?: string;
  readonly documentation?: readonly { readonly label: string; readonly href: string }[];
}

/**
 * What a studio image is. A proposed container is a design, not the container a
 * pharmacy dispenses; a catalog reference is not a photograph of this product.
 */
export const PRODUCT_MEDIA_REPRESENTATIONS = ["proposed_carton", "proposed_vial", "catalog_reference"] as const;
export type ProductMediaRepresentation = (typeof PRODUCT_MEDIA_REPRESENTATIONS)[number];

/** One caption per representation, shown directly under the image on every screen width. */
export const PRODUCT_MEDIA_REPRESENTATION_CAPTIONS: Readonly<Record<ProductMediaRepresentation, string>> = Object.freeze({
  proposed_carton: "Proposed Xenios outer carton. Actual packaging is unconfirmed.",
  proposed_vial: "Proposed Xenios vial design. Actual container is unconfirmed.",
  catalog_reference: "Catalog reference artwork. Physical packaging is unverified.",
});

export interface ReviewedProductMedia {
  readonly primary: CatalogDiscoveryImage;
  readonly labelPreview?: CatalogDiscoveryImage;
  readonly packagingDesign: boolean;
  /** Set on studio records only. When present it decides the caption; packagingDesign is not read. */
  readonly representation?: ProductMediaRepresentation;
}

export interface ReviewedProductContentRecord {
  readonly offeringId: string;
  readonly sourceVariantId: string;
  readonly content: ReviewedProductContent;
}

export function reviewedPackage(content: ReviewedProductContent | undefined): string | undefined {
  return content?.specifications?.find(({ label }) => label === "Package")?.value;
}
