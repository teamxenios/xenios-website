/**
 * Two optional overlays on a freshly generated member-safe dataset, and the
 * privacy re-scan that both of them must survive.
 *
 * The generated artifact is always produced by the existing builder, unchanged.
 * These overlays sit on top of it and are OFF unless an operator asks for them:
 *
 *   - ID PINNING. Where the reconciliation found certain logical continuity and
 *     the content hash still moved, write the previous id back. This is the
 *     only mechanism that makes an existing Product Control binding survive a
 *     rename without editing the binding. It is applied to certain continuity
 *     only, it refuses any pin that would collide with an id already in the
 *     file, and it makes the id stop equalling the hash of the canonical key,
 *     which is exactly the point and is why it is opt in.
 *
 *   - RETIRED RETENTION. Carry an offering that left the workbook into the new
 *     dataset with every state set to unavailable, so its id and slug keep
 *     resolving and the surface says "not currently offered" instead of "not
 *     found". Retirement becomes a state in the artifact rather than a delete.
 *
 * PRIVACY. Banned keys and the required-false invariants are checked by calling
 * the production reader, which owns both lists. The confidential-term sweep is
 * the one thing that had to be written here: the builder's own term derivation
 * and its assertPublicSafe are private to a script that runs its whole build on
 * import, so they cannot be imported without running a build. The derivation
 * below mirrors that script and is the single place to keep in step with it.
 *
 * These functions return new objects. They mutate no input, touch no database,
 * mount no route, and create no Product Control binding.
 */

import {
  loadMasterOfferingDataset,
  MasterOfferingDatasetUnavailable,
} from "./dataset-reader";
import { MASTER_OFFERING_STATE_EXPLANATIONS } from "./normalize";
import type { RawMasterOfferingRow } from "./model";

export type GeneratedArtifact = Record<string, unknown>;

