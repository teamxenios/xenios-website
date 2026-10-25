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
 * `sealProductMediaAsset`, which is where the provenance and rights rules are
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

// ---------------------------------------------------------------------------
// The invariant core
// ---------------------------------------------------------------------------
//
// These predicates live here, next to the brand, rather than in `asset.ts`,
// because the seal below must enforce them and the seal is the last line before
// a value becomes a `ProductMediaAsset`. `asset.ts` re-exports them, so the
// public surface is unchanged.

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}

/** True when the source type asserts a camera photographed the real item. */
export function isPhotographicSource(sourceType: MediaSourceType): boolean {
  return PHOTOGRAPHIC_SOURCE_TYPES.includes(sourceType);
}

/**
 * True when the rights record is complete enough to be evidence. A record with a
 * blank id, a blank holder, or a blank evidence pointer is not evidence, it is a
 * note to self.
 */
export function isCompleteRightsRecord(record: RightsRecord | null | undefined): record is RightsRecord {
  if (!record) return false;
  if (isBlank(record.recordId)) return false;
  if (isBlank(record.holder)) return false;
  if (isBlank(record.grantedOn)) return false;
  if (isBlank(record.evidenceRef)) return false;
  return true;
}

/**
 * The rights gate, exposed on its own so a test can walk every source type
 * against every rights status without constructing an asset.
 *
 * Returns null when the combination is allowed, or the violation code when it is
 * not. Callers that want the throw use `createProductMediaAsset`.
 */
export function rightsViolationFor(
  sourceType: MediaSourceType,
  rightsStatus: RightsStatus,
  rightsRecord: RightsRecord | null | undefined,
): string | null {
  if (isPhotographicSource(sourceType)) {
    // A photograph claim needs a grant we can point at. RIGHTS_NOT_REQUIRED is
    // refused explicitly: it is the shape a caller would reach for to skip this.
    if (rightsStatus === "RIGHTS_NOT_REQUIRED") {
      return "PHOTOGRAPH_CLAIMS_RIGHTS_NOT_REQUIRED";
    }
    if (rightsStatus !== "RIGHTS_ON_FILE") {
      return "PHOTOGRAPH_WITHOUT_RIGHTS_ON_FILE";
    }
    if (!isCompleteRightsRecord(rightsRecord)) {
      return "PHOTOGRAPH_WITHOUT_RIGHTS_RECORD";
    }
    return null;
  }

  // Xenios owns a render and a placeholder outright, so a third party rights
  // grant on one is a category error and is refused rather than ignored: it
  // usually means the caller mislabelled the source.
  if (rightsStatus !== "RIGHTS_NOT_REQUIRED") {
    return "XENIOS_OWNED_SOURCE_CLAIMS_THIRD_PARTY_RIGHTS";
  }
  if (rightsRecord) {
    return "XENIOS_OWNED_SOURCE_CARRIES_RIGHTS_RECORD";
  }
  return null;
}

/**
 * The shape a claim must hold for its provenance tag to be true of it. Deliberately
 * structural rather than nominal, so it can also be run over a value that arrived
 * from outside this process (a database row, a JSON payload, a type assertion) and
 * therefore never passed through the seal.
 */
export interface ProvenanceClaim {
  readonly assetId: string;
  readonly sourceType: MediaSourceType;
  readonly provenanceTag: ProvenanceTag;
  readonly rightsStatus: RightsStatus;
  readonly rightsRecord: RightsRecord | null;
  readonly identityStatus: IdentityVerificationStatus;
  readonly publicStatus: MediaPublicStatus;
  readonly approvalOwner: string | null;
  readonly approvalDate: string | null;
}

/**
 * The one function that decides whether a claim is supportable. Returns null when
 * it is, or a violation code when it is not.
 *
 * The first check is the one this module exists for: a provenance tag that does
 * not follow from the source type is a forgery, whichever direction it points. A
 * render tagged `supplier_photograph` is the case the canon names, and it is
 * refused here even if every other field is immaculate.
 */
export function provenanceViolationIn(claim: ProvenanceClaim): string | null {
  if (claim.provenanceTag !== provenanceTagFor(claim.sourceType)) {
    return "PROVENANCE_TAG_DOES_NOT_FOLLOW_FROM_SOURCE";
  }

  const rightsCode = rightsViolationFor(claim.sourceType, claim.rightsStatus, claim.rightsRecord);
  if (rightsCode) return rightsCode;

  // A supplier or commissioned photograph claim always needs a grant on file. The
  // rights gate above already says so, but it is restated as its own code because
  // this is the pairing the canon forbids and a reader of a failure should see it
  // named, not inferred from a rights status.
  if (isPhotographicSource(claim.sourceType) && !isCompleteRightsRecord(claim.rightsRecord)) {
    return "PHOTOGRAPH_WITHOUT_RIGHTS_RECORD";
  }

  if (claim.publicStatus === "PUBLISHED") {
    if (claim.sourceType === "internal_placeholder") {
      return "PUBLISHED_PLACEHOLDER";
    }
    if (claim.identityStatus !== "VERIFIED_EXACT_VARIANT") {
      return "PUBLISHED_WITHOUT_IDENTITY";
    }
    if (isBlank(claim.approvalOwner) || isBlank(claim.approvalDate)) {
      return "PUBLISHED_WITHOUT_NAMED_APPROVAL";
    }
  }

  return null;
}

/**
 * The fields the seal accepts.
 *
 * `provenanceTag` is absent on purpose and this absence is the structural half of
 * the guarantee: there is no in repo call site, internal or not, that can hand a
 * provenance tag to the constructor, so "a generated render tagged as a supplier
 * photograph" is not a value anyone can ask for. The tag is computed from the
 * source type below.
 */
export type SealableAssetFields = Omit<ProductMediaAsset, typeof provenanceChecked | "provenanceTag">;

/**
 * The structural guarantee, asserted where the typechecker will see it.
 *
 * Test files are excluded from `npm run check`, so a compile time claim made only
 * in a test is not a gate. This assertion lives in the shipped module: if anyone
 * widens `SealableAssetFields` to accept a provenance tag again, `tsc` fails here
 * with "Type 'false' does not satisfy the constraint 'true'".
 */
type Assert<T extends true> = T;
type ProvenanceTagIsNotSealable = "provenanceTag" extends keyof SealableAssetFields ? false : true;
type _NoCallerSuppliedProvenance = Assert<ProvenanceTagIsNotSealable>;

/**
 * The only path to a `ProductMediaAsset`.
 *
 * Callers use `createProductMediaAsset` in `asset.ts`, which validates the wider
 * input (ids, alt text, version, focal point, stored bytes) and then seals. This
 * function is the narrower, unskippable core: it derives the provenance tag and
 * refuses any claim `provenanceViolationIn` rejects. It is exported only because
 * `asset.ts` is a separate module; it grants no capability the factory does not,
 * because it enforces the same rules.
 */
export function sealProductMediaAsset(fields: SealableAssetFields): ProductMediaAsset {
  const provenanceTag = provenanceTagFor(fields.sourceType);
  const sealed = { ...fields, provenanceTag } as ProductMediaAsset;

  const violation = provenanceViolationIn(sealed);
  if (violation) {
    throw new MediaProvenanceViolation(
      violation,
      `Asset ${fields.assetId} cannot be sealed: source ${fields.sourceType} with rights ${fields.rightsStatus} ` +
        `and status ${fields.publicStatus} does not support the claim ${provenanceTag}.`,
    );
  }

  return sealed;
}
