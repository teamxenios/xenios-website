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

export interface ReviewedProductMedia {
  readonly primary: CatalogDiscoveryImage;
  readonly labelPreview?: CatalogDiscoveryImage;
  readonly packagingDesign: boolean;
}

export interface ReviewedProductContentRecord {
  readonly offeringId: string;
  readonly sourceVariantId: string;
  readonly content: ReviewedProductContent;
}

export function reviewedPackage(content: ReviewedProductContent | undefined): string | undefined {
  return content?.specifications?.find(({ label }) => label === "Package")?.value;
}
