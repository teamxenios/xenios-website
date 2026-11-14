import { EARLY_ACCESS_TEAM_EMAIL, teamDraft } from "../../../../shared/research/early-access/quote-contact";

// Kept as an alias for existing Support page imports.
export { EARLY_ACCESS_TEAM_EMAIL as RESEARCH_SUPPORT_EMAIL };

export const LISTING_QUESTION_TOPICS = {
  listing: "A listing detail",
  package: "Package or availability",
  quote: "How to request a quote",
} as const;
export type ListingQuestionTopic = keyof typeof LISTING_QUESTION_TOPICS;

const GENERIC_SUBJECT = "Xenios Early Access catalog question";

// Only the public Master Offering variant reference belongs in a draft. Do not
// fall back to the Product Control UUID, an account/request ID or clinical copy.
export function publicListingReference(candidate: unknown): string | null {
  if (typeof candidate !== "string" || candidate.length !== 24) return null;
  return /^mov_[a-f0-9]{20}$/.test(candidate) ? candidate : null;
}

export function listingQuestionDraft(candidate: unknown, topic: ListingQuestionTopic = "listing") {
  const reference = publicListingReference(candidate);
  const selected = Object.prototype.hasOwnProperty.call(LISTING_QUESTION_TOPICS, topic)
    ? LISTING_QUESTION_TOPICS[topic] : LISTING_QUESTION_TOPICS.listing;
  const body = [
    "Hello Xenios team,",
    "",
    "I have a question about an Early Access catalog listing.",
    ...(reference ? ["Catalog reference: " + reference] : []),
    "Topic: " + selected,
    "",
    "My question: ",
  ].join("\r\n");
  // Encode the headers individually (mailto is not an HTML form). Arbitrary
  // text, addresses, state from other variants and question drafts are not inputs.
  const href = teamDraft(GENERIC_SUBJECT, body);
  const copyText = "To: " + EARLY_ACCESS_TEAM_EMAIL + "\nSubject: " + GENERIC_SUBJECT + "\n\n" + body;
  return { href, reference, copyText };
}
