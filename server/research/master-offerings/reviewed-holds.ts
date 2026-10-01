/**
 * The reviewed commerce holds, read from the founder's reconciliation record.
 *
 * WHY THIS REPLACED A TEXT MARKER
 *
 * The first version of the formulation hold matched the phrase "split pending"
 * in a variant's declared specification, because workbook row GRP-0422 reads
 * "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)".
 *
 * The reviewed reconciliation gives that product its canonical specification:
 *
 *     "CJC-1295 WITH DAC + IPAMORELIN 5 mg total"
 *
 * The marker is gone — correctly, because a customer should not read our
 * internal uncertainty in a product name. So the marker rule would have stopped
 * matching at exactly the moment the reconciled row entered the catalog: the
 * hold would evaporate as the product appeared, and every test written against
 * the workbook text would still have passed.
 *
 * The hold is therefore taken from the reviewed record itself, which is the
 * thing the founder actually decided, and which states in its own words:
 * "Removing this entry is all that is needed to release it. No storefront
 * change, no code change." That promise only holds if the storefront reads the
 * record rather than a copy of it. Production joins the reviewed source row to
 * its raw-hashed variant ID, not to editable customer wording. A record change
 * requires a regenerated dataset carrying its matching normalized-LF hash.
 *
 * FAIL CLOSED
 *
 * An unreadable or malformed reconciliation is not "no holds". It is an unknown
 * number of holds, and answering an empty set would put a formulation-unresolved
 * product on sale. So this throws, and the composition that consults it fails
 * loudly rather than selling.
 */

import path from "node:path";
import { readPinnedReconciliationAuthority } from "./reconciliation-authority";

export interface ReviewedCommerceHold {
  sourceRow: string;
  /** The canonical specification a held product renders under. */
  specification: string;
  product: string;
  offeringId: string;
  offeringVariantId: string;
}

/**
 * Specifications are compared on a normalized form so that incidental spacing
 * or case differences between the record and the generated label cannot let a
 * held product through. Nothing else is normalized away.
 */
export function normalizeSpecification(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function readReviewedCommerceHolds(cwd: string = process.cwd()): readonly ReviewedCommerceHold[] {
  return readPinnedReconciliationAuthority(cwd).reconciliation.commerceHolds.map((hold) => ({
      sourceRow: hold.sourceRow,
      specification: hold.specification,
      product: hold.product,
      offeringId: hold.catalogIdentity.offeringId,
      offeringVariantId: hold.catalogIdentity.offeringVariantId,
  }));
}

let memo: ReadonlySet<string> | null = null;
const identityMemo = new Map<string, ReadonlySet<string>>();

/** Production policy uses exact canonical variant identity, never display text. */
export function reviewedHeldVariantIds(cwd: string = process.cwd()): ReadonlySet<string> {
  const root = path.resolve(cwd);
  const cached = identityMemo.get(root);
  if (cached) return cached;
  const held = new Set(readReviewedCommerceHolds(root).map((hold) => hold.offeringVariantId));
  identityMemo.set(root, held);
  return held;
}

/**
 * Legacy specification compatibility for audit fixtures, read once per process.
 * Production purchase decisions use reviewedHeldVariantIds instead.
 *
 * Memoized because the catalog action resolver runs per variant per request,
 * and the reviewed record changes only between deployments.
 */
export function reviewedHeldSpecifications(cwd: string = process.cwd()): ReadonlySet<string> {
  if (memo !== null) return memo;
  memo = new Set(readReviewedCommerceHolds(cwd).map((hold) => normalizeSpecification(hold.specification)));
  return memo;
}

/** Test affordance: forget the memoized answer. */
export function resetReviewedHoldsCache(): void {
  memo = null;
  identityMemo.clear();
}
