import {
  MASTER_OFFERING_FAMILY_LABELS,
  isMasterOfferingFamily,
} from "@shared/research/master-offerings/contract";

/**
 * Buyer-facing wording for one assisted-order catalog family.
 *
 * WHY THIS EXISTS. The assisted-order catalog carries `family` as the raw
 * Product Control slug (`production-catalog.ts` sets `family: offering.family`),
 * and both the card eyebrow and the family picker rendered it verbatim. The
 * eyebrow is `text-transform: uppercase`, so a customer choosing what to order
 * was reading `CLINICAL_FORMULATIONS_503A`. That is an internal identifier, and
 * a regulatory-sounding one; it is not copy anyone approved.
 *
 * This invents no vocabulary. The canonical family labels already exist in the
 * master-offerings contract and are what the member catalog and the public
 * storefront both render, so using them here makes three surfaces agree rather
 * than adding a fourth wording.
 *
 * The fallback is deliberately conservative. A slug outside the closed family
 * vocabulary cannot be looked up, and guessing a marketing name for it would be
 * inventing a fact. Instead it is de-slugged into plain words, which is honest
 * about being derived from the identifier while never showing a customer a
 * SCREAMING_SNAKE token. `503a` stays `503A` because it is a real designation,
 * not a word.
 */
export function assistedOrderFamilyLabel(family: string): string {
  const trimmed = family.trim();
  if (trimmed === "") return "Other";
  if (isMasterOfferingFamily(trimmed)) {
    return MASTER_OFFERING_FAMILY_LABELS[trimmed];
  }
  return trimmed
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) =>
      // A token carrying a digit is a designation (503a, 21cfr), so it is
      // upper-cased whole rather than title-cased into "503a".
      /\d/.test(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}