export class ArtifactRefused extends Error {
  constructor(readonly reason: string) {
    super(`generated artifact refused: ${reason}`);
    this.name = "ArtifactRefused";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function productsOf(artifact: GeneratedArtifact): Record<string, unknown>[] {
  const products = Array.isArray(artifact.products) ? artifact.products : [];
  return products.filter(isRecord);
}

function variantsOf(product: Record<string, unknown>): Record<string, unknown>[] {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  return variants.filter(isRecord);
}

/**
 * The confidential provider and team identities that must not appear anywhere
 * in a member-safe payload. Mirrors the derivation in
 * scripts/research/build-master-offerings.ts, which cannot be imported because
 * that module runs a full build at import time.
 */
export function confidentialTermsFromMasterRows(
  rows: readonly RawMasterOfferingRow[],
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const terms = new Set<string>();
  for (const row of rows) {
    if (row.category !== "Provider & Performance Network") continue;
    const full = row.productName.trim().toLowerCase();
    if (full.length >= 4) terms.add(full);
    const withoutCredentials = full
      .replace(/,?\s+(md|do|np|pa|rn|phd)\.?$/i, "")
      .trim();
    if (withoutCredentials.length >= 4) terms.add(withoutCredentials);
  }
  const configured = env.XENIOS_CONFIDENTIAL_CATALOG_TERMS;
  if (configured) {
    for (const value of configured.split(",")) {
      const term = value.trim().toLowerCase();
      if (term.length >= 4) terms.add(term);
    }
  }
  return Array.from(terms).sort();
}

export interface ArtifactScanResult {
  offerings: number;
  variants: number;
  countsAgree: boolean;
}

/**
 * Refuse anything the catalog would refuse, plus any confidential identity.
 *
 * The banned-key list and the required-false invariants are not re-implemented
 * here. loadMasterOfferingDataset owns both and is called for exactly that
 * reason, so there is one list, in one place, enforced on every artifact this
 * command emits.
 */
export function assertGeneratedArtifactSafe(
  artifact: unknown,
  confidentialTerms: readonly string[],
): ArtifactScanResult {
  let loaded;
  try {
    loaded = loadMasterOfferingDataset(artifact);
  } catch (error) {
    if (error instanceof MasterOfferingDatasetUnavailable) {
      throw new ArtifactRefused(error.reason);
    }
    throw error;
  }
  const serialized = JSON.stringify(artifact).toLowerCase();
  for (const term of confidentialTerms) {
    if (serialized.includes(term)) {
      throw new ArtifactRefused(
        "payload contains a confidential provider or team identity",
      );
    }
  }
  if (!loaded.summary.countsAgree) {
    throw new ArtifactRefused(
      "the artifact header disagrees with its own contents",
    );
  }
  return {
    offerings: loaded.summary.offerings,
    variants: loaded.summary.variants,
    countsAgree: loaded.summary.countsAgree,
  };
}

export interface PinnedId {
  kind: "offering" | "variant";
  previousId: string;
  replacedId: string;
  name: string;
}

export interface PinConflict {
  previousId: string;
  nextId: string;
  reason: string;
}

export interface PinResult {
  artifact: GeneratedArtifact;
  pinned: readonly PinnedId[];
  conflicts: readonly PinConflict[];
}

/**
 * Write previously issued ids back over the content-hash ids the builder just
 * produced, for certain continuity only.
 *
 * The caller supplies previousId to nextId. A pin is refused, and reported,
 * whenever the previous id is already in use in the new file, because two
 * offerings with one id is a dataset the reader will not load at all.
 */
export function pinPreservedIds(
  artifact: GeneratedArtifact,
  continuity: Readonly<Record<string, string>>,
): PinResult {
  const products = productsOf(artifact);
  const liveIds = new Set<string>();
  for (const product of products) {
    liveIds.add(String(product.id ?? ""));
    for (const variant of variantsOf(product)) liveIds.add(String(variant.id ?? ""));
  }

  const byNextId = new Map<string, string>();
  const conflicts: PinConflict[] = [];
  for (const [previousId, nextId] of Object.entries(continuity).sort()) {
    if (previousId === nextId) continue;
    if (!liveIds.has(nextId)) {
      conflicts.push({
        previousId,
        nextId,
        reason:
          "the new id is not in the regenerated artifact, so there is nothing to pin",
      });
      continue;
    }
    if (liveIds.has(previousId)) {
      conflicts.push({
        previousId,
        nextId,
        reason:
          "the previous id is already used by something else in the regenerated artifact, so pinning it would create a duplicate the reader refuses",
      });
      continue;
    }
    if (byNextId.has(nextId)) {
      conflicts.push({
        previousId,
        nextId,
        reason: "two previous ids claim the same new id",
      });
      continue;
    }
    byNextId.set(nextId, previousId);
  }

  const pinned: PinnedId[] = [];
  const rewritten = products.map((product) => {
    const productId = String(product.id ?? "");
    const pinnedProductId = byNextId.get(productId);
    const variants = variantsOf(product).map((variant) => {
      const variantId = String(variant.id ?? "");
      const pinnedVariantId = byNextId.get(variantId);
      if (pinnedVariantId === undefined) return variant;
      pinned.push({
        kind: "variant",
        previousId: pinnedVariantId,
        replacedId: variantId,
        name: `${String(product.displayName ?? "")} / ${String(variant.label ?? "")}`,
      });
      return { ...variant, id: pinnedVariantId };
    });
    if (pinnedProductId !== undefined) {
      pinned.push({
        kind: "offering",
        previousId: pinnedProductId,
        replacedId: productId,
        name: String(product.displayName ?? ""),
      });
    }
    return {
      ...product,
      id: pinnedProductId ?? product.id,
      variants,
    };
  });

  return {
    artifact: { ...artifact, products: rewritten },
    pinned: pinned.sort((left, right) =>
      left.previousId.localeCompare(right.previousId),
    ),
    conflicts,
  };
}

export interface RetainedOffering {
  id: string;
  slug: string;
  displayName: string;
  variants: number;
}

export interface RetainResult {
  artifact: GeneratedArtifact;
  retained: readonly RetainedOffering[];
  skipped: readonly { id: string; reason: string }[];
}

/**
 * Carry retired offerings into the new dataset as unavailable.
 *
 * The offering objects are taken from the previous generated artifact, which
 * the builder already scanned when it made it, and every display state on the
 * offering and its variants is forced to unavailable with the contract's own
 * explanation for that state. Nothing is invented and no new wording appears.
 *
 * This does not withdraw purchase authority. Product Control decides that, and
 * the report says so where an operator will read it.
 */
export function retainRetiredOfferings(
  artifact: GeneratedArtifact,
  previousArtifact: GeneratedArtifact,
  retiredOfferingIds: readonly string[],
): RetainResult {
  const wanted = new Set(retiredOfferingIds);
  const products = productsOf(artifact);
  const liveIds = new Set(products.map((product) => String(product.id ?? "")));
  const liveSlugs = new Set(products.map((product) => String(product.slug ?? "")));
  const liveVariantIds = new Set<string>();
  for (const product of products) {
    for (const variant of variantsOf(product)) liveVariantIds.add(String(variant.id ?? ""));
  }

  const retained: RetainedOffering[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const additions: Record<string, unknown>[] = [];

  for (const product of productsOf(previousArtifact)) {
    const id = String(product.id ?? "");
    if (!wanted.has(id)) continue;
    const slug = String(product.slug ?? "");
    if (liveIds.has(id)) {
      skipped.push({
        id,
        reason: "the id is already present in the regenerated artifact",
      });
      continue;
    }
    if (liveSlugs.has(slug)) {
      skipped.push({
        id,
        reason: `the slug ${slug} is already taken in the regenerated artifact`,
      });
      continue;
    }
    const variants = variantsOf(product).filter(
      (variant) => !liveVariantIds.has(String(variant.id ?? "")),
    );
    if (variants.length === 0) {
      skipped.push({
        id,
        reason: "every variant id is already present in the regenerated artifact",
      });
      continue;
    }
    liveIds.add(id);
    liveSlugs.add(slug);
    for (const variant of variants) liveVariantIds.add(String(variant.id ?? ""));
    additions.push({
      ...product,
      displayState: "unavailable",
      stateExplanation: MASTER_OFFERING_STATE_EXPLANATIONS.unavailable,
      variants: variants.map((variant) => ({
        ...variant,
        displayState: "unavailable",
      })),
    });
    retained.push({
      id,
      slug,
      displayName: String(product.displayName ?? ""),
      variants: variants.length,
    });
  }

  const merged = [...products, ...additions].sort((left, right) =>
    `${String(left.family ?? "")}|${String(left.displayName ?? "")}|${String(left.slug ?? "")}`.localeCompare(
      `${String(right.family ?? "")}|${String(right.displayName ?? "")}|${String(right.slug ?? "")}`,
    ),
  );

  return {
    artifact: { ...artifact, products: merged },
    retained,
    skipped,
  };
}

/**
 * Recompute the artifact's own header so it never disagrees with its contents.
 * The verifier treats a header that disagrees with the body as a failure, and
 * it is right to.
 */
export function withRecountedHeader(
  artifact: GeneratedArtifact,
): GeneratedArtifact {
  const products = productsOf(artifact);
  return {
    ...artifact,
    canonicalProductCount: products.length,
    variantCount: products.reduce(
      (sum, product) => sum + variantsOf(product).length,
      0,
    ),
  };
}
