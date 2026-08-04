// xenios research: the single construction path for a product media asset.
//
// Everything in this file exists to make one class of lie impossible to record:
// claiming that a picture is a photograph of the real product when it is a render
// we made, or when we hold no rights to the photograph we are using.
//
// The enforcement is structural, not procedural:
//
//   1. `ProductMediaAsset` is branded, and the brand is applied by exactly one
//      function, `sealProductMediaAsset` in `types.ts`. There is no object literal
//      path and no unchecked internal one either: the seal re-runs the provenance
//      gate itself, so it is not a hatch that trusts its caller.
//   2. `provenanceTag` is derived by the seal from `sourceType`, and the seal's
//      parameter type does not contain the field at all. Nobody, inside this
//      package or outside it, can hand a provenance tag to a constructor, so
//      "a render labelled `supplier_photograph`" is not an expressible value.
//   3. A photographic source type without a complete rights record throws. There
//      is no lenient mode, no override flag, and no environment that relaxes it.
//   4. `reclassifySourceType` refuses every transition that would upgrade a
//      render or a placeholder into a photograph. The pixels did not change, so
//      the claim about them may not change either.
//
// The rules below are deliberately fail closed: an input we cannot evaluate
// weakens the asset or throws, never passes.

import {
  IDENTITY_BEARING_ROLES,
  MediaProvenanceViolation,
  isPhotographicSource,
  provenanceTagFor,
  rightsViolationFor,
  sealProductMediaAsset,
  type MediaSourceType,
  type ProductMediaAsset,
  type ProductMediaAssetInput,
  type RightsRecord,
  type RightsStatus,
} from "./types";

// The rights and provenance predicates live in `types.ts`, beside the brand, so
// the seal itself can enforce them. They are re-exported here because this module
// is the package's public surface for reasoning about an asset.
export {
  isCompleteRightsRecord,
  isPhotographicSource,
  provenanceViolationIn,
  rightsViolationFor,
} from "./types";

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}

/**
 * The only constructor.
 *
 * Throws `MediaProvenanceViolation` rather than returning a weakened asset,
 * because every violation here is a caller bug or an attempt to record an
 * unsupported claim, and both should stop at the write, not surface later as a
 * quietly wrong image on a product page.
 */
export function createProductMediaAsset(input: ProductMediaAssetInput): ProductMediaAsset {
  if (isBlank(input.assetId)) {
    throw new MediaProvenanceViolation("BLANK_ASSET_ID", "An asset needs an id.");
  }
  if (isBlank(input.productId)) {
    throw new MediaProvenanceViolation("BLANK_PRODUCT_ID", "An asset must name the product it depicts.");
  }
  if (isBlank(input.altText)) {
    throw new MediaProvenanceViolation(
      "BLANK_ALT_TEXT",
      `Asset ${input.assetId} has no alt text. An image nobody can read is not shippable.`,
    );
  }

  const rightsCode = rightsViolationFor(input.sourceType, input.rightsStatus, input.rightsRecord);
  if (rightsCode) {
    throw new MediaProvenanceViolation(
      rightsCode,
      `Asset ${input.assetId} declares source ${input.sourceType} with rights ${input.rightsStatus}. ` +
        "A photograph of a real product may only be recorded against a rights record on file.",
    );
  }

  const version = input.version ?? 1;
  if (!Number.isInteger(version) || version < 1) {
    throw new MediaProvenanceViolation("BAD_VERSION", `Asset ${input.assetId} has a non positive version.`);
  }

  const byteSize = input.byteSize ?? null;
  if (byteSize !== null && (!Number.isFinite(byteSize) || byteSize < 0)) {
    throw new MediaProvenanceViolation("BAD_BYTE_SIZE", `Asset ${input.assetId} has a negative byte size.`);
  }

  const crop = input.crop ?? null;
  if (crop) {
    const { x, y } = crop.focal;
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) {
      throw new MediaProvenanceViolation("BAD_FOCAL_POINT", `Asset ${input.assetId} has a focal point off canvas.`);
    }
    if (!(crop.authoredAspect > 0)) {
      throw new MediaProvenanceViolation("BAD_ASPECT", `Asset ${input.assetId} has a non positive aspect.`);
    }
  }

  const publicStatus = input.publicStatus;
  if (publicStatus === "PUBLISHED") {
    // Publishing is the moment the claim reaches a reader, so it carries the
    // strictest preconditions in the model.
    if (input.sourceType === "internal_placeholder") {
      throw new MediaProvenanceViolation(
        "PUBLISHED_PLACEHOLDER",
        `Asset ${input.assetId} is an internal placeholder. A placeholder is never published as a product image.`,
      );
    }
    if (input.identityStatus !== "VERIFIED_EXACT_VARIANT") {
      throw new MediaProvenanceViolation(
        "PUBLISHED_WITHOUT_IDENTITY",
        `Asset ${input.assetId} is not confirmed to depict the exact product and variant.`,
      );
    }
    if (isBlank(input.filePath) || isBlank(input.checksum)) {
      throw new MediaProvenanceViolation(
        "PUBLISHED_WITHOUT_BYTES",
        `Asset ${input.assetId} is published with no stored file or no checksum.`,
      );
    }
    if (isBlank(input.approvalOwner) || isBlank(input.approvalDate)) {
      throw new MediaProvenanceViolation(
        "PUBLISHED_WITHOUT_NAMED_APPROVAL",
        `Asset ${input.assetId} is published with no named approver and date.`,
      );
    }
  }

  return sealProductMediaAsset({
    assetId: input.assetId,
    productId: input.productId,
    variantId: input.variantId ?? null,
    role: input.role,
    sourceType: input.sourceType,
    rightsStatus: input.rightsStatus,
    rightsRecord: input.rightsRecord ?? null,
    identityStatus: input.identityStatus,
    declaredStrength: input.declaredStrength ?? null,
    version,
    checksum: input.checksum ?? null,
    filePath: input.filePath ?? null,
    byteSize,
    contentType: input.contentType ?? null,
    altText: input.altText,
    crop,
    publicStatus,
    approvalOwner: input.approvalOwner ?? null,
    approvalDate: input.approvalDate ?? null,
  });
}

