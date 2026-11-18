import type { EarlyAccessCatalogCategory } from "./catalog-category";

/**
 * The optional catalog guide: five optional questions and a closed, reviewed
 * table that turns answers into at most three starting points. Pure and
 * deterministic. Answers live in page memory only; this module never reads or
 * writes a URL, storage, analytics or a request, and never selects an item.
 *
 * A result is a view (one of the four category views), a reviewed FAQ group,
 * the business enquiry page or the support page. It is never a product, and
 * never a treatment for a person's symptoms or goals.
 */
export const GUIDE_REVIEW_REVISION = "catalog-guide-r1-draft";

export const GUIDE_AUDIENCES = ["self", "organization", "browsing"] as const;
export const GUIDE_INTERESTS = ["clinical", "supplements", "topicals", "laboratory", "unsure"] as const;
// Topics are reviewed FAQ groups, by their ids in early-access-faq.ts. No health topics.
export const GUIDE_TOPICS = ["product-basics", "quality", "handling", "quotes-payment", "availability", "delivery-refunds"] as const;
export const GUIDE_STYLES = ["read", "explore", "talk"] as const;
export const GUIDE_NEXT = ["suggestions", "full_catalog", "help"] as const;

export type GuideAnswers = Readonly<{
  audience?: typeof GUIDE_AUDIENCES[number];
  interests?: readonly typeof GUIDE_INTERESTS[number][];
  topics?: readonly typeof GUIDE_TOPICS[number][];
  style?: typeof GUIDE_STYLES[number];
  next?: typeof GUIDE_NEXT[number];
}>;

export type GuideCard =
  | Readonly<{ kind: "category"; category: EarlyAccessCatalogCategory; reason: string }>
  | Readonly<{ kind: "faq"; group: typeof GUIDE_TOPICS[number] | "clinical-care" | "research"; reason: string }>
  | Readonly<{ kind: "organization"; href: "/research/organizations"; reason: string }>
  | Readonly<{ kind: "support"; href: "/research/support"; reason: string }>;

export type GuideResult = Readonly<{ fullCatalog: true } | { fullCatalog: false; cards: readonly GuideCard[] }>;

const INTEREST_CATEGORY: Readonly<Record<Exclude<typeof GUIDE_INTERESTS[number], "unsure">, EarlyAccessCatalogCategory>> = {
  clinical: "clinical",
  supplements: "supplements",
  topicals: "topicals",
  laboratory: "research_peptides",
};

const INTEREST_REASON: Readonly<Record<Exclude<typeof GUIDE_INTERESTS[number], "unsure">, string>> = {
  clinical: "You chose clinical options. This view lists the clinical formulations family. Clinical products follow the applicable clinician-review process.",
  supplements: "You chose supplements. This view lists the supplements family.",
  topicals: "You chose skincare and topicals. This view lists the products whose catalog form is topical, across families.",
  laboratory: "You chose laboratory research. This view lists the research peptides and materials family. Items labeled Research Use Only are for laboratory research, not human or veterinary use.",
};

const MAX_CARDS = 3;

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function closedList<T extends string>(values: readonly T[], list: unknown): T[] | null {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > values.length) return null;
  if (!list.every((item) => isOneOf(values, item))) return null;
  return [...new Set(list as T[])].sort((a, b) => values.indexOf(a) - values.indexOf(b));
}

/**
 * Returns the starting points for the given answers. Any answer outside the
 * closed sets makes the whole result the full catalog: a malformed answer never
 * produces a guess.
 */
export function catalogGuideResult(answers: unknown): GuideResult {
  if (answers === null || typeof answers !== "object" || Array.isArray(answers)) return { fullCatalog: true };
  const a = answers as Record<string, unknown>;
  const allowed = new Set(["audience", "interests", "topics", "style", "next"]);
  if (Object.keys(a).some((key) => !allowed.has(key))) return { fullCatalog: true };
  if (a.audience !== undefined && !isOneOf(GUIDE_AUDIENCES, a.audience)) return { fullCatalog: true };
  if (a.style !== undefined && !isOneOf(GUIDE_STYLES, a.style)) return { fullCatalog: true };
  if (a.next !== undefined && !isOneOf(GUIDE_NEXT, a.next)) return { fullCatalog: true };
  const interests = closedList(GUIDE_INTERESTS, a.interests);
  const topics = closedList(GUIDE_TOPICS, a.topics);
  if (interests === null || topics === null) return { fullCatalog: true };
  if (a.next === "full_catalog") return { fullCatalog: true };

  const cards: GuideCard[] = [];
  if (a.next === "help" || a.style === "talk") {
    cards.push({ kind: "support", href: "/research/support", reason: "You asked to speak with the team." });
  }
  if (a.audience === "organization") {
    cards.push({ kind: "organization", href: "/research/organizations",
      reason: "You are exploring for an organization. Business enquiries have their own path." });
  }
  for (const interest of interests) {
    if (interest === "unsure") continue;
    cards.push({ kind: "category", category: INTEREST_CATEGORY[interest], reason: INTEREST_REASON[interest] });
  }
  // A clinical or laboratory interest also offers its reviewed FAQ group, before general topics.
  if (interests.includes("clinical")) cards.push({ kind: "faq", group: "clinical-care", reason: "Answers about clinician review and availability." });
  if (interests.includes("laboratory")) cards.push({ kind: "faq", group: "research", reason: "Answers about laboratory research materials." });
  for (const topic of topics) cards.push({ kind: "faq", group: topic, reason: "You asked about this topic." });

  const chosen = cards.slice(0, MAX_CARDS);
  return chosen.length === 0 ? { fullCatalog: true } : { fullCatalog: false, cards: chosen };
}
