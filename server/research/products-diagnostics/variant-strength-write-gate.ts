/**
 * The WRITE side of the variant strength dispute. Server only, derived, read only
 * with respect to the catalog.
 *
 * The read guard (product-control-price-resolver.ts) already refuses to SERVE a
 * price for a variant whose physical presentation is contested. That leaves the
 * bad row able to exist: nothing stopped an approved, active price being written
 * for that same variant, so the read guard had to keep catching it on every read,
 * forever. This module closes the other half. An owner decision of 2026-08-01
 * makes the signed supplier master the authority for strength, and states that a
 * catalog row disagreeing with it "CANNOT RECEIVE AN ACTIVE PRODUCT CONTROL PRICE";
 * the Product Control price import gate says a price may become active only when
 * "exact strength/presentation is not disputed". A row that may never become
 * active must never be created or approved.
 *
 * It reuses `findVariantStrengthDispute` unchanged. It adds exactly one thing the
 * read path does not need: IDENTITY RESOLUTION, and a refusal when identity cannot
 * be established.
 *
 * WHY IDENTITY IS THE HARD PART HERE. The read path is handed the variant record
 * itself. The write path is handed a `variantId` (create) or a `priceId`
 * (approve), which carry no presentation at all, so the variant must be resolved
 * from the product record first. If that resolution does not land on exactly one
 * variant of exactly this product, this module REFUSES rather than allowing the
 * write. Fail closed: an unidentified variant is not a proven-undisputed variant.
 *
 * A KNOWN RESIDUAL, STATED RATHER THAN PAPERED OVER. The join key is the catalog
 * SKU, and the catalog DERIVES that SKU from the strength (`buildSku` over a
 * presentation token). So a Product Control variant recorded at the signed
 * supplier master's strength, with a SKU derived the same way, produces a SKU that
 * is in neither the founder-locked index nor the recorded-dispute index, and no
 * dispute is found for it. This module does not pretend otherwise and does not
 * guess at identity to cover it: guessing would either invent a supplier fact or
 * refuse legitimate unrelated units. Closing that residual needs a real identity
 * key for a physical unit (a catalog number that does not move with the strength),
 * which is a data decision, not a code change.
 *
 * SAFETY OF THE OUTPUT. A refusal carries presentations, identity, and provenance
 * only. It never carries a wholesale cost, a multiplier, a margin, or any amount,
 * because it is produced on a pricing path. A test pins that.
 */

import type { AdminProductDetail } from "@shared/research/product-admin";
import {
  findVariantStrengthDispute,
  type VariantStrengthDispute,
} from "./variant-strength-dispute";

/**
 * Why a price write was refused.
 *
 * variant_strength_disputed   the exact unit's presentation is contested
 * variant_identity_unresolved the write could not be tied to exactly one variant
 *                             of this product, so it cannot be proven undisputed
 */
export type VariantStrengthWriteRefusalCode =
  | "variant_strength_disputed"
  | "variant_identity_unresolved";

export interface VariantStrengthWriteRefusal {
  code: VariantStrengthWriteRefusalCode;
  /**
   * The refusal in plain words, naming WHY. The prior review found the dispute
   * reason was discarded at every consumer, so it is carried on the refusal and
   * on the thrown error rather than reconstructed by the caller.
   */
  reason: string;
  /** Both claims with their provenance, for a contested presentation only. */
  dispute: VariantStrengthDispute | null;
}

const RESOLUTION_NOTE =
  "A named human must resolve the presentation before this unit can carry a price.";

function sourceLabel(dispute: VariantStrengthDispute): string {
  return dispute.source === "signed_supplier_master"
    ? "the signed supplier master"
    : "the Product Control variant record";
}

/** The operator-facing sentence for a contested presentation. Never an amount. */
export function describeVariantStrengthDispute(
  dispute: VariantStrengthDispute,
): string {
  return (
    `Variant ${dispute.sku} (${dispute.productCode}) has a contested strength. ` +
    `The founder-locked catalog records "${dispute.founderLocked.presentation}" ` +
    `and ${sourceLabel(dispute)} records ` +
    `"${dispute.contested.presentation}". ` +
    `Founder-locked source: ${dispute.founderLocked.provenance} ` +
    `Contesting source: ${dispute.contested.provenance} ` +
    RESOLUTION_NOTE
  );
}

