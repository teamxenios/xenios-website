import { MASTER_OFFERING_FAMILY_LABELS, isMasterOfferingFamily } from "../../../../shared/research/master-offerings/contract";
import { catalogPresentationLabel } from "../master-offerings/catalog-presentation-labels";
import { EARLY_ACCESS_FAQ_ITEMS, type EarlyAccessFaqItem } from "../faq/early-access-faq";

/** The name the family filter shows for a family value. */
export function catalogFamilyLabel(value: string): string {
  return catalogPresentationLabel(value, isMasterOfferingFamily(value) ? MASTER_OFFERING_FAMILY_LABELS[value] : value.replaceAll("_", " "));
}

const normalize = (value: string) => value.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");

/**
 * Whole searches that name a health goal rather than a product. No listing carries these words,
 * and reviewed copy withholds them as claims for the research rows they are often linked with.
 * They are information only: a match never adds, ranks or filters a result. It only shows the
 * published FAQ answer on where to discuss a goal, and only after the search found nothing.
 */
export const HEALTH_GOAL_SEARCHES: readonly string[] = ["gut health", "healing", "repair"];

/** The published FAQ entry the notice shows, word for word, so its copy cannot drift from the FAQ. */
export const HEALTH_GOAL_FAQ_ID = "personal-goals";

export function healthGoalFaq(search: string): EarlyAccessFaqItem | null {
  if (!HEALTH_GOAL_SEARCHES.includes(normalize(search))) return null;
  return EARLY_ACCESS_FAQ_ITEMS.find((item) => item.id === HEALTH_GOAL_FAQ_ID) ?? null;
}

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
