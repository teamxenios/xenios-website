// xenios research: the product media model.
//
// The question this module answers is narrow and it is a truthfulness question,
// not a design question: for a given product variant, WHAT DO WE ACTUALLY HOLD,
// and what is the strongest truthful thing a surface may show?
//
// The organising rule, which everything below serves:
//
//   A Xenios generated render is a drawing of a product. A supplier photograph is
//   a photograph of a product taken or supplied by the party that makes it. They
//   are different claims about reality. Relabelling the first as the second is the
//   image system's version of writing a certificate of analysis we do not hold.
//
// So provenance is DERIVED from the source type at construction, never accepted
// from a caller, and it can never be promoted afterwards. Any source type that
// asserts a real photograph requires a rights record with evidence on file. There
// is no default, no fallback, and no "unknown" that resolves upward.
//
// A missing asset stays missing. The correct output for a product we have no
// image for is the state NONE, not a placeholder dressed up as a product shot.

// ---------------------------------------------------------------------------
// Closed unions
// ---------------------------------------------------------------------------

/**
 * Where an image sits on a surface. The role matters to verification because a
 * label or package shot makes a factual claim about the exact item (its strength
 * is legible on the vial), while a lifestyle shot does not.
 */
export const IMAGE_ROLES = [
  "card",
  "detail_hero",
  "gallery",
  "label",
  "package",
  "lifestyle",
  "document_preview",
] as const;

export type ImageRole = (typeof IMAGE_ROLES)[number];

/**
 * Roles whose image is understood by a reader as depicting THIS exact item, so a
 * strength printed on the pictured vial is read as the strength being offered.
 */
export const IDENTITY_BEARING_ROLES: readonly ImageRole[] = [
  "card",
  "detail_hero",
  "label",
  "package",
];

/** How the pixels came to exist. */
export const MEDIA_SOURCE_TYPES = [
  "official_brand",
  "licensed_supplier",
  "xenios_generated_render",
  "commissioned_photography",
  "internal_placeholder",
] as const;

export type MediaSourceType = (typeof MEDIA_SOURCE_TYPES)[number];

/**
 * Source types that assert a camera photographed the real product. Every one of
 * them requires a rights record, because we are both making a factual claim about
 * the item and using someone else's or a hired photographer's work.
 */
export const PHOTOGRAPHIC_SOURCE_TYPES: readonly MediaSourceType[] = [
  "official_brand",
  "licensed_supplier",
  "commissioned_photography",
];

/**
 * The immutable provenance tag written into the asset's metadata. This is the
 * value a surface, an export, a partner payload, and an audit read. It is derived
 * from the source type and is never supplied by a caller.
 */
export const PROVENANCE_TAGS = [
  "generated_product_render",
  "supplier_photograph",
  "commissioned_photograph",
  "internal_placeholder",
] as const;

export type ProvenanceTag = (typeof PROVENANCE_TAGS)[number];

const PROVENANCE_BY_SOURCE: Record<MediaSourceType, ProvenanceTag> = {
  official_brand: "supplier_photograph",
  licensed_supplier: "supplier_photograph",
  commissioned_photography: "commissioned_photograph",
  xenios_generated_render: "generated_product_render",
  internal_placeholder: "internal_placeholder",
};

/**
 * The provenance tag for a source type. Exported because verification and the
 * coverage report both need to reason about provenance without constructing an
 * asset first.
 */
export function provenanceTagFor(sourceType: MediaSourceType): ProvenanceTag {
  return PROVENANCE_BY_SOURCE[sourceType];
}

/**
 * Rights position for the asset.
 *
 * `RIGHTS_NOT_REQUIRED` means Xenios owns the pixels outright (a render we made,
 * an internal placeholder). It is NOT a way to skip the rights gate: a
 * photographic source type may never carry it.
 */
export const RIGHTS_STATUSES = [
  "RIGHTS_ON_FILE",
  "RIGHTS_REQUESTED",
  "RIGHTS_NOT_HELD",
  "RIGHTS_NOT_REQUIRED",
] as const;

export type RightsStatus = (typeof RIGHTS_STATUSES)[number];

/** Has the pictured item been confirmed to be the exact product and variant. */
export const IDENTITY_VERIFICATION_STATUSES = [
  "VERIFIED_EXACT_VARIANT",
  "PENDING_VERIFICATION",
  "MISMATCH",
  "UNVERIFIED",
] as const;

export type IdentityVerificationStatus = (typeof IDENTITY_VERIFICATION_STATUSES)[number];

/**
 * What a surface may do with the asset. Ordered strongest to weakest. `NONE` is a
 * real, valid, expected state: it says truthfully that we hold nothing.
 */