function unresolved(detail: string): VariantStrengthWriteRefusal {
  return {
    code: "variant_identity_unresolved",
    reason:
      `The operation could not be tied to exactly one variant of this ` +
      `product, so its strength cannot be proven undisputed: ${detail} ` +
      RESOLUTION_NOTE,
    dispute: null,
  };
}

/**
 * Screen the variant a price is about to be created for.
 *
 * Returns null only when the variant is resolved to exactly one record of this
 * product AND that record's presentation is uncontested. Every other outcome is
 * a refusal, including a product that could not be read and a variant that
 * records no SKU (with no SKU there is no join to the founder-locked catalog, so
 * "uncontested" is unprovable rather than true).
 *
 * A resolved variant whose SKU is simply not in the peptide catalog is NOT a
 * refusal. That is the same rule the read path applies: a unit outside the
 * founder-locked catalog is unconstrained by this dispute, not unidentified.
 * Refusing it would block every non-peptide product from ever being priced.
 *
 * Nothing here is echoed back from caller-supplied input: the refusal describes
 * the condition, so an operator message can never be authored by a request body.
 */
export function screenVariantForPriceWrite(
  product: AdminProductDetail | null,
  variantId: string,
): VariantStrengthWriteRefusal | null {
  if (product === null || !product.id.trim()) {
    return unresolved("the product record could not be read.");
  }
  const wanted = variantId.trim();
  if (!wanted) {
    return unresolved("the price names no variant.");
  }
  const matches = product.variants.filter((variant) => variant.id === wanted);
  if (matches.length !== 1) {
    return unresolved(
      matches.length === 0
        ? "no variant with the requested id belongs to this product."
        : "more than one variant of this product claims the requested id.",
    );
  }
  const variant = matches[0];
  if (variant.productId !== product.id) {
    return unresolved("the requested variant belongs to a different product.");
  }
  if (!variant.sku.trim()) {
    return unresolved(
      "the variant records no SKU, so it cannot be matched against the " +
        "founder-locked catalog.",
    );
  }

  const dispute = findVariantStrengthDispute({
    sku: variant.sku,
    catalogNumber: variant.catalogNumber,
    strength: variant.strength,
  });
  if (dispute === null) return null;
  return {
    code: "variant_strength_disputed",
    reason: describeVariantStrengthDispute(dispute),
    dispute,
  };
}

/**
 * Screen the variant behind a price that is about to be approved. Approval is
 * the moment a draft row becomes an authority, so it is gated on exactly the
 * same fact as creation, resolved through the price row.
 */
export function screenPriceForApproval(
  product: AdminProductDetail | null,
  priceId: string,
): VariantStrengthWriteRefusal | null {
  if (product === null || !product.id.trim()) {
    return unresolved("the product record could not be read.");
  }
  const wanted = priceId.trim();
  if (!wanted) {
    return unresolved("the approval names no price.");
  }
  const matches = product.prices.filter((price) => price.id === wanted);
  if (matches.length !== 1) {
    return unresolved(
      matches.length === 0
        ? "no price with the requested id belongs to this product."
        : "more than one price of this product claims the requested id.",
    );
  }
  const price = matches[0];
  if (price.productId !== product.id) {
    return unresolved("the requested price belongs to a different product.");
  }
  return screenVariantForPriceWrite(product, price.variantId);
}

