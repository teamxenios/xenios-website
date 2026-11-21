import { MASTER_OFFERING_FAMILY_LABELS, isMasterOfferingFamily } from "../../../../shared/research/master-offerings/contract";
import { catalogPresentationLabel } from "../master-offerings/catalog-presentation-labels";

/** The name the family filter shows for a family value. */
export function catalogFamilyLabel(value: string): string {
  return catalogPresentationLabel(value, isMasterOfferingFamily(value) ? MASTER_OFFERING_FAMILY_LABELS[value] : value.replaceAll("_", " "));
}

const normalize = (value: string) => value.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");

/**
 * The family whose filter name the whole search names ("supplements", "Supplement"), among the
 * families this viewer can see. It only offers that filter after a search finds nothing: it never
 * adds a result to a search.
 */
export function familyNamedBySearch(search: string, families: readonly string[]): string | null {
  const query = normalize(search);
  if (!query) return null;
  return families.find((family) => {
    const label = normalize(catalogFamilyLabel(family));
    return query === label || `${query}s` === label;
  }) ?? null;
}
