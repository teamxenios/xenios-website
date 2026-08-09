import type { EarlyAccessCatalogCard } from "./early-access-hardening";

/** Display vocabulary for the separate planning/catalog layer. */
export const PEPTIDE_ROADMAP_DISPLAY_STATUSES = Object.freeze([
  "available_now",
  "available_this_week",
  "temporarily_unavailable",
  "approval_required",
  "request_access",
  "planned",
  "care_pathway_only",
  "unavailable",
] as const);

export type PeptideRoadmapDisplayStatus =
  (typeof PEPTIDE_ROADMAP_DISPLAY_STATUSES)[number];

export const PEPTIDE_ROADMAP_DISPLAY_LABELS: Readonly<
  Record<PeptideRoadmapDisplayStatus, string>
> = Object.freeze({
  available_now: "Available now",
  available_this_week: "Available this week",
  temporarily_unavailable: "Temporarily unavailable",
  approval_required: "Approval required",
  request_access: "Request access",
  planned: "Planned",
  care_pathway_only: "Care pathway only",
  unavailable: "Unavailable",
});

/** Browser-safe card. Commerce fields remain those of the frozen contract. */
export type PeptideRoadmapCard = EarlyAccessCatalogCard &
  Readonly<{
    family: string;
    format: string;
    displayStatus: PeptideRoadmapDisplayStatus;
  }>;
