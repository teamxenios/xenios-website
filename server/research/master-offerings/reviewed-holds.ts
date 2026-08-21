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
 * record rather than a copy of it.
 *
 * FAIL CLOSED
 *
 * An unreadable or malformed reconciliation is not "no holds". It is an unknown
 * number of holds, and answering an empty set would put a formulation-unresolved
 * product on sale. So this throws, and the composition that consults it fails
 * loudly rather than selling.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const RECONCILIATION_DIR = ["config", "research"];
const RECONCILIATION_PREFIX = "master-catalog-reconciliation-";

export interface ReviewedCommerceHold {
  sourceRow: string;
  /** The canonical specification a held product renders under. */
  specification: string;
  product: string;
}

/**
 * Specifications are compared on a normalized form so that incidental spacing
 * or case differences between the record and the generated label cannot let a
 * held product through. Nothing else is normalized away.
 */
export function normalizeSpecification(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function reconciliationFile(cwd: string): string {
  const dir = path.resolve(cwd, ...RECONCILIATION_DIR);
  const names = readdirSync(dir)
    .filter((name) => name.startsWith(RECONCILIATION_PREFIX) && name.endsWith(".json"))
    .sort();
  if (names.length === 0) {
    throw new Error(
      `No ${RECONCILIATION_PREFIX}*.json in ${dir}: cannot determine which products are held.`,
    );
  }
  // The newest reviewed record wins, matching the build.
  return path.join(dir, names[names.length - 1]);
}

export function readReviewedCommerceHolds(cwd: string = process.cwd()): readonly ReviewedCommerceHold[] {
  const file = reconciliationFile(cwd);
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { commerceHolds?: unknown };
  const holds = parsed.commerceHolds;
  if (!Array.isArray(holds)) {
    throw new Error(`${file} has no commerceHolds array: refusing to assume nothing is held.`);
  }
  return holds.map((entry, index) => {
    const hold = entry as Partial<ReviewedCommerceHold>;
    if (
      typeof hold.sourceRow !== "string" ||
      typeof hold.specification !== "string" ||
      hold.specification.trim() === ""
    ) {
      throw new Error(`${file} commerceHolds[${index}] is missing sourceRow or specification.`);
    }
    return {
      sourceRow: hold.sourceRow,
      specification: hold.specification,
      product: typeof hold.product === "string" ? hold.product : "",
    };
  });
}

let memo: ReadonlySet<string> | null = null;

/**
 * The normalized specifications currently held, read once per process.
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
}
