// xenios research: the product media registry.
//
// The write boundary for product imagery. Everything that wants to record an
// asset comes through here, and here is where the manifest's identity rule
// ("Exact product and variant required") stops being a sentence in a workbook and
// becomes a refusal.
//
// The registry does no I/O. It holds records and enforces rules, so it can be
// exercised exhaustively in tests and dropped behind whatever storage the asset
// pipeline eventually uses. It never fetches, generates, downloads, or hotlinks
// an image; it records claims about images and refuses the claims we cannot
// support.
//
// Refusals, in the order they fire:
//   1. Provenance and rights, delegated to createProductMediaAsset. A render can
//      never be recorded as a supplier photograph, with or without a rights row.
//   2. Identity. An asset must name a manifest row that exists, and it may not be
//      attached to a competitor expansion candidate.
//   3. Strength. An asset that shows a strength must show the variant's strength.
//   4. Duplicate ids, and re-registering the same bytes under a second product.
//
// Every refusal throws. A media registry that silently downgrades a bad write is
// a registry that ships the bad image the next time someone reads it back.

import { createProductMediaAsset } from "@shared/research/product-media/asset";
import {
  manifestKey,
  productImageManifest,
  type ManifestEntry,
} from "@shared/research/product-media/manifest";
import { formatStrength, strengthsMatch } from "@shared/research/product-media/strength";
import {
  MediaProvenanceViolation,
  type ProductMediaAsset,
  type ProductMediaAssetInput,
} from "@shared/research/product-media/types";
import {
  competitorTokenIn,
  verifyProductMedia,
  type VerificationReport,
} from "@shared/research/product-media/verification";

export class MediaRegistryRefusal extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MediaRegistryRefusal";
    this.code = code;
  }
}

export interface RegistryOptions {
  /** Defaults to the workbook manifest. Injected in tests. */
  readonly manifest?: readonly ManifestEntry[];
}

export class ProductMediaRegistry {
  private readonly manifest: readonly ManifestEntry[];
  private readonly byVariant: ReadonlyMap<string, readonly ManifestEntry[]>;
  private readonly assets = new Map<string, ProductMediaAsset>();

  constructor(options: RegistryOptions = {}) {
    this.manifest = options.manifest ?? productImageManifest();
    const index = new Map<string, ManifestEntry[]>();
    for (const entry of this.manifest) {
      const key = manifestKey(entry.sku, entry.variant);
      const bucket = index.get(key);
      if (bucket) bucket.push(entry);
      else index.set(key, [entry]);
    }
    this.byVariant = index;
  }

  /** The manifest row an input names, or undefined. */
  rowFor(productId: string, variantId: string | null): ManifestEntry | undefined {
    const bucket = this.byVariant.get(manifestKey(productId, variantId));
    return bucket && bucket.length > 0 ? bucket[0] : undefined;
  }

  /**
   * Record an asset.
   *
   * Throws `MediaProvenanceViolation` for a provenance or rights failure and
   * `MediaRegistryRefusal` for an identity, strength, or duplication failure.
   */
  register(input: ProductMediaAssetInput): ProductMediaAsset {
    if (this.assets.has(input.assetId)) {
      throw new MediaRegistryRefusal("DUPLICATE_ASSET_ID", `Asset ${input.assetId} is already registered.`);
    }

    // Provenance and rights first. This is the gate that cannot be bypassed: a
    // Xenios render carrying a supplier photograph claim never becomes an object.
    const asset = createProductMediaAsset(input);

    const entry = this.rowFor(asset.productId, asset.variantId);
    if (!entry) {
      throw new MediaRegistryRefusal(
        "NO_MANIFEST_ROW",
        `Asset ${asset.assetId} names ${asset.productId}${asset.variantId ? ` / ${asset.variantId}` : ""}, ` +
          "which has no manifest row. An image is bound to an exact product and variant or it is not bound at all.",
      );
    }

    if (entry.isExpansionCandidate) {
      throw new MediaRegistryRefusal(
        "EXPANSION_CANDIDATE",
        `Asset ${asset.assetId} is attached to ${entry.product}, a competitor expansion candidate. ` +
          "Candidates are coverage references, not offers, and carry no imagery.",
      );
    }

    const competitor = competitorTokenIn(
      asset.filePath,
      asset.rightsRecord?.holder,
      asset.rightsRecord?.evidenceRef,
      asset.rightsRecord?.recordId,
    );
    if (competitor) {
      throw new MediaRegistryRefusal(
        "COMPETITOR_SOURCE",
        `Asset ${asset.assetId} names ${competitor} in its provenance. Competitor imagery is never reused.`,
      );
    }

    if (asset.declaredStrength !== null) {
      const variantStrength = entry.variantCarriesStrength ? entry.variant : null;
      if (!strengthsMatch(asset.declaredStrength, variantStrength)) {
        throw new MediaRegistryRefusal(
          "STRENGTH_MISMATCH",
          `Asset ${asset.assetId} shows ${formatStrength(asset.declaredStrength)} but ${entry.product} ` +
            `is ${formatStrength(variantStrength)}. A vial may never display a strength other than the variant's.`,
        );
      }
    }

    if (asset.checksum !== null && asset.checksum.trim().length > 0) {
      for (const existing of Array.from(this.assets.values())) {
        if (existing.checksum !== asset.checksum) continue;
        if (existing.productId !== asset.productId || existing.declaredStrength !== asset.declaredStrength) {
          throw new MediaRegistryRefusal(
            "DUPLICATE_MISMATCHED_LABEL",
            `Asset ${asset.assetId} reuses the bytes of ${existing.assetId}, which is labelled ` +
              `${existing.productId} ${formatStrength(existing.declaredStrength)}. One file, one claim.`,
          );
        }
      }
    }

    this.assets.set(asset.assetId, asset);
    return asset;
  }

  /**
   * Record an asset, returning the refusal instead of throwing. For bulk imports
   * where one bad row must not abort the batch. The refusal is still a refusal:
   * nothing is stored.
   */
  tryRegister(input: ProductMediaAssetInput): { ok: true; asset: ProductMediaAsset } | { ok: false; code: string; message: string } {
    try {
      return { ok: true, asset: this.register(input) };
    } catch (error) {
      if (error instanceof MediaRegistryRefusal || error instanceof MediaProvenanceViolation) {
        return { ok: false, code: error.code, message: error.message };
      }
      throw error;
    }
  }

  get(assetId: string): ProductMediaAsset | undefined {
    return this.assets.get(assetId);
  }

  all(): readonly ProductMediaAsset[] {
    return Array.from(this.assets.values());
  }

  /**
   * Assets a surface may show for a product variant. Returns an empty list when
   * we hold nothing, which is the truthful answer and the one every surface must
   * be able to render without inventing a placeholder.
   */
  publishedFor(productId: string, variantId: string | null): readonly ProductMediaAsset[] {
    return this.all().filter(
      (asset) =>
        asset.productId === productId && asset.variantId === variantId && asset.publicStatus === "PUBLISHED",
    );
  }

  verify(): VerificationReport {
    return verifyProductMedia({ manifest: this.manifest, assets: this.all() });
  }
}
