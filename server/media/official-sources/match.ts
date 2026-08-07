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
  if (exact(row.supplierProductCode, candidate.officialSku)) score += 50;
  if (exact(row.upc, candidate.upc)) score += 50;
  if (exact(row.productName, candidate.productName)) score += 20;
  if (exact(row.packageCount, candidate.packageCount)) score += 15;
  if (exact(row.flavor, candidate.flavor)) score += 10;
  if (exact(row.form, candidate.form)) score += 10;
  if (exact(row.sizeOrWeight, candidate.sizeOrWeight)) score += 10;

  compare(differences, "supplierProductCode", row.supplierProductCode, candidate.officialSku, true);
  compare(differences, "upc", row.upc, candidate.upc, true);
  compare(differences, "packageCount", row.packageCount, candidate.packageCount, true);
  compare(differences, "flavor", row.flavor, candidate.flavor, true);
  compare(differences, "form", row.form, candidate.form, true);
  compare(differences, "sizeOrWeight", row.sizeOrWeight, candidate.sizeOrWeight, true);
  compare(differences, "productName", row.productName, candidate.productName, false);

  if (differences.some((difference) => difference.severity === "conflict")) {
    return { state: "CONFLICT", score, differences, candidate };
  }

  const hasStableIdentifier =
    exact(row.supplierProductCode, candidate.officialSku) || exact(row.upc, candidate.upc);
  const state = hasStableIdentifier && score >= 70
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