/**
 * Screen a VARIANT EDIT. This closes the hole that made the price gate above a
 * check-at-write-time over a MUTABLE key, which an adversarial review defeated
 * with two working exploits against the same admin auth the price gate refuses:
 *
 *   EXPLOIT A  price a clean variant, approve it, then updateVariant it onto the
 *              disputed SKU. No price row is written, so the price gate and the
 *              SQL price trigger never re-fire, and an approved price now sits
 *              on a contested unit.
 *
 *   EXPLOIT B  the worse one. The price gate refuses the disputed variant, so
 *              rename only its SKU. findVariantStrengthDispute then returns null
 *              for the renamed unit while the contested physical strength is
 *              unchanged, and BOTH the write gate and the read resolver go
 *              blind. An active, servable price on a contested unit with nothing
 *              left to catch it.
 *
 * Two rules, and rule 1 is the one that matters:
 *
 *   1. YOU CANNOT EDIT YOUR WAY OUT OF A DISPUTE. If the variant is contested
 *      TODAY, its sku, catalogNumber and strength are frozen. Only a named human
 *      resolving the presentation clears it, which is exactly what the owner
 *      decision requires. Renaming is not resolution.
 *
 *   2. YOU CANNOT EDIT YOUR WAY INTO ONE. If the edit would land the variant on
 *      a contested presentation, it is refused, so a priced clean variant cannot
 *      be walked onto a disputed identity.
 *
 * Fields that cannot change the dispute answer (title, status, active, price
 * fields) are untouched by this screen: it only refuses when the identity
 * triple would move, or when the result would be contested.
 */
export function screenVariantEdit(
  product: AdminProductDetail | null,
  variantId: string,
  update: {
    sku?: string | null;
    catalogNumber?: string | null;
    strength?: string | null;
  },
): VariantStrengthWriteRefusal | null {
  if (product === null || !product.id.trim()) {
    return unresolved("the product record could not be read.");
  }
  const wanted = variantId.trim();
  if (!wanted) {
    return unresolved("the update names no variant.");
  }
  const matches = product.variants.filter((variant) => variant.id === wanted);
  if (matches.length !== 1) {
    return unresolved(
      matches.length === 0
        ? "no variant with the requested id belongs to this product."
        : "more than one variant of this product claims the requested id.",
    );
  }
  const current = matches[0];
  if (current.productId !== product.id) {
    return unresolved("the requested variant belongs to a different product.");
  }

  // An explicit null is a CLEAR, which is a change, not "leave alone". Only
  // undefined means the field was not in the update.
  const nextOr = (given: string | null | undefined, currentValue: string | null | undefined) =>
    given === undefined ? (currentValue ?? "").trim() : (given ?? "").trim();
  const touchesIdentity =
    nextOr(update.sku, current.sku) !== (current.sku ?? "").trim() ||
    nextOr(update.strength, current.strength) !== (current.strength ?? "").trim() ||
    nextOr(update.catalogNumber, current.catalogNumber) !==
      (current.catalogNumber ?? "").trim();

  // RULE 1. Frozen while contested. Checked BEFORE the result, because after a
  // rename the result screens clean and that is precisely the evasion.
  if (touchesIdentity) {
    if (!current.sku.trim()) {
      return unresolved(
        "the current variant records no SKU, so its pre-edit identity cannot " +
          "be proven undisputed.",
      );
    }
    const existing = findVariantStrengthDispute({
      sku: current.sku,
      catalogNumber: current.catalogNumber,
      strength: current.strength,
    });
    if (existing !== null) {
      return {
        code: "variant_strength_disputed",
        reason:
          describeVariantStrengthDispute(existing) +
          " Its SKU, catalogue number and strength are frozen until that is " +
          "resolved: renaming the unit is not resolving the dispute.",
        dispute: existing,
      };
    }
  }

  if (!touchesIdentity) return null;

  // RULE 2. Cannot move onto a contested presentation.
  const nextSku = nextOr(update.sku, current.sku);
  if (!nextSku) {
    return unresolved(
      "the update would leave the variant with no SKU, so it could not be " +
        "matched against the founder-locked catalog.",
    );
  }
  const resulting = findVariantStrengthDispute({
    sku: nextSku,
    catalogNumber: nextOr(update.catalogNumber, current.catalogNumber) || null,
    strength: nextOr(update.strength, current.strength),
  });
  if (resulting === null) return null;
  return {
    code: "variant_strength_disputed",
    reason:
      describeVariantStrengthDispute(resulting) +
      " This edit would move the variant onto that contested presentation.",
    dispute: resulting,
  };
}
