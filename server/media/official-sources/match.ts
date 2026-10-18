import type {
  MatchDifference,
  OfficialSourceProduct,
  SourceMatchResult,
  SupplementManifestRow,
} from "./contracts";

function canonicalizeMicro(value: string): string {
  return value
    .replace(/[µμ]\s*g/gi, "mcg")
    .replace(/[µμ]/g, "u");
}

function normalized(value: string | null | undefined): string {
  return canonicalizeMicro(value ?? "")
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

const QUANTITY_UNIT = /(\d+(?:\.\d+)?)\s*(mcg|ug|mg|kg|g|ml|l|oz|servings?|capsules?|caps?|softgels?|sg|tablets?|tabs?|packets?|packs?|counts?|ct)\b/g;
const DOSAGE_FORMS = [
  { name: "capsule", pattern: /\b(?:capsules?|caps?)\b/ },
  { name: "softgel", pattern: /\b(?:softgels?|sg)\b/ },
  { name: "tablet", pattern: /\b(?:tablets?|tabs?)\b/ },
  { name: "powder", pattern: /\bpowder\b/ },
  { name: "liquid", pattern: /\bliquid\b/ },
  { name: "gummy", pattern: /\bgumm(?:y|ies)\b/ },
  { name: "chew", pattern: /\bchews?\b/ },
] as const;

interface CanonicalQuantity {
  dimension: "mass" | "volume" | "serving" | "count";
  value: number;
}

function quantityText(value: string | null): string {
  return canonicalizeMicro(value ?? "")
    .normalize("NFKD")
    .replace(/[™®©]/g, "")
    .replace(/[^a-zA-Z0-9.]+/g, " ")
    .trim()
    .toLowerCase();
}

function canonicalQuantity(amount: number, unit: string): CanonicalQuantity {
  switch (unit.replace(/s$/, "")) {
    case "mcg":
    case "ug":
      return { dimension: "mass", value: amount };
    case "mg":
      return { dimension: "mass", value: amount * 1_000 };
    case "g":
      return { dimension: "mass", value: amount * 1_000_000 };
    case "kg":
      return { dimension: "mass", value: amount * 1_000_000_000 };
    case "oz":
      return { dimension: "mass", value: amount * 28_349_523.125 };
    case "ml":
      return { dimension: "volume", value: amount };
    case "l":
      return { dimension: "volume", value: amount * 1_000 };
    case "serving":
      return { dimension: "serving", value: amount };
    default:
      return { dimension: "count", value: amount };
  }
}

function quantities(value: string | null): CanonicalQuantity[] {
  const found: CanonicalQuantity[] = [];
  const matcher = new RegExp(QUANTITY_UNIT.source, "g");
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(quantityText(value))) !== null) {
    found.push(canonicalQuantity(Number(match[1]), match[2]));
  }
  return found;
}

function equivalentQuantity(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= scale * Number.EPSILON * 8;
}

function dosageForms(value: string | null): string[] {
  const text = quantityText(value);
  return DOSAGE_FORMS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ name }) => name);
}

function variantIdentityContradicts(expected: string | null, actual: string | null): boolean {
  if (normalized(actual) === "") return false;
  const expectedQuantities = quantities(expected);
  const actualQuantities = quantities(actual);
  for (const expectedQuantity of expectedQuantities) {
    const comparable = actualQuantities.filter(
      ({ dimension }) => dimension === expectedQuantity.dimension,
    );
    if (
      comparable.length > 0 &&
      !comparable.some(({ value }) => equivalentQuantity(expectedQuantity.value, value))
    ) {
      return true;
    }
  }
  const expectedForms = dosageForms(expected);
  const actualForms = dosageForms(actual);
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
  compareRequiredIdentity(differences, "productName", row.productName, candidate.productName);

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
