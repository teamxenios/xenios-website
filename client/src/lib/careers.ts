export type CareerDetailBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

export type CareerRole = {
  slug: string;
  group: "open" | "cohort";
  type: string;
  title: string;
  tagline: string;
  summary: string;
  location: string;
  applySubject?: string;
  applyBody?: string;
  detail: CareerDetailBlock[];
};

// The owner-approved first clarity release has one durable general-interest
// application and no named public roles. Keep the role-shaped exports empty so
// sitemap and structured-data checks cannot accidentally republish old drafts.
export const CAREERS_ROLES: CareerRole[] = [];
export const OPEN_ROLES: CareerRole[] = [];
export const COHORT_ROLES: CareerRole[] = [];

export const EQUAL_OPPORTUNITY_STATEMENT = "Xenios is an equal opportunity employer.";

export function careerApplyHref(role?: CareerRole) {
  const subject = role?.applySubject || "Xenios general-interest application";
  return `mailto:team@xeniostechnology.com?subject=${encodeURIComponent(subject)}`;
}

export function careerDescription(role: CareerRole) {
  return role.detail
    .filter((block): block is Extract<CareerDetailBlock, { kind: "paragraph" }> => block.kind === "paragraph")
    .map((block) => block.text)
    .join("\n\n");
}