export const MEDIA_PUBLIC_STATUSES = [
  "PUBLISHED",
  "APPROVED_NOT_PUBLISHED",
  "PENDING_APPROVAL",
  "BLOCKED_ON_RIGHTS",
  "BLOCKED_ON_IDENTITY",
  "NONE",
] as const;

export type MediaPublicStatus = (typeof MEDIA_PUBLIC_STATUSES)[number];

// ---------------------------------------------------------------------------
// Rights evidence
// ---------------------------------------------------------------------------

/** What a rights grant is for. */
export const RIGHTS_SCOPES = [
  "product_photography",
  "packaging_artwork",
  "lifestyle_imagery",
  "document_preview",
] as const;

export type RightsScope = (typeof RIGHTS_SCOPES)[number];

/**
 * A rights grant we can actually point at. Every field is required because a
 * half filled record is not evidence: if we cannot name the holder and point at
 * the grant, we do not hold the rights.
 */
export interface RightsRecord {
  /** Our identifier for the grant. */
  readonly recordId: string;
  /** The party that granted the rights. */
  readonly holder: string;
  /** ISO date the grant was made. */
  readonly grantedOn: string;
  /** ISO date the grant lapses, or null for an open ended grant. */
  readonly expiresOn: string | null;
  /** Pointer to the stored grant document. Never the document text itself. */
  readonly evidenceRef: string;
  readonly scope: RightsScope;
}

// ---------------------------------------------------------------------------
// Focal and crop data
// ---------------------------------------------------------------------------

/** Normalised focal point, 0 to 1 in each axis, for art directed cropping. */
export interface FocalPoint {
  readonly x: number;
  readonly y: number;
}

export interface CropData {
  readonly focal: FocalPoint;
  /** Aspect ratio the asset is authored at, as width divided by height. */
  readonly authoredAspect: number;
}

// ---------------------------------------------------------------------------
// The asset
// ---------------------------------------------------------------------------

/**
 * Private brand. A `ProductMediaAsset` value can only be produced by
 * `createProductMediaAsset`, which is where the provenance and rights rules are
 * enforced. An object literal cannot be widened into this type, so there is no
 * path that skips the gate.
 */
declare const provenanceChecked: unique symbol;

export interface ProductMediaAsset {
  readonly [provenanceChecked]: true;

  readonly assetId: string;
  readonly productId: string;
  /** Null when the product has no variant axis. */
  readonly variantId: string | null;
  readonly role: ImageRole;

  readonly sourceType: MediaSourceType;
  /** Derived from `sourceType`. Never supplied, never mutated. */
  readonly provenanceTag: ProvenanceTag;

  readonly rightsStatus: RightsStatus;
  readonly rightsRecord: RightsRecord | null;

  readonly identityStatus: IdentityVerificationStatus;
  /**
   * The strength legible in the image, exactly as it is printed on the pictured
   * item. Null means the image shows no strength at all (a plain vial, a service
   * illustration). Null is a claim too: it says the picture makes no strength
   * statement, and verification holds it to that.
   */
  readonly declaredStrength: string | null;

  readonly version: number;
  /** Content hash of the stored bytes. Null until the bytes exist. */
  readonly checksum: string | null;
  readonly filePath: string | null;
  readonly byteSize: number | null;
  readonly contentType: string | null;

  readonly altText: string;
  readonly crop: CropData | null;

  readonly publicStatus: MediaPublicStatus;
  /** The named human accountable for the approval. Never a team alias alone. */
  readonly approvalOwner: string | null;
  readonly approvalDate: string | null;
}

/** The fields a caller supplies. Provenance is absent on purpose. */
export interface ProductMediaAssetInput {
  readonly assetId: string;
  readonly productId: string;
  readonly variantId?: string | null;
  readonly role: ImageRole;
  readonly sourceType: MediaSourceType;
  readonly rightsStatus: RightsStatus;
  readonly rightsRecord?: RightsRecord | null;
  readonly identityStatus: IdentityVerificationStatus;
  readonly declaredStrength?: string | null;
  readonly version?: number;
  readonly checksum?: string | null;
  readonly filePath?: string | null;
  readonly byteSize?: number | null;
  readonly contentType?: string | null;
  readonly altText: string;
  readonly crop?: CropData | null;
  readonly publicStatus: MediaPublicStatus;
  readonly approvalOwner?: string | null;
  readonly approvalDate?: string | null;
}

/** Thrown when a caller tries to record a claim the evidence does not support. */
export class MediaProvenanceViolation extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MediaProvenanceViolation";
    this.code = code;
  }
}

/**
 * Internal escape hatch for the factory only. Not exported from the package
 * surface; `asset.ts` re-exports nothing that returns it.
 */
export function brandAsset(value: Omit<ProductMediaAsset, typeof provenanceChecked>): ProductMediaAsset {
  return value as ProductMediaAsset;
}
