import type {
  MatchDifference,
  OfficialSourceProduct,
  SourceMatchResult,
  SupplementManifestRow,
} from "./contracts";

function normalized(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[™®©]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function exact(expected: string | null, actual: string | null): boolean {
  return normalized(expected) !== "" && normalized(expected) === normalized(actual);
}

function conflicting(expected: string | null, actual: string | null): boolean {
  return normalized(expected) !== "" && normalized(actual) !== "" && !exact(expected, actual);
}

function compare(
  differences: MatchDifference[],
  field: string,
  expected: string | null,
  actual: string | null,
  conflictWhenDifferent: boolean,
) {
  if (!conflicting(expected, actual)) return;
  differences.push({
    field,
    expected,
    actual,
    severity: conflictWhenDifferent ? "conflict" : "info",
  });
}

function compareRequiredIdentity(
  differences: MatchDifference[],
  field: string,
  expected: string | null,
  actual: string | null,
) {
  if (normalized(expected) === "" || exact(expected, actual)) return;
  differences.push({
    field,
    expected,
    actual,
    severity: variantIdentityContradicts(expected, actual) ? "conflict" : "info",
  });
}

const QUANTITY_UNIT = /(\d+(?:\.\d+)?)\s*(mcg|mg|kg|g|ml|l|oz|servings?|capsules?|softgels?|tablets?|packets?|packs?|count)\b/g;
const DOSAGE_FORMS = ["capsule", "softgel", "tablet", "powder", "liquid", "gummy", "chew"] as const;

function canonicalUnit(value: string): string {
  return value.replace(/s$/, "");
}

function quantities(value: string | null): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const matcher = new RegExp(QUANTITY_UNIT.source, "g");
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(normalized(value))) !== null) {
    const unit = canonicalUnit(match[2]);
    const values = found.get(unit) ?? new Set<string>();
    values.add(String(Number(match[1])));
    found.set(unit, values);
  }
  return found;
}

function variantIdentityContradicts(expected: string | null, actual: string | null): boolean {
  if (normalized(actual) === "") return false;
  const expectedQuantities = quantities(expected);
  const actualQuantities = quantities(actual);
  let quantityConflict = false;
  expectedQuantities.forEach((expectedValues, unit) => {
    const actualValues = actualQuantities.get(unit);
    if (actualValues && !Array.from(expectedValues).some((value) => actualValues.has(value))) quantityConflict = true;
  });
  if (quantityConflict) return true;
  const expectedForms = DOSAGE_FORMS.filter((form) => normalized(expected).includes(form));
  const actualForms = DOSAGE_FORMS.filter((form) => normalized(actual).includes(form));
  return expectedForms.length > 0 && actualForms.length > 0 && !expectedForms.some((form) => actualForms.includes(form));
}

export function scoreOfficialSourceMatch(
  row: SupplementManifestRow,
  candidate: OfficialSourceProduct,
): SourceMatchResult {
  const differences: MatchDifference[] = [];
  if (!exact(row.brand, candidate.brand)) {
    differences.push({
      field: "brand",
      expected: row.brand,
      actual: candidate.brand,
      severity: "conflict",
    });
    return { state: "CONFLICT", score: 0, differences, candidate };
  }

  let score = 0;
  const expectedSku = row.supplierProductCode;
  if (exact(expectedSku, candidate.officialSku)) score += 50;
  if (exact(row.upc, candidate.upc)) score += 50;
  if (exact(row.productName, candidate.productName)) score += 20;
  if (exact(row.packageCount, candidate.packageCount)) score += 15;
  if (exact(row.flavor, candidate.flavor)) score += 10;
  if (exact(row.form, candidate.form)) score += 10;
  if (exact(row.sizeOrWeight, candidate.sizeOrWeight)) score += 10;

  compare(differences, "supplierProductCode", expectedSku, candidate.officialSku, true);
  compare(differences, "upc", row.upc, candidate.upc, true);
  compareRequiredIdentity(differences, "packageCount", row.packageCount, candidate.packageCount);
  compare(differences, "flavor", row.flavor, candidate.flavor, true);
  compare(differences, "form", row.form, candidate.form, true);
  compareRequiredIdentity(differences, "sizeOrWeight", row.sizeOrWeight, candidate.sizeOrWeight);
  compareRequiredIdentity(differences, "variantOrFormat", row.variantOrFormat, candidate.variantName);
  compare(differences, "productName", row.productName, candidate.productName, false);

  if (differences.some((difference) => difference.severity === "conflict")) {
    return { state: "CONFLICT", score, differences, candidate };
  }

  const hasStableIdentifier =
    exact(expectedSku, candidate.officialSku) || exact(row.upc, candidate.upc);
  const hasExactVariantIdentity =
    normalized(row.variantOrFormat) === "" || exact(row.variantOrFormat, candidate.variantName);
  const state = hasStableIdentifier && hasExactVariantIdentity && score >= 70
    ? "EXACT_MATCH"
    : score >= 45
      ? "HIGH_CONFIDENCE_MATCH"
      : score >= 20
        ? "REVIEW_REQUIRED"
        : "NO_MATCH";
  return { state, score, differences, candidate };
}

export function selectBestOfficialSourceMatch(
  row: SupplementManifestRow,
  candidates: readonly OfficialSourceProduct[],
): SourceMatchResult {
  if (candidates.length === 0) {
    return { state: "NO_MATCH", score: 0, differences: [], candidate: null };
  }
  return candidates
    .map((candidate) => scoreOfficialSourceMatch(row, candidate))
    .sort((left, right) => {
      const leftConflict = left.state === "CONFLICT" ? 1 : 0;
      const rightConflict = right.state === "CONFLICT" ? 1 : 0;
      return leftConflict - rightConflict || right.score - left.score;
    })[0];
}