/**
 * Reclassification.
 *
 * The pixels do not change when a row is edited, so the claim about the pixels
 * may not be upgraded. Concretely: a `generated_product_render` can never become
 * a photograph, and an `internal_placeholder` can never become a photograph
 * either. Both would be inventing a photo session that never happened.
 *
 * Legal moves are a photograph moving between photographic sources with fresh
 * evidence (the supplier re-licensed it, we commissioned our own), and any source
 * downgrading to `internal_placeholder`, which claims less.
 */
export function reclassifySourceType(
  asset: ProductMediaAsset,
  nextSourceType: MediaSourceType,
  next: { rightsStatus: RightsStatus; rightsRecord: RightsRecord | null },
): ProductMediaAsset {
  if (nextSourceType === asset.sourceType) {
    return asset;
  }

  const wasPhotograph = isPhotographicSource(asset.sourceType);
  const willBePhotograph = isPhotographicSource(nextSourceType);

  if (willBePhotograph && !wasPhotograph) {
    throw new MediaProvenanceViolation(
      "PROVENANCE_UPGRADE_REFUSED",
      `Asset ${asset.assetId} is tagged ${asset.provenanceTag}. It cannot be relabelled as ${provenanceTagFor(
        nextSourceType,
      )}: the image did not change, so the claim about it may not change.`,
    );
  }

  const rightsCode = rightsViolationFor(nextSourceType, next.rightsStatus, next.rightsRecord);
  if (rightsCode) {
    throw new MediaProvenanceViolation(
      rightsCode,
      `Asset ${asset.assetId} cannot move to source ${nextSourceType} without matching rights evidence.`,
    );
  }

  // A reclassified asset returns to pending approval. The prior approval was
  // given for a different claim.
  return createProductMediaAsset({
    assetId: asset.assetId,
    productId: asset.productId,
    variantId: asset.variantId,
    role: asset.role,
    sourceType: nextSourceType,
    rightsStatus: next.rightsStatus,
    rightsRecord: next.rightsRecord,
    identityStatus: asset.identityStatus,
    declaredStrength: asset.declaredStrength,
    version: asset.version + 1,
    checksum: asset.checksum,
    filePath: asset.filePath,
    byteSize: asset.byteSize,
    contentType: asset.contentType,
    altText: asset.altText,
    crop: asset.crop,
    publicStatus: "PENDING_APPROVAL",
    approvalOwner: null,
    approvalDate: null,
  });
}

/**
 * Whether this asset's role makes a strength claim a reader will take literally.
 * Used by verification, exported so a surface can reason about it too.
 */
export function roleMakesIdentityClaim(asset: ProductMediaAsset): boolean {
  return IDENTITY_BEARING_ROLES.includes(asset.role);
}
