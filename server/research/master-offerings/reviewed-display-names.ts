import { CATALOG_DISPLAY_NAME_MAX_LENGTH } from "@shared/research/master-offerings/presentation-contract";
import batch from "./data/reviewed-display-names.json";

/**
 * Reviewed headings for listings whose generated display name misstates the
 * listing: cut off at an open bracket, garbled, or naming one of several
 * ingredients. The generated dataset is not edited; the reader uses the
 * reviewed heading in its place and keeps the dataset's own name searchable.
 *
 * A heading is copy. Each record is reviewed before it is added, and states
 * nothing the listing's own label does not.
 */
export type ReviewedDisplayNameBatch = Readonly<{
  schemaVersion: number;
  records: readonly Readonly<Record<string, unknown>>[];
}>;

const RECORD_KEYS = ["offeringId", "displayName"];

function balanced(text: string): boolean {
  let depth = 0;
  for (const character of text) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

export function readReviewedDisplayNames(source: ReviewedDisplayNameBatch): ReadonlyMap<string, string> {
  if (source.schemaVersion !== 1 || !Array.isArray(source.records)) {
    throw new Error("reviewed_display_names_invalid");
  }
  const names = new Map<string, string>();
  for (const record of source.records) {
    const { offeringId, displayName } = record;
    if (Object.keys(record).some((key) => !RECORD_KEYS.includes(key))
      || typeof offeringId !== "string" || !/^mo_[0-9a-f]+$/.test(offeringId)
      || typeof displayName !== "string" || displayName.trim() !== displayName
      // A longer name would make the catalog projection drop the listing.
      || displayName.length === 0 || displayName.length > CATALOG_DISPLAY_NAME_MAX_LENGTH
      // The defect this file exists to correct must not come back through it.
      || !balanced(displayName)) {
      throw new Error("reviewed_display_name_invalid");
    }
    if (names.has(offeringId)) throw new Error("reviewed_display_name_duplicate");
    names.set(offeringId, displayName);
  }
  return names;
}

const names = readReviewedDisplayNames(batch);

export function reviewedDisplayNameFor(offeringId: string): string | null {
  return names.get(offeringId) ?? null;
}

export function reviewedDisplayNameIds(): readonly string[] {
  return [...names.keys()];
}
